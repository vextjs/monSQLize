import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

const {
    withSlowQueryLog,
    SlowQueryLogManager,
} = require('../../../dist/cjs/index.cjs');

const NO_BATCH = { enabled: false };

function buildMgr(errorHandling = 'throw') {
    return new SlowQueryLogManager(
        { enabled: true, storage: { type: 'memory' }, batch: NO_BATCH, advanced: { errorHandling } },
        null, 'mongodb', null,
    );
}

// ── handleSlowQueryLogError — non-Error thrown value ─────────────────────────

describe('handleSlowQueryLogError — non-Error throw coverage', () => {
    it('policy=throw: wraps non-Error value in new Error', async () => {
        // Use a custom storage that throws a plain string (not an Error instance)
        const throwingStorage = {
            initialize: async () => {},
            save: async () => { throw 'string-error'; },  // non-Error throw
            saveBatch: async () => {},
            query: async () => [],
            close: async () => {},
        };
        const mgr = new SlowQueryLogManager(
            { enabled: true, batch: NO_BATCH, advanced: { errorHandling: 'throw' } },
            null, 'mongodb', null,
            { storage: throwingStorage },
        );
        await mgr.initialize();
        const err = await mgr.save({ database: 'db', collection: 'c', operation: 'find', durationMs: 100 })
            .then(() => null)
            .catch((e: unknown) => e);
        assert.ok(err instanceof Error, `expected Error, got ${typeof err}`);
        assert.match((err as Error).message, /string-error/);
    });

    it('policy=log: logs non-Error value without throwing', async () => {
        const errored: unknown[] = [];
        const mockLogger = { warn: () => {}, error: (...a: unknown[]) => errored.push(a) };
        const throwingStorage = {
            initialize: async () => {},
            save: async () => { throw 42; },  // non-Error throw (number)
            saveBatch: async () => {},
            query: async () => [],
            close: async () => {},
        };
        const mgr = new SlowQueryLogManager(
            { enabled: true, batch: NO_BATCH, advanced: { errorHandling: 'log' } },
            null, 'mongodb', mockLogger,
            { storage: throwingStorage },
        );
        await mgr.initialize();
        await assert.doesNotReject(() =>
            mgr.save({ database: 'db', collection: 'c', operation: 'find', durationMs: 100 }),
        );
        assert.ok(errored.length > 0, 'expected logger.error to be called');
    });
});

// ── normalizeSlowQueryLogEntry — uncovered validation branches ─────────────────

describe('normalizeSlowQueryLogEntry — validation via SlowQueryLogManager.save', () => {
    it('missing collection throws', async () => {
        const mgr = buildMgr('throw');
        await assert.rejects(
            () => mgr.save({ database: 'db', collection: '', operation: 'find', durationMs: 100 }),
        );
    });

    it('missing operation throws', async () => {
        const mgr = buildMgr('throw');
        await assert.rejects(
            () => mgr.save({ database: 'db', collection: 'c', operation: '', durationMs: 100 }),
        );
    });

    it('negative durationMs throws (via storage.save to bypass threshold filter)', async () => {
        const mgr = buildMgr('throw');
        await mgr.initialize();
        // Use storage.save directly to bypass the shouldFilter threshold check
        await assert.rejects(
            () => (mgr as any).storage.save({ database: 'db', collection: 'c', operation: 'find', durationMs: -1 }),
        );
    });

    it('Infinity durationMs throws', async () => {
        const mgr = buildMgr('throw');
        await assert.rejects(
            () => mgr.save({ database: 'db', collection: 'c', operation: 'find', durationMs: Infinity }),
        );
    });

    it('custom timestamp is preserved in the record', async () => {
        const mgr = buildMgr();
        const ts = new Date('2024-01-01T00:00:00Z');
        await mgr.save({
            database: 'db', collection: 'c', operation: 'find',
            durationMs: 100, timestamp: ts,
        });
        const results = await mgr.query({});
        assert.equal(results.length, 1);
        assert.ok(results[0].firstSeen instanceof Date);
        assert.equal(results[0].firstSeen.toISOString(), ts.toISOString());
    });
});

// ── mergeSlowQueryLogRecord — firstSeen/lastSeen reverse order ────────────────

describe('mergeSlowQueryLogRecord — ordering edge cases', () => {
    it('incoming firstSeen < existing firstSeen → incoming firstSeen wins', async () => {
        const mgr = buildMgr();
        // Save LATER timestamp first
        const tsLater = new Date('2024-06-15T12:00:00Z');
        const tsEarlier = new Date('2024-06-15T10:00:00Z');
        await mgr.save({ database: 'db', collection: 'c', operation: 'find', durationMs: 100, timestamp: tsLater });
        // Save EARLIER timestamp second → incoming.firstSeen < existing.firstSeen → use incoming
        await mgr.save({ database: 'db', collection: 'c', operation: 'find', durationMs: 50, timestamp: tsEarlier });
        const [rec] = await mgr.query({}) as { firstSeen: Date; lastSeen: Date }[];
        assert.equal(rec.firstSeen.toISOString(), tsEarlier.toISOString());
        assert.equal(rec.lastSeen.toISOString(), tsLater.toISOString());
    });

    it('incoming sampleQuery is undefined → uses existing sampleQuery', async () => {
        const mgr = buildMgr();
        // Use an explicit queryHash so both saves map to the same record
        const explicitHash = 'aabbccdd11223344';
        await mgr.save({ database: 'db', collection: 'c', operation: 'find', durationMs: 100, query: { x: 1 }, queryHash: explicitHash });
        // Second save: same hash, no query → incoming.sampleQuery is undefined → existing wins
        await mgr.save({ database: 'db', collection: 'c', operation: 'find', durationMs: 200, queryHash: explicitHash });
        const results = await mgr.query({});
        const rec = results.find((r: any) => r.queryHash === explicitHash) as { sampleQuery?: unknown };
        // incoming.sampleQuery ?? existing.sampleQuery → should use existing's query
        assert.deepEqual(rec.sampleQuery, { x: 1 });
    });

    it('incoming metadata is undefined → uses existing metadata', async () => {
        const mgr = buildMgr();
        const meta = { source: 'api', version: 2 };
        await mgr.save({ database: 'db', collection: 'c', operation: 'find', durationMs: 100, metadata: meta });
        await mgr.save({ database: 'db', collection: 'c', operation: 'find', durationMs: 200 });
        const [rec] = await mgr.query({}) as { metadata?: unknown }[];
        assert.deepEqual(rec.metadata, meta);
    });
});

// ── matchesSlowQueryLogFilter — non-matching queryHash ────────────────────────

describe('matchesSlowQueryLogFilter — queryHash filter rejects non-matching', () => {
    it('query by specific queryHash filters out other records', async () => {
        const mgr = buildMgr();
        // Save two distinct records (different collections → different hashes)
        await mgr.save({ database: 'db', collection: 'colA', operation: 'find', durationMs: 100 });
        await mgr.save({ database: 'db', collection: 'colB', operation: 'find', durationMs: 200 });
        const all = await mgr.query({});
        assert.equal(all.length, 2);
        // Filter by first record's hash → only 1 result, second record is rejected
        const hashA = all.find((r: { collection: string }) => r.collection === 'colA')?.queryHash as string;
        const filtered = await mgr.query({ queryHash: hashA });
        assert.equal(filtered.length, 1);
        assert.equal(filtered[0].collection, 'colA');
    });
});

// ── sortSlowQueryLogRecords — null/equal value branches ──────────────────────

describe('sortSlowQueryLogRecords — null and equal value branches', () => {
    it('sort by unknown field with all-undefined values → stable (equal → 0)', async () => {
        const mgr = buildMgr();
        await mgr.save({ database: 'db', collection: 'c1', operation: 'find', durationMs: 100 });
        await mgr.save({ database: 'db', collection: 'c2', operation: 'find', durationMs: 200 });
        // Sort by a field that doesn't exist → all values undefined → comparisons all equal → return 0
        const result = await mgr.query({}, { sort: { nonExistentField: -1 } as never });
        assert.equal(result.length, 2);
    });

    it('sort by count: records with same count produce stable sort', async () => {
        const mgr = buildMgr();
        // Save 3 distinct records (each count=1)
        await mgr.save({ database: 'db', collection: 'a', operation: 'find', durationMs: 100 });
        await mgr.save({ database: 'db', collection: 'b', operation: 'find', durationMs: 200 });
        await mgr.save({ database: 'db', collection: 'c', operation: 'find', durationMs: 300 });
        // Sort by count ascending — all records have count=1 → equal values → 0 returned for each comparison
        const result = await mgr.query({}, { sort: { count: 1 } });
        assert.equal(result.length, 3);
    });
});

// ── withSlowQueryLog — formatSlowQuery returns falsy ─────────────────────────

describe('withSlowQueryLog — formatSlowQuery returns falsy falls back to base', () => {
    it('formatSlowQuery returns null → uses base object for logger.warn', async () => {
        const warned: unknown[] = [];
        const logger = { warn: (_tag: unknown, payload: unknown) => warned.push(payload) };
        await withSlowQueryLog(
            logger,
            {
                slowQueryMs: 0,
                log: {
                    formatSlowQuery: () => null,  // returns falsy → fall back to base
                },
            },
            'find',
            { db: 'db', coll: 'col' },
            {},
            async () => 'result',
        );
        assert.ok(warned.length >= 1);
        const payload = warned[0] as Record<string, unknown>;
        // base object should have 'event' field
        assert.ok('event' in payload, 'payload should have event from base');
    });

    it('formatSlowQuery returns undefined → uses base object', async () => {
        const warned: unknown[] = [];
        const logger = { warn: (_tag: unknown, payload: unknown) => warned.push(payload) };
        await withSlowQueryLog(
            logger,
            {
                slowQueryMs: 0,
                log: {
                    formatSlowQuery: () => undefined,
                },
            },
            'find',
            { db: 'db', coll: 'col' },
            {},
            async () => null,
        );
        assert.ok(warned.length >= 1);
        assert.ok('event' in (warned[0] as Record<string, unknown>));
    });
});
