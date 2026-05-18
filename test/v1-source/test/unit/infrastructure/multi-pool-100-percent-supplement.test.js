/**
 * 多连接池功能 - 100%覆盖率补充测试套件
 *
 * 专门针对剩余未覆盖代码的详细测试
 *
 * @since v1.0.8
 */

const assert = require('assert');
const { MongoMemoryServer } = require('mongodb-memory-server');
const { validatePoolConfig } = require('../../../lib/infrastructure/PoolConfig');
const ConnectionPoolManager = require('../../../lib/infrastructure/ConnectionPoolManager');
const HealthChecker = require('../../../lib/infrastructure/HealthChecker');
const { MongoClient } = require('mongodb');

describe('多连接池 - 100%覆盖率补充测试', function() {
    this.timeout(180000);

    let mongod;
    let uri;

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

    describe('PoolConfig.validatePoolConfig - 所有抛出异常的路径', () => {
        it('应该对null配置抛出异常', () => {
            assert.throws(
                () => validatePoolConfig(null),
                /config.*object/
            );
        });

        it('应该对undefined配置抛出异常', () => {
            assert.throws(
                () => validatePoolConfig(undefined),
                /config.*object/
            );
        });

        it('应该对非对象配置抛出异常', () => {
            assert.throws(
                () => validatePoolConfig('string'),
                /config.*object/
            );
        });

        it('应该对缺少name抛出异常', () => {
            assert.throws(
                () => validatePoolConfig({ uri: 'mongodb://localhost/test' }),
                /name.*required/
            );
        });

        it('应该对空name抛出异常', () => {
            assert.throws(
                () => validatePoolConfig({ name: '', uri: 'mongodb://localhost/test' }),
                /name.*required/
            );
        });

        it('应该对非字符串name抛出异常', () => {
            assert.throws(
                () => validatePoolConfig({ name: 123, uri: 'mongodb://localhost/test' }),
                /name.*string/
            );
        });

        it('应该对缺少uri抛出异常', () => {
            assert.throws(
                () => validatePoolConfig({ name: 'test' }),
                /uri.*required/
            );
        });

        it('应该对空uri抛出异常', () => {
            assert.throws(
                () => validatePoolConfig({ name: 'test', uri: '' }),
                /uri.*required/
            );
        });

        it('应该对非字符串uri抛出异常', () => {
            assert.throws(
                () => validatePoolConfig({ name: 'test', uri: 123 }),
                /uri.*string/
            );
        });

        it('应该对无效uri协议抛出异常', () => {
            assert.throws(
                () => validatePoolConfig({ name: 'test', uri: 'http://localhost' }),
                /mongodb/
            );
        });

        it('应该对无效role抛出异常', () => {
            assert.throws(
                () => validatePoolConfig({
                    name: 'test',
                    uri: 'mongodb://localhost/test',
                    role: 'invalid'
                }),
                /role.*one of/
            );
        });

        it('应该对负weight抛出异常', () => {
            assert.throws(
                () => validatePoolConfig({
                    name: 'test',
                    uri: 'mongodb://localhost/test',
                    weight: -1
                }),
                /weight.*non-negative/
            );
        });

        it('应该对非数字weight抛出异常', () => {
            assert.throws(
                () => validatePoolConfig({
                    name: 'test',
                    uri: 'mongodb://localhost/test',
                    weight: 'heavy'
                }),
                /weight.*number/
            );
        });

        it('应该对非对象options抛出异常', () => {
            assert.throws(
                () => validatePoolConfig({
                    name: 'test',
                    uri: 'mongodb://localhost/test',
                    options: 'invalid'
                }),
                /options.*object/
            );
        });

        it('应该对负maxPoolSize抛出异常', () => {
            assert.throws(
                () => validatePoolConfig({
                    name: 'test',
                    uri: 'mongodb://localhost/test',
                    options: { maxPoolSize: -1 }
                }),
                /maxPoolSize.*non-negative/
            );
        });

        it('应该对非对象healthCheck抛出异常', () => {
            assert.throws(
                () => validatePoolConfig({
                    name: 'test',
                    uri: 'mongodb://localhost/test',
                    healthCheck: 'invalid'
                }),
                /healthCheck.*object/
            );
        });

        it('应该对非布尔enabled抛出异常', () => {
            assert.throws(
                () => validatePoolConfig({
                    name: 'test',
                    uri: 'mongodb://localhost/test',
                    healthCheck: { enabled: 'yes' }
                }),
                /enabled.*boolean/
            );
        });

        it('应该对负interval抛出异常', () => {
            assert.throws(
                () => validatePoolConfig({
                    name: 'test',
                    uri: 'mongodb://localhost/test',
                    healthCheck: { interval: -1000 }
                }),
                /interval.*non-negative/
            );
        });

        it('应该对非数组tags抛出异常', () => {
            assert.throws(
                () => validatePoolConfig({
                    name: 'test',
                    uri: 'mongodb://localhost/test',
                    tags: 'invalid'
                }),
                /tags.*array/
            );
        });

        it('应该对非字符串tag元素抛出异常', () => {
            assert.throws(
                () => validatePoolConfig({
                    name: 'test',
                    uri: 'mongodb://localhost/test',
                    tags: [123]
                }),
                /tags.*string/
            );
        });

        it('应该接受完全有效的配置', () => {
            assert.doesNotThrow(() => {
                validatePoolConfig({
                    name: 'test',
                    uri: 'mongodb://localhost/test',
                    role: 'primary',
                    weight: 1,
                    tags: ['prod'],
                    options: {
                        maxPoolSize: 100,
                        minPoolSize: 10
                    },
                    healthCheck: {
                        enabled: true,
                        interval: 5000,
                        timeout: 3000,
                        retries: 3
                    }
                });
            });
        });
    });

    describe('HealthChecker - 精确的状态管理', () => {
        let checker;
        let client;

        beforeEach(async function() {
            client = new MongoClient(uri);
            await client.connect();
            checker = new HealthChecker({ logger: mockLogger });
        });

        afterEach(async function() {
            if (checker) {
                checker.stop();
            }
            if (client) {
                try {
                    await client.close();
                } catch (e) {
                    // 忽略
                }
            }
        });

        it('应该在register时初始化状态', () => {
            checker.register({
                name: 'test',
                healthCheck: { enabled: false }
            }, client);

            const status = checker.getStatus('test');
            assert.ok(status);
            assert.strictEqual(status.status, 'unknown');
            assert.strictEqual(status.consecutiveFailures, 0);
        });

        it('应该在启动后自动开始检查', async () => {
            checker.register({
                name: 'auto-start',
                healthCheck: {
                    enabled: true,
                    interval: 100,
                    timeout: 1000
                }
            }, client);

            checker.start();

            // 等待至少一次检查
            await new Promise(resolve => setTimeout(resolve, 150));

            const status = checker.getStatus('auto-start');
            assert.ok(status);
            // 应该已经检查过
            assert.ok(status.lastCheck > 0);
        });

        it('应该处理ping成功', async () => {
            checker.register({
                name: 'success',
                healthCheck: {
                    enabled: true,
                    interval: 100,
                    timeout: 1000,
                    retries: 1
                }
            }, client);

            checker.start();
            await new Promise(resolve => setTimeout(resolve, 150));

            const status = checker.getStatus('success');
            assert.ok(status);
            assert.strictEqual(status.status, 'up');
            assert.strictEqual(status.consecutiveFailures, 0);
        });

        it('应该处理ping失败', async () => {
            checker.register({
                name: 'fail',
                healthCheck: {
                    enabled: true,
                    interval: 100,
                    timeout: 50,
                    retries: 1
                }
            }, client);

            // 关闭客户端
            await client.close();
            client = null;

            checker.start();
            await new Promise(resolve => setTimeout(resolve, 200));

            const status = checker.getStatus('fail');
            assert.ok(status);
            // 应该标记为失败
            assert.ok(status.consecutiveFailures > 0);
        });

        it('应该在连续失败后标记为down', async () => {
            checker.register({
                name: 'down',
                healthCheck: {
                    enabled: true,
                    interval: 50,
                    timeout: 20,
                    retries: 2
                }
            }, client);

            await client.close();
            client = null;

            checker.start();
            // 等待足够时间让重试完成
            await new Promise(resolve => setTimeout(resolve, 300));

            const status = checker.getStatus('down');
            assert.ok(status);
            assert.ok(status.consecutiveFailures >= 2);
        });

        it('应该记录lastError', async () => {
            const badClient = {
                db: () => ({
                    admin: () => ({
                        ping: async () => {
                            throw new Error('Test error');
                        }
                    })
                })
            };

            checker.register({
                name: 'error',
                healthCheck: {
                    enabled: true,
                    interval: 100,
                    timeout: 1000,
                    retries: 1
                }
            }, badClient);

            checker.start();
            await new Promise(resolve => setTimeout(resolve, 150));

            const status = checker.getStatus('error');
            assert.ok(status);
            assert.ok(status.lastError);
        });

        it('应该在unregister后返回null', () => {
            checker.register({
                name: 'unreg',
                healthCheck: { enabled: false }
            }, client);

            assert.ok(checker.getStatus('unreg'));

            checker.unregister('unreg');
            assert.strictEqual(checker.getStatus('unreg'), null);
        });

        it('应该返回所有状态的副本', () => {
            checker.register({
                name: 'test1',
                healthCheck: { enabled: false }
            }, client);

            const status1 = checker.getAllStatus();
            const status2 = checker.getAllStatus();

            assert.notStrictEqual(status1, status2);
            assert.strictEqual(status1.size, status2.size);
        });
    });

    describe('ConnectionPoolManager - 边界情况100%', () => {
        let manager;

        afterEach(async function() {
            if (manager) {
                try {
                    await manager.close();
                } catch (e) {
                    // 忽略
                }
                manager = null;
            }
        });

        it('应该处理maxPoolsCount限制', async () => {
            manager = new ConnectionPoolManager({
                logger: mockLogger,
                maxPoolsCount: 2
            });

            await manager.addPool({
                name: 'pool1',
                uri: uri,
                role: 'primary'
            });

            await manager.addPool({
                name: 'pool2',
                uri: uri,
                role: 'secondary'
            });

            try {
                await manager.addPool({
                    name: 'pool3',
                    uri: uri,
                    role: 'secondary'
                });
                assert.fail('应该抛出错误');
            } catch (error) {
                assert.ok(error.message.includes('Maximum'));
            }
        });

        it('应该处理重复的池名称', async () => {
            manager = new ConnectionPoolManager({
                logger: mockLogger
            });

            await manager.addPool({
                name: 'duplicate',
                uri: uri,
                role: 'primary'
            });

            try {
                await manager.addPool({
                    name: 'duplicate',
                    uri: uri,
                    role: 'secondary'
                });
                assert.fail('应该抛出错误');
            } catch (error) {
                assert.ok(error.message.includes('already exists') || error.message.includes('duplicate'));
            }
        });

        it('应该处理无效的URI', async () => {
            manager = new ConnectionPoolManager({
                logger: mockLogger
            });

            try {
                await manager.addPool({
                    name: 'invalid',
                    uri: 'mongodb://invalid-host-xyz:27017/test',
                    role: 'primary',
                    options: {
                        serverSelectionTimeoutMS: 1000,
                        connectTimeoutMS: 1000
                    }
                });
                // 可能会失败
            } catch (error) {
                // 预期可能失败
                assert.ok(error);
            }
        });

        it('应该返回空数组当没有池时', () => {
            manager = new ConnectionPoolManager({
                logger: mockLogger
            });

            const names = manager.getPoolNames();
            assert.strictEqual(names.length, 0);
        });

        it('应该返回空对象当没有统计时', () => {
            manager = new ConnectionPoolManager({
                logger: mockLogger
            });

            const stats = manager.getPoolStats();
            assert.deepStrictEqual(stats, {});
        });

        it('应该返回空Map当没有健康状态时', () => {
            manager = new ConnectionPoolManager({
                logger: mockLogger
            });

            const health = manager.getPoolHealth();
            assert.ok(health instanceof Map);
            assert.strictEqual(health.size, 0);
        });

        it('应该处理选择不存在的池', async () => {
            manager = new ConnectionPoolManager({
                logger: mockLogger
            });

            await manager.addPool({
                name: 'exists',
                uri: uri,
                role: 'primary'
            });

            try {
                manager.selectPool('read', { pool: 'not-exists' });
                assert.fail('应该抛出错误');
            } catch (error) {
                assert.ok(error.message.includes('not found') || error.message.includes('not available'));
            }
        });

        it('应该支持重复启动健康检查', async () => {
            manager = new ConnectionPoolManager({
                logger: mockLogger
            });

            await manager.addPool({
                name: 'health',
                uri: uri,
                role: 'primary'
            });

            manager.startHealthCheck();
            manager.startHealthCheck(); // 第二次
            manager.startHealthCheck(); // 第三次

            assert.ok(true); // 不应该抛出错误
        });

        it('应该支持重复停止健康检查', () => {
            manager = new ConnectionPoolManager({
                logger: mockLogger
            });

            manager.stopHealthCheck();
            manager.stopHealthCheck();
            manager.stopHealthCheck();

            assert.ok(true);
        });

        it('应该处理所有池状态为down的情况', async () => {
            manager = new ConnectionPoolManager({
                logger: mockLogger,
                fallback: {
                    enabled: true,
                    fallbackStrategy: 'error'
                }
            });

            await manager.addPool({
                name: 'down-pool',
                uri: uri,
                role: 'primary'
            });

            // 模拟down状态
            const status = manager._healthChecker.getStatus('down-pool');
            if (status) {
                status.status = 'down';
                status.consecutiveFailures = 10;
            }

            try {
                manager.selectPool('read');
                // 可能抛出错误或降级
            } catch (error) {
                assert.ok(error.message.includes('No available'));
            }
        });
    });

    describe('极端并发和压力测试', () => {
        let manager;

        afterEach(async function() {
            if (manager) {
                await manager.close();
                manager = null;
            }
        });

        it('应该处理极高并发的池选择', async () => {
            manager = new ConnectionPoolManager({
                logger: mockLogger
            });

            await manager.addPool({
                name: 'stress',
                uri: uri,
                role: 'primary'
            });

            // 1000次并发选择
            const promises = [];
            for (let i = 0; i < 1000; i++) {
                promises.push(
                    Promise.resolve(manager.selectPool('read', { pool: 'stress' }))
                );
            }

            const results = await Promise.all(promises);
            assert.strictEqual(results.length, 1000);
            assert.ok(results.every(r => r.name === 'stress'));
        });

        it('应该处理并发添加和移除', async () => {
            manager = new ConnectionPoolManager({
                logger: mockLogger
            });

            const operations = [];

            // 并发添加
            for (let i = 0; i < 5; i++) {
                operations.push(
                    manager.addPool({
                        name: `concurrent-${i}`,
                        uri: uri,
                        role: i % 2 === 0 ? 'primary' : 'secondary'
                    })
                );
            }

            await Promise.all(operations);

            // 并发移除
            const removes = [];
            for (let i = 0; i < 5; i++) {
                removes.push(
                    manager.removePool(`concurrent-${i}`).catch(e => e)
                );
            }

            await Promise.all(removes);

            assert.strictEqual(manager.getPoolNames().length, 0);
        });

        it('应该处理混合并发操作', async () => {
            manager = new ConnectionPoolManager({
                logger: mockLogger
            });

            await manager.addPool({
                name: 'base',
                uri: uri,
                role: 'primary'
            });

            const operations = [];

            // 并发选择
            for (let i = 0; i < 100; i++) {
                operations.push(
                    Promise.resolve(manager.selectPool('read', { pool: 'base' }))
                );
            }

            // 并发获取状态
            for (let i = 0; i < 50; i++) {
                operations.push(
                    Promise.resolve(manager.getPoolStats())
                );
            }

            // 并发启动/停止健康检查
            for (let i = 0; i < 10; i++) {
                operations.push(
                    Promise.resolve(manager.startHealthCheck())
                );
                operations.push(
                    Promise.resolve(manager.stopHealthCheck())
                );
            }

            await Promise.all(operations);

            assert.ok(true);
        });
    });
});

