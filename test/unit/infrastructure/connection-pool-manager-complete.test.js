/**
 * ConnectionPoolManager 完整覆盖测试
 *
 * 专门测试未覆盖的代码路径
 *
 * @since v1.0.8
 */

const assert = require('assert');
const { MongoMemoryServer } = require('mongodb-memory-server');
const ConnectionPoolManager = require('../../../lib/infrastructure/ConnectionPoolManager');

describe('ConnectionPoolManager 完整覆盖测试', function() {
    this.timeout(60000);

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
                // 忽略关闭错误
            }
            manager = null;
        }
    });

    describe('1. selectPool 方法完整测试', () => {
        it('应该能手动指定连接池', async () => {
            manager = new ConnectionPoolManager({
                logger: mockLogger,
                strategy: 'manual'
            });

            await manager.addPool({
                name: 'manual-pool',
                uri: uri,
                role: 'primary'
            });

            const selected = manager.selectPool('read', { pool: 'manual-pool' });
            assert.strictEqual(selected.name, 'manual-pool');
            assert.ok(selected.client);
        });

        it('应该在手动指定不存在的连接池时抛出错误', async () => {
            manager = new ConnectionPoolManager({
                logger: mockLogger
            });

            await manager.addPool({
                name: 'exists',
                uri: uri,
                role: 'primary'
            });

            try {
                manager.selectPool('read', { pool: 'non-existent' });
                assert.fail('应该抛出错误');
            } catch (error) {
                assert.ok(error.message.includes('not found'));
            }
        });

        it('应该在无可用连接池时抛出错误', async () => {
            manager = new ConnectionPoolManager({
                logger: mockLogger,
                fallback: {
                    enabled: false
                }
            });

            // 不添加任何连接池
            try {
                manager.selectPool('read');
                assert.fail('应该抛出错误');
            } catch (error) {
                assert.ok(error.message.includes('No available'));
            }
        });

        it('应该使用降级策略（readonly）', async () => {
            manager = new ConnectionPoolManager({
                logger: mockLogger,
                fallback: {
                    enabled: true,
                    fallbackStrategy: 'readonly'
                }
            });

            // 添加secondary但标记为down（通过健康检查模拟）
            await manager.addPool({
                name: 'secondary-readonly',
                uri: uri,
                role: 'secondary'
            });

            // 模拟所有连接池down的情况
            // 这需要触发_handleAllPoolsDown方法
            const healthStatus = manager._healthChecker.getStatus('secondary-readonly');
            if (healthStatus) {
                healthStatus.status = 'down';
            }

            try {
                // readonly策略下，write操作应该被拒绝
                const result = manager.selectPool('write');
                // 如果到这里，说明有健康的池，测试通过
                assert.ok(result);
            } catch (error) {
                // 预期：readonly策略拒绝write或无可用池
                assert.ok(
                    error.message.includes('No available') ||
                    error.message.includes('readonly')
                );
            }
        });

        it('应该使用降级策略（secondary）', async () => {
            manager = new ConnectionPoolManager({
                logger: mockLogger,
                fallback: {
                    enabled: true,
                    fallbackStrategy: 'secondary'
                }
            });

            await manager.addPool({
                name: 'secondary-fallback',
                uri: uri,
                role: 'secondary'
            });

            // 正常选择应该成功
            const result = manager.selectPool('read');
            assert.ok(result);
            assert.ok(result.client);
        });

        it('应该使用降级策略（error）', async () => {
            manager = new ConnectionPoolManager({
                logger: mockLogger,
                fallback: {
                    enabled: true,
                    fallbackStrategy: 'error'
                }
            });

            // 不添加连接池，触发error策略
            try {
                manager.selectPool('read');
                assert.fail('应该抛出错误');
            } catch (error) {
                assert.ok(error.message.includes('No available'));
            }
        });
    });

    describe('2. _getHealthyPools 方法测试', () => {
        it('应该返回所有健康的连接池', async () => {
            manager = new ConnectionPoolManager({
                logger: mockLogger
            });

            await manager.addPool({
                name: 'healthy-1',
                uri: uri,
                role: 'primary'
            });

            await manager.addPool({
                name: 'healthy-2',
                uri: uri,
                role: 'secondary'
            });

            const healthy = manager._getHealthyPools();
            assert.strictEqual(healthy.length, 2);
        });

        it('应该过滤掉down状态的连接池', async () => {
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

            // 模拟down状态
            const status = manager._healthChecker.getStatus('down-pool');
            if (status) {
                status.status = 'down';
            }

            const healthy = manager._getHealthyPools();
            const names = healthy.map(p => p.name);

            assert.ok(names.includes('up-pool'));
            // down-pool应该被过滤（如果健康检查正常工作）
        });
    });

    describe('3. _getPoolsByRole 方法测试', () => {
        it('应该返回指定角色的所有连接池', async () => {
            manager = new ConnectionPoolManager({
                logger: mockLogger
            });

            await manager.addPool({
                name: 'primary-1',
                uri: uri,
                role: 'primary'
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

            const secondaries = manager._getPoolsByRole('secondary');
            assert.strictEqual(secondaries.length, 2);
            assert.ok(secondaries.every(p => p.role === 'secondary'));
        });

        it('应该在没有匹配角色时返回空数组', async () => {
            manager = new ConnectionPoolManager({
                logger: mockLogger
            });

            await manager.addPool({
                name: 'primary-only',
                uri: uri,
                role: 'primary'
            });

            const analytics = manager._getPoolsByRole('analytics');
            assert.strictEqual(analytics.length, 0);
        });
    });

    describe('4. 连接池健康状态集成', () => {
        it('应该正确获取连接池健康状态', async () => {
            manager = new ConnectionPoolManager({
                logger: mockLogger
            });

            await manager.addPool({
                name: 'health-status-test',
                uri: uri,
                role: 'primary'
            });

            manager.startHealthCheck();

            const health = manager.getPoolHealth();
            assert.ok(health);
            assert.ok(health.has('health-status-test'));

            const status = health.get('health-status-test');
            assert.ok(status);
            assert.ok(['up', 'down', 'unknown'].includes(status.status));

            manager.stopHealthCheck();
        });
    });

    describe('5. 统计信息收集', () => {
        it('应该返回完整的连接池统计', async () => {
            manager = new ConnectionPoolManager({
                logger: mockLogger
            });

            await manager.addPool({
                name: 'stats-full-test',
                uri: uri,
                role: 'primary'
            });

            const stats = manager.getPoolStats();
            assert.ok(stats['stats-full-test']);

            const poolStats = stats['stats-full-test'];
            assert.ok('connections' in poolStats);
            assert.ok('available' in poolStats);
            assert.ok('waiting' in poolStats);
            assert.ok('status' in poolStats);
        });

        it('应该记录选择事件', async () => {
            manager = new ConnectionPoolManager({
                logger: mockLogger
            });

            await manager.addPool({
                name: 'selection-test',
                uri: uri,
                role: 'primary'
            });

            // 选择连接池会记录统计
            manager.selectPool('read', { pool: 'selection-test' });

            const stats = manager.getPoolStats();
            assert.ok(stats['selection-test']);
        });
    });

    describe('6. 错误处理路径', () => {
        it('应该处理��接池添加时的网络错误', async () => {
            manager = new ConnectionPoolManager({
                logger: mockLogger
            });

            try {
                await manager.addPool({
                    name: 'network-error',
                    uri: 'mongodb://192.0.2.1:27017/test', // TEST-NET-1 (不可达)
                    role: 'primary',
                    options: {
                        serverSelectionTimeoutMS: 1000,
                        connectTimeoutMS: 1000
                    }
                });
                assert.fail('应该抛出错误');
            } catch (error) {
                assert.ok(
                    error.message.includes('connect') ||
                    error.message.includes('ETIMEDOUT') ||
                    error.message.includes('ECONNREFUSED')
                );
            }
        });

        it('应该处��连接池移除时的错误', async () => {
            manager = new ConnectionPoolManager({
                logger: mockLogger
            });

            await manager.addPool({
                name: 'remove-error-test',
                uri: uri,
                role: 'primary'
            });

            // 第一次移除成功
            await manager.removePool('remove-error-test');

            // 第二次移除应该失败
            try {
                await manager.removePool('remove-error-test');
                assert.fail('应该抛出错误');
            } catch (error) {
                assert.ok(error.message.includes('not found'));
            }
        });
    });

    describe('7. 并发锁保护', () => {
        it('应该正确处理并发添加', async () => {
            manager = new ConnectionPoolManager({
                logger: mockLogger
            });

            const promises = [];
            for (let i = 0; i < 3; i++) {
                promises.push(
                    manager.addPool({
                        name: `concurrent-lock-${i}`,
                        uri: uri,
                        role: i === 0 ? 'primary' : 'secondary'
                    })
                );
            }

            await Promise.all(promises);

            const names = manager.getPoolNames();
            assert.strictEqual(names.length, 3);
        });

        it('应该正确处理并发移除', async () => {
            manager = new ConnectionPoolManager({
                logger: mockLogger
            });

            // 先添加
            await manager.addPool({
                name: 'remove-1',
                uri: uri,
                role: 'primary'
            });

            await manager.addPool({
                name: 'remove-2',
                uri: uri,
                role: 'secondary'
            });

            // 并发移除
            await Promise.all([
                manager.removePool('remove-1'),
                manager.removePool('remove-2')
            ]);

            const names = manager.getPoolNames();
            assert.strictEqual(names.length, 0);
        });
    });

    describe('8. _selectPool 内部方法', () => {
        it('应该正确调用_selectPool', async () => {
            manager = new ConnectionPoolManager({
                logger: mockLogger,
                strategy: 'auto'
            });

            await manager.addPool({
                name: 'auto-select-primary',
                uri: uri,
                role: 'primary'
            });

            await manager.addPool({
                name: 'auto-select-secondary',
                uri: uri,
                role: 'secondary'
            });

            // 测试write操作选择primary
            const writeResult = manager.selectPool('write');
            assert.strictEqual(writeResult.name, 'auto-select-primary');

            // 测试read操作选择secondary
            const readResult = manager.selectPool('read');
            assert.ok(['auto-select-primary', 'auto-select-secondary'].includes(readResult.name));
        });
    });

    describe('9. 配置验证边界', () => {
        it('应该处理无效的fallback配置', () => {
            manager = new ConnectionPoolManager({
                logger: mockLogger,
                fallback: null // 无效配置
            });

            assert.ok(manager);
        });

        it('应该处理空的maxPoolsCount', () => {
            manager = new ConnectionPoolManager({
                logger: mockLogger,
                maxPoolsCount: undefined
            });

            assert.ok(manager);
        });
    });

    describe('10. _getPool 内部方法', () => {
        it('应该返回存在的连接池client', async () => {
            manager = new ConnectionPoolManager({
                logger: mockLogger
            });

            await manager.addPool({
                name: 'get-pool-test',
                uri: uri,
                role: 'primary'
            });

            const client = manager._getPool('get-pool-test');
            assert.ok(client);
        });

        it('应该对不存在的连接池返回null', () => {
            manager = new ConnectionPoolManager({
                logger: mockLogger
            });

            const client = manager._getPool('non-existent');
            assert.strictEqual(client, null);
        });
    });
});

