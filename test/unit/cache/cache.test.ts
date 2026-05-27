import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

const MonSQLize = require('../../../dist/cjs/index.cjs');

type CacheRecord = Record<string, number>;

type LockManager = {
    isLocked(key: string): boolean;
};

type PipelineTask = () => void | Promise<void>;

type FakePipeline = {
    set(key: string, value: unknown, mode?: string, ttl?: number): FakePipeline;
    del(...keys: string[]): FakePipeline;
    exec(): Promise<unknown[]>;
};

type FakeRedis = {
    get(key: string): unknown | null;
    set(key: string, value: unknown): void;
    psetex(key: string, ttl: number | undefined, value: unknown): void;
    del(...keys: string[]): number;
    exists(key: string): 0 | 1;
    mget(...keys: (string | string[])[]): (unknown | null)[];
    scan(cursor: string, matchLabel: string, pattern: string): [string, string[]];
    flushdb(): void;
    quit(): undefined;
    pipeline(): FakePipeline;
};

type MessageHandler = (channel: string, message: string) => void;
type SubscribeCallback = (error: Error | null) => void;

type FakeConnection = {
    on(event: string, handler: MessageHandler): void;
    subscribe(channel: string, callback?: SubscribeCallback): void;
    unsubscribe(channel: string): void;
    quit(): Promise<void>;
    publish(channel: string, message: string): Promise<number>;
    handlers: Map<string, MessageHandler[]>;
    subscriptions: Set<string>;
};

function createConnection(bus: FakeConnection[]): FakeConnection {
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
        async quit() { },
        publish(channel: string, message: string) {
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
}

describe('P3-A cache facade', () => {
    it('MemoryCache supports TTL / pattern / stats / lock manager', async () => {
        const cache = new MonSQLize.MemoryCache({ maxEntries: 10 });
        const lockManager: LockManager = {
            isLocked(key: string) {
                return key === 'locked:key';
            },
        };

        cache.setLockManager(lockManager);
        assert.equal(cache.getLockManager(), lockManager);

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

    it('MultiLevelCache exposes v1 publish and lock-manager mutators', async () => {
        const local = new MonSQLize.MemoryCache();
        const remote = new MonSQLize.MemoryCache();
        const cache = new MonSQLize.MultiLevelCache({ local, remote });
        const published: unknown[] = [];
        const lockManager: LockManager = { isLocked: () => false };

        cache.setPublish((message: unknown) => published.push(message));
        cache.setLockManager(lockManager);
        assert.equal(local.getLockManager(), lockManager);
        assert.equal(remote.getLockManager(), lockManager);

        await cache.set('user:1', { id: 1 });
        assert.deepEqual(await cache.get('user:1'), { id: 1 });
        await cache.delPattern('user:*');
        assert.equal(published.length, 1);
        assert.deepEqual((published[0] as Record<string, unknown>).pattern, 'user:*');
    });

    it('createRedisCacheAdapter supports a fake redis client', async () => {
        const store = new Map<string, unknown>();
        const fakeRedis: FakeRedis = {
            get(key: string) {
                return store.has(key) ? store.get(key) : null;
            },
            set(key: string, value: unknown) {
                store.set(key, value);
            },
            psetex(key: string, _ttl: number | undefined, value: unknown) {
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
            mget(...keys: (string | string[])[]) {
                const resolvedKeys = Array.isArray(keys[0]) ? keys[0] : keys as string[];
                return resolvedKeys.map((key) => store.get(key) ?? null);
            },
            scan(cursor: string, _matchLabel: string, pattern: string) {
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
                const tasks: PipelineTask[] = [];
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

    it('DistributedCacheInvalidator broadcasts with cache-hub semantics and invalidates peer local cache', async () => {
        const bus: FakeConnection[] = [];
        const localA = new MonSQLize.MemoryCache();
        const localB = new MonSQLize.MemoryCache();
        localA.set('user:1', { id: 1 });
        localB.set('user:1', { id: 1 });

        const connA = createConnection(bus);
        const connB = createConnection(bus);
        bus.push(connA, connB);

        const invalidatorA = new MonSQLize.DistributedCacheInvalidator({
            cache: { local: localA },
            channel: 'cache-test',
            instanceId: 'node-a',
            redis: connA,
        });
        const invalidatorB = new MonSQLize.DistributedCacheInvalidator({
            cache: { local: localB },
            channel: 'cache-test',
            instanceId: 'node-b',
            redis: connB,
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

    it('DistributedCacheInvalidator supports _connections injection and direct cache instances', async () => {
        const bus: FakeConnection[] = [];
        const localA = new MonSQLize.MemoryCache();
        const localB = new MonSQLize.MemoryCache();
        localA.set('user:1', { id: 1 });
        localB.set('user:1', { id: 1 });

        const connA = createConnection(bus);
        const connB = createConnection(bus);
        bus.push(connA, connB);

        const invalidatorA = new MonSQLize.DistributedCacheInvalidator({
            cache: localA,
            channel: 'cache-test-direct',
            instanceId: 'node-a-direct',
            _connections: { pub: connA, sub: connA },
        });
        const invalidatorB = new MonSQLize.DistributedCacheInvalidator({
            cache: localB,
            channel: 'cache-test-direct',
            instanceId: 'node-b-direct',
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