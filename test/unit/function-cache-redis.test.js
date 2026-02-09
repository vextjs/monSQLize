/**
 * 函数缓存 Redis 集成测试
 * 测试 Redis 缓存场景
 */

const { describe, it, before, after } = require('mocha');
const { expect } = require('chai');
const { withCache, FunctionCache } = require('../../lib/function-cache');
const MonSQLize = require('../../lib/index');

// Redis 连接测试 - 使用更健壮的方式
async function testRedisConnection() {
    const Redis = require('ioredis');
    let redis = null;

    try {
        redis = new Redis({
            host: '127.0.0.1',
            port: 6379,
            db: 0,
            retryStrategy: () => null,  // 不重试
            lazyConnect: true,
            connectTimeout: 2000,
            maxRetriesPerRequest: 0,
            enableReadyCheck: false,
            enableOfflineQueue: false
        });

        // 静默错误事件
        redis.on('error', () => {});

        await redis.connect();
        const pong = await redis.ping();

        if (redis && redis.status === 'ready') {
            await redis.quit();
        }

        return pong === 'PONG';
    } catch (error) {
        console.log('⚠️  Redis 连接失败:', error.message);
        console.log('💡 提示: 请确保 Redis 服务器正在运行 (127.0.0.1:6379)');

        // 确保清理资源
        if (redis) {
            try {
                redis.disconnect(false);
            } catch (e) {
                // 忽略
            }
        }

        return false;
    }
}

describe('函数缓存 Redis 集成测试', () => {
    let redisAvailable = false;
    let msq;

    before(async function() {
        this.timeout(5000);
        redisAvailable = await testRedisConnection();

        if (!redisAvailable) {
            console.log('⚠️  Redis 不可用，跳过 Redis 测试');
            this.skip();
        }
    });

    afterEach(async () => {
        if (msq) {
            // 清空 Redis 测试数据
            try {
                const cache = msq.getCache();
                if (cache && cache.clear) {
                    cache.clear();
                }
            } catch (err) {
                // 忽略清理错误
            }

            await msq.close();
            msq = null;
        }
    });

    describe('仅 Redis 缓存', () => {
        it('应该在 Redis 中缓存函数结果', async function() {
            this.timeout(30000);  // 增加超时到 30 秒

            msq = new MonSQLize({
                type: 'mongodb',
                databaseName: 'test_function_cache',
                config: { useMemoryServer: true },
                cache: MonSQLize.createRedisCacheAdapter('redis://127.0.0.1:6379/0')
            });

            await msq.connect();

            let callCount = 0;
            async function testFn(x) {
                callCount++;
                return x * 2;
            }

            const cached = withCache(testFn, {
                ttl: 5000,
                cache: msq.getCache()
            });

            const result1 = await cached(5);
            const result2 = await cached(5);

            expect(result1).to.equal(10);
            expect(result2).to.equal(10);
            expect(callCount).to.equal(1);
        });

        it('应该在 TTL 过期后重新执行', async function() {
            this.timeout(30000);  // 增加超时到 30 秒

            msq = new MonSQLize({
                type: 'mongodb',
                databaseName: 'test_function_cache',
                config: { useMemoryServer: true },
                cache: MonSQLize.createRedisCacheAdapter('redis://127.0.0.1:6379/0')
            });

            await msq.connect();

            let callCount = 0;
            async function testFn(x) {
                callCount++;
                return x * 2;
            }

            const cached = withCache(testFn, {
                ttl: 100,
                cache: msq.getCache()
            });

            await cached(10);  // 使用不同的参数
            expect(callCount).to.equal(1);

            await new Promise(resolve => setTimeout(resolve, 150));
            await cached(10);  // 使用不同的参数
            expect(callCount).to.equal(2);
        });
    });

    describe('本地 + Redis 双层缓存', () => {
        it('应该在本地缓存中优先命中', async function() {
            this.timeout(30000);  // 增加超时到 30 秒

            msq = new MonSQLize({
                type: 'mongodb',
                databaseName: 'test_function_cache',
                config: { useMemoryServer: true },
                cache: {
                    multiLevel: true,
                    local: { maxSize: 1000 },
                    remote: MonSQLize.createRedisCacheAdapter('redis://127.0.0.1:6379/0')
                }
            });

            await msq.connect();

            let callCount = 0;
            async function testFn(x) {
                callCount++;
                return x * 2;
            }

            const cached = withCache(testFn, {
                ttl: 60000,
                cache: msq.getCache()
            });

            // 第一次调用（未缓存，执行函数）
            const result1 = await cached(15);
            expect(result1).to.equal(30);
            expect(callCount).to.equal(1);

            // 第二次调用（本地缓存命中，不执行函数）
            const result2 = await cached(15);
            expect(result2).to.equal(30);
            expect(callCount).to.equal(1); // callCount 不变，说明命中缓存
        });

        it('应该支持 FunctionCache 类', async function() {
            this.timeout(30000);  // 增加超时到 30 秒

            msq = new MonSQLize({
                type: 'mongodb',
                databaseName: 'test_function_cache',
                config: { useMemoryServer: true },
                cache: {
                    multiLevel: true,
                    local: { maxSize: 1000 },
                    remote: MonSQLize.createRedisCacheAdapter('redis://127.0.0.1:6379/0')
                }
            });

            await msq.connect();

            const fnCache = new FunctionCache(msq, {
                namespace: 'test',
                defaultTTL: 60000
            });

            let callCount = 0;
            fnCache.register('testFn', async (x) => {
                callCount++;
                return x * 2;
            });

            const result1 = await fnCache.execute('testFn', 20);  // 使用不同的参数
            const result2 = await fnCache.execute('testFn', 20);  // 使用不同的参数

            expect(result1).to.equal(40);
            expect(result2).to.equal(40);
            expect(callCount).to.equal(1);
        });

        it('应该正确失效缓存', async function() {
            this.timeout(30000);  // 增加超时到 30 秒

            msq = new MonSQLize({
                type: 'mongodb',
                databaseName: 'test_function_cache',
                config: { useMemoryServer: true },
                cache: {
                    multiLevel: true,
                    local: { maxSize: 1000 },
                    remote: MonSQLize.createRedisCacheAdapter('redis://127.0.0.1:6379/0')
                }
            });

            await msq.connect();

            const fnCache = new FunctionCache(msq);

            let callCount = 0;
            fnCache.register('testFn', async (x) => {
                callCount++;
                return x * 2;
            });

            await fnCache.execute('testFn', 25);  // 使用不同的参数
            await fnCache.invalidate('testFn', 25);  // 使用不同的参数
            await fnCache.execute('testFn', 25);  // 使用不同的参数

            expect(callCount).to.equal(2);
        });
    });
});

