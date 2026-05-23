import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';

import MonSQLize from 'monsqlize';

function createFakeSession(sessionId: string) {
    let inTransaction = false;
    return {
        id: { toString: () => sessionId },
        inTransaction() {
            return inTransaction;
        },
        startTransaction() {
            inTransaction = true;
        },
        commitTransaction() {
            inTransaction = false;
            return Promise.resolve();
        },
        abortTransaction() {
            inTransaction = false;
            return Promise.resolve();
        },
        endSession() {
            inTransaction = false;
            return Promise.resolve();
        },
    };
}

function createFakeClient() {
    let index = 0;
    return {
        startSession() {
            index += 1;
            return createFakeSession(`session-${index}`);
        },
    };
}

describe('Stage B transaction TS migration', () => {
    afterEach(() => {
        const cacheLockManager = new MonSQLize.CacheLockManager();
        cacheLockManager.clear();
        cacheLockManager.stop();
    });

    it('应支持 Transaction 生命周期与缓存失效记录', async () => {
        const cache = new MonSQLize.MemoryCache({ enableStats: true });
        cache.set('users:1', { id: 1 }, 60000);

        const cacheLockManager = new MonSQLize.CacheLockManager();
        const transaction = new MonSQLize.Transaction(createFakeSession('session-tx-1'), {
            cache,
            lockManager: cacheLockManager,
        });

        await transaction.start();
        assert.equal(transaction.session.inTransaction(), true);

        await transaction.recordInvalidation('users:*');
        assert.equal(cacheLockManager.isLocked('users:1'), true);
        assert.equal(cache.get('users:1'), undefined);
        assert.equal(transaction.getInfo().status, 'active');

        await transaction.commit();
        assert.equal(transaction.getInfo().status, 'committed');
        assert.equal(cacheLockManager.isLocked('users:1'), false);

        await transaction.end();
        cacheLockManager.stop();
    });

    it('应支持 TransactionManager 的 startSession / withTransaction / retry / stats', async () => {
        const cacheLockManager = new MonSQLize.CacheLockManager();
        const manager = new MonSQLize.TransactionManager({
            client: createFakeClient() as any,
            lockManager: cacheLockManager,
            maxRetries: 1,
            retryDelay: 1,
        });

        const session = await manager.startSession();
        await session.start();
        assert.equal(session.getInfo().status, 'active');
        await session.abort();
        await session.end();

        let attempts = 0;
        const result = await manager.withTransaction(async (tx) => {
            attempts += 1;
            if (attempts === 1) {
                const error = new Error('transient') as Error & { code?: number; };
                error.code = 112;
                throw error;
            }
            return tx.id;
        });

        assert.equal(typeof result, 'string');
        assert.equal(attempts, 2);

        const stats = manager.getStats();
        assert.equal(stats.totalTransactions, 2);
        assert.equal(stats.successfulTransactions, 1);
        assert.equal(stats.failedTransactions, 1);
        assert.equal(stats.activeTransactions, 0);

        await manager.abortAll();
        cacheLockManager.stop();
    });
});