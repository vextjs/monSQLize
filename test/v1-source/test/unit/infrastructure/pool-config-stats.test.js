/**
 * PoolConfig 和 PoolStats 单元测试
 *
 * @since v1.0.8
 */

const assert = require('assert');
const PoolConfig = require('../../../lib/infrastructure/PoolConfig');
const PoolStats = require('../../../lib/infrastructure/PoolStats');

describe('PoolConfig 单元测试', function() {
    describe('1. 配置验证', () => {
        it('应该验证必需字段', () => {
            const errors = PoolConfig.validate({});
            assert.ok(errors.length > 0);
            assert.ok(errors.some(e => e.includes('name')));
        });

        it('应该验证完整配置', () => {
            const config = {
                name: 'test-pool',
                uri: 'mongodb://localhost:27017/test',
                role: 'primary',
                weight: 1,
                options: {}
            };

            const errors = PoolConfig.validate(config);
            assert.strictEqual(errors.length, 0);
        });

        it('应该验证role字段', () => {
            const config = {
                name: 'test',
                uri: 'mongodb://localhost:27017/test',
                role: 'invalid-role'
            };

            const errors = PoolConfig.validate(config);
            assert.ok(errors.some(e => e.includes('role')));
        });

        it('应该验证weight字段', () => {
            const config = {
                name: 'test',
                uri: 'mongodb://localhost:27017/test',
                role: 'primary',
                weight: -1
            };

            const errors = PoolConfig.validate(config);
            assert.ok(errors.some(e => e.includes('weight')));
        });
    });

    describe('2. 默认值', () => {
        it('应该提供默认role', () => {
            const config = {
                name: 'test',
                uri: 'mongodb://localhost:27017/test'
            };

            const errors = PoolConfig.validate(config);
            assert.strictEqual(errors.length, 0);
        });

        it('应该提供默认weight', () => {
            const config = {
                name: 'test',
                uri: 'mongodb://localhost:27017/test',
                role: 'secondary'
            };

            const errors = PoolConfig.validate(config);
            assert.strictEqual(errors.length, 0);
        });
    });

    describe('3. 健康检查配置', () => {
        it('应该验证健康检查配置', () => {
            const config = {
                name: 'test',
                uri: 'mongodb://localhost:27017/test',
                role: 'primary',
                healthCheck: {
                    interval: 30000,
                    timeout: 5000
                }
            };

            const errors = PoolConfig.validate(config);
            assert.strictEqual(errors.length, 0);
        });

        it('应该验证无效的健康检查间隔', () => {
            const config = {
                name: 'test',
                uri: 'mongodb://localhost:27017/test',
                role: 'primary',
                healthCheck: {
                    interval: -1000
                }
            };

            const errors = PoolConfig.validate(config);
            assert.ok(errors.some(e => e.includes('interval') || e.includes('healthCheck')));
        });

        it('应该验证健康检查的enabled字段', () => {
            const config = {
                name: 'test',
                uri: 'mongodb://localhost:27017/test',
                healthCheck: {
                    enabled: true,
                    interval: 30000
                }
            };

            const errors = PoolConfig.validate(config);
            assert.strictEqual(errors.length, 0);
        });

        it('应该验证健康检查的retries字段', () => {
            const config = {
                name: 'test',
                uri: 'mongodb://localhost:27017/test',
                healthCheck: {
                    retries: 3,
                    timeout: 5000
                }
            };

            const errors = PoolConfig.validate(config);
            assert.strictEqual(errors.length, 0);
        });
    });

    describe('4. MongoDB连接选项', () => {
        it('应该验证maxPoolSize', () => {
            const config = {
                name: 'test',
                uri: 'mongodb://localhost:27017/test',
                options: {
                    maxPoolSize: 100
                }
            };

            const errors = PoolConfig.validate(config);
            assert.strictEqual(errors.length, 0);
        });

        it('应该验证minPoolSize', () => {
            const config = {
                name: 'test',
                uri: 'mongodb://localhost:27017/test',
                options: {
                    minPoolSize: 10
                }
            };

            const errors = PoolConfig.validate(config);
            assert.strictEqual(errors.length, 0);
        });

        it('应该验证完整的options配置', () => {
            const config = {
                name: 'test',
                uri: 'mongodb://localhost:27017/test',
                options: {
                    maxPoolSize: 100,
                    minPoolSize: 10,
                    maxIdleTimeMS: 30000,
                    waitQueueTimeoutMS: 5000,
                    connectTimeoutMS: 10000,
                    serverSelectionTimeoutMS: 30000
                }
            };

            const errors = PoolConfig.validate(config);
            assert.strictEqual(errors.length, 0);
        });

        it('应该拒绝负数的maxPoolSize', () => {
            const config = {
                name: 'test',
                uri: 'mongodb://localhost:27017/test',
                options: {
                    maxPoolSize: -1
                }
            };

            const errors = PoolConfig.validate(config);
            assert.ok(errors.length > 0);
        });
    });

    describe('5. Tags 验证', () => {
        it('应该验证tags数组', () => {
            const config = {
                name: 'test',
                uri: 'mongodb://localhost:27017/test',
                tags: ['prod', 'read', 'backup']
            };

            const errors = PoolConfig.validate(config);
            assert.strictEqual(errors.length, 0);
        });

        it('应该拒绝非数组的tags', () => {
            const config = {
                name: 'test',
                uri: 'mongodb://localhost:27017/test',
                tags: 'not-an-array'
            };

            const errors = PoolConfig.validate(config);
            assert.ok(errors.some(e => e.includes('array')));
        });

        it('应该拒绝非字符串的tag元素', () => {
            const config = {
                name: 'test',
                uri: 'mongodb://localhost:27017/test',
                tags: ['valid', 123, 'valid2']
            };

            const errors = PoolConfig.validate(config);
            assert.ok(errors.some(e => e.includes('string')));
        });

        it('应该接受空tags数组', () => {
            const config = {
                name: 'test',
                uri: 'mongodb://localhost:27017/test',
                tags: []
            };

            const errors = PoolConfig.validate(config);
            assert.strictEqual(errors.length, 0);
        });
    });

    describe('6. URI 格式验证', () => {
        it('应该接受mongodb://协议', () => {
            const config = {
                name: 'test',
                uri: 'mongodb://localhost:27017/test'
            };

            const errors = PoolConfig.validate(config);
            assert.strictEqual(errors.length, 0);
        });

        it('应该接受mongodb+srv://协议', () => {
            const config = {
                name: 'test',
                uri: 'mongodb+srv://cluster.mongodb.net/test'
            };

            const errors = PoolConfig.validate(config);
            assert.strictEqual(errors.length, 0);
        });

        it('应该拒绝无效的URI协议', () => {
            const config = {
                name: 'test',
                uri: 'http://localhost:27017/test'
            };

            const errors = PoolConfig.validate(config);
            assert.ok(errors.some(e => e.includes('mongodb://')));
        });
    });
});

describe('PoolStats 单元测试', function() {
    let stats;

    beforeEach(() => {
        stats = new PoolStats();
    });

    describe('1. 记录统计', () => {
        it('应该记录查询统计', async () => {
            await stats.recordQuery('pool1', 100, null);

            const poolStats = stats.getStats('pool1');
            assert.strictEqual(poolStats.totalRequests, 1);
            assert.ok(poolStats.avgResponseTime >= 0);
        });

        it('应该记录错误', async () => {
            await stats.recordQuery('pool1', 100, new Error('Test error'));

            const poolStats = stats.getStats('pool1');
            assert.strictEqual(poolStats.failedRequests, 1);
            assert.ok(poolStats.errorRate > 0);
        });

        it('应该计算平均响应时间', async () => {
            await stats.recordQuery('pool1', 100, null);
            await stats.recordQuery('pool1', 200, null);

            const poolStats = stats.getStats('pool1');
            assert.ok(poolStats.avgResponseTime > 0);
            assert.ok(poolStats.avgResponseTime <= 200);
        });
    });

    describe('2. 连接数统计', () => {
        it('应该记录连接数', () => {
            stats.recordConnections('pool1', 5);

            const poolStats = stats.getStats('pool1');
            assert.strictEqual(poolStats.connections, 5);
        });

        it('应该更新连接数', () => {
            stats.recordConnections('pool1', 5);
            stats.recordConnections('pool1', 10);

            const poolStats = stats.getStats('pool1');
            assert.strictEqual(poolStats.connections, 10);
        });
    });

    describe('3. 获取统计', () => {
        it('应该获取单个连接池统计', async () => {
            await stats.recordQuery('pool1', 100, null);

            const poolStats = stats.getStats('pool1');
            assert.ok(poolStats);
            assert.ok(poolStats.totalRequests >= 0);
        });

        it('应该获取所有统计', async () => {
            await stats.recordQuery('pool1', 100, null);
            await stats.recordQuery('pool2', 200, null);

            const allStats = stats.getAllStats();
            assert.ok(allStats);
            assert.ok(allStats.pool1);
            assert.ok(allStats.pool2);
        });

        it('应该返回初始统计对于新连接池', () => {
            const poolStats = stats.getStats('new-pool');
            assert.ok(poolStats);
            assert.strictEqual(poolStats.totalRequests, 0);
            assert.strictEqual(poolStats.failedRequests, 0);
        });
    });

    describe('4. 重置统计', () => {
        it('应该重置单个连接池统计', async () => {
            await stats.recordQuery('pool1', 100, null);
            stats.reset('pool1');

            const poolStats = stats.getStats('pool1');
            assert.strictEqual(poolStats.totalRequests, 0);
        });

        it('应该重置所有统计', async () => {
            await stats.recordQuery('pool1', 100, null);
            await stats.recordQuery('pool2', 200, null);
            stats.resetAll();

            const allStats = stats.getAllStats();
            // 重置后应该是空对象
            assert.strictEqual(Object.keys(allStats).length, 0);
        });
    });

    describe('5. 边界情况', () => {
        it('应该处理高频率记录', async () => {
            const promises = [];
            for (let i = 0; i < 100; i++) {
                promises.push(stats.recordQuery('pool1', i, null));
            }
            await Promise.all(promises);

            const poolStats = stats.getStats('pool1');
            assert.ok(poolStats.totalRequests >= 100);
        });

        it('应该处理零响应时间', async () => {
            await stats.recordQuery('pool1', 0, null);

            const poolStats = stats.getStats('pool1');
            assert.strictEqual(poolStats.avgResponseTime, 0);
        });

        it('应该处理null错误', async () => {
            await stats.recordQuery('pool1', 100, null);

            const poolStats = stats.getStats('pool1');
            assert.strictEqual(poolStats.failedRequests, 0);
        });
    });

    describe('6. 错误率计算', () => {
        it('应该正确计算错误率', async () => {
            // 5个成功，5个失败
            for (let i = 0; i < 5; i++) {
                await stats.recordQuery('pool1', 100, null);
            }
            for (let i = 0; i < 5; i++) {
                await stats.recordQuery('pool1', 100, new Error('Test'));
            }

            const poolStats = stats.getStats('pool1');
            assert.ok(poolStats.errorRate >= 0.4 && poolStats.errorRate <= 0.6);
        });

        it('应该处理零请求的情况', () => {
            const poolStats = stats.getStats('pool1');
            assert.strictEqual(poolStats.errorRate, 0);
        });

        it('应该处理全部成功的情况', async () => {
            for (let i = 0; i < 10; i++) {
                await stats.recordQuery('pool1', 100, null);
            }

            const poolStats = stats.getStats('pool1');
            assert.strictEqual(poolStats.errorRate, 0);
        });

        it('应该处理全部失败的情况', async () => {
            for (let i = 0; i < 10; i++) {
                await stats.recordQuery('pool1', 100, new Error('Test'));
            }

            const poolStats = stats.getStats('pool1');
            assert.strictEqual(poolStats.errorRate, 1);
        });
    });
});

