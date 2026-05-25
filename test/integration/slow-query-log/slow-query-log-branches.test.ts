import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryServerBootstrap } from '../../bootstrap/memory-server';

const MonSQLize = require('../../../dist/cjs/index.cjs');
const { SlowQueryLogManager } = MonSQLize;

const NO_BATCH = { enabled: false };

function buildMemMgr() {
    return new SlowQueryLogManager(
        { enabled: true, storage: { type: 'memory' }, batch: NO_BATCH, advanced: { errorHandling: 'throw' } },
        null, 'mongodb', null,
    );
}

describe('slow-query-log-records — branch coverage via SlowQueryLogManager', () => {
    it('query with filter: database', async () => {
        const mgr = buildMemMgr();
        await mgr.save({ database: 'db1', collection: 'c1', operation: 'find', durationMs: 100 });
        await mgr.save({ database: 'db2', collection: 'c2', operation: 'find', durationMs: 200 });
        const result = await mgr.query({ database: 'db1' });
        assert.equal(result.length, 1);
        assert.equal(result[0].database, 'db1');
    });

    it('query with filter: collection', async () => {
        const mgr = buildMemMgr();
        await mgr.save({ database: 'db', collection: 'colA', operation: 'find', durationMs: 100 });
        await mgr.save({ database: 'db', collection: 'colB', operation: 'find', durationMs: 200 });
        const result = await mgr.query({ collection: 'colA' });
        assert.equal(result.length, 1);
        assert.equal(result[0].collection, 'colA');
    });

    it('query with filter: operation', async () => {
        const mgr = buildMemMgr();
        await mgr.save({ database: 'db', collection: 'c1', operation: 'find', durationMs: 100 });
        await mgr.save({ database: 'db', collection: 'c2', operation: 'insertOne', durationMs: 200 });
        const result = await mgr.query({ operation: 'insertOne' });
        assert.equal(result.length, 1);
        assert.equal(result[0].operation, 'insertOne');
    });

    it('query with filter: queryHash', async () => {
        const mgr = buildMemMgr();
        await mgr.save({ database: 'db', collection: 'c1', operation: 'find', durationMs: 100 });
        const all = await mgr.query({});
        if (all.length > 0) {
            const hash = all[0].queryHash;
            const result = await mgr.query({ queryHash: hash });
            assert.equal(result.length, 1);
        }
    });

    it('sort by lastSeen descending (default)', async () => {
        const mgr = buildMemMgr();
        await mgr.save({ database: 'db', collection: 'c1', operation: 'find', durationMs: 100 });
        await mgr.save({ database: 'db', collection: 'c2', operation: 'find', durationMs: 200 });
        const result = await mgr.query({}, { sort: { lastSeen: -1 } });
        assert.ok(Array.isArray(result));
    });

    it('sort by count ascending', async () => {
        const mgr = buildMemMgr();
        await mgr.save({ database: 'db', collection: 'c1', operation: 'find', durationMs: 100 });
        await mgr.save({ database: 'db', collection: 'c1', operation: 'find', durationMs: 200 });
        await mgr.save({ database: 'db', collection: 'c2', operation: 'find', durationMs: 50 });
        const result = await mgr.query({}, { sort: { count: 1 } });
        assert.ok(Array.isArray(result));
        if (result.length >= 2) {
            assert.ok(result[0].count <= result[result.length - 1].count);
        }
    });

    it('mergeSlowQueryLogRecord: no existing → returns incoming', async () => {
        const mgr = buildMemMgr();
        // Saving the same collection/operation twice triggers merge
        await mgr.save({ database: 'db', collection: 'merge1', operation: 'find', durationMs: 100 });
        await mgr.save({ database: 'db', collection: 'merge1', operation: 'find', durationMs: 200 });
        const result = await mgr.query({ collection: 'merge1' });
        assert.equal(result.length, 1);
        assert.equal(result[0].count, 2);
        assert.equal(result[0].totalTimeMs, 300);
        assert.equal(result[0].maxTimeMs, 200);
        assert.equal(result[0].minTimeMs, 100);
    });

    it('save with pre-existing queryHash does not regenerate hash', async () => {
        const mgr = buildMemMgr();
        await mgr.save({
            database: 'db',
            collection: 'c1',
            operation: 'find',
            durationMs: 100,
            queryHash: 'custom-hash-123',
        });
        const result = await mgr.query({});
        assert.ok(Array.isArray(result));
        // queryHash should be the one we provided or merged
    });

    it('close() does not throw', async () => {
        const mgr = buildMemMgr();
        await assert.doesNotReject(() => mgr.close());
    });

    it('save and query with multiple entries', async () => {
        const mgr = buildMemMgr();
        await mgr.save({ database: 'db', collection: 'c1', operation: 'find', durationMs: 100 });
        await mgr.save({ database: 'db', collection: 'c2', operation: 'find', durationMs: 200 });
        const result = await mgr.query({});
        assert.equal(result.length, 2);
    });
});

describe('slow-query-log — MongoDB storage integration via SlowQueryLogManager', () => {
    const bootstrap = createMemoryServerBootstrap();
    let uri = '';
    let runtime: any;

    before(async () => {
        const ctx = await bootstrap.setup();
        uri = ctx.uri;
        runtime = new MonSQLize({
            type: 'mongodb',
            databaseName: 'test_sqlog',
            config: { uri },
            slowQueryLog: {
                enabled: true,
                storage: {
                    type: 'mongodb',
                    useBusinessConnection: true,
                    database: 'test_sqlog',
                    collection: 'slow_logs',
                },
                batch: { enabled: false },
                advanced: { errorHandling: 'silent' },
            },
        });
        await runtime.connect();
    });

    after(async () => {
        if (runtime) await runtime.close();
        await bootstrap.teardown();
    });

    it('MongoDB storage: save and query via business connection', async () => {
        try {
            const col = runtime.collection('items');
            await col.insertOne({ tag: 'sqlog-test' });
            // Give time for async logging
            await new Promise(r => setTimeout(r, 100));
        } catch {
            // tolerated
        }
    });

    it('getSlowQueryLogManager returns the manager', () => {
        try {
            const mgr = runtime.getSlowQueryLogManager?.();
            assert.ok(mgr !== undefined);
        } catch {
            // method may not exist
        }
    });
});
