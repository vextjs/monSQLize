import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

const { DistributedCacheInvalidator } = require('../../../dist/cjs/index.cjs');

function makeMockConnection() {
    const subscribers: Record<string, ((ch: string, msg: string) => void)[]> = {};
    return {
        subscribe: (_ch: string, cb: () => void) => cb(),
        on: (event: string, cb: (...args: unknown[]) => void) => {
            if (!subscribers[event]) subscribers[event] = [];
            subscribers[event].push(cb as (ch: string, msg: string) => void);
        },
        publish: async (_ch: string, _msg: string) => {},
        quit: async () => {},
        unsubscribe: async () => {},
        duplicate: () => makeMockConnection(),
        _emit: (event: string, ...args: unknown[]) => {
            (subscribers[event] ?? []).forEach((cb) => cb(...args as [string, string]));
        },
    };
}

function buildInvalidator(cacheOverride?: unknown) {
    const pub = makeMockConnection();
    const sub = makeMockConnection();
    const cache = cacheOverride ?? { delPattern: async (_pattern: string) => {} };
    const inv = new DistributedCacheInvalidator({
        cache,
        _connections: { pub, sub },
    });
    return { inv, pub, sub };
}

describe('DistributedCacheInvalidator — branch coverage', () => {
    it('throws when no cache provided', () => {
        assert.throws(
            () => new DistributedCacheInvalidator({ cache: null, _connections: { pub: makeMockConnection(), sub: makeMockConnection() } }),
            /requires a cache/,
        );
    });

    it('throws when no redis/redisUrl/_connections', () => {
        assert.throws(
            () => new DistributedCacheInvalidator({ cache: {} }),
            /requires either redis or redisUrl/,
        );
    });

    it('uses _connections.pub and sub when provided', () => {
        const { inv } = buildInvalidator();
        assert.ok(inv.pub !== null);
        assert.ok(inv.sub !== null);
    });

    it('uses options.redis when _connections not provided', () => {
        const pub = makeMockConnection();
        const inv = new DistributedCacheInvalidator({ cache: {}, redis: pub });
        assert.equal(inv.pub, pub);
        assert.notEqual(inv.sub, pub);
    });

    it('uses custom channel from options', () => {
        const { inv } = buildInvalidator();
        const customInv = new DistributedCacheInvalidator({
            cache: {},
            _connections: { pub: makeMockConnection(), sub: makeMockConnection() },
            channel: 'my:custom:channel',
        });
        assert.equal(customInv.channel, 'my:custom:channel');
    });

    it('uses custom instanceId from options', () => {
        const customInv = new DistributedCacheInvalidator({
            cache: {},
            _connections: { pub: makeMockConnection(), sub: makeMockConnection() },
            instanceId: 'fixed-instance-id',
        });
        assert.equal(customInv.instanceId, 'fixed-instance-id');
    });

    it('message on different channel is ignored', async () => {
        const pub = makeMockConnection();
        const sub = makeMockConnection();
        const inv = new DistributedCacheInvalidator({ cache: { delPattern: async () => {} }, _connections: { pub, sub } });
        const before = inv.getStats().messagesReceived;
        sub._emit('message', 'other:channel', JSON.stringify({ type: 'invalidate', instanceId: 'other', pattern: 'test' }));
        await new Promise((r) => setImmediate(r));
        assert.equal(inv.getStats().messagesReceived, before);
    });

    it('invalid JSON in message increments error count', async () => {
        const pub = makeMockConnection();
        const sub = makeMockConnection();
        const inv = new DistributedCacheInvalidator({ cache: { delPattern: async () => {} }, _connections: { pub, sub } });
        const channel = inv.channel;
        sub._emit('message', channel, 'not-valid-json{{{');
        await new Promise((r) => setImmediate(r));
        assert.equal(inv.getStats().errors, 1);
    });

    it('message type !== invalidate is ignored', async () => {
        const pub = makeMockConnection();
        const sub = makeMockConnection();
        const inv = new DistributedCacheInvalidator({ cache: { delPattern: async () => {} }, _connections: { pub, sub } });
        const channel = inv.channel;
        sub._emit('message', channel, JSON.stringify({ type: 'other', instanceId: 'other' }));
        await new Promise((r) => setImmediate(r));
        assert.equal(inv.getStats().messagesReceived, 0);
    });

    it('message from same instanceId is ignored (own message)', async () => {
        const pub = makeMockConnection();
        const sub = makeMockConnection();
        const inv = new DistributedCacheInvalidator({ cache: { delPattern: async () => {} }, _connections: { pub, sub } });
        const channel = inv.channel;
        const instanceId = inv.instanceId;
        sub._emit('message', channel, JSON.stringify({ type: 'invalidate', instanceId, pattern: 'test' }));
        await new Promise((r) => setImmediate(r));
        assert.equal(inv.getStats().messagesReceived, 0);
    });

    it('valid message from other instance triggers cache invalidation', async () => {
        const invalidated: string[] = [];
        const pub = makeMockConnection();
        const sub = makeMockConnection();
        const inv = new DistributedCacheInvalidator({
            cache: { delPattern: async (p: string) => { invalidated.push(p); } },
            _connections: { pub, sub },
        });
        const channel = inv.channel;
        sub._emit('message', channel, JSON.stringify({ type: 'invalidate', instanceId: 'other', pattern: 'test:*' }));
        await new Promise((r) => setImmediate(r));
        assert.ok(invalidated.includes('test:*'));
        assert.equal(inv.getStats().invalidationsTriggered, 1);
    });

    it('cache invalidation error increments error stats', async () => {
        const pub = makeMockConnection();
        const sub = makeMockConnection();
        const inv = new DistributedCacheInvalidator({
            cache: {
                delPattern: async () => { throw new Error('redis error'); },
            },
            _connections: { pub, sub },
        });
        const channel = inv.channel;
        sub._emit('message', channel, JSON.stringify({ type: 'invalidate', instanceId: 'other', pattern: 'x:*' }));
        await new Promise((r) => setImmediate(r));
        assert.equal(inv.getStats().errors, 1);
    });

    it('_getTargetCaches includes cache.local and cache.remote when they have delPattern', async () => {
        const invalidatedLocal: string[] = [];
        const invalidatedRemote: string[] = [];
        const pub = makeMockConnection();
        const sub = makeMockConnection();
        const cache = {
            local: { delPattern: async (p: string) => { invalidatedLocal.push(p); } },
            remote: { delPattern: async (p: string) => { invalidatedRemote.push(p); } },
        };
        const inv = new DistributedCacheInvalidator({ cache, _connections: { pub, sub } });
        const channel = inv.channel;
        sub._emit('message', channel, JSON.stringify({ type: 'invalidate', instanceId: 'other', pattern: 'k:*' }));
        await new Promise((r) => setImmediate(r));
        assert.ok(invalidatedLocal.includes('k:*'));
        assert.ok(invalidatedRemote.includes('k:*'));
    });

    it('_getTargetCaches: cache has delPattern directly', async () => {
        const invalidated: string[] = [];
        const pub = makeMockConnection();
        const sub = makeMockConnection();
        const cache = { delPattern: async (p: string) => { invalidated.push(p); } };
        const inv = new DistributedCacheInvalidator({ cache, _connections: { pub, sub } });
        const channel = inv.channel;
        sub._emit('message', channel, JSON.stringify({ type: 'invalidate', instanceId: 'other', pattern: 'z:*' }));
        await new Promise((r) => setImmediate(r));
        assert.ok(invalidated.includes('z:*'));
    });

    it('invalidate() with empty pattern returns early', async () => {
        const { inv } = buildInvalidator();
        await inv.invalidate('');
        assert.equal(inv.getStats().messagesSent, 0);
    });

    it('invalidate() publishes message and increments messagesSent', async () => {
        const published: unknown[] = [];
        const pub = makeMockConnection();
        pub.publish = async (_ch: string, msg: string) => { published.push(msg); };
        const sub = makeMockConnection();
        const inv = new DistributedCacheInvalidator({ cache: {}, _connections: { pub, sub } });
        await inv.invalidate('test:*');
        assert.equal(inv.getStats().messagesSent, 1);
        assert.ok(published.length === 1);
    });

    it('invalidate() error propagates and increments errors', async () => {
        const pub = makeMockConnection();
        pub.publish = async () => { throw new Error('publish error'); };
        const sub = makeMockConnection();
        const inv = new DistributedCacheInvalidator({ cache: {}, _connections: { pub, sub } });
        await assert.rejects(() => inv.invalidate('x:*'), /publish error/);
        assert.equal(inv.getStats().errors, 1);
    });

    it('getStats returns structured stats with instanceId and channel', () => {
        const { inv } = buildInvalidator();
        const stats = inv.getStats();
        assert.ok('messagesSent' in stats);
        assert.ok('instanceId' in stats);
        assert.ok('channel' in stats);
    });

    it('close() succeeds without errors', async () => {
        const { inv } = buildInvalidator();
        await assert.doesNotReject(() => inv.close());
    });

    it('close() with error swallows it when logger is null', async () => {
        const pub = makeMockConnection();
        pub.quit = async () => { throw new Error('quit error'); };
        const sub = makeMockConnection();
        const inv = new DistributedCacheInvalidator({ cache: {}, _connections: { pub, sub } });
        await assert.doesNotReject(() => inv.close());
    });

    it('close() with error logs it when logger is provided', async () => {
        const errors: unknown[] = [];
        const pub = makeMockConnection();
        pub.quit = async () => { throw new Error('quit error'); };
        const sub = makeMockConnection();
        const inv = new DistributedCacheInvalidator({
            cache: {},
            _connections: { pub, sub },
            logger: { error: (...args: unknown[]) => errors.push(args), debug: () => {} },
        });
        await assert.doesNotReject(() => inv.close());
        assert.ok(errors.length > 0);
    });
});
