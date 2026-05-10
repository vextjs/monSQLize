const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const MonSQLize = require('../../../lib/index.js');

describe('P3-A cache facade', () => {
    it('MemoryCache 应支持 TTL / pattern / stats / lock manager', async () => {
        const cache = new MonSQLize.MemoryCache({ maxSize: 10 });
        const lockManager = {
            isLocked(key) {
                return key === 'locked:key';
            },
        };

        cache.setLockManager(lockManager);
        assert.equal(cache.getLockManager(), lockManager);

        cache.set('user:1', { id: 1 }, 20);
        cache.set('user:2', { id: 2 });
        cache.setMany({ 'post:1': { id: 1 }, 'post:2': { id: 2 } });
        assert.equal(cache.set('locked:key', 'denied'), false);

        assert.deepEqual(cache.get('user:1'), { id: 1 });
        assert.equal(cache.exists('user:2'), true);
        assert.deepEqual(cache.getMany(['user:2', 'post:1']), {
            'user:2': { id: 2 },
            'post:1': { id: 1 },
        });
        assert.deepEqual(cache.keys('post:*').sort(), ['post:1', 'post:2']);
        assert.equal(cache.delPattern('post:*'), 2);

        await new Promise((resolve) => setTimeout(resolve, 30));
        assert.equal(cache.get('user:1'), undefined);
        assert.equal(cache.delMany(['user:2']), 1);

        const stats = cache.getStats();
        assert.equal(typeof stats.hitRate, 'number');
        assert.equal(typeof stats.calls, 'number');
        cache.resetStats();
        assert.equal(cache.getStats().calls, 0);
    });

    it('createRedisCacheAdapter 应支持 fake redis client 与 prefix', async () => {
        const store = new Map();
        const fakeRedis = {
            get(key) {
                return store.has(key) ? store.get(key) : null;
            },
            set(key, value) {
                store.set(key, value);
            },
            psetex(key, _ttl, value) {
                store.set(key, value);
            },
            del(...keys) {
                let deleted = 0;
                for (const key of keys) {
                    if (store.delete(key)) {
                        deleted += 1;
                    }
                }
                return deleted;
            },
            exists(key) {
                return store.has(key) ? 1 : 0;
            },
            mget(keys) {
                return keys.map((key) => store.get(key) ?? null);
            },
            scan(cursor, _matchLabel, pattern) {
                const regex = new RegExp(`^${pattern.replace(/[|\\{}()[\]^$+?.]/g, '\\$&').replace(/\*/g, '.*')}$`);
                return [cursor === '0' ? '0' : '0', [...store.keys()].filter((key) => regex.test(key))];
            },
            flushdb() {
                store.clear();
            },
            quit() {
                return undefined;
            },
        };

        const cache = MonSQLize.createRedisCacheAdapter({ client: fakeRedis, prefix: 'app:' });
        await cache.set('a', { value: 1 });
        await cache.setMany({ b: { value: 2 }, c: { value: 3 } });

        assert.deepEqual(await cache.get('a'), { value: 1 });
        assert.deepEqual(await cache.getMany(['a', 'b']), {
            a: { value: 1 },
            b: { value: 2 },
        });
        assert.equal(await cache.exists('c'), true);
        assert.deepEqual((await cache.keys('*')).sort(), ['a', 'b', 'c']);
        assert.equal(await cache.delPattern('b*'), 1);
        assert.equal(await cache.delMany(['a', 'c']), 2);
        assert.equal(store.size, 0);
        assert.equal(cache.getRedisInstance(), fakeRedis);
    });

    it('DistributedCacheInvalidator 应同时失效 local/remote cache，并支持处理广播消息', async () => {
        const local = new MonSQLize.MemoryCache();
        const remote = new MonSQLize.MemoryCache();
        local.set('user:1', { id: 1 });
        remote.set('user:1', { id: 1 });
        local.set('user:2', { id: 2 });

        const published = [];
        const invalidator = new MonSQLize.DistributedCacheInvalidator({
            cache: { local, remote },
            pub: {
                publish(channel, message) {
                    published.push({ channel, message });
                },
            },
        });

        await invalidator.invalidate('user:*');
        assert.deepEqual(local.keys('user:*'), []);
        assert.deepEqual(remote.keys('user:*'), []);
        assert.equal(published.length, 1);

        local.set('order:1', { id: 1 });
        await invalidator.handleMessage('monsqlize:cache:invalidate', JSON.stringify({
            type: 'invalidate',
            pattern: 'order:*',
            instanceId: 'remote-node',
        }));
        assert.deepEqual(local.keys('order:*'), []);
        assert.equal(typeof invalidator.getStats().messagesReceived, 'number');
        await invalidator.close();
    });
});


