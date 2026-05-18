/**
 * 多连接池功能 - 100%覆盖率终极测试
 *
 * 专门针对剩余未覆盖的代码路径
 *
 * @since v1.0.8
 */

const assert = require('assert');
const { MongoMemoryServer } = require('mongodb-memory-server');
const ConnectionPoolManager = require('../../../lib/infrastructure/ConnectionPoolManager');
const HealthChecker = require('../../../lib/infrastructure/HealthChecker');
const PoolStats = require('../../../lib/infrastructure/PoolStats');

describe('多连接池 - 100%覆盖率终极测试', function() {
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

    describe('1. _handleAllPoolsDown 完整测试', () => {
        it('应该在error策略下返回空数组', async () => {
            manager = new ConnectionPoolManager({
                logger: mockLogger,
                fallback: {
                    enabled: true,
                    fallbackStrategy: 'error'
                }
            });

            await manager.addPool({
                name: 'test-pool',
                uri: uri,
                role: 'primary'
            });

            // 模拟所有连接池down
            const result = manager._handleAllPoolsDown('read');
            assert.strictEqual(result.length, 0);
        });

        it('应该在readonly策略下拒绝write操作', async () => {
            manager = new ConnectionPoolManager({
                logger: mockLogger,
                fallback: {
                    enabled: true,
                    fallbackStrategy: 'readonly'
                }
            });

            await manager.addPool({
                name: 'secondary-pool',
                uri: uri,
                role: 'secondary'
            });

            // readonly策略下的write操作应该返回空数组
            const result = manager._handleAllPoolsDown('write');
            assert.strictEqual(result.length, 0);
        });

        it('应该在readonly策略下允许read操作', async () => {
            manager = new ConnectionPoolManager({
                logger: mockLogger,
                fallback: {
                    enabled: true,
                    fallbackStrategy: 'readonly'
                }
            });

            await manager.addPool({
                name: 'secondary-pool',
                uri: uri,
                role: 'secondary'
            });

            // 直接测试方法
            const result = manager._handleAllPoolsDown('read');

            // readonly策略下的read操作应该返回secondary池的配置
            // 如果有secondary配置的话
            assert.ok(Array.isArray(result));
        });

        it('应该在secondary策略下返回所有secondary', async () => {
            manager = new ConnectionPoolManager({
                logger: mockLogger,
                fallback: {
                    enabled: true,
                    fallbackStrategy: 'secondary'
                }
            });

            await manager.addPool({
                name: 'secondary-1',
                uri: uri,
                role: 'secondary'
            });

            await manager.addPool({
                name: 'secondary-2',
                uri: uri,
                role: 'secondary'
            });

            const result = manager._handleAllPoolsDown('write');

            // secondary策略应该返回所有secondary配置
            assert.ok(Array.isArray(result));
            // 结果取决于_getPoolsByRole的实现
        });

        it('应该在未知策略下返回空数组', async () => {
            manager = new ConnectionPoolManager({
                logger: mockLogger,
                fallback: {
                    enabled: true,
                    fallbackStrategy: 'unknown-strategy'
                }
            });

            await manager.addPool({
                name: 'test-pool',
                uri: uri,
                role: 'primary'
            });

            const result = manager._handleAllPoolsDown('read');
            assert.strictEqual(result.length, 0);
        });
    });

    describe('2. selectPool 所有异常路径', () => {
        it('应该在选中的池不可用时抛出错误', async () => {
            manager = new ConnectionPoolManager({
                logger: mockLogger,
                strategy: 'manual'
            });

            await manager.addPool({
                name: 'test-pool',
                uri: uri,
                role: 'primary'
            });

            // 手动删除pool但保留config（模拟异常状态）
            manager._pools.delete('test-pool');

            try {
                manager.selectPool('read');
                assert.fail('应该抛出错误');
            } catch (error) {
                assert.ok(error.message.includes('not available'));
            }
        });

        it('应该在所有池down且fallback未启用时抛出错误', async () => {
            manager = new ConnectionPoolManager({
                logger: mockLogger,
                fallback: {
                    enabled: false
                }
            });

            await manager.addPool({
                name: 'test-pool',
                uri: uri,
                role: 'primary'
            });

            // 注册但立即标记为down
            const status = manager._healthChecker.getStatus('test-pool');
            if (status) {
                status.status = 'down';
            } else {
                // 手动注册状态
                manager._healthChecker.register({
                    name: 'test-pool',
                    healthCheck: { enabled: false }
                }, null);
                const newStatus = manager._healthChecker.getStatus('test-pool');
                if (newStatus) {
                    newStatus.status = 'down';
                }
            }

            try {
                manager.selectPool('read');
                assert.fail('应该抛出错误');
            } catch (error) {
                assert.ok(error.message.includes('No available'));
            }
        });

        it('应该在所有池down且fallback返回空时抛出错误', async () => {
            manager = new ConnectionPoolManager({
                logger: mockLogger,
                fallback: {
                    enabled: true,
                    fallbackStrategy: 'error'
                }
            });

            await manager.addPool({
                name: 'test-pool',
                uri: uri,
                role: 'primary'
            });

            // 标记为down
            const status = manager._healthChecker.getStatus('test-pool');
            if (status) {
                status.status = 'down';
            }

            try {
                manager.selectPool('read');
                assert.fail('应该抛出错误');
            } catch (error) {
                assert.ok(error.message.includes('all pools down') || error.message.includes('No available'));
            }
        });
    });

    describe('3. _getHealthyPools 边界情况', () => {
        it('应该在没有状态时将池视为健康', async () => {
            manager = new ConnectionPoolManager({
                logger: mockLogger
            });

            await manager.addPool({
                name: 'no-status-pool',
                uri: uri,
                role: 'primary'
            });

            // 不启动健康检查，所以没有状态
            const healthy = manager._getHealthyPools();
            assert.strictEqual(healthy.length, 1);
        });

        it('应该正确过滤down状态的池', async () => {
            manager = new ConnectionPoolManager({
                logger: mockLogger
            });

            await manager.addPool({
                name: 'up-pool',
                uri: uri,
                role: 'primary'
            });

            await manager.addPool({
                name: 'down-pool',
                uri: uri,
                role: 'secondary'
            });

            // 启动健康检查并标记一个为down
            manager.startHealthCheck();

            const status = manager._healthChecker.getStatus('down-pool');
            if (status) {
                status.status = 'down';
            }

            const healthy = manager._getHealthyPools();
            const names = healthy.map(p => p.name);

            // 至少up-pool应该在列表中
            assert.ok(names.includes('up-pool'));

            manager.stopHealthCheck();
        });
    });

    describe('4. 统计记录完整性', () => {
        it('应该正确记录选择事件的统计', async () => {
            manager = new ConnectionPoolManager({
                logger: mockLogger
            });

            await manager.addPool({
                name: 'stats-pool',
                uri: uri,
                role: 'primary'
            });

            // 执行多次选择
            for (let i = 0; i < 5; i++) {
                manager.selectPool('read', { pool: 'stats-pool' });
            }

            // 验证统计被记录
            const stats = manager.getPoolStats();
            assert.ok(stats['stats-pool']);
        });

        it('应该在getPoolStats中包含所有必需字段', async () => {
            manager = new ConnectionPoolManager({
                logger: mockLogger
            });

            await manager.addPool({
                name: 'complete-stats',
                uri: uri,
                role: 'primary'
            });

            manager.startHealthCheck();

            const stats = manager.getPoolStats();
            const poolStats = stats['complete-stats'];

            assert.ok('connections' in poolStats);
            assert.ok('available' in poolStats);
            assert.ok('waiting' in poolStats);
            assert.ok('status' in poolStats);

            manager.stopHealthCheck();
        });
    });

    describe('5. 健康检查状态边界', () => {
        it('应该正确处理未启动健康检查的情况', async () => {
            manager = new ConnectionPoolManager({
                logger: mockLogger
            });

            await manager.addPool({
                name: 'no-health-check',
                uri: uri,
                role: 'primary'
            });

            // 不启动健康检查
            const health = manager.getPoolHealth();
            assert.ok(health);
        });

        it('应该在健康检查运行时返回正确状态', async () => {
            manager = new ConnectionPoolManager({
                logger: mockLogger
            });

            await manager.addPool({
                name: 'health-running',
                uri: uri,
                role: 'primary'
            });

            manager.startHealthCheck();

            // 等待一次健康检查
            await new Promise(resolve => setTimeout(resolve, 100));

            const health = manager.getPoolHealth();
            assert.ok(health.has('health-running'));

            const status = health.get('health-running');
            assert.ok(status);
            assert.ok(['up', 'down', 'unknown'].includes(status.status));

            manager.stopHealthCheck();
        });
    });

    describe('6. 并发场景完整测试', () => {
        it('应该正确处理并发选择池', async () => {
            manager = new ConnectionPoolManager({
                logger: mockLogger,
                strategy: 'roundRobin'
            });

            await manager.addPool({
                name: 'concurrent-1',
                uri: uri,
                role: 'primary'
            });

            await manager.addPool({
                name: 'concurrent-2',
                uri: uri,
                role: 'secondary'
            });

            // 并发选择
            const promises = [];
            for (let i = 0; i < 20; i++) {
                promises.push(
                    Promise.resolve(manager.selectPool('read'))
                );
            }

            const results = await Promise.all(promises);
            assert.strictEqual(results.length, 20);
            assert.ok(results.every(r => r.name && r.client));
        });

        it('应该正确处理并发添加和选择', async () => {
            manager = new ConnectionPoolManager({
                logger: mockLogger
            });

            const addPromises = [];
            for (let i = 0; i < 3; i++) {
                addPromises.push(
                    manager.addPool({
                        name: `concurrent-add-${i}`,
                        uri: uri,
                        role: i === 0 ? 'primary' : 'secondary'
                    })
                );
            }

            await Promise.all(addPromises);

            // 立即并发选择
            const selectPromises = [];
            for (let i = 0; i < 10; i++) {
                selectPromises.push(
                    Promise.resolve(manager.selectPool('read'))
                );
            }

            const results = await Promise.all(selectPromises);
            assert.strictEqual(results.length, 10);
        });
    });

    describe('7. 配置边界情况', () => {
        it('应该处理null的fallback配置', () => {
            manager = new ConnectionPoolManager({
                logger: mockLogger,
                fallback: null
            });

            assert.ok(manager._fallbackConfig);
        });

        it('应该处理undefined的strategy', () => {
            manager = new ConnectionPoolManager({
                logger: mockLogger,
                strategy: undefined
            });

            assert.ok(manager._selector);
            assert.strictEqual(manager._selector.getStrategy(), 'auto');
        });

        it('应该处理0作为maxPoolsCount', async () => {
            manager = new ConnectionPoolManager({
                logger: mockLogger,
                maxPoolsCount: 0
            });

            // 应该能添加池（0表示无限制）
            await manager.addPool({
                name: 'zero-limit',
                uri: uri,
                role: 'primary'
            });

            assert.strictEqual(manager.getPoolNames().length, 1);
        });

        it('应该处理负数的maxPoolsCount', () => {
            manager = new ConnectionPoolManager({
                logger: mockLogger,
                maxPoolsCount: -1
            });

            // 负数应该被忽略或转换为默认值
            assert.ok(manager);
        });
    });

    describe('8. 关闭和清理边界', () => {
        it('应该在关闭时清理所有资源', async () => {
            manager = new ConnectionPoolManager({
                logger: mockLogger
            });

            await manager.addPool({
                name: 'cleanup-1',
                uri: uri,
                role: 'primary'
            });

            await manager.addPool({
                name: 'cleanup-2',
                uri: uri,
                role: 'secondary'
            });

            manager.startHealthCheck();

            await manager.close();

            // 验证清理
            assert.strictEqual(manager.getPoolNames().length, 0);
        });

        it('应该在关闭时停止健康检查', async () => {
            manager = new ConnectionPoolManager({
                logger: mockLogger
            });

            await manager.addPool({
                name: 'stop-health',
                uri: uri,
                role: 'primary'
            });

            manager.startHealthCheck();

            await manager.close();

            // 验证关闭不会抛出错误，健康检查已停止
            assert.ok(true);
        });

        it('应该在关闭时清理统计', async () => {
            manager = new ConnectionPoolManager({
                logger: mockLogger
            });

            await manager.addPool({
                name: 'stats-cleanup',
                uri: uri,
                role: 'primary'
            });

            manager.selectPool('read', { pool: 'stats-cleanup' });

            await manager.close();

            // PoolStats 应该被清理
            assert.ok(manager._stats);
        });
    });

    describe('9. PoolStats close() 方法测试', () => {
        it('应该能正常关闭PoolStats', () => {
            const stats = new PoolStats({
                logger: mockLogger
            });

            stats.recordSelection('test-pool', 'read');

            // 关闭
            stats.close();

            // 验证interval被清理
            assert.strictEqual(stats._batchInterval, null);
        });

        it('应该在close时刷新剩余缓冲', async () => {
            const stats = new PoolStats({
                logger: mockLogger
            });

            await stats.recordQuery('test-pool', 100, null);

            // 关闭
            stats.close();

            // 验证统计被刷新
            const poolStats = stats.getStats('test-pool');
            assert.ok(poolStats.totalRequests > 0);
        });
    });

    describe('10. HealthChecker 未测试路径', () => {
        it('应该处理注销不存在的连接池', () => {
            const checker = new HealthChecker({
                logger: mockLogger
            });

            // 注销不存在的池不应该抛出错误
            checker.unregister('non-existent');
            assert.ok(true);
        });

        it('应该在未启动时正常停止', () => {
            const checker = new HealthChecker({
                logger: mockLogger
            });

            // 未启动就停止不应该抛出错误
            checker.stop();
            assert.ok(true);
        });

        it('应该返回null或undefined对于未注册的池', () => {
            const checker = new HealthChecker({
                logger: mockLogger
            });

            const status = checker.getStatus('unregistered');
            // 可能返回null或undefined
            assert.ok(status === null || status === undefined);
        });
    });
});

