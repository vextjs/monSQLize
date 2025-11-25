/**
 * DistributedCacheInvalidator 单元测试
 *
 * 测试分布式缓存失效功能：
 * - 初始化和配置
 * - Redis 连接（自动提取/显式配置）
 * - 消息发送和接收
 * - 缓存失效逻辑
 * - 统计信息
 * - 错误处理
 */

const { describe, it, beforeEach, afterEach } = require('mocha');
const { expect } = require('chai');
const sinon = require('sinon');
const DistributedCacheInvalidator = require('../../../lib/distributed-cache-invalidator');

describe('DistributedCacheInvalidator', () => {
    let mockRedis;
    let mockCache;
    let mockLogger;
    let invalidator;

    beforeEach(() => {
        // Mock Redis 实例
        mockRedis = {
            options: { host: 'localhost', port: 6379 },
            publish: sinon.stub().resolves(1),
            subscribe: sinon.stub().callsArg(1),
            unsubscribe: sinon.stub().resolves(),
            quit: sinon.stub().resolves(),
            on: sinon.stub()
        };

        // Mock MultiLevelCache
        mockCache = {
            local: {
                delPattern: sinon.stub().resolves(2)
            },
            remote: {
                delPattern: sinon.stub().resolves(3),
                getRedisInstance: sinon.stub().returns(mockRedis)
            }
        };

        // Mock Logger
        mockLogger = {
            debug: sinon.stub(),
            info: sinon.stub(),
            error: sinon.stub()
        };
    });

    afterEach(async () => {
        if (invalidator) {
            await invalidator.close();
            invalidator = null;
        }
    });

    describe('构造函数', () => {
        it('应该抛出错误：缺少 cache 参数', () => {
            expect(() => {
                new DistributedCacheInvalidator({});
            }).to.throw('DistributedCacheInvalidator requires a cache instance');
        });

        it('应该使用默认的 channel', () => {
            invalidator = new DistributedCacheInvalidator({
                redis: mockRedis,
                cache: mockCache
            });

            expect(invalidator.channel).to.equal('monsqlize:cache:invalidate');
        });

        it('应该使用自定义的 channel', () => {
            invalidator = new DistributedCacheInvalidator({
                redis: mockRedis,
                cache: mockCache,
                channel: 'custom:channel'
            });

            expect(invalidator.channel).to.equal('custom:channel');
        });

        it('应该自动生成 instanceId', () => {
            invalidator = new DistributedCacheInvalidator({
                redis: mockRedis,
                cache: mockCache
            });

            expect(invalidator.instanceId).to.match(/^instance-\d+-[a-z0-9]+$/);
        });

        it('应该使用自定义的 instanceId', () => {
            invalidator = new DistributedCacheInvalidator({
                redis: mockRedis,
                cache: mockCache,
                instanceId: 'test-instance-1'
            });

            expect(invalidator.instanceId).to.equal('test-instance-1');
        });

        it('应该初始化统计信息', () => {
            invalidator = new DistributedCacheInvalidator({
                redis: mockRedis,
                cache: mockCache
            });

            const stats = invalidator.getStats();
            expect(stats.messagesSent).to.equal(0);
            expect(stats.messagesReceived).to.equal(0);
            expect(stats.invalidationsTriggered).to.equal(0);
            expect(stats.errors).to.equal(0);
        });
    });

    describe('Redis 连接', () => {
        it('应该使用显式传入的 redis 实例', () => {
            invalidator = new DistributedCacheInvalidator({
                redis: mockRedis,
                cache: mockCache
            });

            expect(invalidator.pub).to.equal(mockRedis);
        });

        it('应该为订阅创建新的连接', () => {
            // Mock Redis 构造函数
            const MockRedis = sinon.stub().returns({
                ...mockRedis,
                subscribe: sinon.stub().callsArg(1)
            });

            // 注入 Mock
            const originalRequire = require;
            const requireStub = sinon.stub();
            requireStub.withArgs('ioredis').returns(MockRedis);
            requireStub.callsFake(originalRequire);

            // 测试
            invalidator = new DistributedCacheInvalidator({
                redis: mockRedis,
                cache: mockCache
            });

            expect(invalidator.sub).to.exist;
        });

        it('应该使用 redisUrl 创建新连接', () => {
            const MockRedis = function(url) {
                this.url = url;
                Object.assign(this, mockRedis);
            };

            const Module = require('module');
            const originalRequire = Module.prototype.require;
            Module.prototype.require = function(id) {
                if (id === 'ioredis') return MockRedis;
                return originalRequire.apply(this, arguments);
            };

            try {
                invalidator = new DistributedCacheInvalidator({
                    redisUrl: 'redis://localhost:6379',
                    cache: mockCache
                });

                expect(invalidator.pub.url).to.equal('redis://localhost:6379');
            } finally {
                Module.prototype.require = originalRequire;
            }
        });
    });

    describe('消息发送 (invalidate)', () => {
        beforeEach(() => {
            invalidator = new DistributedCacheInvalidator({
                redis: mockRedis,
                cache: mockCache,
                instanceId: 'test-instance',
                logger: mockLogger
            });
        });

        it('应该发送失效消息', async () => {
            await invalidator.invalidate('user:*');

            expect(mockRedis.publish.calledOnce).to.be.true;
            expect(mockRedis.publish.firstCall.args[0]).to.equal('monsqlize:cache:invalidate');

            const message = JSON.parse(mockRedis.publish.firstCall.args[1]);
            expect(message.type).to.equal('invalidate');
            expect(message.pattern).to.equal('user:*');
            expect(message.instanceId).to.equal('test-instance');
            expect(message.timestamp).to.be.a('number');
        });

        it('应该更新发送统计', async () => {
            await invalidator.invalidate('user:*');

            const stats = invalidator.getStats();
            expect(stats.messagesSent).to.equal(1);
        });

        it('应该记录调试日志', async () => {
            await invalidator.invalidate('user:*');

            expect(mockLogger.debug.calledWith(
                '[DistributedCacheInvalidator] Published invalidation: user:*'
            )).to.be.true;
        });

        it('应该忽略空 pattern', async () => {
            await invalidator.invalidate('');

            expect(mockRedis.publish.called).to.be.false;
        });

        it('应该处理发送错误', async () => {
            mockRedis.publish.rejects(new Error('Redis error'));

            try {
                await invalidator.invalidate('user:*');
                expect.fail('应该抛出错误');
            } catch (error) {
                expect(error.message).to.equal('Redis error');
                expect(invalidator.getStats().errors).to.equal(1);
            }
        });
    });

    describe('消息接收和处理', () => {
        beforeEach(() => {
            invalidator = new DistributedCacheInvalidator({
                redis: mockRedis,
                cache: mockCache,
                instanceId: 'instance-A',
                logger: mockLogger
            });
        });

        it('应该处理来自其他实例的失效消息', async () => {
            const message = JSON.stringify({
                type: 'invalidate',
                pattern: 'user:*',
                instanceId: 'instance-B',
                timestamp: Date.now()
            });

            // 模拟接收消息
            const messageHandler = mockRedis.on.getCalls().find(
                call => call.args[0] === 'message'
            )?.args[1];

            if (messageHandler) {
                await messageHandler('monsqlize:cache:invalidate', message);

                // 验证缓存失效
                expect(mockCache.local.delPattern.calledWith('user:*')).to.be.true;
                expect(mockCache.remote.delPattern.calledWith('user:*')).to.be.true;

                // 验证统计
                const stats = invalidator.getStats();
                expect(stats.messagesReceived).to.equal(1);
                expect(stats.invalidationsTriggered).to.equal(1);
            }
        });

        it('应该忽略自己发送的消息', async () => {
            const message = JSON.stringify({
                type: 'invalidate',
                pattern: 'user:*',
                instanceId: 'instance-A',  // 相同的 instanceId
                timestamp: Date.now()
            });

            const messageHandler = mockRedis.on.getCalls().find(
                call => call.args[0] === 'message'
            )?.args[1];

            if (messageHandler) {
                await messageHandler('monsqlize:cache:invalidate', message);

                // 不应该触发失效
                expect(mockCache.local.delPattern.called).to.be.false;
                expect(invalidator.getStats().invalidationsTriggered).to.equal(0);
            }
        });

        it('应该同时失效本地和远端缓存', async () => {
            const message = JSON.stringify({
                type: 'invalidate',
                pattern: 'product:*',
                instanceId: 'instance-B',
                timestamp: Date.now()
            });

            const messageHandler = mockRedis.on.getCalls().find(
                call => call.args[0] === 'message'
            )?.args[1];

            if (messageHandler) {
                await messageHandler('monsqlize:cache:invalidate', message);

                // 验证本地缓存失效
                expect(mockCache.local.delPattern.calledOnce).to.be.true;
                expect(mockCache.local.delPattern.calledWith('product:*')).to.be.true;

                // 验证远端缓存失效
                expect(mockCache.remote.delPattern.calledOnce).to.be.true;
                expect(mockCache.remote.delPattern.calledWith('product:*')).to.be.true;

                // 验证日志
                expect(mockLogger.debug.calledWith(
                    sinon.match(/Invalidated local cache: product:\*/)
                )).to.be.true;
                expect(mockLogger.debug.calledWith(
                    sinon.match(/Invalidated remote cache: product:\*/)
                )).to.be.true;
            }
        });

        it('应该处理无效的消息格式', async () => {
            const messageHandler = mockRedis.on.getCalls().find(
                call => call.args[0] === 'message'
            )?.args[1];

            if (messageHandler) {
                await messageHandler('monsqlize:cache:invalidate', 'invalid json');

                // 不应该崩溃
                expect(invalidator.getStats().errors).to.equal(1);
            }
        });

        it('应该处理缓存失效错误', async () => {
            mockCache.local.delPattern.rejects(new Error('Cache error'));

            const message = JSON.stringify({
                type: 'invalidate',
                pattern: 'user:*',
                instanceId: 'instance-B',
                timestamp: Date.now()
            });

            const messageHandler = mockRedis.on.getCalls().find(
                call => call.args[0] === 'message'
            )?.args[1];

            if (messageHandler) {
                await messageHandler('monsqlize:cache:invalidate', message);

                expect(invalidator.getStats().errors).to.equal(1);
                expect(mockLogger.error.called).to.be.true;
            }
        });
    });

    describe('统计信息', () => {
        beforeEach(() => {
            invalidator = new DistributedCacheInvalidator({
                redis: mockRedis,
                cache: mockCache,
                instanceId: 'test-instance',
                channel: 'test:channel'
            });
        });

        it('应该返回完整的统计信息', () => {
            const stats = invalidator.getStats();

            expect(stats).to.have.property('messagesSent');
            expect(stats).to.have.property('messagesReceived');
            expect(stats).to.have.property('invalidationsTriggered');
            expect(stats).to.have.property('errors');
            expect(stats).to.have.property('instanceId', 'test-instance');
            expect(stats).to.have.property('channel', 'test:channel');
        });

        it('应该正确更新统计信息', async () => {
            await invalidator.invalidate('key1:*');
            await invalidator.invalidate('key2:*');

            const stats = invalidator.getStats();
            expect(stats.messagesSent).to.equal(2);
        });
    });

    describe('关闭连接', () => {
        it('应该取消订阅并关闭连接', async () => {
            invalidator = new DistributedCacheInvalidator({
                redis: mockRedis,
                cache: mockCache
            });

            await invalidator.close();

            expect(mockRedis.unsubscribe.calledOnce).to.be.true;
            expect(mockRedis.quit.calledTwice).to.be.true; // pub 和 sub
        });

        it('应该处理关闭错误', async () => {
            invalidator = new DistributedCacheInvalidator({
                redis: mockRedis,
                cache: mockCache,
                logger: mockLogger
            });

            mockRedis.quit.rejects(new Error('Close error'));

            await invalidator.close();

            expect(mockLogger.error.called).to.be.true;
        });
    });

    describe('边缘情况', () => {
        it('应该处理 cache.local 不存在的情况', async () => {
            const cacheWithoutLocal = {
                remote: mockCache.remote
            };

            invalidator = new DistributedCacheInvalidator({
                redis: mockRedis,
                cache: cacheWithoutLocal
            });

            const message = JSON.stringify({
                type: 'invalidate',
                pattern: 'user:*',
                instanceId: 'other-instance',
                timestamp: Date.now()
            });

            const messageHandler = mockRedis.on.getCalls().find(
                call => call.args[0] === 'message'
            )?.args[1];

            if (messageHandler) {
                // 不应该崩溃
                await messageHandler('monsqlize:cache:invalidate', message);
                expect(cacheWithoutLocal.remote.delPattern.called).to.be.true;
            }
        });

        it('应该处理 cache.remote 不存在的情况', async () => {
            const cacheWithoutRemote = {
                local: mockCache.local
            };

            invalidator = new DistributedCacheInvalidator({
                redis: mockRedis,
                cache: cacheWithoutRemote
            });

            const message = JSON.stringify({
                type: 'invalidate',
                pattern: 'user:*',
                instanceId: 'other-instance',
                timestamp: Date.now()
            });

            const messageHandler = mockRedis.on.getCalls().find(
                call => call.args[0] === 'message'
            )?.args[1];

            if (messageHandler) {
                // 不应该崩溃
                await messageHandler('monsqlize:cache:invalidate', message);
                expect(cacheWithoutRemote.local.delPattern.called).to.be.true;
            }
        });

        it('应该处理非 invalidate 类型的消息', async () => {
            invalidator = new DistributedCacheInvalidator({
                redis: mockRedis,
                cache: mockCache
            });

            const message = JSON.stringify({
                type: 'other-type',
                data: 'something'
            });

            const messageHandler = mockRedis.on.getCalls().find(
                call => call.args[0] === 'message'
            )?.args[1];

            if (messageHandler) {
                await messageHandler('monsqlize:cache:invalidate', message);

                // 不应该触发失效
                expect(mockCache.local.delPattern.called).to.be.false;
            }
        });

        it('应该忽略错误的频道消息', async () => {
            invalidator = new DistributedCacheInvalidator({
                redis: mockRedis,
                cache: mockCache
            });

            const message = JSON.stringify({
                type: 'invalidate',
                pattern: 'user:*'
            });

            const messageHandler = mockRedis.on.getCalls().find(
                call => call.args[0] === 'message'
            )?.args[1];

            if (messageHandler) {
                await messageHandler('wrong:channel', message);

                // 不应该处理
                expect(mockCache.local.delPattern.called).to.be.false;
            }
        });
    });
});

