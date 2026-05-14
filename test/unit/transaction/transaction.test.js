const { afterEach, describe, it } = require('node:test');
const assert = require('node:assert/strict');

const MonSQLize = require('../../../lib/index.js');

function createFakeSession() {
    let inTransaction = false;
    return {
        id: { toString: () => 'session-1' },
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
    return {
        startSession() {
            return createFakeSession();
        },
    };
}

describe('P4-A transaction', () => {
    afterEach(() => {
        const cacheLockManager = new MonSQLize.CacheLockManager();
        cacheLockManager.clear();
        cacheLockManager.stop();
    });

    it('应支持 Transaction 生命周期与缓存失效记录', async () => {
        const cache = new MonSQLize.MemoryCache({ enableStats: true });
        cache.set('users:1', { id: 1 }, 60000);
        const cacheLockManager = new MonSQLize.CacheLockManager();
        const transaction = new MonSQLize.Transaction(createFakeSession(), {
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
            client: createFakeClient(),
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
        const result = await manager.withTransaction((tx) => {
            attempts += 1;
            if (attempts === 1) {
                const error = new Error('transient');
                error.code = 112;
                return Promise.reject(error);
            }
            return Promise.resolve(tx.id);
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

