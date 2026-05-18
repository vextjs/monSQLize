/**
 * 分布式缓存失效集成测试
 *
 * 需要真实的 Redis 和 MongoDB 环境
 * 运行前确保：
 * - MongoDB 运行在 localhost:27017
 * - Redis 运行在 localhost:6379
 *
 * 运行：npm test -- test/integration/distributed-cache-invalidation.test.js
 */

const { describe, it, before, after, beforeEach, afterEach } = require('mocha');
const { expect } = require('chai');
const MonSQLize = require('../../lib/index');
const Redis = require('ioredis');

// 检测环境
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017';
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

describe('分布式缓存失效集成测试', function() {
    this.timeout(10000); // 延长超时时间

    let redis;
    let instanceA;
    let instanceB;
    let skipTests = false;

    before(async function() {
        // 检查 Redis 可用性
        try {
            redis = new Redis(REDIS_URL);
            await redis.ping();
            console.log('      ✓ Redis 连接成功');
        } catch (error) {
            console.log('      ✗ Redis 不可用，跳过测试');
            skipTests = true;
            this.skip();
        }
    });

    after(async function() {
        if (redis) {
            await redis.quit();
        }
    });

    beforeEach(async function() {
        if (skipTests) this.skip();

        // 创建实例 A
        instanceA = new MonSQLize({
            type: 'mongodb',
            databaseName: 'test_distributed_integration',
            config: { uri: MONGODB_URI },
            cache: {
                multiLevel: true,
                local: { maxSize: 100 },
                remote: MonSQLize.createRedisCacheAdapter(new Redis(REDIS_URL)),
                distributed: {
                    enabled: true,
                    instanceId: 'instance-A',
                    channel: 'test:distributed:integration'
                }
            }
        });

        // 创建实例 B
        instanceB = new MonSQLize({
            type: 'mongodb',
            databaseName: 'test_distributed_integration',
            config: { uri: MONGODB_URI },
            cache: {
                multiLevel: true,
                local: { maxSize: 100 },
                remote: MonSQLize.createRedisCacheAdapter(new Redis(REDIS_URL)),
                distributed: {
                    enabled: true,
                    instanceId: 'instance-B',
                    channel: 'test:distributed:integration'
                }
            }
        });

        await instanceA.connect();
        await instanceB.connect();
    });

    afterEach(async function() {
        if (instanceA) {
            await instanceA.close();
        }
        if (instanceB) {
            await instanceB.close();
        }
    });

    describe('基本失效功能', () => {
        it('应该在实例间同步缓存失效', async function() {
            const collA = instanceA.collection;
            const collB = instanceB.collection;
            const db = instanceA._adapter.db;

            // 准备测试数据
            await db.collection('users').deleteMany({});
            await db.collection('users').insertOne({
                userId: 'alice',
                name: 'Alice',
                age: 30
            });

            // 实例 A 查询（写入缓存）
            const userA1 = await collA('users').findOne({
                query: { userId: 'alice' },
                cache: 60000
            });
            expect(userA1.age).to.equal(30);

            // 实例 B 查询（写入缓存）
            const userB1 = await collB('users').findOne({
                query: { userId: 'alice' },
                cache: 60000
            });
            expect(userB1.age).to.equal(30);

            // 实例 A 更新数据
            await collA('users').updateOne(
                { userId: 'alice' },
                { $set: { age: 31 } }
            );

            // 等待广播传播
            await new Promise(resolve => setTimeout(resolve, 200));

            // 实例 B 查询应该读到新数据
            const userB2 = await collB('users').findOne({
                query: { userId: 'alice' },
                cache: 60000
            });
            expect(userB2.age).to.equal(31);

            // 清理
            await db.collection('users').deleteMany({});
        });

        it('应该支持模式匹配失效', async function() {
            const collA = instanceA.collection;
            const collB = instanceB.collection;
            const db = instanceA._adapter.db;

            // 准备多条数据
            await db.collection('products').deleteMany({});
            await db.collection('products').insertMany([
                { productId: 'p1', category: 'electronics', price: 100 },
                { productId: 'p2', category: 'electronics', price: 200 },
                { productId: 'p3', category: 'books', price: 50 }
            ]);

            // 两个实例都查询（写入缓存）
            await collA('products').find({
                query: { category: 'electronics' },
                cache: 60000
            });
            await collB('products').find({
                query: { category: 'electronics' },
                cache: 60000
            });

            // 实例 A 更新 electronics 类别
            await collA('products').updateMany(
                { category: 'electronics' },
                { $inc: { price: 10 } }
            );

            // 等待广播
            await new Promise(resolve => setTimeout(resolve, 200));

            // 实例 B 查询应该读到新数据
            const products = await collB('products').find({
                query: { category: 'electronics' },
                cache: 60000
            });
            expect(products[0].price).to.equal(110);
            expect(products[1].price).to.equal(210);

            // 清理
            await db.collection('products').deleteMany({});
        });
    });

    describe('并发场景', () => {
        it('应该处理并发更新', async function() {
            const collA = instanceA.collection;
            const collB = instanceB.collection;
            const db = instanceA._adapter.db;

            // 准备数据
            await db.collection('counters').deleteMany({});
            await db.collection('counters').insertOne({
                counterId: 'test',
                value: 0
            });

            // 并发更新
            await Promise.all([
                collA('counters').updateOne(
                    { counterId: 'test' },
                    { $inc: { value: 1 } }
                ),
                collB('counters').updateOne(
                    { counterId: 'test' },
                    { $inc: { value: 1 } }
                )
            ]);

            // 等待广播
            await new Promise(resolve => setTimeout(resolve, 200));

            // 两个实例都应该读到最新值
            const counterA = await collA('counters').findOne({
                query: { counterId: 'test' },
                cache: 60000
            });
            const counterB = await collB('counters').findOne({
                query: { counterId: 'test' },
                cache: 60000
            });

            expect(counterA.value).to.equal(2);
            expect(counterB.value).to.equal(2);

            // 清理
            await db.collection('counters').deleteMany({});
        });
    });

    describe('统计信息', () => {
        it('应该记录失效统计', async function() {
            const collA = instanceA.collection;
            const db = instanceA._adapter.db;

            // 准备数据
            await db.collection('stats_test').deleteMany({});
            await db.collection('stats_test').insertOne({
                id: 'test',
                value: 'initial'
            });

            // 查询
            await collA('stats_test').findOne({
                query: { id: 'test' },
                cache: 60000
            });

            // 更新（触发失效）
            await collA('stats_test').updateOne(
                { id: 'test' },
                { $set: { value: 'updated' } }
            );

            // 等待广播
            await new Promise(resolve => setTimeout(resolve, 200));

            // 检查统计
            const statsA = instanceA._cacheInvalidator?.getStats();
            const statsB = instanceB._cacheInvalidator?.getStats();

            expect(statsA).to.exist;
            expect(statsB).to.exist;
            expect(statsA.messagesSent).to.be.greaterThan(0);
            expect(statsB.messagesReceived).to.be.greaterThan(0);

            // 清理
            await db.collection('stats_test').deleteMany({});
        });
    });

    describe('错误处理', () => {
        it('应该在 Redis 失败时优雅降级', async function() {
            // 创建一个 Redis 连接会失败的实例
            const badRedis = new Redis({
                host: 'localhost',
                port: 9999, // 不存在的端口
                retryStrategy: () => null,
                lazyConnect: true
            });

            const instanceC = new MonSQLize({
                type: 'mongodb',
                databaseName: 'test_distributed_integration',
                config: { uri: MONGODB_URI },
                cache: {
                    multiLevel: true,
                    local: { maxSize: 100 },
                    distributed: {
                        enabled: true,
                        redis: badRedis,
                        instanceId: 'instance-C'
                    }
                }
            });

            try {
                await instanceC.connect();
                const collection = instanceC.collection;

                // 应该仍然可以查询（使用本地缓存）
                const db = instanceC._adapter.db;
                await db.collection('error_test').deleteMany({});
                await db.collection('error_test').insertOne({
                    id: 'test',
                    value: 'data'
                });

                const result = await collection('error_test').findOne({
                    query: { id: 'test' },
                    cache: 60000
                });

                expect(result.value).to.equal('data');

                // 清理
                await db.collection('error_test').deleteMany({});
            } finally {
                await instanceC.close();
                await badRedis.quit();
            }
        });
    });
});

