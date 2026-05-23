import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';

import MonSQLize from 'monsqlize';

describe('Stage B lock TS migration', () => {
    afterEach(() => {
        const manager = new MonSQLize.LockManager({ lockKeyPrefix: 'stage-b-lock:' });
        manager.clear();
        manager.close();
    });

    it('应支持 tryAcquireLock / acquireLock / release / renew / stats 主链', async () => {
        const manager = new MonSQLize.LockManager({ lockKeyPrefix: 'stage-b-lock:' });

        const first = await manager.tryAcquireLock('inventory:sku-1', { ttl: 200 });
        assert.ok(first instanceof MonSQLize.Lock);
        assert.equal(manager.isLocked('inventory:sku-1'), true);

        const second = await manager.tryAcquireLock('inventory:sku-1');
        assert.equal(second, null);

        assert.equal(await first.renew(300), true);
        assert.equal(first.isHeld(), true);
        assert.equal(first.getHoldTime() >= 0, true);

        const stats = manager.getStats();
        assert.equal(stats.locksAcquired >= 1, true);
        assert.equal(stats.activeLocks, 1);

        assert.equal(await first.release(), true);
        assert.equal(await first.release(), false);
        assert.equal(manager.isLocked('inventory:sku-1'), false);
        assert.equal(manager.getStats().locksReleased >= 1, true);

        manager.close();
    });

    it('应支持 withLock 与 fallbackToNoLock 错误/兜底语义', async () => {
        const manager = new MonSQLize.LockManager({ lockKeyPrefix: 'stage-b-lock:' });
        const steps: string[] = [];

        const held = await manager.tryAcquireLock('cron:daily-report');
        assert.ok(held);

        await assert.rejects(
            () => manager.acquireLock('cron:daily-report', { retryTimes: 0, retryDelay: 1 }),
            (error: unknown) => error instanceof MonSQLize.LockTimeoutError,
        );

        const value = await manager.withLock('cron:sync', async () => {
            steps.push('inside');
            return 42;
        });
        assert.equal(value, 42);
        assert.deepEqual(steps, ['inside']);

        const fallback = await manager.acquireLock('cron:daily-report', {
            retryTimes: 0,
            fallbackToNoLock: true,
        });
        assert.ok(fallback instanceof MonSQLize.Lock);
        assert.equal(fallback.key.includes('cron:daily-report'), true);
        assert.equal(await fallback.release(), true);

        await held.release();
        manager.close();
    });
});