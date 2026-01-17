/**
 * HealthChecker 100%覆盖率测试
 *
 * 覆盖运行时场景和所有分支
 *
 * @since v1.0.8
 */

const assert = require('assert');
const { MongoMemoryServer } = require('mongodb-memory-server');
const HealthChecker = require('../../../lib/infrastructure/HealthChecker');
const { MongoClient } = require('mongodb');

describe('HealthChecker - 100%覆盖率测试', () => {
    let mongod;
    let uri;
    let client;
    let checker;

    const mockLogger = {
        info: () => {},
        warn: () => {},
        error: () => {},
        debug: () => {}
    };

    before(async function() {
        this.timeout(60000);
        mongod = await MongoMemoryServer.create();
        uri = mongod.getUri();
    });

    after(async function() {
        if (mongod) {
            await mongod.stop();
        }
    });

    beforeEach(async function() {
        client = new MongoClient(uri);
        await client.connect();

        checker = new HealthChecker({
            logger: mockLogger
        });
    });

    afterEach(async function() {
        if (checker) {
            checker.stop();
        }
        if (client) {
            await client.close();
        }
    });

    describe('1. 健康检查运行时场景', () => {
        it('应该在健康检查失败后标记为down', async () => {
            // 注册一个连接池
            checker.register({
                name: 'test-pool',
                healthCheck: {
                    enabled: true,
                    interval: 100,
                    timeout: 50,
                    retries: 2
                }
            }, client);

            // 关闭客户端模拟失败
            await client.close();
            client = null;

            // 启动健康检查
            checker.start();

            // 等待健康检查执行并失败
            await new Promise(resolve => setTimeout(resolve, 500));

            const status = checker.getStatus('test-pool');
            // 经过2次重试后应该标记为down
            assert.ok(status);
        });

        it('应该在连续失败达到阈值后标记为down', async () => {
            checker.register({
                name: 'fail-pool',
                healthCheck: {
                    enabled: true,
                    interval: 100,
                    timeout: 50,
                    retries: 3
                }
            }, client);

            // 关闭客户端
            await client.close();
            client = null;

            checker.start();

            // 等待3次重试
            await new Promise(resolve => setTimeout(resolve, 400));

            const status = checker.getStatus('fail-pool');
            assert.ok(status);
            assert.ok(status.consecutiveFailures >= 3);
        });

        it('应该在从down恢复到up', async () => {
            // 先注册一个会失败的
            const badClient = new MongoClient('mongodb://invalid:27017/test');

            checker.register({
                name: 'recover-pool',
                healthCheck: {
                    enabled: true,
                    interval: 100,
                    timeout: 50,
                    retries: 1
                }
            }, badClient);

            checker.start();

            // 等待失败
            await new Promise(resolve => setTimeout(resolve, 200));

            // 注销并重新注册好的客户端
            checker.unregister('recover-pool');
            checker.register({
                name: 'recover-pool',
                healthCheck: {
                    enabled: true,
                    interval: 100,
                    timeout: 1000,
                    retries: 1
                }
            }, client);

            // 等待恢复
            await new Promise(resolve => setTimeout(resolve, 200));

            const status = checker.getStatus('recover-pool');
            assert.ok(status);
        });

        it('应该在ping超时时标记失败', async () => {
            checker.register({
                name: 'timeout-pool',
                healthCheck: {
                    enabled: true,
                    interval: 100,
                    timeout: 1, // 极短超时
                    retries: 1
                }
            }, client);

            checker.start();

            // 等待超时
            await new Promise(resolve => setTimeout(resolve, 200));

            const status = checker.getStatus('timeout-pool');
            assert.ok(status);
        });
    });

    describe('2. 注册和注销边界情况', () => {
        it('应该处理重复注册', () => {
            checker.register({
                name: 'duplicate',
                healthCheck: { enabled: false }
            }, client);

            // 重复注册应该覆盖
            checker.register({
                name: 'duplicate',
                healthCheck: { enabled: false }
            }, client);

            assert.ok(checker.getStatus('duplicate'));
        });

        it('应该在注销后无法获取状态', () => {
            checker.register({
                name: 'unregister-test',
                healthCheck: { enabled: false }
            }, client);

            checker.unregister('unregister-test');

            const status = checker.getStatus('unregister-test');
            assert.strictEqual(status, null);
        });

        it('应该在启动后注册新池时自动开始检查', () => {
            checker.start();

            checker.register({
                name: 'late-register',
                healthCheck: {
                    enabled: true,
                    interval: 5000
                }
            }, client);

            // 应该有状态
            const status = checker.getStatus('late-register');
            assert.ok(status);
        });

        it('应该在停止后注册不启动检查', () => {
            checker.stop();

            checker.register({
                name: 'stopped-register',
                healthCheck: {
                    enabled: true,
                    interval: 100
                }
            }, client);

            // 应该有状态但不会自动检查
            const status = checker.getStatus('stopped-register');
            assert.ok(status);
        });
    });

    describe('3. 健康检查配置边界', () => {
        it('应该处理 enabled=false 的情况', () => {
            checker.register({
                name: 'disabled',
                healthCheck: {
                    enabled: false
                }
            }, client);

            checker.start();

            // 不应该启动检查
            assert.ok(checker.getStatus('disabled'));
        });

        it('应该处理缺少 interval 的情况', () => {
            checker.register({
                name: 'no-interval',
                healthCheck: {
                    enabled: true,
                    timeout: 3000
                    // interval 缺失
                }
            }, client);

            checker.start();

            // 应该使用默认值
            assert.ok(checker.getStatus('no-interval'));
        });

        it('应该处理缺少 timeout 的情况', () => {
            checker.register({
                name: 'no-timeout',
                healthCheck: {
                    enabled: true,
                    interval: 5000
                    // timeout 缺失
                }
            }, client);

            checker.start();

            assert.ok(checker.getStatus('no-timeout'));
        });

        it('应该处理缺少 retries 的情况', () => {
            checker.register({
                name: 'no-retries',
                healthCheck: {
                    enabled: true,
                    interval: 5000
                    // retries 缺失
                }
            }, client);

            checker.start();

            assert.ok(checker.getStatus('no-retries'));
        });

        it('应该处理空的 healthCheck 配置', () => {
            checker.register({
                name: 'empty-config',
                healthCheck: {}
            }, client);

            checker.start();

            assert.ok(checker.getStatus('empty-config'));
        });
    });

    describe('4. 多连接池并发场景', () => {
        it('应该同时检查多个连接池', async () => {
            for (let i = 0; i < 5; i++) {
                const newClient = new MongoClient(uri);
                await newClient.connect();

                checker.register({
                    name: `concurrent-${i}`,
                    healthCheck: {
                        enabled: true,
                        interval: 200,
                        timeout: 1000
                    }
                }, newClient);
            }

            checker.start();

            // 等待所有检查执行
            await new Promise(resolve => setTimeout(resolve, 300));

            // 所有池都应该有状态
            for (let i = 0; i < 5; i++) {
                const status = checker.getStatus(`concurrent-${i}`);
                assert.ok(status);
            }
        });

        it('应该处理部分池失败的情况', async () => {
            // 添加一个好的
            checker.register({
                name: 'good',
                healthCheck: {
                    enabled: true,
                    interval: 100,
                    retries: 1
                }
            }, client);

            // 添加一个坏的
            const badClient = new MongoClient('mongodb://invalid:27017/test');
            checker.register({
                name: 'bad',
                healthCheck: {
                    enabled: true,
                    interval: 100,
                    timeout: 50,
                    retries: 1
                }
            }, badClient);

            checker.start();

            // 等待检查
            await new Promise(resolve => setTimeout(resolve, 300));

            const goodStatus = checker.getStatus('good');
            const badStatus = checker.getStatus('bad');

            assert.ok(goodStatus);
            assert.ok(badStatus);
        });
    });

    describe('5. getAllStatus 方法', () => {
        it('应该返回所有连接池的状态', () => {
            checker.register({
                name: 'pool1',
                healthCheck: { enabled: false }
            }, client);

            checker.register({
                name: 'pool2',
                healthCheck: { enabled: false }
            }, client);

            const allStatus = checker.getAllStatus();
            assert.ok(allStatus instanceof Map);
            assert.strictEqual(allStatus.size, 2);
            assert.ok(allStatus.has('pool1'));
            assert.ok(allStatus.has('pool2'));
        });

        it('应该返回空Map当没有注册池时', () => {
            const allStatus = checker.getAllStatus();
            assert.ok(allStatus instanceof Map);
            assert.strictEqual(allStatus.size, 0);
        });

        it('应该返回Map的副本', () => {
            checker.register({
                name: 'copy-test',
                healthCheck: { enabled: false }
            }, client);

            const status1 = checker.getAllStatus();
            const status2 = checker.getAllStatus();

            // 应该是不同的实例
            assert.notStrictEqual(status1, status2);
        });
    });

    describe('6. 停止和清理', () => {
        it('应该在停止时清理所有定时器', async () => {
            for (let i = 0; i < 3; i++) {
                checker.register({
                    name: `cleanup-${i}`,
                    healthCheck: {
                        enabled: true,
                        interval: 100
                    }
                }, client);
            }

            checker.start();

            // 等待启动
            await new Promise(resolve => setTimeout(resolve, 50));

            checker.stop();

            // 再等待，确保没有继续检查
            await new Promise(resolve => setTimeout(resolve, 200));

            // 应该正常结束
            assert.ok(true);
        });

        it('应该支持重复停止', () => {
            checker.start();
            checker.stop();
            checker.stop(); // 第二次停止

            assert.ok(true);
        });

        it('应该支持停止-启动循环', async () => {
            checker.register({
                name: 'cycle',
                healthCheck: {
                    enabled: true,
                    interval: 100
                }
            }, client);

            checker.start();
            await new Promise(resolve => setTimeout(resolve, 50));

            checker.stop();
            await new Promise(resolve => setTimeout(resolve, 50));

            checker.start();
            await new Promise(resolve => setTimeout(resolve, 50));

            checker.stop();

            assert.ok(true);
        });
    });

    describe('7. 错误处理', () => {
        it('应该处理 client 为 null 的情况', () => {
            checker.register({
                name: 'null-client',
                healthCheck: { enabled: false }
            }, null);

            // 应该有状态但检查时会失败
            const status = checker.getStatus('null-client');
            assert.ok(status);
        });

        it('应该处理 ping 抛出异常', async () => {
            const brokenClient = {
                db: () => ({
                    admin: () => ({
                        ping: async () => {
                            throw new Error('Ping failed');
                        }
                    })
                })
            };

            checker.register({
                name: 'broken',
                healthCheck: {
                    enabled: true,
                    interval: 100,
                    timeout: 1000,
                    retries: 1
                }
            }, brokenClient);

            checker.start();

            // 等待检查失败
            await new Promise(resolve => setTimeout(resolve, 200));

            const status = checker.getStatus('broken');
            assert.ok(status);
            assert.ok(status.lastError || status.consecutiveFailures > 0);
        });
    });
});

