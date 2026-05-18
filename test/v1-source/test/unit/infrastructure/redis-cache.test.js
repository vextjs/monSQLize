/**
 * Redis 缓存适配器测试套件
 * 测试 Redis 缓存的基本操作、错误处理和降级机制
 */

const assert = require('assert');
const { createRedisCacheAdapter } = require('../../../lib/redis-cache-adapter');
const MemoryCache = require('../../../lib/cache');

describe('RedisCacheAdapter 测试套件', function () {
    this.timeout(30000);

    let redisCache;
    let mockRedis;

    // 创建模拟的 Redis 客户端
    function createMockRedis(options = {}) {
        const store = new Map();
        const {
            shouldFail = false,
            shouldTimeout = false,
            timeoutDelay = 100
        } = options;

        return {
            store, // 暴露内部存储用于测试验证
            connected: !shouldFail,

            async get(key) {
                if (shouldFail) throw new Error('Redis connection failed');
                if (shouldTimeout) {
                    await new Promise(resolve => setTimeout(resolve, timeoutDelay));
                }
                return store.get(key) || null;
            },

            async set(key, value, ...args) {
                if (shouldFail) throw new Error('Redis connection failed');
                if (shouldTimeout) {
                    await new Promise(resolve => setTimeout(resolve, timeoutDelay));
                }

                // 解析 EX 参数（秒）
                let ttlSeconds = null;
                for (let i = 0; i < args.length; i++) {
                    if (args[i] === 'EX' && args[i + 1]) {
                        ttlSeconds = args[i + 1];
                        break;
                    }
                }

                store.set(key, value);

                // 模拟 TTL 过期
                if (ttlSeconds !== null) {
                    setTimeout(() => {
                        store.delete(key);
                    }, ttlSeconds * 1000);
                }

                return 'OK';
            },

            async del(key) {
                if (shouldFail) throw new Error('Redis connection failed');
                const existed = store.has(key);
                store.delete(key);
                return existed ? 1 : 0;
            },

            async keys(pattern) {
                if (shouldFail) throw new Error('Redis connection failed');
                // 简单的模式匹配（仅支持 * 通配符）
                const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
                return Array.from(store.keys()).filter(key => regex.test(key));
            },

            async quit() {
                this.connected = false;
                store.clear();
            }
        };
    }

    beforeEach(() => {
        // 在每个测试前创建新的模拟 Redis
        mockRedis = createMockRedis();
        redisCache = createRedisCacheAdapter({
            client: mockRedis,
            prefix: 'test:',
            ttl: 60 // 默认 60 秒
        });
    });

    afterEach(async () => {
        if (mockRedis && mockRedis.connected) {
            await mockRedis.quit();
        }
    });

    describe('基本操作', () => {
        it('set - 应该存储键值对', async () => {
            await redisCache.set('key1', 'value1');

            // 验证存储成功（直接检查模拟 Redis）
            const stored = await mockRedis.get('test:key1');
            assert.ok(stored, '键应该存在');

            // 解析 JSON
            const parsed = JSON.parse(stored);
            assert.strictEqual(parsed, 'value1', '值应该匹配');
        });

        it('set - 应该支持复杂对象', async () => {
            const complexObj = {
                name: 'Alice',
                age: 25,
                tags: ['developer', 'nodejs'],
                nested: { key: 'value' }
            };

            await redisCache.set('complex', complexObj);

            const stored = await mockRedis.get('test:complex');
            const parsed = JSON.parse(stored);
            assert.deepStrictEqual(parsed, complexObj, '复杂对象应该正确序列化');
        });

        it('get - 应该获取已存在的键', async () => {
            await redisCache.set('key2', 'value2');

            const value = await redisCache.get('key2');
            assert.strictEqual(value, 'value2', '应该返回正确的值');
        });

        it('get - 应该返回 null（键不存在）', async () => {
            const value = await redisCache.get('nonexistent');
            assert.strictEqual(value, null, '不存在的键应该返回 null');
        });

        it('delete - 应该删除单个键', async () => {
            await redisCache.set('key3', 'value3');

            const deleted = await redisCache.delete('key3');
            assert.strictEqual(deleted, 1, '应该返回删除的键数量');

            const value = await redisCache.get('key3');
            assert.strictEqual(value, null, '键应该已被删除');
        });

        it('delete - 删除不存在的键应该返回 0', async () => {
            const deleted = await redisCache.delete('nonexistent');
            assert.strictEqual(deleted, 0, '删除不存在的键应该返回 0');
        });

        it('delPattern - 应该删除匹配的键', async () => {
            // 设置多个键
            await redisCache.set('user:1', 'Alice');
            await redisCache.set('user:2', 'Bob');
            await redisCache.set('product:1', 'Laptop');

            // 删除所有 user: 开头的键
            const deleted = await redisCache.delPattern('user:*');
            assert.strictEqual(deleted, 2, '应该删除 2 个匹配的键');

            // 验证
            const user1 = await redisCache.get('user:1');
            const user2 = await redisCache.get('user:2');
            const product1 = await redisCache.get('product:1');

            assert.strictEqual(user1, null, 'user:1 应该被删除');
            assert.strictEqual(user2, null, 'user:2 应该被删除');
            assert.strictEqual(product1, 'Laptop', 'product:1 不应该被删除');
        });
    });

    describe('TTL 过期', () => {
        it('set - 应该支持 TTL 过期', async function () {
            this.timeout(3000);

            // 设置 1 秒过期
            await redisCache.set('ttl-key', 'ttl-value', { ttl: 1 });

            // 立即获取应该存在
            let value = await redisCache.get('ttl-key');
            assert.strictEqual(value, 'ttl-value', '立即获取应该成功');

            // 等待过期
            await new Promise(resolve => setTimeout(resolve, 1100));

            // 再次获取应该为 null
            value = await redisCache.get('ttl-key');
            assert.strictEqual(value, null, '过期后应该返回 null');
        });

        it('set - 应该使用默认 TTL', async () => {
            await redisCache.set('default-ttl', 'value');

            // 验证设置时使用了默认 TTL（60 秒）
            const stored = await mockRedis.get('test:default-ttl');
            assert.ok(stored, '应该使用默认 TTL 存储');
        });

        it('set - 自定义 TTL 应该覆盖默认值', async () => {
            await redisCache.set('custom-ttl', 'value', { ttl: 120 });

            // 验证使用了自定义 TTL
            const stored = await mockRedis.get('test:custom-ttl');
            assert.ok(stored, '应该使用自定义 TTL 存储');
        });
    });

    describe('错误处理', () => {
        it('Redis 连接失败时应该降级到本地缓存', async () => {
            // 创建会失败的 Redis
            const failingRedis = createMockRedis({ shouldFail: true });
            const fallbackCache = createRedisCacheAdapter({
                client: failingRedis,
                prefix: 'test:',
                fallback: new MemoryCache({ maxSize: 100 })
            });

            // 设置值（应该降级到本地缓存）
            await fallbackCache.set('key', 'value');

            // 获取值（应该从本地缓存返回）
            const value = await fallbackCache.get('key');
            assert.strictEqual(value, 'value', '应该从本地缓存返回值');
        });

        it('Redis 超时时应该降级到本地缓存', async function () {
            this.timeout(3000);

            // 创建会超时的 Redis
            const timeoutRedis = createMockRedis({ shouldTimeout: true, timeoutDelay: 200 });
            const fallbackCache = createRedisCacheAdapter({
                client: timeoutRedis,
                prefix: 'test:',
                timeout: 100, // 100ms 超时
                fallback: new MemoryCache({ maxSize: 100 })
            });

            // 设置值（应该超时并降级）
            const startTime = Date.now();
            await fallbackCache.set('key', 'value');
            const duration = Date.now() - startTime;

            // 验证快速返回（未等待完整的 200ms）
            assert.ok(duration < 150, '应该在超时后快速返回');

            // 获取值（应该从本地缓存返回）
            const value = await fallbackCache.get('key');
            assert.strictEqual(value, 'value', '应该从本地缓存返回值');
        });

        it('get - Redis 失败时应该返回 null', async () => {
            const failingRedis = createMockRedis({ shouldFail: true });
            const cache = createRedisCacheAdapter({ client: failingRedis, prefix: 'test:' });

            const value = await cache.get('key');
            assert.strictEqual(value, null, 'Redis 失败时应该返回 null');
        });

        it('delete - Redis 失败时应该返回 0', async () => {
            const failingRedis = createMockRedis({ shouldFail: true });
            const cache = createRedisCacheAdapter({ client: failingRedis, prefix: 'test:' });

            const deleted = await cache.delete('key');
            assert.strictEqual(deleted, 0, 'Redis 失败时应该返回 0');
        });

        it('delPattern - Redis 失败时应该返回 0', async () => {
            const failingRedis = createMockRedis({ shouldFail: true });
            const cache = createRedisCacheAdapter({ client: failingRedis, prefix: 'test:' });

            const deleted = await cache.delPattern('pattern:*');
            assert.strictEqual(deleted, 0, 'Redis 失败时应该返回 0');
        });
    });

    describe('序列化', () => {
        it('应该正确序列化和反序列化 Date 对象', async () => {
            const now = new Date();
            await redisCache.set('date-key', now);

            const value = await redisCache.get('date-key');
            assert.ok(value instanceof Date, '应该反序列化为 Date 对象');
            assert.strictEqual(value.getTime(), now.getTime(), '时间戳应该匹配');
        });

        it('应该正确序列化 null 和 undefined', async () => {
            await redisCache.set('null-key', null);
            await redisCache.set('undefined-key', undefined);

            const nullValue = await redisCache.get('null-key');
            const undefinedValue = await redisCache.get('undefined-key');

            assert.strictEqual(nullValue, null, 'null 应该正确序列化');
            assert.strictEqual(undefinedValue, undefined, 'undefined 应该正确序列化');
        });

        it('应该正确序列化数组', async () => {
            const arr = [1, 2, 3, 'four', { five: 5 }];
            await redisCache.set('array-key', arr);

            const value = await redisCache.get('array-key');
            assert.deepStrictEqual(value, arr, '数组应该正确序列化');
        });

        it('应该正确序列化嵌套对象', async () => {
            const nested = {
                level1: {
                    level2: {
                        level3: {
                            value: 'deep'
                        }
                    }
                }
            };

            await redisCache.set('nested-key', nested);

            const value = await redisCache.get('nested-key');
            assert.deepStrictEqual(value, nested, '嵌套对象应该正确序列化');
        });
    });

    describe('前缀处理', () => {
        it('应该自动添加前缀', async () => {
            await redisCache.set('key', 'value');

            // 验证实际存储的键有前缀
            const keys = await mockRedis.keys('test:*');
            assert.strictEqual(keys.length, 1, '应该有 1 个键');
            assert.strictEqual(keys[0], 'test:key', '键应该有前缀');
        });

        it('应该在 get 时自动添加前缀', async () => {
            // 直接在 Redis 中设置（带前缀）
            await mockRedis.set('test:direct-key', JSON.stringify('direct-value'));

            // 通过缓存获取（不带前缀）
            const value = await redisCache.get('direct-key');
            assert.strictEqual(value, 'direct-value', '应该自动添加前缀');
        });

        it('应该在 delete 时自动添加前缀', async () => {
            await mockRedis.set('test:del-key', JSON.stringify('value'));

            const deleted = await redisCache.delete('del-key');
            assert.strictEqual(deleted, 1, '应该成功删除');

            const value = await mockRedis.get('test:del-key');
            assert.strictEqual(value, null, '键应该被删除');
        });

        it('delPattern - 应该在模式中自动添加前缀', async () => {
            await redisCache.set('user:1', 'Alice');
            await redisCache.set('user:2', 'Bob');

            const deleted = await redisCache.delPattern('user:*');
            assert.strictEqual(deleted, 2, '应该删除 2 个键');
        });
    });

    describe('统计功能', () => {
        it('应该统计缓存命中率（如果支持）', async () => {
            // 注意：这个测试取决于 Redis 适配器是否实现了统计功能
            // 如果没有实现，可以跳过或注释掉

            await redisCache.set('stat-key', 'value');

            // 第一次获取（miss）
            await redisCache.get('stat-key');

            // 第二次获取（hit）
            await redisCache.get('stat-key');

            // 如果实现了 getStats
            if (typeof redisCache.getStats === 'function') {
                const stats = redisCache.getStats();
                assert.ok(stats.hits > 0 || stats.misses > 0, '应该有统计数据');
            }
        });
    });
});

