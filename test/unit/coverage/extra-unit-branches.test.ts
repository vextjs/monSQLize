import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

const MonSQLize = require('../../../dist/cjs/index.cjs');

// ── FunctionCache.register() per-function option validation ───────────────────
// These branches are in validateFunctionCachePerFnOptions (not validateWithCacheOptions).

describe('FunctionCache.register() — per-function option validation branches', () => {
    function buildCache() {
        return new MonSQLize.FunctionCache(new MonSQLize.MemoryCache(), { namespace: 'test' });
    }

    it('throws when per-fn options is an array', () => {
        const fc = buildCache();
        assert.throws(
            () => fc.register('fn', async () => 1, [] as unknown as Record<string, unknown>),
            /options must be an object/i,
        );
    });

    it('throws when per-fn keyBuilder is not a function', () => {
        const fc = buildCache();
        assert.throws(
            () => fc.register('fn', async () => 1, { keyBuilder: 'bad' }),
            /keyBuilder must be a function/i,
        );
    });

    it('throws when per-fn condition is not a function', () => {
        const fc = buildCache();
        assert.throws(
            () => fc.register('fn', async () => 1, { condition: 'bad' }),
            /condition must be a function/i,
        );
    });

    it('throws when per-fn ttl is NaN', () => {
        const fc = buildCache();
        assert.throws(
            () => fc.register('fn', async () => 1, { ttl: NaN }),
            /non-negative/i,
        );
    });

    it('throws when per-fn ttl is a string', () => {
        const fc = buildCache();
        assert.throws(
            () => fc.register('fn', async () => 1, { ttl: 'fast' as unknown as number }),
            /non-negative/i,
        );
    });

    it('throws when per-fn defaultTTL is negative', () => {
        const fc = buildCache();
        assert.throws(
            () => fc.register('fn', async () => 1, { defaultTTL: -1 }),
            /non-negative/i,
        );
    });

    it('throws when per-fn defaultTTL is NaN (uses defaultTTL as ttl fallback)', () => {
        const fc = buildCache();
        assert.throws(
            () => fc.register('fn', async () => 1, { defaultTTL: NaN }),
            /non-negative/i,
        );
    });

    it('accepts valid per-fn options with condition function', async () => {
        const fc = buildCache();
        fc.register('fn', async () => 1, { condition: (r: unknown) => r !== null });
        const result = await fc.execute('fn');
        assert.equal(result, 1);
    });

    it('accepts valid per-fn options with keyBuilder function', async () => {
        const fc = buildCache();
        fc.register('fn', async (x: number) => x * 2, { keyBuilder: (...args: unknown[]) => `key:${args[0]}` });
        const result = await fc.execute('fn', 5);
        assert.equal(result, 10);
    });
});

// ── LockManager.clear() and cleanupExpiredLocks branches ──────────────────────

describe('LockManager — clear() and expired lock cleanup branches', () => {
    it('clear() with acquired lock deletes the key (true branch)', async () => {
        const mgr = new MonSQLize.LockManager({ lockKeyPrefix: 'test-clear:' });
        const lock = await mgr.tryAcquireLock('mykey');
        assert.ok(lock);
        mgr.clear();
        assert.equal(mgr.isLocked('mykey'), false);
    });

    it('clear() with another manager prefix: false branch for non-matching keys', async () => {
        const mgrA = new MonSQLize.LockManager({ lockKeyPrefix: 'prefix-a:' });
        const mgrB = new MonSQLize.LockManager({ lockKeyPrefix: 'prefix-b:' });
        await mgrA.tryAcquireLock('shared-key');
        await mgrB.tryAcquireLock('shared-key');
        // clear() on mgrA only deletes mgrA keys; mgrB key is untouched (false branch)
        mgrA.clear();
        assert.ok(mgrB.isLocked('shared-key'));
        mgrB.clear();
    });

    it('cleanupExpiredLocks deletes expired lock (expiresAt <= now true branch)', async () => {
        const mgr = new MonSQLize.LockManager({ lockKeyPrefix: 'test-expire:', maxDuration: 1000 });
        const originalNow = Date.now;
        let now = originalNow();
        Date.now = () => now;
        try {
            await mgr.tryAcquireLock('expire-key', { ttl: 1000 });
            assert.ok(mgr.isLocked('expire-key'));
            now += 1001;
            mgr.close();
            assert.equal(mgr.isLocked('expire-key'), false);
        } finally {
            Date.now = originalNow;
            mgr.clear();
        }
    });

    it('renewLock false branch: wrong lockId returns false', async () => {
        const mgr = new MonSQLize.LockManager({ lockKeyPrefix: 'test-renew:' });
        await mgr.tryAcquireLock('renew-key');
        const result = await mgr.renewLock('renew-key', 'wrong-id', 5000);
        assert.equal(result, false);
        mgr.clear();
    });

    it('releaseLock false branch: wrong lockId returns false', async () => {
        const mgr = new MonSQLize.LockManager({ lockKeyPrefix: 'test-release:' });
        await mgr.tryAcquireLock('release-key');
        const result = await mgr.releaseLock('release-key', 'wrong-id');
        assert.equal(result, false);
        mgr.clear();
    });
});

// ── CacheLockManager (transaction module) branches ────────────────────────────

describe('CacheLockManager — addLock string owner and expired cleanup', () => {
    it('addLock with string owner covers string branch', () => {
        const mgr = new MonSQLize.CacheLockManager({ maxDuration: 300000 });
        mgr.addLock('pattern:*', 'owner-string');
        assert.ok(mgr.isLocked('pattern:match'));
        mgr.stop();
    });

    it('addLock with object owner covers object branch', () => {
        const mgr = new MonSQLize.CacheLockManager({ maxDuration: 300000 });
        mgr.addLock('key', { id: 'owner-obj' });
        assert.ok(mgr.isLocked('key'));
        mgr.stop();
    });

    it('addLock with object having null id uses "unknown" fallback', () => {
        const mgr = new MonSQLize.CacheLockManager({ maxDuration: 300000 });
        mgr.addLock('key', { id: null });
        assert.ok(mgr.isLocked('key'));
        mgr.stop();
    });

    it('isLocked with wildcard pattern covers regex branch', () => {
        const mgr = new MonSQLize.CacheLockManager({ maxDuration: 300000 });
        mgr.addLock('cache:user:*', 'owner');
        assert.ok(mgr.isLocked('cache:user:123'));
        assert.equal(mgr.isLocked('cache:other:123'), false);
        mgr.stop();
    });

    it('cleanupExpiredLocks deletes expired locks (true branch via getStats)', async () => {
        const mgr = new MonSQLize.CacheLockManager({ maxDuration: 1 });
        mgr.addLock('temp-key', 'owner');
        assert.ok(mgr.isLocked('temp-key'));
        // Wait for lock to expire (maxDuration=1ms)
        await new Promise((r) => setTimeout(r, 5));
        const stats = mgr.getStats();
        assert.equal(mgr.isLocked('temp-key'), false);
        assert.ok(stats.activeLocks === 0);
        mgr.stop();
    });

    it('releaseLocks removes all locks for a given owner', () => {
        const mgr = new MonSQLize.CacheLockManager({ maxDuration: 300000 });
        mgr.addLock('key1', 'tx-abc');
        mgr.addLock('key2', 'tx-abc');
        mgr.addLock('key3', 'tx-xyz');
        mgr.releaseLocks('tx-abc');
        assert.equal(mgr.isLocked('key1'), false);
        assert.equal(mgr.isLocked('key2'), false);
        assert.ok(mgr.isLocked('key3'));
        mgr.stop();
    });

    it('releaseLocks with object owner', () => {
        const mgr = new MonSQLize.CacheLockManager({ maxDuration: 300000 });
        mgr.addLock('key', { id: 'tx-xyz' });
        mgr.releaseLocks({ id: 'tx-xyz' });
        assert.equal(mgr.isLocked('key'), false);
        mgr.stop();
    });
});

// ── TransactionManager — mock-based isTransientTransactionError branches ──────

describe('TransactionManager — withTransaction mock and isTransientTransactionError', () => {
    function buildMockClient(sessionOptions?: { id?: unknown }) {
        const session = {
            id: sessionOptions?.id ?? { toHexString: () => 'abc123' },
            startTransaction: () => {},
            commitTransaction: async () => {},
            abortTransaction: async () => {},
            endSession: async () => {},
        };
        const client = { startSession: () => session };
        return client;
    }

    it('withTransaction commits on success (no retry needed)', async () => {
        const mgr = new MonSQLize.TransactionManager({ client: buildMockClient() as any });
        const result = await mgr.withTransaction(async () => 'success');
        assert.equal(result, 'success');
    });

    it('withTransaction: non-object error (null) → not transient → throws immediately', async () => {
        const mgr = new MonSQLize.TransactionManager({ client: buildMockClient() as any, maxRetries: 2 });
        await assert.rejects(
            () => mgr.withTransaction(async () => { throw null; }),
        );
    });

    it('withTransaction: non-object error (string) → not transient → throws immediately', async () => {
        const mgr = new MonSQLize.TransactionManager({ client: buildMockClient() as any, maxRetries: 2 });
        await assert.rejects(
            () => mgr.withTransaction(async () => { throw 'error-string'; }),
        );
    });

    it('withTransaction: error with hasErrorLabel(TransientTransactionError)=true → retries', async () => {
        const mgr = new MonSQLize.TransactionManager({ client: buildMockClient() as any, maxRetries: 1, retryDelay: 1 });
        const transientError = {
            hasErrorLabel: (label: string) => label === 'TransientTransactionError',
        };
        let attempts = 0;
        await assert.rejects(
            () => mgr.withTransaction(async () => {
                attempts++;
                throw transientError;
            }),
        );
        // Should have retried (attempts = maxRetries + 1 = 2)
        assert.ok(attempts >= 2);
    });

    it('withTransaction: error code 112 → transient → retries', async () => {
        const mgr = new MonSQLize.TransactionManager({ client: buildMockClient() as any, maxRetries: 1, retryDelay: 1 });
        let attempts = 0;
        await assert.rejects(
            () => mgr.withTransaction(async () => {
                attempts++;
                throw { code: 112 };
            }),
        );
        assert.ok(attempts >= 2);
    });

    it('withTransaction: error code 117 → transient → retries', async () => {
        const mgr = new MonSQLize.TransactionManager({ client: buildMockClient() as any, maxRetries: 1, retryDelay: 1 });
        let attempts = 0;
        await assert.rejects(
            () => mgr.withTransaction(async () => {
                attempts++;
                throw { code: 117 };
            }),
        );
        assert.ok(attempts >= 2);
    });

    it('withTransaction: non-transient error code → does not retry', async () => {
        const mgr = new MonSQLize.TransactionManager({ client: buildMockClient() as any, maxRetries: 5, retryDelay: 1 });
        let attempts = 0;
        await assert.rejects(
            () => mgr.withTransaction(async () => {
                attempts++;
                throw { code: 999 };
            }),
        );
        assert.equal(attempts, 1);
    });

    it('withTransaction: enableRetry=false → does not retry', async () => {
        const mgr = new MonSQLize.TransactionManager({ client: buildMockClient() as any, maxRetries: 5 });
        let attempts = 0;
        await assert.rejects(
            () => mgr.withTransaction(async () => {
                attempts++;
                throw { code: 112 };
            }, { enableRetry: false }),
        );
        assert.equal(attempts, 1);
    });

    it('Transaction.getInfo() with session id having toHexString branch', async () => {
        const mgr = new MonSQLize.TransactionManager({ client: buildMockClient({ id: { toHexString: () => 'hex123' } }) as any });
        const tx = await mgr.startSession();
        await tx.start();
        const info = tx.getInfo();
        assert.ok(info.sessionId);
        await tx.abort();
        await tx.end();
    });

    it('Transaction.getInfo() with session id having id.buffer branch', async () => {
        const buffer = Buffer.alloc(12);
        const mgr = new MonSQLize.TransactionManager({
            client: buildMockClient({ id: { id: { buffer } } }) as any,
        });
        const tx = await mgr.startSession();
        await tx.start();
        const info = tx.getInfo();
        assert.ok(info.sessionId);
        await tx.abort();
        await tx.end();
    });

    it('Transaction.getInfo() with session id having toString branch', async () => {
        const mgr = new MonSQLize.TransactionManager({
            client: buildMockClient({ id: { toString: () => 'custom-id' } }) as any,
        });
        const tx = await mgr.startSession();
        await tx.start();
        const info = tx.getInfo();
        assert.ok(info.sessionId);
        await tx.abort();
        await tx.end();
    });

    it('Transaction.getInfo() with string session id', async () => {
        const mgr = new MonSQLize.TransactionManager({
            client: buildMockClient({ id: 'string-session-id' }) as any,
        });
        const tx = await mgr.startSession();
        await tx.start();
        const info = tx.getInfo();
        assert.equal(info.sessionId, 'string-session-id');
        await tx.abort();
        await tx.end();
    });

    it('Transaction.getDuration() returns 0 before start', async () => {
        const mgr = new MonSQLize.TransactionManager({ client: buildMockClient() as any });
        const tx = await mgr.startSession();
        assert.equal(tx.getDuration(), 0);
        await tx.end();
    });

    it('TransactionManager.abortAll() aborts active transactions', async () => {
        const mgr = new MonSQLize.TransactionManager({ client: buildMockClient() as any });
        const tx = await mgr.startSession();
        await tx.start();
        assert.ok(mgr.activeTransactions.size >= 1);
        await mgr.abortAll();
        assert.equal(mgr.activeTransactions.size, 0);
    });

    it('TransactionManager.getStats() reflects transaction counts', async () => {
        const mgr = new MonSQLize.TransactionManager({ client: buildMockClient() as any });
        const result = await mgr.withTransaction(async () => 'done');
        const stats = mgr.getStats();
        assert.ok(stats.totalTransactions >= 1);
        assert.ok(stats.successfulTransactions >= 1);
        assert.equal(result, 'done');
    });
});

// ── normalizeSort / normalizeProjection missing branches ──────────────────────

describe('normalizeSort / normalizeProjection — missing branches', () => {
    it('normalizeProjection([]) returns undefined (empty array → no keys)', () => {
        const result = MonSQLize.normalizeProjection([]);
        assert.equal(result, undefined);
    });

    it('normalizeProjection with non-object truthy value returns undefined', () => {
        const result = MonSQLize.normalizeProjection('name age' as unknown as Record<string, unknown>);
        assert.equal(result, undefined);
    });

    it('normalizeProjection array with non-string items skips them', () => {
        const result = MonSQLize.normalizeProjection([42, null, 'name'] as unknown as string[]);
        assert.ok(result !== undefined && (result as Record<string, unknown>).name === 1);
    });

    it('normalizeSort with string returns undefined', () => {
        const result = MonSQLize.normalizeSort('name' as unknown as Record<string, 1 | -1>);
        assert.equal(result, undefined);
    });

    it('normalizeSort with number returns undefined', () => {
        const result = MonSQLize.normalizeSort(42 as unknown as Record<string, 1 | -1>);
        assert.equal(result, undefined);
    });
});

// ── decodeCursor — bad structure branches ─────────────────────────────────────

describe('decodeCursor — bad structure branches', () => {
    it('decodeCursor with v≠1 in payload throws INVALID_CURSOR', () => {
        // Encode with explicit v=2 to trigger the v!==1 branch
        const raw = Buffer.from(JSON.stringify({ v: 2, s: { x: 1 }, a: { x: 1 } })).toString('base64');
        assert.throws(
            () => MonSQLize.decodeCursor(raw.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')),
            (e: unknown) => e instanceof Error && (e as any).code === 'INVALID_CURSOR',
        );
    });

    it('decodeCursor with missing s field throws INVALID_CURSOR', () => {
        const raw = Buffer.from(JSON.stringify({ v: 1, a: { x: 1 } })).toString('base64');
        assert.throws(
            () => MonSQLize.decodeCursor(raw.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')),
            (e: unknown) => e instanceof Error && (e as any).code === 'INVALID_CURSOR',
        );
    });

    it('decodeCursor with missing a field throws INVALID_CURSOR', () => {
        const raw = Buffer.from(JSON.stringify({ v: 1, s: { x: 1 } })).toString('base64');
        assert.throws(
            () => MonSQLize.decodeCursor(raw.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')),
            (e: unknown) => e instanceof Error && (e as any).code === 'INVALID_CURSOR',
        );
    });

    it('decodeCursor with null JSON payload throws INVALID_CURSOR', () => {
        const raw = Buffer.from('null').toString('base64');
        assert.throws(
            () => MonSQLize.decodeCursor(raw.replace(/=+$/, '')),
            (e: unknown) => e instanceof Error && (e as any).code === 'INVALID_CURSOR',
        );
    });
});
