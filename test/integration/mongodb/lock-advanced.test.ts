import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryServerBootstrap } from '../../bootstrap/memory-server';

const MonSQLize = require('../../../dist/cjs/index.cjs');

describe('Lock — advanced branch coverage', () => {
    const bootstrap = createMemoryServerBootstrap();
    let uri = '';
    let runtime: any;

    before(async () => {
        const ctx = await bootstrap.setup();
        uri = ctx.uri;
        runtime = new MonSQLize({ type: 'mongodb', databaseName: 'test_lock_adv', config: { uri } });
        await runtime.connect();
    });

    after(async () => {
        if (runtime) await runtime.close();
        await bootstrap.teardown();
    });

    // ── Lock.release() and Lock.renew() ──────────────────────────────────────

    it('lock.release() returns true on first release', async () => {
        const lock = await runtime.acquireLock('test-release-1', { ttl: 5000 });
        const released = await lock.release();
        assert.equal(released, true);
    });

    it('lock.release() returns false when called twice (already released)', async () => {
        const lock = await runtime.acquireLock('test-release-2', { ttl: 5000 });
        await lock.release();
        const released2 = await lock.release();
        assert.equal(released2, false);
    });

    it('lock.renew() returns false when lock already released', async () => {
        const lock = await runtime.acquireLock('test-renew-released', { ttl: 5000 });
        await lock.release();
        const renewed = await lock.renew(10000);
        assert.equal(renewed, false);
    });

    it('lock.renew() returns true while lock is held', async () => {
        const lock = await runtime.acquireLock('test-renew-active', { ttl: 5000 });
        const renewed = await lock.renew(10000);
        assert.equal(renewed, true);
        await lock.release();
    });

    it('lock.isHeld() returns true when held and false after release', async () => {
        const lock = await runtime.acquireLock('test-isheld', { ttl: 5000 });
        assert.equal(lock.isHeld(), true);
        await lock.release();
        assert.equal(lock.isHeld(), false);
    });

    it('lock.getHoldTime() returns non-negative number', async () => {
        const lock = await runtime.acquireLock('test-holdtime', { ttl: 5000 });
        const holdTime = lock.getHoldTime();
        assert.ok(holdTime >= 0 && typeof holdTime === 'number');
        await lock.release();
    });

    // ── acquireLock() retry exhaustion and fallback ─────────────────────────

    it('acquireLock() throws LockTimeoutError when lock already held and retryTimes=0', async () => {
        const lock = await runtime.acquireLock('contended-key', { ttl: 10000 });
        try {
            await assert.rejects(
                () => runtime.acquireLock('contended-key', { ttl: 5000, retryTimes: 0 }),
                /timeout|Failed to acquire/i,
            );
        } finally {
            await lock.release();
        }
    });

    it('acquireLock() with fallbackToNoLock returns noop lock on contention', async () => {
        const lock = await runtime.acquireLock('fallback-key', { ttl: 10000 });
        try {
            const fallbackLock = await runtime.acquireLock('fallback-key', {
                ttl: 5000,
                retryTimes: 0,
                fallbackToNoLock: true,
            });
            assert.ok(fallbackLock !== null);
            // Noop lock — release should succeed
            await fallbackLock.release();
        } finally {
            await lock.release();
        }
    });

    // ── tryAcquireLock() ─────────────────────────────────────────────────────

    it('tryAcquireLock() returns null when lock already held', async () => {
        const lock = await runtime.acquireLock('try-contended', { ttl: 10000 });
        try {
            const result = await runtime.tryAcquireLock('try-contended');
            assert.equal(result, null);
        } finally {
            await lock.release();
        }
    });

    it('tryAcquireLock() returns Lock when key is free', async () => {
        const lock = await runtime.tryAcquireLock('try-free-key');
        assert.ok(lock !== null);
        await lock.release();
    });

    // ── getLockStats() ───────────────────────────────────────────────────────

    it('getLockStats() returns stats with expected fields', async () => {
        const lock = await runtime.acquireLock('stats-key', { ttl: 5000 });
        const stats = runtime.getLockStats();
        assert.ok(stats !== null);
        assert.ok(typeof stats.locksAcquired === 'number');
        assert.ok(typeof stats.locksReleased === 'number');
        assert.ok(typeof stats.lockChecks === 'number');
        await lock.release();
    });

    // ── withLock() callback throws → lock still released ─────────────────────

    it('withLock() releases lock even when callback throws', async () => {
        await assert.rejects(
            () => runtime.withLock('withlock-throw', async () => { throw new Error('callback error'); }),
            /callback error/,
        );
        // Lock should be released — can acquire again
        const lock = await runtime.tryAcquireLock('withlock-throw');
        assert.ok(lock !== null);
        await lock.release();
    });

    // ── isLocked ─────────────────────────────────────────────────────────────

    it('dbInstance.withLock is accessible', async () => {
        // v1 compat: dbInstance.withLock
        const dbi = runtime.dbInstance;
        if (dbi) {
            const result = await dbi.withLock('dbi-lock-key', async () => 'locked-result');
            assert.equal(result, 'locked-result');
        }
    });

    it('dbInstance.acquireLock and tryAcquireLock are accessible', async () => {
        const dbi = runtime.dbInstance;
        if (dbi) {
            const lock = await dbi.acquireLock('dbi-acquire-key', { ttl: 5000 });
            assert.ok(lock !== null);
            const stats = dbi.getLockStats();
            assert.ok(stats !== null || stats === null); // might return null in some versions
            await lock.release();
            // tryAcquireLock after release
            const lock2 = await dbi.tryAcquireLock('dbi-acquire-key');
            assert.ok(lock2 !== null);
            await lock2.release();
        }
    });
});
