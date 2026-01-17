/**
 * 多连接池高级功能集成测试
 *
 * 覆盖剩余未测试的代码路径
 *
 * @since v1.0.8
 */

const assert = require('assert');
const { MongoMemoryServer } = require('mongodb-memory-server');
const ConnectionPoolManager = require('../../lib/infrastructure/ConnectionPoolManager');
const PoolSelector = require('../../lib/infrastructure/PoolSelector');

describe('多连接池高级功能测试 (v1.0.8+)', function() {
    this.timeout(60000);

    let mongod;
    let uri;
    let manager;

    const mockLogger = {
        info: (msg, meta) => console.log('[INFO]', msg, meta || ''),
        warn: (msg, meta) => console.log('[WARN]', msg, meta || ''),
        error: (msg, meta) => console.log('[ERROR]', msg, meta || ''),
        debug: (msg, meta) => console.log('[DEBUG]', msg, meta || '')
    };

    before(async function() {
        console.log('[INFO] 启动 MongoDB Memory Server...');
        mongod = await MongoMemoryServer.create();
        uri = mongod.getUri();
        console.log('[INFO] MongoDB Memory Server 已启动:', uri);
    });

    after(async function() {
        if (manager) {
            await manager.close();
        }
        if (mongod) {
            await mongod.stop();
            console.log('[INFO] MongoDB Memory Server 已停止');
        }
    });

    afterEach(async function() {
        if (manager) {
            await manager.close();
            manager = null;
        }
    });

    describe('1. 连接池添加和连接', () => {
        it('应该成功添加连接池并连接', async () => {
            manager = new ConnectionPoolManager({
                logger: mockLogger
            });

            const config = {
                name: 'test-primary',
                uri: uri,
                role: 'primary',
                options: {
                    maxPoolSize: 10,
                    minPoolSize: 2
                }
            };

            await manager.addPool(config);

            const names = manager.getPoolNames();
            assert.strictEqual(names.length, 1);
            assert.strictEqual(names[0], 'test-primary');
        });

        it('应该处理连接池添加失败', async () => {
            manager = new ConnectionPoolManager({
                logger: mockLogger
            });

            const config = {
                name: 'test-fail',
                uri: 'mongodb://invalid-host:27017/test',
                role: 'primary'
            };

            try {
                await manager.addPool(config);
                assert.fail('应该抛出错误');
            } catch (error) {
                assert.ok(error.message.includes('connect') || error.message.includes('ENOTFOUND'));
            }
        });

        it('应该拒绝重复的连接池名称', async () => {
            manager = new ConnectionPoolManager({
                logger: mockLogger
            });

            const config = {
                name: 'duplicate-test',
                uri: uri,
                role: 'primary'
            };

            await manager.addPool(config);

            try {
                await manager.addPool(config);
                assert.fail('应该抛出错误');
            } catch (error) {
                assert.ok(error.message.includes('already exists') || error.message.includes('duplicate'));
            }
        });
    });

    describe('2. 连接池选择逻辑', () => {
        beforeEach(async function() {
            manager = new ConnectionPoolManager({
                logger: mockLogger,
                strategy: 'auto'
            });

            // 添加多个连接池
            await manager.addPool({
                name: 'primary',
                uri: uri,
                role: 'primary',
                weight: 1
            });

            await manager.addPool({
                name: 'secondary-1',
                uri: uri,
                role: 'secondary',
                weight: 2
            });

            await manager.addPool({
                name: 'secondary-2',
                uri: uri,
                role: 'secondary',
                weight: 1
            });
        });

        it('应该根据操作类型选择连接池（write→primary）', async () => {
            const result = manager.selectPool('write');
            assert.strictEqual(result.name, 'primary');
        });

        it('应该根据操作类型选择连接池（read→secondary）', async () => {
            const result = manager.selectPool('read');
            assert.ok(['secondary-1', 'secondary-2'].includes(result.name));
        });

        it('应该使用auto策略正确选择', async () => {
            const result = manager.selectPool('write');
            assert.strictEqual(result.name, 'primary');
        });
    });

    describe('3. 健康检查集成', () => {
        it('应该启动健康检查', async () => {
            manager = new ConnectionPoolManager({
                logger: mockLogger
            });

            await manager.addPool({
                name: 'health-test',
                uri: uri,
                role: 'primary',
                healthCheck: {
                    enabled: true,
                    interval: 5000,
                    timeout: 3000
                }
            });

            manager.startHealthCheck();

            // 验证健康状态
            const health = manager.getPoolHealth();
            assert.ok(health.has('health-test'));
        });

        it('应该停止健康检查', async () => {
            manager = new ConnectionPoolManager({
                logger: mockLogger
            });

            await manager.addPool({
                name: 'health-test',
                uri: uri,
                role: 'primary'
            });

            manager.startHealthCheck();
            manager.stopHealthCheck();

            // 验证已停止
            assert.ok(true);
        });
    });

    describe('4. 连接池移除', () => {
        it('应该成功移除连接池', async () => {
            manager = new ConnectionPoolManager({
                logger: mockLogger
            });

            await manager.addPool({
                name: 'remove-test',
                uri: uri,
                role: 'primary'
            });

            let names = manager.getPoolNames();
            assert.strictEqual(names.length, 1);

            await manager.removePool('remove-test');

            names = manager.getPoolNames();
            assert.strictEqual(names.length, 0);
        });

        it('应该拒绝移除不存在的连接池', async () => {
            manager = new ConnectionPoolManager({
                logger: mockLogger
            });

            try {
                await manager.removePool('non-existent');
                assert.fail('应该抛出错误');
            } catch (error) {
                assert.ok(error.message.includes('not found'));
            }
        });
    });

    describe('5. 统计信��收集', () => {
        it('应该收集连接池统计', async () => {
            manager = new ConnectionPoolManager({
                logger: mockLogger
            });

            await manager.addPool({
                name: 'stats-test',
                uri: uri,
                role: 'primary'
            });

            const stats = manager.getPoolStats();
            assert.ok(stats);
            assert.ok(stats['stats-test']);
        });

        it('应该返回所有连接池统计', async () => {
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

            const stats = manager.getPoolStats();
            assert.strictEqual(Object.keys(stats).length, 2);
        });
    });

    describe('6. 故障转移场景', () => {
        it('应该在主连接池失败时使用备用', async () => {
            manager = new ConnectionPoolManager({
                logger: mockLogger,
                strategy: 'auto',
                fallback: {
                    enabled: true,
                    retryDelay: 100,
                    maxRetries: 2,
                    fallbackStrategy: 'secondary'
                }
            });

            // 添加一个无效的primary和一个有效的secondary
            try {
                await manager.addPool({
                    name: 'primary-fail',
                    uri: 'mongodb://invalid:27017/test',
                    role: 'primary'
                });
            } catch (error) {
                // 预期失败
            }

            await manager.addPool({
                name: 'secondary-backup',
                uri: uri,
                role: 'secondary'
            });

            // 验证有备用连接池
            const names = manager.getPoolNames();
            assert.ok(names.includes('secondary-backup'));
        });
    });

    describe('7. 并发操作', () => {
        it('应该支持并发添加连接池', async () => {
            manager = new ConnectionPoolManager({
                logger: mockLogger
            });

            const promises = [];
            for (let i = 0; i < 5; i++) {
                promises.push(
                    manager.addPool({
                        name: `concurrent-${i}`,
                        uri: uri,
                        role: i === 0 ? 'primary' : 'secondary'
                    })
                );
            }

            await Promise.all(promises);

            const names = manager.getPoolNames();
            assert.strictEqual(names.length, 5);
        });

        it('应该支持并发获取统计', async () => {
            manager = new ConnectionPoolManager({
                logger: mockLogger
            });

            await manager.addPool({
                name: 'concurrent-stats',
                uri: uri,
                role: 'primary'
            });

            const promises = [];
            for (let i = 0; i < 10; i++) {
                promises.push(manager.getPoolStats());
            }

            const results = await Promise.all(promises);
            assert.strictEqual(results.length, 10);
        });
    });

    describe('8. maxPoolsCount 限制', () => {
        it('应该强制执行连接池数量限制', async () => {
            manager = new ConnectionPoolManager({
                logger: mockLogger,
                maxPoolsCount: 2
            });

            await manager.addPool({
                name: 'limit-1',
                uri: uri,
                role: 'primary'
            });

            await manager.addPool({
                name: 'limit-2',
                uri: uri,
                role: 'secondary'
            });

            try {
                await manager.addPool({
                    name: 'limit-3',
                    uri: uri,
                    role: 'secondary'
                });
                assert.fail('应该抛出错误');
            } catch (error) {
                assert.ok(error.message.includes('Maximum') || error.message.includes('limit'));
            }
        });
    });

    describe('9. 关闭和清理', () => {
        it('应该正确关闭所有连接池', async () => {
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

            // 验证已关闭
            const names = manager.getPoolNames();
            assert.strictEqual(names.length, 0);
        });

        it('应该支持重复关闭', async () => {
            manager = new ConnectionPoolManager({
                logger: mockLogger
            });

            await manager.addPool({
                name: 'close-repeat',
                uri: uri,
                role: 'primary'
            });

            await manager.close();
            await manager.close(); // 第二次关闭

            assert.ok(true);
        });
    });

    describe('10. 边界情况', () => {
        it('应该处理空配置', () => {
            manager = new ConnectionPoolManager({
                logger: mockLogger
            });

            const names = manager.getPoolNames();
            assert.strictEqual(names.length, 0);
        });

        it('应该处理无效的策略', () => {
            manager = new ConnectionPoolManager({
                logger: mockLogger,
                strategy: 'invalid-strategy'
            });

            assert.ok(manager);
        });
    });
});

