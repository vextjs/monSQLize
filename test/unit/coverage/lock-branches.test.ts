import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

const { LockManager } = require('../../../dist/cjs/index.cjs');

function buildMgr(opts = {}) {
    return new LockManager({ lockKeyPrefix: 'test:lock:', ...opts });
}

describe('LockManager — branch coverage', () => {
    it('tryAcquireLock returns null when key is already locked', async () => {
        const mgr = buildMgr();
        const lock1 = await mgr.tryAcquireLock('key1');
        assert.ok(lock1 !== null);
        const lock2 = await mgr.tryAcquireLock('key1');
        assert.equal(lock2, null);
        await lock1.release();
    });

    it('releaseLock with wrong lockId returns false', async () => {
        const mgr = buildMgr();
        const lock = await mgr.tryAcquireLock('key2');
        assert.ok(lock !== null);
        const released = await mgr.releaseLock(lock.key, 'wrong-lock-id');
        assert.equal(released, false);
        await lock.release(); // cleanup
    });

    it('renewLock with wrong lockId returns false', async () => {
        const mgr = buildMgr();
        const lock = await mgr.tryAcquireLock('key3');
        assert.ok(lock !== null);
        const renewed = await mgr.renewLock(lock.key, 'wrong-lock-id', 10000);
        assert.equal(renewed, false);
        await lock.release();
    });

    it('renewLock with correct lockId returns true', async () => {
        const mgr = buildMgr();
        const lock = await mgr.tryAcquireLock('key4');
        assert.ok(lock !== null);
        const renewed = await mgr.renewLock(lock.key, lock.lockId, 10000);
        assert.equal(renewed, true);
        await lock.release();
    });

    it('Lock.release() twice returns false on second call', async () => {
        const mgr = buildMgr();
        const lock = await mgr.tryAcquireLock('key5');
        assert.ok(lock !== null);
        const r1 = await lock.release();
        assert.equal(r1, true);
        const r2 = await lock.release(); // already released
        assert.equal(r2, false);
    });

    it('Lock.renew() after release returns false', async () => {
        const mgr = buildMgr();
        const lock = await mgr.tryAcquireLock('key6');
        assert.ok(lock !== null);
        await lock.release();
        const renewed = await lock.renew(10000);
        assert.equal(renewed, false);
    });

    it('Lock.renew() with no ttl arg uses lock default ttl', async () => {
        const mgr = buildMgr();
        const lock = await mgr.tryAcquireLock('key7', { ttl: 5000 });
        assert.ok(lock !== null);
        const renewed = await lock.renew(); // no ttl
        assert.equal(renewed, true);
        await lock.release();
    });

    it('isLocked returns true for held key', async () => {
        const mgr = buildMgr();
        const lock = await mgr.tryAcquireLock('key8');
        assert.equal(mgr.isLocked('key8'), true);
        await lock.release();
        assert.equal(mgr.isLocked('key8'), false);
    });

    it('Lock.isHeld() returns true until release', async () => {
        const mgr = buildMgr();
        const lock = await mgr.tryAcquireLock('key9');
        assert.ok(lock !== null);
        assert.equal(lock.isHeld(), true);
        await lock.release();
        assert.equal(lock.isHeld(), false);
    });

    it('Lock.getHoldTime() returns non-negative number', async () => {
        const mgr = buildMgr();
        const lock = await mgr.tryAcquireLock('key10');
        assert.ok(lock !== null);
        const t = lock.getHoldTime();
        assert.ok(t >= 0);
        await lock.release();
    });

    it('acquireLock with fallbackToNoLock returns noop lock after exhausting retries', async () => {
        const mgr = buildMgr();
        const lock1 = await mgr.tryAcquireLock('key11');
        assert.ok(lock1 !== null);
        // acquireLock should fallback because key11 is held
        const noop = await mgr.acquireLock('key11', {
            retryTimes: 0,
            fallbackToNoLock: true,
        });
        assert.ok(noop !== null);
        assert.ok(noop.isHeld()); // noop lock reports isHeld true
        await lock1.release();
    });

    it('acquireLock throws LockTimeoutError when no fallback and retries exhausted', async () => {
        const mgr = buildMgr();
        const lock1 = await mgr.tryAcquireLock('key12');
        assert.ok(lock1 !== null);
        await assert.rejects(
            () => mgr.acquireLock('key12', { retryTimes: 0 }),
            /failed to acquire lock/i,
        );
        await lock1.release();
    });

    it('withLock runs callback and releases lock', async () => {
        const mgr = buildMgr();
        let ran = false;
        await mgr.withLock('key13', async () => {
            ran = true;
        });
        assert.equal(ran, true);
        assert.equal(mgr.isLocked('key13'), false);
    });

    it('getStats returns stats with activeLocks count', async () => {
        const mgr = buildMgr();
        const lock = await mgr.tryAcquireLock('key14');
        const stats = mgr.getStats();
        assert.ok(typeof stats === 'object');
        assert.ok(stats.activeLocks >= 1);
        assert.ok(stats.locksAcquired >= 1);
        await lock.release();
    });

    it('clear() removes all locks with the prefix', async () => {
        const mgr = buildMgr();
        await mgr.tryAcquireLock('key15');
        await mgr.tryAcquireLock('key16');
        mgr.clear();
        assert.equal(mgr.isLocked('key15'), false);
        assert.equal(mgr.isLocked('key16'), false);
    });

    it('close() does not throw', () => {
        const mgr = buildMgr();
        assert.doesNotThrow(() => mgr.close());
    });

    it('acquireLock with normalized key (already prefixed)', async () => {
        const mgr = buildMgr();
        const lock = await mgr.acquireLock('test:lock:key17', { retryTimes: 0 });
        assert.ok(lock !== null);
        await lock.release();
    });
});
