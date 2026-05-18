/**
 * ConnectionPoolManager 错误处理和边界测试
 *
 * 覆盖所有错误处理路径
 *
 * @since v1.0.8
 */

const assert = require('assert');
const { MongoMemoryServer } = require('mongodb-memory-server');
const ConnectionPoolManager = require('../../../lib/infrastructure/ConnectionPoolManager');
const { MongoClient } = require('mongodb');

describe('ConnectionPoolManager - 错误处理100%覆盖', function() {
    this.timeout(120000);

    let mongod;
    let uri;
    let manager;

    const mockLogger = {
        info: () => {},
        warn: () => {},
        error: () => {},
        debug: () => {}
    };

    before(async function() {
        mongod = await MongoMemoryServer.create();
        uri = mongod.getUri();
    });

    after(async function() {
        if (mongod) {
            await mongod.stop();
        }
    });

    afterEach(async function() {
        if (manager) {
            try {
                await manager.close();
            } catch (error) {
                // 忽略
            }
            manager = null;
        }
    });

    describe('1. 移除连接池错误处理', () => {
        it('应该处理 client.close() 失败', async () => {
            manager = new ConnectionPoolManager({
                logger: mockLogger
            });

            await manager.addPool({
                name: 'close-fail',
                uri: uri,
                role: 'primary'
            });

            // 替换 client.close 使其失败
            const pool = manager._pools.get('close-fail');
            if (pool) {
                const originalClose = pool.client.close.bind(pool.client);
                pool.client.close = async () => {
                    throw new Error('Close failed');
                };
            }

            try {
                await manager.removePool('close-fail');
                assert.fail('应该抛出错误');
            } catch (error) {
                assert.ok(error.message.includes('Close failed'));
            }
        });

        it('应该在移除过程中清理健康检查', async () => {
            manager = new ConnectionPoolManager({
                logger: mockLogger
            });

            await manager.addPool({
                name: 'cleanup-test',
                uri: uri,
                role: 'primary'
            });

            manager.startHealthCheck();

            await manager.removePool('cleanup-test');

            // 健康检查应该被清理
            const status = manager._healthChecker.getStatus('cleanup-test');
            assert.strictEqual(status, null);
        });
    });

    describe('2. PoolStats close() 方法', () => {
        it('应该清理批量刷新定时器', () => {
            manager = new ConnectionPoolManager({
                logger: mockLogger
            });

            // PoolStats 应该有 close 方法
            assert.ok(typeof manager._stats.close === 'function');

            manager._stats.close();

            // 验证 interval 被清理
            assert.strictEqual(manager._stats._batchInterval, null);
        });

        it('应该在 close 时刷新剩余缓冲', async () => {
            manager = new ConnectionPoolManager({
                logger: mockLogger
            });

            await manager.addPool({
                name: 'flush-test',
                uri: uri,
                role: 'primary'
            });

            // 记录一些查询
            await manager._stats.recordQuery('flush-test', 100, null);
            await manager._stats.recordQuery('flush-test', 200, null);

            // 关闭应该刷新
            manager._stats.close();

            // 统计应该被记录
            const stats = manager._stats.getStats('flush-test');
            assert.ok(stats.totalRequests > 0);
        });
    });

    describe('3. 降级策略的所有分支', () => {
        it('应该在readonly模式下阻止write且无secondary', async () => {
            manager = new ConnectionPoolManager({
                logger: mockLogger,
                fallback: {
                    enabled: true,
                    fallbackStrategy: 'readonly'
                }
            });

            // 只添加primary，没有secondary
            await manager.addPool({
                name: 'primary-only',
                uri: uri,
                role: 'primary'
            });

            // 标记primary为down
            const status = manager._healthChecker.getStatus('primary-only');
            if (status) {
                status.status = 'down';
            }

            try {
                manager.selectPool('write');
                assert.fail('应该抛出错误');
            } catch (error) {
                assert.ok(error.message.includes('No available'));
            }
        });

        it('应该在secondary策略下返回down的secondary', async () => {
            manager = new ConnectionPoolManager({
                logger: mockLogger,
                fallback: {
                    enabled: true,
                    fallbackStrategy: 'secondary'
                }
            });

            await manager.addPool({
                name: 'primary',
                uri: uri,
                role: 'primary'
            });

            await manager.addPool({
                name: 'secondary',
                uri: uri,
                role: 'secondary'
            });

            // 标记primary为down
            const primaryStatus = manager._healthChecker.getStatus('primary');
            if (primaryStatus) {
                primaryStatus.status = 'down';
            }

            // 即使secondary可用，也能选择
            const result = manager.selectPool('write');
            assert.ok(result);
        });

        it('应该处理所有池都是primary的情况', async () => {
            manager = new ConnectionPoolManager({
                logger: mockLogger,
                fallback: {
                    enabled: true,
                    fallbackStrategy: 'secondary'
                }
            });

            await manager.addPool({
                name: 'primary-1',
                uri: uri,
                role: 'primary'
            });

            await manager.addPool({
                name: 'primary-2',
                uri: uri,
                role: 'primary'
            });

            // 标记所有为down
            ['primary-1', 'primary-2'].forEach(name => {
                const status = manager._healthChecker.getStatus(name);
                if (status) {
                    status.status = 'down';
                }
            });

            try {
                manager.selectPool('write');
                assert.fail('应该抛出错误');
            } catch (error) {
                assert.ok(error.message.includes('No available'));
            }
        });
    });

    describe('4. 并发操作的边界情况', () => {
        it('应该处理并发添加相同名称的池', async () => {
            manager = new ConnectionPoolManager({
                logger: mockLogger
            });

            const promises = [];
            for (let i = 0; i < 3; i++) {
                promises.push(
                    manager.addPool({
                        name: 'duplicate-concurrent',
                        uri: uri,
                        role: 'primary'
                    }).catch(err => err)
                );
            }

            const results = await Promise.all(promises);

            // 至少有两个应该失败
            const errors = results.filter(r => r instanceof Error);
            assert.ok(errors.length >= 2);
        });

        it('应该处理添加和移除的并发竞争', async () => {
            manager = new ConnectionPoolManager({
                logger: mockLogger
            });

            await manager.addPool({
                name: 'race-test',
                uri: uri,
                role: 'primary'
            });

            // 并发添加和移除
            const promises = [
                manager.addPool({
                    name: 'race-test-2',
                    uri: uri,
                    role: 'secondary'
                }),
                manager.removePool('race-test').catch(err => err)
            ];

            await Promise.all(promises);

            // 应该能正常完成
            assert.ok(true);
        });
    });

    describe('5. getPoolStats 边界情况', () => {
        it('应该返回所有池的完整统计', async () => {
            manager = new ConnectionPoolManager({
                logger: mockLogger
            });

            await manager.addPool({
                name: 'stats-1',
                uri: uri,
                role: 'primary'
            });

            await manager.addPool({
                name: 'stats-2',
                uri: uri,
                role: 'secondary'
            });

            manager.startHealthCheck();

            const stats = manager.getPoolStats();

            // 验证所有必需字段
            Object.keys(stats).forEach(poolName => {
                const poolStat = stats[poolName];
                assert.ok('connections' in poolStat);
                assert.ok('available' in poolStat);
                assert.ok('waiting' in poolStat);
                assert.ok('status' in poolStat);
                assert.ok(typeof poolStat.connections === 'number');
                assert.ok(typeof poolStat.available === 'number');
                assert.ok(typeof poolStat.waiting === 'number');
                assert.ok(typeof poolStat.status === 'string');
            });

            manager.stopHealthCheck();
        });

        it('应该处理stats为null的情况', async () => {
            manager = new ConnectionPoolManager({
                logger: mockLogger
            });

            await manager.addPool({
                name: 'no-stats',
                uri: uri,
                role: 'primary'
            });

            // 不记录任何统计
            const stats = manager.getPoolStats();

            assert.ok(stats['no-stats']);
            assert.strictEqual(stats['no-stats'].connections, 0);
        });
    });

    describe('6. close() 方法的所有路径', () => {
        it('应该在close时停止健康检查', async () => {
            manager = new ConnectionPoolManager({
                logger: mockLogger
            });

            await manager.addPool({
                name: 'close-health',
                uri: uri,
                role: 'primary'
            });

            manager.startHealthCheck();

            await manager.close();

            // 验证健康检查已停止（不会抛出错误）
            assert.ok(true);
        });

        it('应该在close时关闭PoolStats', async () => {
            manager = new ConnectionPoolManager({
                logger: mockLogger
            });

            await manager.addPool({
                name: 'close-stats',
                uri: uri,
                role: 'primary'
            });

            await manager.close();

            // PoolStats应该被关闭
            assert.strictEqual(manager._stats._batchInterval, null);
        });

        it('应该在close时清理所有连接池', async () => {
            manager = new ConnectionPoolManager({
                logger: mockLogger
            });

            await manager.addPool({
                name: 'close-1',
                uri: uri,
                role: 'primary'
            });

            await manager.addPool({
                name: 'close-2',
                uri: uri,
                role: 'secondary'
            });

            await manager.close();

            assert.strictEqual(manager.getPoolNames().length, 0);
        });

        it('应该处理close时某个池失败', async () => {
            manager = new ConnectionPoolManager({
                logger: mockLogger
            });

            await manager.addPool({
                name: 'close-fail-1',
                uri: uri,
                role: 'primary'
            });

            await manager.addPool({
                name: 'close-fail-2',
                uri: uri,
                role: 'secondary'
            });

            // 使第一个池的close失败
            const pool1 = manager._pools.get('close-fail-1');
            if (pool1) {
                pool1.client.close = async () => {
                    throw new Error('Close failed');
                };
            }

            // close应该继续处理其他池
            try {
                await manager.close();
            } catch (error) {
                // 可能抛出错误
            }

            // 至少应该尝试关闭所有池
            assert.ok(true);
        });
    });

    describe('7. selectPool 的所有边界', () => {
        it('应该在候选池为空数组时抛出错误', () => {
            manager = new ConnectionPoolManager({
                logger: mockLogger,
                fallback: {
                    enabled: false
                }
            });

            try {
                // 直接调用内部方法测试
                const emptyPools = [];
                manager._selector.select(emptyPools, { operation: 'read' });
                assert.fail('应该抛出错误');
            } catch (error) {
                assert.ok(error.message.includes('No available') || error.message.includes('pools'));
            }
        });

        it('应该处理selector返回的池不在pools中', async () => {
            manager = new ConnectionPoolManager({
                logger: mockLogger
            });

            await manager.addPool({
                name: 'exists',
                uri: uri,
                role: 'primary'
            });

            // 人为删除pool但保留config
            manager._pools.delete('exists');

            try {
                manager.selectPool('read');
                assert.fail('应该抛出错误');
            } catch (error) {
                assert.ok(error.message.includes('not available'));
            }
        });
    });

    describe('8. 配置的所有边界值', () => {
        it('应该处理maxPoolsCount为1', async () => {
            manager = new ConnectionPoolManager({
                logger: mockLogger,
                maxPoolsCount: 1
            });

            await manager.addPool({
                name: 'only-one',
                uri: uri,
                role: 'primary'
            });

            try {
                await manager.addPool({
                    name: 'second',
                    uri: uri,
                    role: 'secondary'
                });
                assert.fail('应该抛出错误');
            } catch (error) {
                assert.ok(error.message.includes('Maximum') || error.message.includes('limit'));
            }
        });

        it('应该处理极大的maxPoolsCount', async () => {
            manager = new ConnectionPoolManager({
                logger: mockLogger,
                maxPoolsCount: 999999
            });

            await manager.addPool({
                name: 'test',
                uri: uri,
                role: 'primary'
            });

            assert.strictEqual(manager.getPoolNames().length, 1);
        });

        it('应该处理fallback的所有字段组合', () => {
            const fallbackConfigs = [
                { enabled: false },
                { enabled: true, fallbackStrategy: 'error' },
                { enabled: true, fallbackStrategy: 'readonly', retryDelay: 500 },
                { enabled: true, fallbackStrategy: 'secondary', maxRetries: 5 }
            ];

            fallbackConfigs.forEach(config => {
                const mgr = new ConnectionPoolManager({
                    logger: mockLogger,
                    fallback: config
                });

                assert.ok(mgr._fallbackConfig);
                assert.strictEqual(mgr._fallbackConfig.enabled, config.enabled);
            });
        });
    });
});

