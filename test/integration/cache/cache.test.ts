import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';

const MonSQLize = require('../../../dist/cjs/index.cjs');

type MessageHandler = (channel: string, message: string) => void;
type SubscribeCallback = (error: Error | null) => void;

type FakeConnection = {
    on(event: string, handler: MessageHandler): void;
    subscribe(channel: string, callback?: SubscribeCallback): void;
    unsubscribe(channel: string): void;
    quit(): Promise<void>;
    publish(channel: string, message: string): Promise<number>;
    duplicate(): FakeConnection;
    handlers: Map<string, MessageHandler[]>;
    subscriptions: Set<string>;
};

type FakePipeline = {
    set(key: string, value: unknown, mode?: string, ttl?: number): FakePipeline;
    del(...keys: string[]): FakePipeline;
    exec(): Promise<unknown[]>;
};

const invalidators: any[] = [];

after(async () => {
    for (const invalidator of invalidators) {
        await invalidator.close();
    }
});

describe('P3-A cache facade integration', () => {
    it('MonSQLize instances expose usable MemoryCache and distributed invalidator collaboration', async () => {
        const runtime = new MonSQLize({
            type: 'mongodb',
            databaseName: 'cache_facade_integration',
            cache: { maxSize: 10 },
        });

        const cache = runtime.getCache();
        cache.set('session:1', { id: 1 }, 1000);
        cache.set('session:2', { id: 2 }, 1000);
        assert.deepEqual(cache.keys('session:*').sort(), ['session:1', 'session:2']);

        const remoteNodeCache = new MonSQLize.MemoryCache();
        remoteNodeCache.set('session:1', { id: 1 }, 1000);
        remoteNodeCache.set('session:2', { id: 2 }, 1000);

        const peers: FakeConnection[] = [];
        const createConnection = (): FakeConnection => {
            const handlers = new Map<string, MessageHandler[]>();
            const subscriptions = new Set<string>();
            return {
                on(event: string, handler: MessageHandler) {
                    if (!handlers.has(event)) handlers.set(event, []);
                    handlers.get(event)?.push(handler);
                },
                subscribe(channel: string, callback?: SubscribeCallback) {
                    subscriptions.add(channel);
                    callback?.(null);
                },
                unsubscribe(channel: string) {
                    subscriptions.delete(channel);
                },
                async quit() {},
                duplicate() {
                    const duplicated = createConnection();
                    peers.push(duplicated);
                    return duplicated;
                },
                publish(channel: string, message: string) {
                    for (const peer of peers) {
                        if (!peer.subscriptions.has(channel)) continue;
                        const listeners = peer.handlers.get('message') ?? [];
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

        const connA = createConnection();
        const connB = createConnection();
        peers.push(connA, connB);

        const invalidator = new MonSQLize.DistributedCacheInvalidator({
            cache: { local: cache },
            channel: 'cache-integration',
            instanceId: 'runtime-node',
            redis: connA,
        });
        const remoteInvalidator = new MonSQLize.DistributedCacheInvalidator({
            cache: { local: remoteNodeCache },
            channel: 'cache-integration',
            instanceId: 'remote-node',
            redis: connB,
        });
        invalidators.push(invalidator);
        invalidators.push(remoteInvalidator);

        await invalidator.invalidate('session:*');
        await new Promise((resolve) => setImmediate(resolve));

        assert.deepEqual(cache.keys('session:*').sort(), ['session:1', 'session:2']);
        assert.deepEqual(remoteNodeCache.keys('session:*'), []);
        assert.equal(remoteInvalidator.getStats().invalidationsTriggered, 1);
    });

    it('Redis cache adapter forms a complete cache-like contract with a fake redis client', async () => {
        const state = new Map<string, unknown>();
        const fakeRedis = {
            get(key: string) {
                return state.has(key) ? state.get(key) : null;
            },
            set(key: string, value: unknown) {
                state.set(key, value);
            },
            psetex(key: string, _ttl: number | undefined, value: unknown) {
                state.set(key, value);
            },
            del(...keys: string[]) {
                let deleted = 0;
                for (const key of keys) {
                    if (state.delete(key)) {
                        deleted += 1;
                    }
                }
                return deleted;
            },
            exists(key: string) {
                return state.has(key) ? 1 : 0;
            },
            mget(...keys: (string | string[])[]) {
                const resolvedKeys = Array.isArray(keys[0]) ? keys[0] : keys as string[];
                return resolvedKeys.map((key) => state.get(key) ?? null);
            },
            scan(cursor: string, _matchLabel: string, pattern: string) {
                const regex = new RegExp(`^${pattern.replace(/[|\\{}()[\]^$+?.]/g, '\\$&').replace(/\*/g, '.*')}$`);
                return [cursor === '0' ? '0' : '0', [...state.keys()].filter((key) => regex.test(key))];
            },
            flushdb() {
                state.clear();
            },
            pipeline() {
                const tasks: Array<() => void | Promise<void>> = [];
                const pipeline: FakePipeline = {
                    set(key: string, value: unknown, mode?: string, ttl?: number) {
                        tasks.push(() => {
                            if (mode === 'PX') {
                                fakeRedis.psetex(key, ttl, value);
                            } else {
                                fakeRedis.set(key, value);
                            }
                        });
                        return pipeline;
                    },
                    del(...keys: string[]) {
                        tasks.push(() => {
                            fakeRedis.del(...keys);
                        });
                        return pipeline;
                    },
                    async exec() {
                        for (const task of tasks) {
                            await task();
                        }
                        return [];
                    },
                };
                return pipeline;
            },
        };

        const cache = MonSQLize.createRedisCacheAdapter(fakeRedis);
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
