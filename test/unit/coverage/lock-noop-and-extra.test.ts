import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

const MonSQLize = require('../../../dist/cjs/index.cjs');
const { LockManager } = MonSQLize;

// Covers:
//   - lock/index.ts NoopLockManager.renewLock() (lines 57-59)
//   - lock/index.ts acquireLock fallbackToNoLock path (line 185)
//   - lock/index.ts Lock.renew() when released=false (line 103-106)
//   - lock/index.ts Lock.renew() when released=true (line 103-104)
//   - lock/index.ts LockManager.renewLock false branch (line 251: no current)
//   - lock/index.ts LockManager.acquireLock retry budget exhausted without fallback → LockTimeoutError
//   - lock/index.ts normalizeKey already-prefixed branch (line 293)

describe('lock — NoopLockManager.renewLock() via fallbackToNoLock', () => {
    it('acquire key twice with fallbackToNoLock → second lock is noop → lock.renew() returns true', async () => {
        const lm = new LockManager({ lockKeyPrefix: 'test:noop:' });
        // Acquire the key first
        const firstLock = await lm.acquireLock('noopkey', { retryTimes: 0, ttl: 5000 });
        assert.ok(firstLock !== null);

        // Try to acquire the same key with fallbackToNoLock → gets a NoopLock
        const noopLock = await lm.acquireLock('noopkey', { retryTimes: 0, fallbackToNoLock: true, ttl: 5000 });
        assert.ok(noopLock !== null);

        // renew() on a NoopLock calls NoopLockManager.renewLock() → returns true
        const renewed = await noopLock.renew(5000);
        assert.equal(renewed, true);

        // release() on a NoopLock calls NoopLockManager.releaseLock() → returns true
        const released = await noopLock.release();
        assert.equal(released, true);

        // Clean up
        await firstLock.release();
        lm.close();
    });
});

describe('lock — Lock.renew() when already released', () => {
    it('lock.renew() after release → returns false', async () => {
        const lm = new LockManager({ lockKeyPrefix: 'test:renew:' });
        const lock = await lm.acquireLock('renewkey', { retryTimes: 0, ttl: 5000 });
        await lock.release();
        // Now lock.released = true → renew() returns false immediately
        const result = await lock.renew(5000);
        assert.equal(result, false);
        lm.close();
    });

    it('lock.renew() before release → renews successfully', async () => {
        const lm = new LockManager({ lockKeyPrefix: 'test:renew2:' });
        const lock = await lm.acquireLock('renewkey2', { retryTimes: 0, ttl: 5000 });
        const result = await lock.renew(5000);
        assert.equal(result, true);
        await lock.release();
        lm.close();
    });
});

describe('lock — LockManager.renewLock false branch (no current record)', () => {
    it('renewLock with wrong lockId → returns false', async () => {
        const lm = new LockManager({ lockKeyPrefix: 'test:rn:' });
        const lock = await lm.acquireLock('rnkey', { retryTimes: 0, ttl: 5000 });
        // Renew with wrong lockId → current.lockId !== lockId → returns false
        const result = await lm.renewLock(lock.key, 'wrong-lock-id-xyz', 5000);
        assert.equal(result, false);
        await lock.release();
        lm.close();
    });

    it('renewLock with non-existent key → returns false', async () => {
        const lm = new LockManager({ lockKeyPrefix: 'test:rn2:' });
        // Key doesn't exist → !current → returns false
        const result = await lm.renewLock('test:rn2:nonexistent', 'any-id', 5000);
        assert.equal(result, false);
        lm.close();
    });
});

describe('lock — acquireLock retry budget exhausted → LockTimeoutError', () => {
    it('acquire same key twice without fallback → LockTimeoutError', async () => {
        const lm = new LockManager({ lockKeyPrefix: 'test:timeout:' });
        const first = await lm.acquireLock('timeoutkey', { retryTimes: 0, ttl: 5000 });
        try {
            await assert.rejects(
                () => lm.acquireLock('timeoutkey', { retryTimes: 0, ttl: 5000 }),
                /Failed to acquire lock/,
            );
        } finally {
            await first.release();
            lm.close();
        }
    });
});

describe('lock — normalizeKey already-prefixed branch', () => {
    it('key already has prefix → normalizeKey returns as-is', async () => {
        const prefix = 'test:norm:';
        const lm = new LockManager({ lockKeyPrefix: prefix });
        // releaseLock with already-prefixed key should work
        const lock = await lm.acquireLock('mykey', { retryTimes: 0, ttl: 5000 });
        // The lock.key is already normalized (prefixed)
        assert.ok(lock.key.startsWith(prefix));
        // isLocked with already-prefixed key
        const isLocked = lm.isLocked(lock.key);
        assert.equal(isLocked, true);
        await lock.release();
        lm.close();
    });
});

describe('lock — LockManager.getStats and isLocked', () => {
    it('getStats returns correct counts after operations', async () => {
        const lm = new LockManager({ lockKeyPrefix: 'test:stats:' });
        const lock = await lm.acquireLock('statskey', { retryTimes: 0, ttl: 5000 });
        const stats = lm.getStats();
        assert.ok(stats.locksAcquired >= 1);
        assert.ok(stats.lockChecks >= 0);
        await lock.release();
        const stats2 = lm.getStats();
        assert.ok(stats2.locksReleased >= 1);
        lm.close();
    });

    it('isLocked returns false after release', async () => {
        const lm = new LockManager({ lockKeyPrefix: 'test:is:' });
        const lock = await lm.acquireLock('iskey', { retryTimes: 0, ttl: 5000 });
        assert.equal(lm.isLocked('iskey'), true);
        await lock.release();
        assert.equal(lm.isLocked('iskey'), false);
        lm.close();
    });
});
