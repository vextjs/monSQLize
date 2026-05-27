import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

const MonSQLize = require('../../../dist/cjs/index.cjs');

const { generateQueryHash, getSlowQueryThreshold, withSlowQueryLog, SlowQueryLogManager } = MonSQLize;

// ── generateQueryHash (drives stableStringify + normalizeHashInput) ───────────

describe('generateQueryHash — branch coverage', () => {
    it('returns 16-char hex string', () => {
        const hash = generateQueryHash({ database: 'db', collection: 'col', operation: 'find' });
        assert.equal(typeof hash, 'string');
        assert.equal(hash.length, 16);
    });

    it('null input → falls through normalizeHashInput non-object path', () => {
        const hash = generateQueryHash(null);
        assert.equal(typeof hash, 'string');
        assert.equal(hash.length, 16);
    });

    it('array input → Array.isArray branch in normalizeHashInput', () => {
        const hash = generateQueryHash([1, 2, 3]);
        assert.equal(typeof hash, 'string');
        assert.equal(hash.length, 16);
    });

    it('string input → falls through normalizeHashInput (non-object)', () => {
        const hash = generateQueryHash('raw-string');
        assert.equal(typeof hash, 'string');
    });

    it('object with alternative field names (db vs database, coll vs collection)', () => {
        const hash1 = generateQueryHash({ db: 'mydb', collection: 'col', operation: 'find' });
        const hash2 = generateQueryHash({ database: 'mydb', collection: 'col', operation: 'find' });
        // Both should produce the same normalized db value
        assert.equal(hash1, hash2);
    });

    it('object with coll alias', () => {
        const hash1 = generateQueryHash({ database: 'db', collection: 'col', operation: 'find' });
        const hash2 = generateQueryHash({ database: 'db', coll: 'col', operation: 'find' });
        assert.equal(hash1, hash2);
    });

    it('object with op alias', () => {
        const hash1 = generateQueryHash({ database: 'db', collection: 'col', operation: 'find' });
        const hash2 = generateQueryHash({ database: 'db', collection: 'col', op: 'find' });
        assert.equal(hash1, hash2);
    });

    it('object with queryShape alias', () => {
        const hash1 = generateQueryHash({ database: 'db', collection: 'col', operation: 'find', queryShape: { x: 1 } });
        const hash2 = generateQueryHash({ database: 'db', collection: 'col', operation: 'find', query: { x: 1 } });
        // queryShape should be used if present, overriding query
        assert.equal(hash1, hash2);
    });

    it('stableStringify Date value in query', () => {
        const hash = generateQueryHash({
            database: 'db',
            collection: 'col',
            operation: 'find',
            query: { ts: new Date('2026-01-01') },
        });
        assert.equal(typeof hash, 'string');
        assert.equal(hash.length, 16);
    });

    it('stableStringify Array value in query', () => {
        const hash = generateQueryHash({
            database: 'db',
            collection: 'col',
            operation: 'find',
            query: { ids: ['id1', 'id2', null] },
        });
        assert.equal(typeof hash, 'string');
    });

    it('stableStringify null value in query', () => {
        const hash = generateQueryHash({
            database: 'db',
            collection: 'col',
            operation: 'find',
            query: { deletedAt: null },
        });
        assert.equal(typeof hash, 'string');
    });

    it('stableStringify nested objects are sorted by key', () => {
        const hash1 = generateQueryHash({ database: 'db', collection: 'c', operation: 'f', query: { a: 1, b: 2 } });
        const hash2 = generateQueryHash({ database: 'db', collection: 'c', operation: 'f', query: { b: 2, a: 1 } });
        assert.equal(hash1, hash2);
    });

    it('missing db/collection/operation fields → empty string fallback', () => {
        const hash = generateQueryHash({ someOther: 'field' });
        assert.equal(typeof hash, 'string');
    });
});

// ── getSlowQueryThreshold — branch coverage ───────────────────────────────────

describe('getSlowQueryThreshold — branch coverage', () => {
    it('returns default 500 when defaults is null', () => {
        const t = getSlowQueryThreshold(null);
        assert.equal(t, 500);
    });

    it('returns default 500 when defaults is undefined', () => {
        const t = getSlowQueryThreshold(undefined);
        assert.equal(t, 500);
    });

    it('returns default 500 when slowQueryMs is a string', () => {
        const t = getSlowQueryThreshold({ slowQueryMs: '200' });
        assert.equal(t, 500);
    });

    it('returns default 500 when slowQueryMs is missing', () => {
        const t = getSlowQueryThreshold({ maxTimeMS: 5000 });
        assert.equal(t, 500);
    });

    it('returns configured value when slowQueryMs is a number', () => {
        const t = getSlowQueryThreshold({ slowQueryMs: 200 });
        assert.equal(t, 200);
    });

    it('returns 0 when slowQueryMs is 0', () => {
        const t = getSlowQueryThreshold({ slowQueryMs: 0 });
        assert.equal(t, 0);
    });
});

// ── withSlowQueryLog — branch coverage ────────────────────────────────────────

describe('withSlowQueryLog — branch coverage', () => {
    it('runs exec and returns result when below threshold', async () => {
        const result = await withSlowQueryLog(
            null,
            { slowQueryMs: 100000 },
            'find',
            { db: 'db', coll: 'col' },
            {},
            async () => 42,
        );
        assert.equal(result, 42);
    });

    it('triggers slow query log when threshold is 0', async () => {
        const warned: unknown[] = [];
        const logger = { warn: (...args: unknown[]) => warned.push(args) };
        await withSlowQueryLog(
            logger,
            { slowQueryMs: 0 },
            'find',
            { db: 'db', coll: 'col', iid: 'inst1', type: 'mongodb' },
            {},
            async () => 'done',
        );
        assert.ok(warned.length >= 1);
    });

    it('calls onEmit when slow query fires (no formatSlowQuery)', async () => {
        const emitted: unknown[] = [];
        await withSlowQueryLog(
            { warn: () => {} },
            { slowQueryMs: 0 },
            'find',
            { db: 'db', coll: 'col' },
            {},
            async () => null,
            null,
            (info: unknown) => emitted.push(info),
        );
        assert.ok(emitted.length >= 1);
    });

    it('uses formatSlowQuery when provided', async () => {
        const formatted: unknown[] = [];
        const logger = {
            warn: (_tag: unknown, payload: unknown) => formatted.push(payload),
        };
        await withSlowQueryLog(
            logger,
            {
                slowQueryMs: 0,
                log: {
                    formatSlowQuery: (base: unknown) => ({ ...base as Record<string, unknown>, custom: true }),
                },
            },
            'find',
            { db: 'db', coll: 'col' },
            {},
            async () => 'result',
        );
        assert.ok(formatted.length >= 1);
        assert.ok((formatted[0] as Record<string, unknown>)?.custom === true);
    });

    it('onEmit is called with formatted result when formatSlowQuery provided', async () => {
        const emitted: unknown[] = [];
        await withSlowQueryLog(
            { warn: () => {} },
            {
                slowQueryMs: 0,
                log: { formatSlowQuery: (base: unknown) => base },
            },
            'find',
            { db: 'db', coll: 'col' },
            {},
            async () => null,
            null,
            (info: unknown) => emitted.push(info),
        );
        assert.ok(emitted.length >= 1);
    });

    it('onEmit throwing does not propagate error', async () => {
        await assert.doesNotReject(() =>
            withSlowQueryLog(
                { warn: () => {} },
                { slowQueryMs: 0 },
                'find',
                { db: 'db', coll: 'col' },
                {},
                async () => null,
                null,
                () => { throw new Error('onEmit throws'); },
            ),
        );
    });

    it('slowLogShaper is called when provided', async () => {
        let shaperCalled = false;
        await withSlowQueryLog(
            { warn: () => {} },
            { slowQueryMs: 0 },
            'find',
            { db: 'db', coll: 'col' },
            { limit: 100 },
            async () => null,
            (opts: unknown) => { shaperCalled = true; return { limit: (opts as Record<string, unknown>).limit }; },
        );
        assert.ok(shaperCalled);
    });

    it('uses scope from namespace when provided', async () => {
        const warned: unknown[] = [];
        await withSlowQueryLog(
            { warn: (_t: unknown, payload: unknown) => warned.push(payload) },
            { slowQueryMs: 0, namespace: { scope: 'tenant-123' } },
            'aggregate',
            { db: 'db', coll: 'col' },
            {},
            async () => null,
        );
        const payload = warned[0] as Record<string, unknown>;
        assert.equal(payload?.scope, 'tenant-123');
    });

    it('logger is null → no logging even when slow', async () => {
        await assert.doesNotReject(() =>
            withSlowQueryLog(
                null,
                { slowQueryMs: 0 },
                'find',
                { db: 'db', coll: 'col' },
                {},
                async () => 'ok',
            ),
        );
    });

    it('slowQueryTag event and code used in log', async () => {
        const warned: unknown[] = [];
        await withSlowQueryLog(
            { warn: (_t: unknown, payload: unknown) => warned.push(payload) },
            {
                slowQueryMs: 0,
                log: { slowQueryTag: { event: 'custom_slow', code: 'MY_SLOW' } },
            },
            'find',
            { db: 'db', coll: 'col' },
            {},
            async () => null,
        );
        const payload = warned[0] as Record<string, unknown>;
        assert.equal(payload?.event, 'custom_slow');
        assert.equal(payload?.code, 'MY_SLOW');
    });

    it('returns correct result even when logging throws', async () => {
        const result = await withSlowQueryLog(
            { warn: () => { throw new Error('logging failed'); } },
            { slowQueryMs: 0 },
            'find',
            { db: 'db', coll: 'col' },
            {},
            async () => 'expected',
        );
        assert.equal(result, 'expected');
    });
});

// ── SlowQueryLogManager — uncovered record helper branches ────────────────────

describe('SlowQueryLogManager — record sorting and filtering coverage', () => {
    const NO_BATCH = { enabled: false };

    function buildMgr() {
        return new SlowQueryLogManager(
            { enabled: true, storage: { type: 'memory' }, batch: NO_BATCH, advanced: { errorHandling: 'throw' } },
            null, 'mongodb', null,
        );
    }

    it('query with sort by avgTimeMs desc', async () => {
        const mgr = buildMgr();
        await mgr.save({ database: 'db', collection: 'col', operation: 'find', durationMs: 100 });
        await mgr.save({ database: 'db', collection: 'col2', operation: 'find', durationMs: 200 });
        const result = await mgr.query({}, { sort: { avgTimeMs: -1 } });
        assert.ok(Array.isArray(result));
    });

    it('query with sort where left > right (maxTimeMs)', async () => {
        const mgr = buildMgr();
        await mgr.save({ database: 'db', collection: 'a', operation: 'find', durationMs: 50 });
        await mgr.save({ database: 'db', collection: 'b', operation: 'find', durationMs: 500 });
        const result = await mgr.query({}, { sort: { maxTimeMs: -1 } });
        assert.ok(result.length >= 2);
        assert.ok(result[0].maxTimeMs >= result[1].maxTimeMs);
    });

    it('query with sort by count asc', async () => {
        const mgr = buildMgr();
        await mgr.save({ database: 'db', collection: 'col', operation: 'find', durationMs: 100 });
        const result = await mgr.query({}, { sort: { count: 1 } });
        assert.ok(Array.isArray(result));
    });

    it('query with filter by database only', async () => {
        const mgr = buildMgr();
        await mgr.save({ database: 'dbA', collection: 'col', operation: 'find', durationMs: 100 });
        await mgr.save({ database: 'dbB', collection: 'col', operation: 'find', durationMs: 100 });
        const result = await mgr.query({ database: 'dbA' });
        assert.ok(result.every((r: any) => r.database === 'dbA'));
    });

    it('query with filter by collection only', async () => {
        const mgr = buildMgr();
        await mgr.save({ database: 'db', collection: 'users', operation: 'find', durationMs: 100 });
        await mgr.save({ database: 'db', collection: 'orders', operation: 'find', durationMs: 100 });
        const result = await mgr.query({ collection: 'users' });
        assert.ok(result.every((r: any) => r.collection === 'users'));
    });

    it('query with filter by operation only', async () => {
        const mgr = buildMgr();
        await mgr.save({ database: 'db', collection: 'col', operation: 'find', durationMs: 100 });
        await mgr.save({ database: 'db', collection: 'col', operation: 'insert', durationMs: 100 });
        const result = await mgr.query({ operation: 'find' });
        assert.ok(result.every((r: any) => r.operation === 'find'));
    });

    it('query with filter by queryHash', async () => {
        const mgr = buildMgr();
        await mgr.save({ database: 'db', collection: 'col', operation: 'find', durationMs: 100 });
        const all = await mgr.query({});
        const qh = all[0].queryHash;
        const result = await mgr.query({ queryHash: qh });
        assert.equal(result.length, 1);
    });

    it('records are merged: second save updates counts', async () => {
        const mgr = buildMgr();
        await mgr.save({ database: 'db', collection: 'col', operation: 'find', durationMs: 100, query: { x: 1 } });
        await mgr.save({ database: 'db', collection: 'col', operation: 'find', durationMs: 200, query: { x: 1 } });
        const result = await mgr.query({});
        const merged = result.find((r: any) => r.database === 'db');
        assert.ok(merged);
        assert.equal(merged.count, 2);
        assert.equal(merged.maxTimeMs, 200);
        assert.equal(merged.minTimeMs, 100);
    });
});
