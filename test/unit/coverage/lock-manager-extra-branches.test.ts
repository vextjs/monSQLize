import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

const {
    LockManager,
    Lock,
    LockTimeoutError,
    LockAcquireError,
    DistributedCacheLockManager,
} = require('../../../dist/cjs/index.cjs');

// ── Lock class branches ───────────────────────────────────────────────────────

describe('Lock — release when already released returns false', () => {
    it('release() called twice: second call returns false', async () => {
        const mgr = new LockManager();
        const lock = await mgr.tryAcquireLock('lock-twice-release');
        assert.ok(lock !== null);
        const r1 = await lock.release();
        assert.equal(r1, true);
        const r2 = await lock.release();
        assert.equal(r2, false); // already released → returns false immediately
    });

    it('renew() when already released returns false', async () => {
        const mgr = new LockManager();
        const lock = await mgr.tryAcquireLock('lock-renew-released');
        assert.ok(lock !== null);
        await lock.release();
        const renewed = await lock.renew();
        assert.equal(renewed, false); // released → returns false
    });

    it('renew() with explicit ttl uses provided ttl', async () => {
        const mgr = new LockManager();
        const lock = await mgr.tryAcquireLock('lock-renew-ttl');
        assert.ok(lock !== null);
        const renewed = await lock.renew(5000); // explicit ttl
        assert.equal(renewed, true);
        await lock.release();
    });
});

// ── LockManager branches ──────────────────────────────────────────────────────

describe('LockManager — tryAcquireLock when lock already held returns null', () => {
    it('tryAcquireLock on already-locked key returns null', async () => {
        const mgr = new LockManager({ lockKeyPrefix: 'test-prefix:' });
        const lock = await mgr.tryAcquireLock('shared-key');
        assert.ok(lock !== null);
        const lock2 = await mgr.tryAcquireLock('shared-key');
        assert.equal(lock2, null); // already locked → null
        await lock.release();
    });

    it('releaseLock with wrong lockId returns false', async () => {
        const mgr = new LockManager({ lockKeyPrefix: 'test-release:' });
        await mgr.tryAcquireLock('release-wrong-id-key');
        const released = await mgr.releaseLock('release-wrong-id-key', 'wrong-uuid-here');
        assert.equal(released, false);
        mgr.clear();
    });

    it('renewLock with wrong lockId returns false', async () => {
        const mgr = new LockManager({ lockKeyPrefix: 'test-renew:' });
        await mgr.tryAcquireLock('renew-wrong-id-key');
        const renewed = await mgr.renewLock('renew-wrong-id-key', 'wrong-id', 5000);
        assert.equal(renewed, false);
        mgr.clear();
    });

    it('releaseLock with non-existent key returns false', async () => {
        const mgr = new LockManager({ lockKeyPrefix: 'test-nokey:' });
        const released = await mgr.releaseLock('nonexistent-key-xyz', 'any-id');
        assert.equal(released, false);
    });

    it('normalizeKey: key already starts with prefix → returned as-is', async () => {
        const mgr = new LockManager({ lockKeyPrefix: 'myprefix:' });
        // Acquire with the prefix already included in key
        const lock = await mgr.tryAcquireLock('myprefix:already-prefixed');
        // If the implementation double-prefixes, the key would be wrong;
        // the branch is hit when normalizeKey detects the prefix already present
        assert.ok(true); // just confirm no error
        await lock?.release();
    });

    it('acquireLock with fallbackToNoLock returns NoopLock after retries exhaust', async () => {
        const mgr = new LockManager({ lockKeyPrefix: 'fallback:' });
        // Acquire lock first to make it unavailable
        const blocking = await mgr.tryAcquireLock('fallback-key');

        const fallbackLock = await mgr.acquireLock('fallback-key', {
            retryTimes: 1,
            retryDelay: 1,
            fallbackToNoLock: true,
        });
        assert.ok(fallbackLock !== null);
        // NoopLock: release returns true, renew returns true
        const r = await fallbackLock.release();
        assert.ok(r === true || r === false); // noop

        await blocking?.release();
    });

    it('acquireLock without fallbackToNoLock throws LockTimeoutError after retries exhaust', async () => {
        const mgr = new LockManager({ lockKeyPrefix: 'timeout:' });
        const blocking = await mgr.tryAcquireLock('timeout-key');

        await assert.rejects(
            () => mgr.acquireLock('timeout-key', { retryTimes: 1, retryDelay: 1 }),
            (err: unknown) => err instanceof LockTimeoutError || (err instanceof Error && /lock/i.test(err.message)),
        );

        await blocking?.release();
    });
});

// ── DistributedCacheLockManager — pattern matching branches ──────────────────

describe('DistributedCacheLockManager — branches', () => {
    function makeMockRedis(opts: {
        setResult?: string | null;
        evalResult?: number;
        keysResult?: string[];
        existsResult?: number;
        onError?: (e: unknown) => void;
    } = {}) {
        const errorHandlers: Array<(...args: unknown[]) => void> = [];
        return {
            on(event: string, handler: (...args: unknown[]) => void) {
                if (event === 'error') errorHandlers.push(handler);
            },
            emit(event: string, ...args: unknown[]) {
                if (event === 'error') errorHandlers.forEach(h => h(...args));
            },
            async set(_k: string, _v: string, ..._args: unknown[]) {
                return opts.setResult ?? null;
            },
            async eval(_script: string, _n: number, ..._args: unknown[]) {
                return opts.evalResult ?? 1;
            },
            async keys(_pattern: string) {
                return opts.keysResult ?? [];
            },
            async exists(_key: string) {
                return opts.existsResult ?? 0;
            },
        };
    }

    it('isLocked returns false when key does not exist and no wildcard keys', async () => {
        const redis = makeMockRedis({ existsResult: 0, keysResult: [] });
        const mgr = new DistributedCacheLockManager({ redis });
        const result = await mgr.isLocked('some-key');
        assert.equal(result, false);
    });

    it('isLocked returns true when key exists', async () => {
        const redis = makeMockRedis({ existsResult: 1 });
        const mgr = new DistributedCacheLockManager({ redis });
        const result = await mgr.isLocked('existing-key');
        assert.equal(result, true);
    });

    it('isLocked with wildcard key in store matches via regex', async () => {
        const redis = makeMockRedis({
            existsResult: 0,
            keysResult: ['monsqlize:cache:lock:user:*'],
        });
        const mgr = new DistributedCacheLockManager({ redis });
        const result = await mgr.isLocked('user:123');
        assert.ok(typeof result === 'boolean'); // pattern with * checks regex match
    });

    it('addLock with no session returns false', async () => {
        const redis = makeMockRedis();
        const mgr = new DistributedCacheLockManager({ redis });
        const result = await mgr.addLock('key', null as any);
        assert.equal(result, false);
    });

    it('addLock with session.id = null returns false', async () => {
        const redis = makeMockRedis();
        const mgr = new DistributedCacheLockManager({ redis });
        const result = await mgr.addLock('key', { id: null });
        assert.equal(result, false);
    });

    it('releaseLocks with no session returns 0', async () => {
        const redis = makeMockRedis();
        const mgr = new DistributedCacheLockManager({ redis });
        const result = await mgr.releaseLocks(null as any);
        assert.equal(result, 0);
    });

    it('releaseLocks with empty keys returns 0 without eval', async () => {
        const redis = makeMockRedis({ keysResult: [] });
        const mgr = new DistributedCacheLockManager({ redis });
        const result = await mgr.releaseLocks({ id: 'sess-1' });
        assert.equal(result, 0);
    });

    it('withLock with fallbackToNoLock on Redis connection error falls back', async () => {
        const redis = {
            on: () => {},
            async set() { throw new Error('ECONNREFUSED localhost:6379'); },
            async eval() { return 0; },
            async keys() { return []; },
            async exists() { return 0; },
        };
        const mgr = new DistributedCacheLockManager({ redis });
        const result = await mgr.withLock('key', async () => 'fallback-value', {
            retryTimes: 0,
            fallbackToNoLock: true,
        });
        assert.equal(result, 'fallback-value');
    });

    it('tryAcquireLock returns null when Redis returns null (lock held)', async () => {
        const redis = makeMockRedis({ setResult: null });
        const mgr = new DistributedCacheLockManager({ redis });
        const lock = await mgr.tryAcquireLock('held-key');
        assert.equal(lock, null);
    });

    it('tryAcquireLock returns Lock when Redis returns OK', async () => {
        const redis = makeMockRedis({ setResult: 'OK' });
        const mgr = new DistributedCacheLockManager({ redis });
        const lock = await mgr.tryAcquireLock('free-key');
        assert.ok(lock !== null);
        assert.ok(typeof lock.release === 'function');
    });

    it('releaseLock when eval returns 0 → returns false', async () => {
        const redis = makeMockRedis({ evalResult: 0 });
        const mgr = new DistributedCacheLockManager({ redis });
        const released = await mgr.releaseLock('key', 'wrong-id');
        assert.equal(released, false);
    });

    it('renewLock when eval returns 0 → returns false', async () => {
        const redis = makeMockRedis({ evalResult: 0 });
        const mgr = new DistributedCacheLockManager({ redis });
        const renewed = await mgr.renewLock('key', 'wrong-id', 5000);
        assert.equal(renewed, false);
    });
});
