import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

const {
    SlowQueryLogManager,
    withSlowQueryLog,
    generateQueryHash,
} = require('../../../dist/cjs/index.cjs');

// Minimal logger mock
function makeLogger() {
    const warned: unknown[] = [];
    const errored: unknown[] = [];
    return {
        logger: { debug: () => {}, info: () => {}, warn: (...a: unknown[]) => warned.push(a), error: (...a: unknown[]) => errored.push(a) },
        warned,
        errored,
    };
}

// ── generateQueryHash / stableStringify branches ───────���──────────────────────

describe('generateQueryHash — stableStringify branches', () => {
    it('stableStringify: Date value', () => {
        const d = new Date('2024-06-15T12:00:00.000Z');
        const hash = generateQueryHash({ ts: d });
        assert.equal(typeof hash, 'string');
        assert.equal(hash.length, 16);
    });

    it('stableStringify: array value', () => {
        const hash = generateQueryHash([1, 'two', null]);
        assert.equal(typeof hash, 'string');
        assert.equal(hash.length, 16);
    });

    it('stableStringify: nested object with Date', () => {
        const hash = generateQueryHash({ nested: { d: new Date(0) } });
        assert.equal(typeof hash, 'string');
    });

    it('stableStringify: null input', () => {
        const hash = generateQueryHash(null);
        assert.equal(typeof hash, 'string');
    });

    it('stableStringify: string input', () => {
        const hash = generateQueryHash('plain string');
        assert.equal(typeof hash, 'string');
    });

    it('stableStringify: number input', () => {
        const hash = generateQueryHash(42);
        assert.equal(typeof hash, 'string');
    });
});

// ── withSlowQueryLog branches ─────────────────────────────────────────────────

describe('withSlowQueryLog — threshold and logging branches', () => {
    it('does NOT log when durationMs is below threshold', async () => {
        const { logger, warned } = makeLogger();
        await withSlowQueryLog(logger, { slowQueryMs: 99999 }, 'find', { db: 'test', coll: 'col' }, {}, async () => 'done');
        assert.equal(warned.length, 0);
    });

    it('does NOT log when logger is null', async () => {
        const result = await withSlowQueryLog(null, { slowQueryMs: 0 }, 'find', { db: 'test', coll: 'col' }, {}, async () => 'result');
        assert.equal(result, 'result');
    });

    it('does NOT log when logger is undefined', async () => {
        const result = await withSlowQueryLog(undefined, { slowQueryMs: 0 }, 'find', { db: 'test', coll: 'col' }, {}, async () => 42);
        assert.equal(result, 42);
    });

    it('logs when durationMs >= threshold with valid logger', async () => {
        const { logger, warned } = makeLogger();
        await withSlowQueryLog(logger, { slowQueryMs: 0 }, 'find', { db: 'testdb', coll: 'users', type: 'mongodb', iid: 'i1' }, {}, async () => 'ok');
        assert.ok(warned.length > 0, 'should have warned');
        const msg = warned[0] as unknown[];
        assert.ok(typeof msg[0] === 'string' && msg[0].includes('Slow'));
    });

    it('logs with scope from defaults.namespace.scope', async () => {
        const { logger, warned } = makeLogger();
        await withSlowQueryLog(
            logger,
            { slowQueryMs: 0, namespace: { scope: 'user-service' } },
            'aggregate',
            { db: 'testdb', coll: 'events' },
            {},
            async () => [],
        );
        assert.ok(warned.length > 0);
        const log = warned[0] as unknown[];
        assert.ok((log[1] as Record<string, unknown>).scope === 'user-service');
    });

    it('logs with logTag event/code from defaults.log', async () => {
        const { logger, warned } = makeLogger();
        await withSlowQueryLog(
            logger,
            { slowQueryMs: 0, log: { slowQueryTag: { event: 'custom_slow', code: 'CUSTOM_CODE' } } },
            'find',
            { db: 'db', coll: 'col' },
            {},
            async () => null,
        );
        assert.ok(warned.length > 0);
        const log = warned[0] as unknown[];
        assert.equal((log[1] as Record<string, unknown>).event, 'custom_slow');
        assert.equal((log[1] as Record<string, unknown>).code, 'CUSTOM_CODE');
    });

    it('uses formatSlowQuery function to transform log entry', async () => {
        const { logger, warned } = makeLogger();
        await withSlowQueryLog(
            logger,
            {
                slowQueryMs: 0,
                log: {
                    formatSlowQuery: (base: unknown) => ({ ...(base as object), formatted: true }),
                },
            },
            'find',
            { db: 'db', coll: 'col' },
            {},
            async () => null,
        );
        assert.ok(warned.length > 0);
        const payload = (warned[0] as unknown[])[1] as Record<string, unknown>;
        assert.equal(payload.formatted, true);
    });

    it('calls onEmit with formatted log (formatSlowQuery branch)', async () => {
        const emitted: unknown[] = [];
        const { logger } = makeLogger();
        await withSlowQueryLog(
            logger,
            { slowQueryMs: 0, log: { formatSlowQuery: (base: unknown) => ({ ...(base as object), x: 1 }) } },
            'find',
            { db: 'db', coll: 'col' },
            {},
            async () => null,
            null,
            (info: unknown) => emitted.push(info),
        );
        assert.ok(emitted.length > 0);
        assert.equal((emitted[0] as Record<string, unknown>).x, 1);
    });

    it('calls onEmit without formatSlowQuery (else branch)', async () => {
        const emitted: unknown[] = [];
        const { logger } = makeLogger();
        await withSlowQueryLog(
            logger,
            { slowQueryMs: 0 },
            'find',
            { db: 'db', coll: 'col' },
            {},
            async () => null,
            null,
            (info: unknown) => emitted.push(info),
        );
        assert.ok(emitted.length > 0);
    });

    it('suppresses error thrown by onEmit', async () => {
        const { logger } = makeLogger();
        await assert.doesNotReject(() =>
            withSlowQueryLog(
                logger,
                { slowQueryMs: 0 },
                'find',
                { db: 'db', coll: 'col' },
                {},
                async () => null,
                null,
                () => { throw new Error('onEmit failure'); },
            ),
        );
    });

    it('applies slowLogShaper to options', async () => {
        const { logger, warned } = makeLogger();
        await withSlowQueryLog(
            logger,
            { slowQueryMs: 0 },
            'find',
            { db: 'db', coll: 'col' },
            { filter: { x: 1 } },
            async () => null,
            (opts: unknown) => ({ query: opts }),
        );
        assert.ok(warned.length > 0);
        assert.ok((warned[0] as unknown[])[1] as unknown as object);
    });

    it('defaults.namespace is undefined — scope is undefined', async () => {
        const { logger, warned } = makeLogger();
        await withSlowQueryLog(logger, { slowQueryMs: 0 }, 'find', { db: 'db', coll: 'col' }, {}, async () => null);
        assert.ok(warned.length > 0);
        const payload = (warned[0] as unknown[])[1] as Record<string, unknown>;
        assert.equal(payload.scope, undefined);
    });
});

// Batch must be disabled so save() calls storage.save() immediately for error testing.
const NO_BATCH = { enabled: false };

// ── SlowQueryLogManager — normalizeSlowQueryLogEntry / handleSlowQueryLogError ─

describe('SlowQueryLogManager — save error handling', () => {
    it('policy=silent: ignores error when database is empty (normalizeSlowQueryLogEntry throws)', async () => {
        const mgr = new SlowQueryLogManager(
            { enabled: true, storage: { type: 'memory' }, batch: NO_BATCH, advanced: { errorHandling: 'silent' } },
            null, 'mongodb', null,
        );
        await mgr.initialize();
        // Empty database → normalizeSlowQueryLogEntry throws INVALID_ARGUMENT → caught + silent
        await assert.doesNotReject(() => mgr.save({
            database: '',
            collection: 'c',
            operation: 'find',
            durationMs: 100,
        }));
    });

    it('policy=throw: re-throws error from storage (normalizeSlowQueryLogEntry)', async () => {
        const mgr = new SlowQueryLogManager(
            { enabled: true, storage: { type: 'memory' }, batch: NO_BATCH, advanced: { errorHandling: 'throw' } },
            null, 'mongodb', null,
        );
        await mgr.initialize();
        await assert.rejects(
            () => mgr.save({ database: '', collection: 'c', operation: 'find', durationMs: 100 }),
        );
    });

    it('policy=log: logs the error and does not throw', async () => {
        const { logger, errored } = makeLogger();
        const mgr = new SlowQueryLogManager(
            { enabled: true, storage: { type: 'memory' }, batch: NO_BATCH, advanced: { errorHandling: 'log' } },
            null, 'mongodb', logger,
        );
        await mgr.initialize();
        await assert.doesNotReject(() => mgr.save({ database: '', collection: 'c', operation: 'find', durationMs: 100 }));
        assert.ok(errored.length > 0);
    });

    it('policy=throw: re-throws when durationMs is NaN (invalid)', async () => {
        const mgr = new SlowQueryLogManager(
            { enabled: true, storage: { type: 'memory' }, batch: NO_BATCH, advanced: { errorHandling: 'throw' } },
            null, 'mongodb', null,
        );
        await mgr.initialize();
        await assert.rejects(
            () => mgr.save({ database: 'db', collection: 'c', operation: 'find', durationMs: NaN }),
        );
    });

    it('save is no-op when config.enabled=false', async () => {
        const mgr = new SlowQueryLogManager(
            { enabled: false, storage: { type: 'memory' } },
            null, 'mongodb', null,
        );
        await assert.doesNotReject(() => mgr.save({ database: 'db', collection: 'c', operation: 'find', durationMs: 50 }));
    });
});

// ── SlowQueryLogManager — query / matchesSlowQueryLogFilter / sort ─────────────

describe('SlowQueryLogManager — query and filter branches', () => {
    async function buildPopulatedMgr() {
        const mgr = new SlowQueryLogManager(
            { enabled: true, storage: { type: 'memory' }, batch: NO_BATCH, advanced: { errorHandling: 'throw' } },
            null, 'mongodb', null,
        );
        await mgr.initialize();
        await mgr.save({ database: 'db1', collection: 'users', operation: 'find', durationMs: 200 });
        await mgr.save({ database: 'db1', collection: 'orders', operation: 'aggregate', durationMs: 100 });
        await mgr.save({ database: 'db2', collection: 'users', operation: 'find', durationMs: 300 });
        return mgr;
    }

    it('query with no filter returns all records', async () => {
        const mgr = await buildPopulatedMgr();
        const results = await mgr.query({});
        assert.ok(results.length >= 3);
    });

    it('query with database filter — matching and non-matching', async () => {
        const mgr = await buildPopulatedMgr();
        const matching = await mgr.query({ database: 'db1' });
        assert.ok(matching.every((r: Record<string, unknown>) => r.database === 'db1'));
        const nonMatch = await mgr.query({ database: 'nonexistent' });
        assert.equal(nonMatch.length, 0);
    });

    it('query with operation filter returns non-matching empty', async () => {
        const mgr = await buildPopulatedMgr();
        const results = await mgr.query({ operation: 'delete' });
        assert.equal(results.length, 0);
    });

    it('query with sort by avgTimeMs descending', async () => {
        const mgr = await buildPopulatedMgr();
        const sorted = await mgr.query({}, { sort: { avgTimeMs: -1 } });
        if (sorted.length >= 2) {
            const a = (sorted[0] as Record<string, unknown>).avgTimeMs as number;
            const b = (sorted[1] as Record<string, unknown>).avgTimeMs as number;
            assert.ok(a >= b);
        }
    });

    it('query with sort by collection (string comparison)', async () => {
        const mgr = await buildPopulatedMgr();
        const sorted = await mgr.query({}, { sort: { collection: 1 } });
        assert.ok(sorted.length >= 2);
        if (sorted.length >= 2) {
            const a = (sorted[0] as Record<string, unknown>).collection as string;
            const b = (sorted[1] as Record<string, unknown>).collection as string;
            assert.ok(a <= b);
        }
    });

    it('mergeSlowQueryLogRecord: saving same query twice merges counts', async () => {
        const mgr = new SlowQueryLogManager(
            { enabled: true, storage: { type: 'memory' }, batch: NO_BATCH, advanced: { errorHandling: 'throw' } },
            null, 'mongodb', null,
        );
        await mgr.initialize();
        const entry = { database: 'db', collection: 'users', operation: 'find', durationMs: 100 };
        await mgr.save(entry);
        await mgr.save({ ...entry, durationMs: 200 });
        const results = await mgr.query({});
        assert.ok(results.length >= 1);
        const rec = results[0] as Record<string, unknown>;
        assert.equal(rec.count, 2);
        assert.equal(rec.totalTimeMs, 300);
        assert.equal(rec.avgTimeMs, 150);
        assert.equal(rec.maxTimeMs, 200);
        assert.equal(rec.minTimeMs, 100);
    });

    it('mergeSlowQueryLogRecord: firstSeen and lastSeen are ordered', async () => {
        const mgr = new SlowQueryLogManager(
            { enabled: true, storage: { type: 'memory' }, batch: NO_BATCH, advanced: { errorHandling: 'throw' } },
            null, 'mongodb', null,
        );
        await mgr.initialize();
        const ts1 = new Date(Date.now() - 5000);
        const ts2 = new Date();
        await mgr.save({ database: 'db', collection: 'col', operation: 'find', durationMs: 50, timestamp: ts1 });
        await mgr.save({ database: 'db', collection: 'col', operation: 'find', durationMs: 75, timestamp: ts2 });
        const [rec] = await mgr.query({}) as Record<string, unknown>[];
        assert.ok((rec.firstSeen as Date) <= (rec.lastSeen as Date));
    });

    it('query with collection filter matches correctly', async () => {
        const mgr = await buildPopulatedMgr();
        const results = await mgr.query({ collection: 'users' });
        assert.ok(results.every((r: Record<string, unknown>) => r.collection === 'users'));
    });
});

// ── SlowQueryLogManager — shouldFilter / minExecutionTimeMs ───────────────────

describe('SlowQueryLogManager — shouldFilter branches', () => {
    it('filters out excluded databases', async () => {
        const mgr = new SlowQueryLogManager(
            { enabled: true, storage: { type: 'memory' }, filter: { excludeDatabases: ['admin'] } },
            null, 'mongodb', null,
        );
        await mgr.initialize();
        await mgr.save({ database: 'admin', collection: 'c', operation: 'find', durationMs: 100 });
        const results = await mgr.query({});
        assert.equal(results.length, 0);
    });

    it('filters out entries below minExecutionTimeMs', async () => {
        const mgr = new SlowQueryLogManager(
            { enabled: true, storage: { type: 'memory' }, filter: { minExecutionTimeMs: 500 } },
            null, 'mongodb', null,
        );
        await mgr.initialize();
        await mgr.save({ database: 'db', collection: 'c', operation: 'find', durationMs: 10 });
        const results = await mgr.query({});
        assert.equal(results.length, 0);
    });
});
