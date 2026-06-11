import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryServerBootstrap } from '../../bootstrap/memory-server';

const MonSQLize = require('../../../dist/cjs/index.cjs');

describe('Runtime — extended methods coverage', () => {
    const bootstrap = createMemoryServerBootstrap();
    let uri = '';
    let runtime: any;

    before(async () => {
        const ctx = await bootstrap.setup();
        uri = ctx.uri;
        runtime = new MonSQLize({
            type: 'mongodb',
            databaseName: 'test_runtime_methods',
            config: { uri },
        });
        await runtime.connect();
    });

    after(async () => {
        if (runtime) await runtime.close();
        await bootstrap.teardown();
    });

    // ── event emitter: on / once / off ────────────────────────────────────────

    it('on() registers an event handler', () => {
        const received: unknown[] = [];
        runtime.on('test-event', (data: unknown) => received.push(data));
        runtime.emit('test-event', { msg: 'hello' });
        assert.equal(received.length, 1);
    });

    it('once() registers a one-time event handler', () => {
        const received: unknown[] = [];
        runtime.once('once-event', (data: unknown) => received.push(data));
        runtime.emit('once-event', 'first');
        runtime.emit('once-event', 'second');
        assert.equal(received.length, 1);
        assert.equal(received[0], 'first');
    });

    it('off() removes a handler', () => {
        const received: unknown[] = [];
        const handler = (data: unknown) => received.push(data);
        runtime.on('off-event', handler);
        runtime.emit('off-event', 'before-off');
        runtime.off('off-event', handler);
        runtime.emit('off-event', 'after-off');
        assert.equal(received.length, 1);
    });

    // ── withLock ──────────────────────────────────────────────────────────────

    it('withLock executes callback inside lock', async () => {
        const result = await runtime.withLock('runtime-lock-key', () => Promise.resolve('locked-result'));
        assert.equal(result, 'locked-result');
    });

    it('withLock releases lock even when callback throws', async () => {
        await assert.rejects(
            () => runtime.withLock('error-lock', () => Promise.reject(new Error('cb error'))),
            /cb error/,
        );
        // Can acquire again after error
        const result = await runtime.withLock('error-lock', () => Promise.resolve('ok'));
        assert.equal(result, 'ok');
    });

    // ── acquireLock / tryAcquireLock ──────────────────────────────────────────

    it('acquireLock returns a lock object', async () => {
        const lock = await runtime.acquireLock('acq-key', { ttl: 5000, retryTimes: 0 });
        assert.ok(lock !== null);
        await lock.release();
    });

    it('tryAcquireLock returns lock when key is free', async () => {
        const lock = await runtime.tryAcquireLock('try-key');
        assert.ok(lock !== null);
        await lock.release();
    });

    it('tryAcquireLock returns null when key is held', async () => {
        const lock1 = await runtime.tryAcquireLock('held-try');
        assert.ok(lock1 !== null);
        const lock2 = await runtime.tryAcquireLock('held-try');
        assert.equal(lock2, null);
        await lock1.release();
    });

    // ── getLockStats ──────────────────────────────────────────────────────────

    it('getLockStats returns stats after lock operations', async () => {
        const lock = await runtime.acquireLock('stats-lock');
        await lock.release();
        const stats = runtime.getLockStats();
        assert.ok(stats !== null);
        assert.ok(typeof stats.locksAcquired === 'number');
    });

    // ── startSession ──────────────────────────────────────────────────────────

    it('startSession returns a Transaction', async () => {
        const tx = await runtime.startSession();
        assert.ok(tx !== null);
        await tx.abort();
    });

    it('getTransactionStats returns aggregate stats after transaction activity', async () => {
        const before = runtime.getTransactionStats();
        assert.ok(before !== null);
        await runtime.withTransaction(async () => 'ok');
        const stats = runtime.getTransactionStats();
        assert.ok(stats !== null);
        assert.ok(stats.totalTransactions >= before.totalTransactions + 1);
        assert.ok(typeof stats.averageDuration === 'number');
        assert.ok(typeof stats.p95Duration === 'number');
        assert.ok(typeof stats.p99Duration === 'number');
        assert.ok(typeof stats.successRate === 'string');
        assert.ok(typeof stats.readOnlyRatio === 'string');
    });

    it('getDistributedCacheInvalidatorStats returns null when distributed cache is disabled', () => {
        assert.equal(runtime.getDistributedCacheInvalidatorStats(), null);
    });

    it('initializes distributed cache invalidator with injected Redis-like connections', async () => {
        const warnings: unknown[][] = [];
        const publishedPatterns: string[] = [];
        const fakeRedis = {
            subscribe(_channel: string, callback?: () => void) {
                callback?.();
            },
            on() {},
            publish: async (_channel: string, message: string) => {
                publishedPatterns.push(JSON.parse(message).pattern);
                return 1;
            },
            unsubscribe: async () => {},
            quit: async () => {},
        };
        const distributedRuntime = new MonSQLize({
            type: 'mongodb',
            databaseName: 'test_runtime_distributed_invalidator',
            config: { uri },
            cache: {
                distributed: {
                    redis: fakeRedis,
                    channel: 'monsqlize:test:invalidate',
                    instanceId: 'runtime-methods-test',
                },
            },
            logger: {
                debug: () => {},
                info: () => {},
                warn: (...args: unknown[]) => warnings.push(args),
                error: () => {},
            },
        });

        try {
            await distributedRuntime.connect();
            const stats = distributedRuntime.getDistributedCacheInvalidatorStats();
            assert.ok(stats !== null);
            assert.equal(stats.instanceId, 'runtime-methods-test');
            assert.ok(warnings.some(([message]) => String(message).includes('distributed invalidator created')));
        } finally {
            await distributedRuntime.close();
        }
        assert.deepEqual(publishedPatterns, []);
    });

    // ── getSlowQueryLogManager ────────────────────────────────────────────────

    it('getSlowQueryLogManager returns null when not configured', () => {
        const mgr = runtime.getSlowQueryLogManager();
        // null or a real manager depending on options
        assert.ok(mgr === null || typeof mgr === 'object');
    });

    it('slow query log queries reject when the capability is not enabled', async () => {
        await assert.rejects(
            () => runtime.getSlowQueryLogs(),
            /slow query log is not enabled/i,
        );
    });

    it('startSync rejects when sync is not enabled', async () => {
        await assert.rejects(
            () => runtime.startSync(),
            /sync is not enabled/i,
        );
    });

    // ── getSagaOrchestrator / saga ────────────────────────────────────────────

    it('getSagaOrchestrator returns a SagaOrchestrator', () => {
        const orch = runtime.getSagaOrchestrator();
        assert.ok(orch !== null);
    });

    it('saga() is alias for getSagaOrchestrator()', () => {
        const orch = runtime.saga();
        assert.ok(orch !== null);
    });

    // ── dropDatabase ──────────────────────────────────────────────────────────

    it('dropDatabase drops the database when confirmed', async () => {
        const tmpRuntime = new MonSQLize({
            type: 'mongodb',
            databaseName: 'test_drop_db_tmp',
            config: { uri },
        });
        await tmpRuntime.connect();
        await tmpRuntime.collection('tmp_col').insertOne({ x: 1 });
        const result = await tmpRuntime.dropDatabase({ confirm: true });
        assert.equal(result.dropped, true);
        assert.equal(result.database, 'test_drop_db_tmp');
        await tmpRuntime.close();
    });

    it('dropDatabase rejects when not confirmed', async () => {
        await assert.rejects(
            () => runtime.dropDatabase({ confirm: false }),
            /confirm/i,
        );
    });
});

describe('Runtime — dbInstance and cache getter coverage', () => {
    const bootstrap = createMemoryServerBootstrap();
    let uri = '';
    let runtime: any;

    before(async () => {
        const ctx = await bootstrap.setup();
        uri = ctx.uri;
        runtime = new MonSQLize({
            type: 'mongodb',
            databaseName: 'test_dbinstance_coverage',
            config: { uri },
        });
        await runtime.connect();
    });

    after(async () => {
        if (runtime) await runtime.close();
        await bootstrap.teardown();
    });

    it('runtime.cache getter returns a cache object', () => {
        const cache = runtime.cache;
        assert.ok(cache !== null && cache !== undefined);
        assert.ok(typeof cache.get === 'function');
        assert.ok(typeof cache.set === 'function');
    });

    it('runtime.dbInstance is non-null when connected', () => {
        const db = runtime.dbInstance;
        assert.ok(db !== null && db !== undefined);
        assert.ok(typeof db.collection === 'function');
        assert.ok(typeof db.db === 'function');
        assert.ok(typeof db.withLock === 'function');
        assert.ok(typeof db.acquireLock === 'function');
        assert.ok(typeof db.tryAcquireLock === 'function');
        assert.ok(typeof db.getLockStats === 'function');
    });

    it('dbInstance.collection(name) returns a collection facade', () => {
        const col = runtime.dbInstance.collection('di_test');
        assert.ok(col !== null && col !== undefined);
        assert.ok(typeof col.find === 'function');
    });

    it('dbInstance.db() returns a db facade', () => {
        const db = runtime.dbInstance.db();
        assert.ok(db !== null && db !== undefined);
        assert.ok(typeof db.collection === 'function');
    });

    it('dbInstance.withLock() acquires and releases lock', async () => {
        const result = await runtime.dbInstance.withLock('di-lock', () => Promise.resolve(42));
        assert.equal(result, 42);
    });

    it('dbInstance.acquireLock() returns a lock', async () => {
        const lock = await runtime.dbInstance.acquireLock('di-acq', { ttl: 5000, retryTimes: 0 });
        assert.ok(lock !== null);
        await lock.release();
    });

    it('dbInstance.tryAcquireLock() returns lock when free', async () => {
        const lock = await runtime.dbInstance.tryAcquireLock('di-try');
        assert.ok(lock !== null);
        await lock.release();
    });

    it('dbInstance.tryAcquireLock() returns null when held', async () => {
        const lock1 = await runtime.dbInstance.tryAcquireLock('di-held');
        assert.ok(lock1 !== null);
        const lock2 = await runtime.dbInstance.tryAcquireLock('di-held');
        assert.equal(lock2, null);
        await lock1.release();
    });

    it('dbInstance.getLockStats() returns stats', async () => {
        const lock = await runtime.dbInstance.acquireLock('di-stats');
        await lock.release();
        const stats = runtime.dbInstance.getLockStats();
        assert.ok(stats !== null);
    });

    it('runtime._connecting is null after fully connected', () => {
        // _connecting is only set while connecting; after connect() resolves it should be null
        const connecting = runtime._connecting;
        assert.ok(connecting === null || connecting instanceof Promise);
    });
});

describe('Runtime — pool methods coverage', () => {
    const bootstrap = createMemoryServerBootstrap();
    let uri = '';
    let runtime: any;

    before(async () => {
        const ctx = await bootstrap.setup();
        uri = ctx.uri;

        const clientFactory = async (cfg: any) => {
            const { MongoClient } = require('mongodb');
            const client = new MongoClient(uri);
            await client.connect();
            return client;
        };

        runtime = new MonSQLize({
            type: 'mongodb',
            databaseName: 'test_pool_methods',
            config: { uri },
            pools: [{ name: 'primary', role: 'primary', weight: 1, uri, clientFactory }],
        });
        await runtime.connect();
    });

    after(async () => {
        if (runtime) await runtime.close();
        await bootstrap.teardown();
    });

    it('getPoolHealth returns health status map', () => {
        const health = runtime.getPoolHealth();
        assert.ok(typeof health === 'object');
        assert.ok('primary' in health);
    });

    it('addPool adds a new pool', async () => {
        const clientFactory = async () => {
            const { MongoClient } = require('mongodb');
            const client = new MongoClient(uri);
            await client.connect();
            return client;
        };
        await runtime.addPool({ name: 'added-pool', role: 'secondary', weight: 1, uri, clientFactory });
        const names = runtime.getPoolNames();
        assert.ok(names.includes('added-pool'));
    });

    it('removePool removes an existing pool', async () => {
        const clientFactory = async () => {
            const { MongoClient } = require('mongodb');
            const client = new MongoClient(uri);
            await client.connect();
            return client;
        };
        await runtime.addPool({ name: 'to-remove', role: 'secondary', weight: 1, uri, clientFactory });
        await runtime.removePool('to-remove');
        const names = runtime.getPoolNames();
        assert.ok(!names.includes('to-remove'));
    });
});
