const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const MonSQLize = require('../../../lib/index.js');

describe('P3-B function-cache', () => {
    it('withCache 应缓存结果并支持 invalidate', async () => {
        let calls = 0;
        const cache = new MonSQLize.MemoryCache();
        const cached = MonSQLize.withCache((userId) => Promise.resolve().then(() => {
            calls += 1;
            return { userId, calls };
        }), {
            cache,
            namespace: 'user-profile',
            ttl: 1_000,
        });

        const first = await cached('u1');
        const second = await cached('u1');
        await cached.invalidate('u1');
        const third = await cached('u1');
        const stats = cached.stats();

        assert.deepEqual(first, { userId: 'u1', calls: 1 });
        assert.deepEqual(second, { userId: 'u1', calls: 1 });
        assert.deepEqual(third, { userId: 'u1', calls: 2 });
        assert.equal(calls, 2);
        assert.equal(stats.hits >= 1, true);
        assert.equal(typeof stats.hitRate, 'number');
    });

    it('withCache 应支持 keyBuilder / condition / 并发去重', async () => {
        let calls = 0;
        const cached = MonSQLize.withCache(async (payload) => {
            calls += 1;
            await new Promise((resolve) => setTimeout(resolve, 20));
            return payload.skip ? null : { id: payload.id, calls };
        }, {
            namespace: 'custom',
            keyBuilder: (payload) => `id:${payload.id}`,
            condition: (result) => result !== null,
        });

        const [first, second] = await Promise.all([
            cached({ id: 1, skip: false }),
            cached({ id: 1, skip: false }),
        ]);
        const missOne = await cached({ id: 2, skip: true });
        const missTwo = await cached({ id: 2, skip: true });

        assert.deepEqual(first, { id: 1, calls: 1 });
        assert.deepEqual(second, { id: 1, calls: 1 });
        assert.equal(missOne, null);
        assert.equal(missTwo, null);
        assert.equal(calls, 3);
    });

    it('FunctionCache 应支持 register/execute/invalidate/invalidatePattern/list/clear', async () => {
        const runtime = new MonSQLize({ type: 'mongodb', databaseName: 'function_cache_unit' });
        const functionCache = new MonSQLize.FunctionCache(runtime, {
            namespace: 'svc',
            ttl: 1_000,
        });

        let calls = 0;
        functionCache.register('getUser', (userId) => Promise.resolve().then(() => {
            calls += 1;
            return { userId, calls };
        }));

        const first = await functionCache.execute('getUser', 'u1');
        const second = await functionCache.execute('getUser', 'u1');
        await functionCache.invalidate('getUser', 'u1');
        const third = await functionCache.execute('getUser', 'u1');
        const stats = functionCache.getStats('getUser');

        assert.deepEqual(first, { userId: 'u1', calls: 1 });
        assert.deepEqual(second, { userId: 'u1', calls: 1 });
        assert.deepEqual(third, { userId: 'u1', calls: 2 });
        assert.deepEqual(functionCache.list(), ['getUser']);
        assert.equal(typeof stats.hitRate, 'number');

        await functionCache.invalidatePattern('getUser:*');
        functionCache.clear();
        assert.deepEqual(functionCache.list(), []);
    });
});


