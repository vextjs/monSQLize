/**
 * Redis 缓存适配器测试
 * 
 * 注意：这些测试需要 ioredis 依赖（可选）
 * 如果未安装 ioredis，测试将被跳过
 */

const assert = require('assert');

describe('Redis 缓存适配器', () => {
    let createRedisCacheAdapter;
    let redis;
    let cache;

    // 检查 ioredis 是否可用
    let ioredisAvailable = false;
    try {
        require('ioredis');
        ioredisAvailable = true;
    } catch (error) {
        console.log('⚠️ ioredis 未安装，跳过 Redis 适配器测试');
    }

    before(function () {
        if (!ioredisAvailable) {
            this.skip();
        }

        try {
            ({ createRedisCacheAdapter } = require('../../../lib/redis-cache-adapter'));
        } catch (error) {
            console.error('加载 redis-cache-adapter 失败:', error.message);
            this.skip();
        }
    });

    afterEach(async () => {
        if (cache) {
            try {
                await cache.clear();
                await cache.close();
            } catch (error) {
                // 忽略清理错误
            }
            cache = null;
        }
    });

    describe('创建适配器', () => {
        it('应该支持传入 URL 字符串', function () {
            if (!ioredisAvailable) this.skip();

            cache = createRedisCacheAdapter('redis://localhost:6379/0');
            assert.ok(cache);
            assert.strictEqual(typeof cache.get, 'function');
            assert.strictEqual(typeof cache.set, 'function');
        });

        it('应该支持传入 ioredis 实例', function () {
            if (!ioredisAvailable) this.skip();

            const Redis = require('ioredis');
            redis = new Redis('redis://localhost:6379/0');
            cache = createRedisCacheAdapter(redis);

            assert.ok(cache);
            assert.strictEqual(typeof cache.get, 'function');
        });

        it('应该在参数无效时抛出错误', () => {
            if (!ioredisAvailable) return;

            assert.throws(() => {
                createRedisCacheAdapter(null);
            }, /redisUrlOrInstance 必须是 Redis URL 字符串或 ioredis 实例/);
        });
    });

    describe('CacheLike 接口', () => {
        beforeEach(function () {
            if (!ioredisAvailable) this.skip();
            cache = createRedisCacheAdapter('redis://localhost:6379/0');
        });

        it('应该实现 get/set 方法', async () => {
            await cache.set('test:key', { value: 123 });
            const result = await cache.get('test:key');

            assert.deepStrictEqual(result, { value: 123 });
        });

        it('应该支持 TTL', async function () {
            this.timeout(5000);

            await cache.set('test:ttl', { value: 456 }, 1000);  // 1 秒

            // 立即读取应该存在
            let result = await cache.get('test:ttl');
            assert.deepStrictEqual(result, { value: 456 });

            // 等待过期
            await new Promise(r => setTimeout(r, 1200));
            result = await cache.get('test:ttl');
            assert.strictEqual(result, undefined);
        });

        it('应该实现 del 方法', async () => {
            await cache.set('test:del', { value: 789 });
            const deleted = await cache.del('test:del');

            assert.strictEqual(deleted, true);

            const result = await cache.get('test:del');
            assert.strictEqual(result, undefined);
        });

        it('应该实现 exists 方法', async () => {
            await cache.set('test:exists', { value: 1 });

            const exists1 = await cache.exists('test:exists');
            assert.strictEqual(exists1, true);

            const exists2 = await cache.exists('test:not-exists');
            assert.strictEqual(exists2, false);
        });

        it('应该实现 getMany 方法', async () => {
            await cache.set('test:a', { value: 'A' });
            await cache.set('test:b', { value: 'B' });

            const result = await cache.getMany(['test:a', 'test:b', 'test:c']);

            assert.deepStrictEqual(result, {
                'test:a': { value: 'A' },
                'test:b': { value: 'B' }
            });
        });

        it('应该实现 setMany 方法', async () => {
            await cache.setMany({
                'test:x': { value: 'X' },
                'test:y': { value: 'Y' }
            });

            const x = await cache.get('test:x');
            const y = await cache.get('test:y');

            assert.deepStrictEqual(x, { value: 'X' });
            assert.deepStrictEqual(y, { value: 'Y' });
        });

        it('应该实现 delMany 方法', async () => {
            await cache.set('test:1', { value: 1 });
            await cache.set('test:2', { value: 2 });

            const count = await cache.delMany(['test:1', 'test:2']);
            assert.strictEqual(count, 2);

            const result1 = await cache.get('test:1');
            const result2 = await cache.get('test:2');
            assert.strictEqual(result1, undefined);
            assert.strictEqual(result2, undefined);
        });

        it('应该实现 delPattern 方法', async () => {
            await cache.set('pattern:a:1', { value: 1 });
            await cache.set('pattern:a:2', { value: 2 });
            await cache.set('pattern:b:1', { value: 3 });

            const count = await cache.delPattern('pattern:a:*');
            assert.ok(count >= 2);  // 至少删除 2 个

            const a1 = await cache.get('pattern:a:1');
            const b1 = await cache.get('pattern:b:1');
            assert.strictEqual(a1, undefined);
            assert.ok(b1);  // pattern:b:1 应该还在
        });

        it('应该实现 clear 方法', async () => {
            await cache.set('clear:1', { value: 1 });
            await cache.set('clear:2', { value: 2 });

            await cache.clear();

            const result1 = await cache.get('clear:1');
            const result2 = await cache.get('clear:2');
            assert.strictEqual(result1, undefined);
            assert.strictEqual(result2, undefined);
        });

        it('应该实现 keys 方法', async () => {
            await cache.set('keys:a', { value: 1 });
            await cache.set('keys:b', { value: 2 });

            const allKeys = await cache.keys('keys:*');
            assert.ok(allKeys.includes('keys:a'));
            assert.ok(allKeys.includes('keys:b'));
        });
    });

    describe('错误处理', () => {
        beforeEach(function () {
            if (!ioredisAvailable) this.skip();
            cache = createRedisCacheAdapter('redis://localhost:6379/0');
        });

        it('应该在 JSON 解析失败时返回 undefined', async () => {
            // 直接写入非 JSON 数据（绕过适配器）
            const redis = cache.getRedisInstance();
            await redis.set('test:invalid-json', 'not a json string');

            const result = await cache.get('test:invalid-json');
            assert.strictEqual(result, undefined);
        });
    });
});
