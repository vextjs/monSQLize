const { after, describe, it } = require('node:test');
const assert = require('node:assert/strict');

const MonSQLize = require('../../../lib/index.js');

const invalidators = [];

after(async () => {
    for (const invalidator of invalidators) {
        await invalidator.close();
    }
});

describe('P3-A cache facade integration', () => {
    it('MonSQLize 实例应暴露可用的 MemoryCache 与 distributed invalidator 协作能力', async () => {
        const runtime = new MonSQLize({
            type: 'mongodb',
            databaseName: 'cache_facade_integration',
            cache: { maxSize: 10 },
        });

        const cache = runtime.getCache();
        cache.set('session:1', { id: 1 }, 1000);
        cache.set('session:2', { id: 2 }, 1000);
        assert.deepEqual(cache.keys('session:*').sort(), ['session:1', 'session:2']);

        const remote = new MonSQLize.MemoryCache();
        remote.set('session:1', { id: 1 }, 1000);
        remote.set('session:2', { id: 2 }, 1000);

        const invalidator = new MonSQLize.DistributedCacheInvalidator({
            cache: { local: cache, remote },
        });
        invalidators.push(invalidator);

        await invalidator.invalidate('session:*');

        assert.deepEqual(cache.keys('session:*'), []);
        assert.deepEqual(remote.keys('session:*'), []);
        assert.equal(invalidator.getStats().invalidationsTriggered, 1);
    });

    it('Redis cache adapter 应可与 fake redis client 形成完整 cache-like 契约', async () => {
        const state = new Map();
        const fakeRedis = {
            get(key) {
                return state.has(key) ? state.get(key) : null;
            },
            set(key, value) {
                state.set(key, value);
            },
            psetex(key, _ttl, value) {
                state.set(key, value);
            },
            del(...keys) {
                let deleted = 0;
                for (const key of keys) {
                    if (state.delete(key)) {
                        deleted += 1;
                    }
                }
                return deleted;
            },
            exists(key) {
                return state.has(key) ? 1 : 0;
            },
            mget(keys) {
                return keys.map((key) => state.get(key) ?? null);
            },
            scan(cursor, _matchLabel, pattern) {
                const regex = new RegExp(`^${pattern.replace(/[|\\{}()[\]^$+?.]/g, '\\$&').replace(/\*/g, '.*')}$`);
                return [cursor === '0' ? '0' : '0', [...state.keys()].filter((key) => regex.test(key))];
            },
            flushdb() {
                state.clear();
            },
        };

        const cache = MonSQLize.createRedisCacheAdapter({ client: fakeRedis, prefix: 'integration:' });
        await cache.set('alpha', { ok: true });
        await cache.set('beta', { ok: false });
        assert.deepEqual(await cache.get('alpha'), { ok: true });
        assert.deepEqual((await cache.keys('*')).sort(), ['alpha', 'beta']);
        assert.equal(await cache.delPattern('a*'), 1);
        assert.deepEqual(await cache.getMany(['alpha', 'beta']), { beta: { ok: false } });
        await cache.clear();
        assert.deepEqual(await cache.keys('*'), []);
    });
});

