import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';

import MonSQLize from 'monsqlize';

type MessageListener = (channel: string, message: string) => void;

type BusConnection = {
    handlers: Map<string, MessageListener[]>;
    subscriptions: Set<string>;
    on(event: string, handler: MessageListener): void;
    subscribe(channel: string, callback?: (error?: Error | null) => void): void;
    unsubscribe(channel: string): void;
    quit(): Promise<void>;
    publish(channel: string, message: string): Promise<number>;
};

const invalidators: Array<{ close(): Promise<void> }> = [];

after(async () => {
    for (const invalidator of invalidators) {
        await invalidator.close();
    }
    invalidators.length = 0;
});

function createConnection(peers: BusConnection[]): BusConnection {
    const handlers = new Map<string, MessageListener[]>();
    const subscriptions = new Set<string>();

    return {
        handlers,
        subscriptions,
        on(event: string, handler: MessageListener) {
            if (!handlers.has(event)) {
                handlers.set(event, []);
            }
            handlers.get(event)?.push(handler);
        },
        subscribe(channel: string, callback?: (error?: Error | null) => void) {
            subscriptions.add(channel);
            callback?.(null);
        },
        unsubscribe(channel: string) {
            subscriptions.delete(channel);
        },
        async quit() {},
        publish(channel: string, message: string) {
            for (const peer of peers) {
                if (!peer.subscriptions.has(channel)) {
                    continue;
                }
                const listeners = peer.handlers.get('message') ?? [];
                for (const listener of listeners) {
                    listener(channel, message);
                }
            }
            return Promise.resolve(1);
        },
    };
}

describe('Stage B cache invalidation TS migration', () => {
    it('DistributedCacheInvalidator 应按公开 cache 能力语义广播远端失效', async () => {
        const peers: BusConnection[] = [];
        const localCache = new MonSQLize.MemoryCache();
        const remoteCache = new MonSQLize.MemoryCache();

        localCache.set('session:1', { id: 1 });
        localCache.set('session:2', { id: 2 });
        remoteCache.set('session:1', { id: 1 });
        remoteCache.set('session:2', { id: 2 });

        const connA = createConnection(peers);
        const connB = createConnection(peers);
        peers.push(connA, connB);

        const invalidator = new MonSQLize.DistributedCacheInvalidator({
            cache: { local: localCache } as never,
            channel: 'cache-ts-migration',
            instanceId: 'runtime-node',
            redis: connA,
        });
        const remoteInvalidator = new MonSQLize.DistributedCacheInvalidator({
            cache: { local: remoteCache } as never,
            channel: 'cache-ts-migration',
            instanceId: 'remote-node',
            redis: connB,
        });
        invalidators.push(invalidator, remoteInvalidator);

        await invalidator.invalidate('session:*');
        await new Promise((resolve) => setImmediate(resolve));

        assert.deepEqual(localCache.keys('session:*').sort(), ['session:1', 'session:2']);
        assert.deepEqual(remoteCache.keys('session:*'), []);
        assert.equal(invalidator.getStats().messagesSent, 1);
        assert.equal(remoteInvalidator.getStats().invalidationsTriggered, 1);
    });
});