/**
 * HealthChecker 单元测试
 *
 * 测试健康检查功能
 *
 * @since v1.0.8
 */

const assert = require('assert');
const HealthChecker = require('../../../lib/infrastructure/HealthChecker');

describe('HealthChecker 单元测试', function() {
    this.timeout(10000);

    let checker;
    const mockLogger = {
        info: () => {},
        warn: () => {},
        error: () => {},
        debug: () => {}
    };

    const mockPoolManager = {
        _getPool: (name) => {
            if (name === 'healthy-pool') {
                return {
                    db: () => ({
                        command: async () => ({ ok: 1 })
                    })
                };
            }
            if (name === 'unhealthy-pool') {
                return {
                    db: () => ({
                        command: async () => { throw new Error('Connection failed'); }
                    })
                };
            }
            return null;
        }
    };

    afterEach(() => {
        if (checker) {
            checker.stop();
            checker = null;
        }
    });

    describe('1. 初始化', () => {
        it('应该成功创建实例', () => {
            checker = new HealthChecker({
                poolManager: mockPoolManager,
                logger: mockLogger
            });

            assert.ok(checker instanceof HealthChecker);
        });
    });

    describe('2. 注册连接池', () => {
        beforeEach(() => {
            checker = new HealthChecker({
                poolManager: mockPoolManager,
                logger: mockLogger
            });
        });

        it('应该能注册连接池', () => {
            checker.register('test-pool', {
                interval: 5000,
                timeout: 3000
            });

            const status = checker.getStatus('test-pool');
            assert.ok(status);
            assert.strictEqual(status.status, 'up');
        });

        it('应该使用默认配置', () => {
            checker.register('test-pool', {});
            const status = checker.getStatus('test-pool');
            assert.ok(status);
        });
    });

    describe('3. 注销连接池', () => {
        beforeEach(() => {
            checker = new HealthChecker({
                poolManager: mockPoolManager,
                logger: mockLogger
            });
        });

        it('应该能注销连接池', () => {
            checker.register('test-pool', {});
            checker.unregister('test-pool');

            const status = checker.getStatus('test-pool');
            assert.strictEqual(status, undefined);
        });
    });

    describe('4. 健康检查', () => {
        beforeEach(() => {
            checker = new HealthChecker({
                poolManager: mockPoolManager,
                logger: mockLogger
            });
        });

        it('应该检测健康的连接池', async () => {
            checker.register('healthy-pool', { interval: 1000 });

            // 执行检查
            await checker.checkPool('healthy-pool');

            const status = checker.getStatus('healthy-pool');
            assert.strictEqual(status.status, 'up');
        });

        it('应该检测不健康的连接池', async () => {
            checker.register('unhealthy-pool', { interval: 1000 });

            // 执行检查
            try {
                await checker.checkPool('unhealthy-pool');
            } catch (error) {
                // 预期会失败
            }

            const status = checker.getStatus('unhealthy-pool');
            assert.ok(status.consecutiveFailures > 0 || status.status === 'down');
        });
    });

    describe('5. 启动和停止', () => {
        beforeEach(() => {
            checker = new HealthChecker({
                poolManager: mockPoolManager,
                logger: mockLogger
            });
        });

        it('应该能启动健康检查', () => {
            checker.register('test-pool', { interval: 5000 });
            checker.start();

            // 验证已启动
            assert.ok(checker._started);
        });

        it('应该能停止健康检查', () => {
            checker.register('test-pool', { interval: 5000 });
            checker.start();
            checker.stop();

            // 验证已停止
            assert.ok(!checker._started);
        });

        it('应该支持重复启动', () => {
            checker.start();
            checker.start(); // 第二次启动应该无效但不报错

            assert.ok(checker._started);
        });

        it('应该支持重复停止', () => {
            checker.start();
            checker.stop();
            checker.stop(); // 第二次停止应该无效但不报错

            assert.ok(!checker._started);
        });
    });

    describe('6. 获取状态', () => {
        beforeEach(() => {
            checker = new HealthChecker({
                poolManager: mockPoolManager,
                logger: mockLogger
            });
        });

        it('应该能获取单个连接池状态', () => {
            checker.register('test-pool', {});
            const status = checker.getStatus('test-pool');

            assert.ok(status);
            assert.ok(status.status);
            assert.ok(status.lastCheck instanceof Date);
        });

        it('应该能获取所有状态', () => {
            checker.register('pool1', {});
            checker.register('pool2', {});

            const allStatus = checker.getAllStatus();

            assert.ok(allStatus instanceof Map);
            assert.strictEqual(allStatus.size, 2);
        });

        it('应该返回undefined对于不存在的连接池', () => {
            const status = checker.getStatus('non-existent');
            assert.strictEqual(status, undefined);
        });
    });

    describe('7. 故障恢复', () => {
        beforeEach(() => {
            checker = new HealthChecker({
                poolManager: mockPoolManager,
                logger: mockLogger
            });
        });

        it('应该记录连续失败次数', async () => {
            checker.register('unhealthy-pool', {});

            // 执行多次检查
            for (let i = 0; i < 3; i++) {
                try {
                    await checker.checkPool('unhealthy-pool');
                } catch (error) {
                    // 预期失败
                }
            }

            const status = checker.getStatus('unhealthy-pool');
            assert.ok(status.consecutiveFailures >= 1);
        });
    });

    describe('8. 边界情况', () => {
        beforeEach(() => {
            checker = new HealthChecker({
                poolManager: mockPoolManager,
                logger: mockLogger
            });
        });

        it('应该处理空配置', () => {
            checker.register('test-pool', null);
            const status = checker.getStatus('test-pool');
            assert.ok(status);
        });

        it('应该处理未注册就启动', () => {
            checker.start();
            // 应该不报错
            assert.ok(checker._started);
        });

        it('应该处理重复注册', () => {
            checker.register('test-pool', {});
            checker.register('test-pool', {}); // 重复注册

            const allStatus = checker.getAllStatus();
            assert.strictEqual(allStatus.size, 1);
        });
    });
});

