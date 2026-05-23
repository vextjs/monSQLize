import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import MonSQLize from 'monsqlize';

describe('Stage B cache facade TS migration', () => {
    it('MemoryCache 应支持 TTL / pattern / stats / lock manager', async () => {
        const cache = new MonSQLize.MemoryCache({ maxEntries: 10 });
        const lockManager = {
            isLocked(key: string) {
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
        const store = new Map<string, string>();
        const fakeRedis = {
            get(key: string) {
                return store.has(key) ? store.get(key) ?? null : null;
            },
            set(key: string, value: string) {
                store.set(key, value);
            },
            psetex(key: string, _ttl: number, value: string) {
                store.set(key, value);
            },
            del(...keys: string[]) {
                let deleted = 0;
                for (const key of keys) {
                    if (store.delete(key)) {
                        deleted += 1;
                    }
                }
                return deleted;
            },
            exists(key: string) {
                return store.has(key) ? 1 : 0;
            },
            mget(...keys: Array<string | string[]>) {
                const resolvedKeys = (Array.isArray(keys[0]) ? keys[0] : keys) as string[];
                return resolvedKeys.map((key: string) => store.get(key) ?? null);
            },
            scan(cursor: string, _matchLabel: string, pattern: string) {
                const regex = new RegExp(`^${pattern.replace(/[|\\{}()[\]^$+?.]/g, '\\$&').replace(/\*/g, '.*')}$`);
                return [cursor === '0' ? '0' : '0', [...store.keys()].filter((key) => regex.test(key))] as const;
            },
            flushdb() {
                store.clear();
            },
            quit() {
                return undefined;
            },
            pipeline() {
                const tasks: Array<() => void | Promise<void>> = [];
                const api = {
                    set(key: string, value: string, mode?: string, ttl?: number) {
                        tasks.push(() => {
                            if (mode === 'PX' && typeof ttl === 'number') {
                                fakeRedis.psetex(key, ttl, value);
                            } else {
                                fakeRedis.set(key, value);
                            }
                        });
                        return api;
                    },
                    del(...keys: string[]) {
                        tasks.push(() => {
                            fakeRedis.del(...keys);
                        });
                        return api;
                    },
                    async exec() {
                        for (const task of tasks) {
                            await task();
                        }
                        return [];
                    },
                };
                return api;
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
});