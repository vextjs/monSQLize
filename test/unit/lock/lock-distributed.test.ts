import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

const MonSQLize = require('../../../dist/cjs/index.cjs');

// Minimal Redis mock covering the ioredis surface used by DistributedCacheLockManager
function createMockRedis(opts: {
    setResult?: string | null;
    evalResult?: number;
    existsResult?: number;
    keysResult?: string[];
    errorOnSet?: boolean;
    errorOnEval?: boolean;
    errorOnExists?: boolean;
} = {}) {
    const store = new Map<string, string>();
    const errorHandlers: Array<(...args: unknown[]) => void> = [];

    return {
        store,
        triggerError(err: Error) {
            for (const h of errorHandlers) h(err);
        },
        on(event: string, handler: (...args: unknown[]) => void) {
            if (event === 'error') errorHandlers.push(handler);
        },
        async set(key: string, value: string, ...args: unknown[]) {
            if (opts.errorOnSet) throw new Error('Redis ECONNREFUSED');
            // NX flag: only set if not exists
            const hasNX = args.includes('NX');
            if (hasNX && store.has(key)) return null;
            store.set(key, value);
            return opts.setResult ?? 'OK';
        },
        async eval(_script: string, _numkeys: number, ...args: unknown[]) {
            if (opts.errorOnEval) throw new Error('EVAL error');
            if (opts.evalResult !== undefined) return opts.evalResult;
            // Simulate Lua script: delete if value matches
            const key = args[0] as string;
            const val = args[1] as string;
            if (store.get(key) === val) {
                store.delete(key);
                return 1;
            }
            return 0;
        },
        async exists(key: string) {
            if (opts.errorOnExists) throw new Error('ECONNREFUSED');
            return opts.existsResult ?? (store.has(key) ? 1 : 0);
        },
        async keys(_pattern: string) {
            if (opts.keysResult !== undefined) return opts.keysResult;
            return [...store.keys()];
        },
    };
}

describe('DistributedCacheLockManager', () => {

    // ── constructor ───────────────────────────────────────────────────────────

    it('throws when redis is not provided', () => {
        assert.throws(
            () => new MonSQLize.DistributedCacheLockManager({ redis: null }),
            /requires a Redis instance/,
        );
    });

    it('constructs with default prefix and maxDuration', () => {
        const redis = createMockRedis();
        const mgr = new MonSQLize.DistributedCacheLockManager({ redis });
        const stats = mgr.getStats();
        assert.equal(stats.locksAcquired, 0);
        assert.equal(stats.lockKeyPrefix, 'monsqlize:cache:lock:');
    });

    it('reports Redis error via on("error") handler', () => {
        const redis = createMockRedis();
        const errors: unknown[] = [];
        const mgr = new MonSQLize.DistributedCacheLockManager({ redis, logger: { error: (...a: unknown[]) => errors.push(a), warn: () => {} } });
        redis.triggerError(new Error('redis down'));
        assert.ok(mgr.getStats().errors >= 1 || errors.length >= 1);
    });

    // ── tryAcquireLock ────────────────────────────────────────────────────────

    it('tryAcquireLock returns a Lock on first attempt', async () => {
        const redis = createMockRedis();
        const mgr = new MonSQLize.DistributedCacheLockManager({ redis });
        const lock = await mgr.tryAcquireLock('res-1', { ttl: 5000 });
        assert.ok(lock !== null);
        assert.equal(mgr.getStats().locksAcquired, 1);
    });

    it('tryAcquireLock returns null when key already held', async () => {
        const redis = createMockRedis();
        const mgr = new MonSQLize.DistributedCacheLockManager({ redis });
        await mgr.tryAcquireLock('held', { ttl: 5000 });
        const second = await mgr.tryAcquireLock('held', { ttl: 5000 });
        assert.equal(second, null);
    });

    it('tryAcquireLock returns null on Redis error', async () => {
        const redis = createMockRedis({ errorOnSet: true });
        const mgr = new MonSQLize.DistributedCacheLockManager({ redis });
        const lock = await mgr.tryAcquireLock('err-key');
        assert.equal(lock, null);
    });

    // ── acquireLock ───────────────────────────────────────────────────────────

    it('acquireLock returns Lock on success', async () => {
        const redis = createMockRedis();
        const mgr = new MonSQLize.DistributedCacheLockManager({ redis });
        const lock = await mgr.acquireLock('acq-1', { ttl: 1000, retryTimes: 0 });
        assert.ok(lock);
        assert.equal(mgr.getStats().locksAcquired, 1);
    });

    it('acquireLock throws LockAcquireError after exhausting retries', async () => {
        const redis = createMockRedis({ setResult: null }); // always fail NX
        const mgr = new MonSQLize.DistributedCacheLockManager({ redis });
        // Pre-fill the key so NX always fails
        redis.store.set('monsqlize:cache:lock:blocked', 'someone');
        await assert.rejects(
            () => mgr.acquireLock('blocked', { retryTimes: 0, retryDelay: 1 }),
            (e: unknown) => e instanceof Error && e.constructor.name === 'LockAcquireError',
        );
        assert.equal(mgr.getStats().errors, 1);
    });

    // ── releaseLock ───────────────────────────────────────────────────────────

    it('releaseLock via Lock.release() removes the key', async () => {
        const redis = createMockRedis();
        const mgr = new MonSQLize.DistributedCacheLockManager({ redis });
        const lock = await mgr.tryAcquireLock('rel-1', { ttl: 5000 });
        assert.ok(lock);
        const released = await lock.release();
        assert.equal(released, true);
        assert.equal(mgr.getStats().locksReleased, 1);
    });

    it('releaseLock returns false when eval returns 0 (mismatch lockId)', async () => {
        const redis = createMockRedis({ evalResult: 0 });
        const mgr = new MonSQLize.DistributedCacheLockManager({ redis });
        const result = await mgr.releaseLock('ghost', 'wrong-id');
        assert.equal(result, false);
    });

    it('releaseLock returns false on Redis error', async () => {
        const redis = createMockRedis({ errorOnEval: true });
        const mgr = new MonSQLize.DistributedCacheLockManager({ redis });
        const result = await mgr.releaseLock('err', 'id');
        assert.equal(result, false);
    });

    // ── renewLock ─────────────────────────────────────────────────────────────

    it('renewLock returns true when eval returns 1', async () => {
        const redis = createMockRedis({ evalResult: 1 });
        const mgr = new MonSQLize.DistributedCacheLockManager({ redis });
        const result = await mgr.renewLock('r', 'id', 5000);
        assert.equal(result, true);
    });

    it('renewLock returns false on Redis error', async () => {
        const redis = createMockRedis({ errorOnEval: true });
        const mgr = new MonSQLize.DistributedCacheLockManager({ redis });
        const result = await mgr.renewLock('r', 'id', 5000);
        assert.equal(result, false);
    });

    // ── isLocked ──────────────────────────────────────────────────────────────

    it('isLocked returns true when key exists', async () => {
        const redis = createMockRedis({ existsResult: 1 });
        const mgr = new MonSQLize.DistributedCacheLockManager({ redis });
        const locked = await mgr.isLocked('some-key');
        assert.equal(locked, true);
    });

    it('isLocked returns false when key does not exist', async () => {
        const redis = createMockRedis({ existsResult: 0, keysResult: [] });
        const mgr = new MonSQLize.DistributedCacheLockManager({ redis });
        const locked = await mgr.isLocked('absent');
        assert.equal(locked, false);
    });

    it('isLocked matches wildcard pattern via KEYS fallback when SCAN is unavailable', async () => {
        const redis = createMockRedis({ existsResult: 0, keysResult: ['monsqlize:cache:lock:order:*'] });
        const mgr = new MonSQLize.DistributedCacheLockManager({ redis });
        const locked = await mgr.isLocked('order:123');
        assert.equal(locked, true);
    });

    it('isLocked uses SCAN instead of KEYS when scan is available', async () => {
        let keysCalled = 0;
        let scanCalled = 0;
        const redis = {
            ...createMockRedis({ existsResult: 0 }),
            async keys(_pattern: string) {
                keysCalled += 1;
                return [];
            },
            async scan(_cursor: string, ..._args: unknown[]) {
                scanCalled += 1;
                return ['0', ['monsqlize:cache:lock:order:*']];
            },
        };
        const mgr = new MonSQLize.DistributedCacheLockManager({ redis });
        const locked = await mgr.isLocked('order:123');
        assert.equal(locked, true);
        assert.equal(scanCalled, 1);
        assert.equal(keysCalled, 0);
    });

    it('isLocked returns false on Redis error', async () => {
        const redis = createMockRedis({ errorOnExists: true });
        const mgr = new MonSQLize.DistributedCacheLockManager({ redis });
        const locked = await mgr.isLocked('err-key');
        assert.equal(locked, false);
    });

    // ── releaseLocks ──────────────────────────────────────────────────────────

    it('releaseLocks returns 0 for empty session', async () => {
        const redis = createMockRedis({ keysResult: [] });
        const mgr = new MonSQLize.DistributedCacheLockManager({ redis });
        const count = await mgr.releaseLocks({ id: null });
        assert.equal(count, 0);
    });

    it('releaseLocks returns 0 when no keys found', async () => {
        const redis = createMockRedis({ keysResult: [] });
        const mgr = new MonSQLize.DistributedCacheLockManager({ redis });
        const count = await mgr.releaseLocks({ id: 'session-1' });
        assert.equal(count, 0);
    });

    it('releaseLocks uses eval to delete matching session keys', async () => {
        const redis = createMockRedis({ evalResult: 2, keysResult: ['k1', 'k2'] });
        const mgr = new MonSQLize.DistributedCacheLockManager({ redis });
        const count = await mgr.releaseLocks({ id: 'sess' });
        assert.equal(count, 2);
        assert.equal(mgr.getStats().locksReleased, 2);
    });

    it('releaseLocks uses SCAN instead of KEYS when scan is available', async () => {
        let keysCalled = 0;
        let scanCalled = 0;
        const redis = {
            ...createMockRedis({ evalResult: 2 }),
            async keys(_pattern: string) {
                keysCalled += 1;
                return [];
            },
            async scan(_cursor: string, ..._args: unknown[]) {
                scanCalled += 1;
                return ['0', ['monsqlize:cache:lock:k1', 'monsqlize:cache:lock:k2']];
            },
        };
        const mgr = new MonSQLize.DistributedCacheLockManager({ redis });
        const count = await mgr.releaseLocks({ id: 'sess' });
        assert.equal(count, 2);
        assert.equal(scanCalled, 1);
        assert.equal(keysCalled, 0);
    });

    // ── withLock ──────────────────────────────────────────────────────────────

    it('withLock executes callback and releases lock', async () => {
        const redis = createMockRedis();
        const mgr = new MonSQLize.DistributedCacheLockManager({ redis });
        const result = await mgr.withLock('wl-key', () => Promise.resolve('done'));
        assert.equal(result, 'done');
    });

    it('withLock falls back to no-lock on connection error when fallbackToNoLock=true', async () => {
        const redis = createMockRedis({ errorOnSet: true });
        const mgr = new MonSQLize.DistributedCacheLockManager({ redis });
        const result = await mgr.withLock(
            'wl-err',
            () => Promise.resolve('fallback-result'),
            { fallbackToNoLock: true },
        );
        assert.equal(result, 'fallback-result');
    });

    // ── addLock ───────────────────────────────────────────────────────────────

    it('addLock returns true on successful set', async () => {
        const redis = createMockRedis();
        const mgr = new MonSQLize.DistributedCacheLockManager({ redis });
        const ok = await mgr.addLock('tx-1', { id: 'session-abc' });
        assert.equal(ok, true);
        assert.equal(mgr.getStats().locksAcquired, 1);
    });

    it('addLock returns false when session id is missing', async () => {
        const redis = createMockRedis();
        const mgr = new MonSQLize.DistributedCacheLockManager({ redis });
        const ok = await mgr.addLock('tx-2', { id: null });
        assert.equal(ok, false);
    });

    it('addLock returns false on Redis error', async () => {
        const redis = createMockRedis({ errorOnSet: true });
        const mgr = new MonSQLize.DistributedCacheLockManager({ redis });
        const ok = await mgr.addLock('tx-3', { id: 'sess' });
        assert.equal(ok, false);
    });

    // ── stop / cleanup ────────────────────────────────────────────────────────

    it('stop() and cleanup() complete without error', async () => {
        const redis = createMockRedis();
        const mgr = new MonSQLize.DistributedCacheLockManager({ redis });
        mgr.stop();
        await mgr.cleanup();
    });
});
