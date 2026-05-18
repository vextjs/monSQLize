const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const MonSQLize = require('../../../lib/index.js');

describe('P3-A cache facade', () => {
    it('MemoryCache 应支持 TTL / pattern / stats / lock manager', async () => {
        const cache = new MonSQLize.MemoryCache({ maxEntries: 10 });
        const lockManager = {
            isLocked(key) {
                return key === 'locked:key';
            },
        };

        cache.setLockManager(lockManager);

        cache.set('user:1', { id: 1 }, 20);
        cache.set('user:2', { id: 2 });
        cache.setMany({ 'post:1': { id: 1 }, 'post:2': { id: 2 } });
        cache.set('locked:key', 'denied');

        assert.deepEqual(cache.get('user:1'), { id: 1 });
        assert.equal(cache.exists('user:2'), true);
        assert.equal(cache.get('locked:key'), undefined);
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
        assert.equal(typeof stats.entries, 'number');
        cache.resetStats();
        assert.equal(cache.getStats().hits, 0);
    });

    it('createRedisCacheAdapter 应支持 fake redis client', async () => {
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
            mget(...keys) {
                const resolvedKeys = Array.isArray(keys[0]) ? keys[0] : keys;
                return resolvedKeys.map((key) => store.get(key) ?? null);
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
            pipeline() {
                const tasks = [];
                return {
                    set(key, value, mode, ttl) {
                        tasks.push(() => {
                            if (mode === 'PX') {
                                fakeRedis.psetex(key, ttl, value);
                            } else {
                                fakeRedis.set(key, value);
                            }
                        });
                        return this;
                    },
                    del(...keys) {
                        tasks.push(() => {
                            fakeRedis.del(...keys);
                        });
                        return this;
                    },
                    async exec() {
                        for (const task of tasks) {
                            await task();
                        }
                        return [];
                    },
                };
            },
        };

        const cache = MonSQLize.createRedisCacheAdapter(fakeRedis);
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

    it('DistributedCacheInvalidator 应按 cache-hub 原生语义广播并失��其他节点本地缓存', async () => {
        const createConnection = () => {
            const handlers = new Map();
            const subscriptions = new Set();
            return {
                on(event, handler) {
                    if (!handlers.has(event)) handlers.set(event, []);
                    handlers.get(event).push(handler);
                },
                subscribe(channel, callback) {
                    subscriptions.add(channel);
                    callback?.(null);
                },
                unsubscribe(channel) {
                    subscriptions.delete(channel);
                },
                async quit() {},
                publish(channel, message) {
                    for (const conn of bus) {
                        if (!conn.subscriptions.has(channel)) continue;
                        const listeners = conn.handlers.get('message') ?? [];
                        for (const listener of listeners) {
                            listener(channel, message);
                        }
                    }
                    return Promise.resolve(1);
                },
                handlers,
                subscriptions,
            };
        };

        const bus = [];
        const localA = new MonSQLize.MemoryCache();
        const localB = new MonSQLize.MemoryCache();
        localA.set('user:1', { id: 1 });
        localB.set('user:1', { id: 1 });

        const connA = createConnection();
        const connB = createConnection();
        bus.push(connA, connB);

        const invalidatorA = new MonSQLize.DistributedCacheInvalidator({
            cache: localA,
            channel: 'cache-test',
            instanceId: 'node-a',
            _connections: { pub: connA, sub: connA },
        });
        const invalidatorB = new MonSQLize.DistributedCacheInvalidator({
            cache: localB,
            channel: 'cache-test',
            instanceId: 'node-b',
            _connections: { pub: connB, sub: connB },
        });

        await invalidatorA.invalidate('user:*');
        await new Promise((resolve) => setImmediate(resolve));

        assert.deepEqual(localA.keys('user:*'), ['user:1']);
        assert.deepEqual(localB.keys('user:*'), []);
        assert.equal(invalidatorA.getStats().messagesSent, 1);
        assert.equal(invalidatorB.getStats().invalidationsTriggered, 1);

        await invalidatorA.close();
        await invalidatorB.close();
    });
});


