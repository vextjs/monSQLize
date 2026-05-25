import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

const MonSQLize = require('../../../dist/cjs/index.cjs');

function makeManager(overrides: Record<string, unknown> = {}) {
    return new MonSQLize.SlowQueryLogManager({
        enabled: true,
        storage: { type: 'memory' },
        batch: { enabled: false, size: 1, interval: 50, maxBufferSize: 10 },
        ...overrides,
    });
}

describe('SlowQueryLogManager behavior', () => {

    // ── enabled: false guard ──────────────────────────────────────────────────
    // Note: v1 compat in mergeConfig forces enabled=true when userConfig.storage
    // is set, so we inject the storage via the 5th constructor arg to bypass it.

    describe('enabled: false', () => {
        it('save() is a no-op when disabled', async () => {
            const saved: unknown[] = [];
            const mockStorage = {
                initialize: () => Promise.resolve(undefined),
                save:      (e: unknown)    => { saved.push(e); return Promise.resolve(undefined); },
                saveBatch: (es: unknown[]) => { saved.push(...es); return Promise.resolve(undefined); },
                query:     ()              => Promise.resolve(saved as any),
                close:     ()              => Promise.resolve(undefined),
            };
            const mgr = new MonSQLize.SlowQueryLogManager(
                { enabled: false, batch: { enabled: false, size: 1, interval: 50, maxBufferSize: 10 } },
                null, null, null, { storage: mockStorage },
            );
            await mgr.save({ database: 'app', collection: 'users', operation: 'find', durationMs: 1000, query: {} });
            assert.equal(saved.length, 0);
        });

        it('query() returns empty when disabled and nothing was saved', async () => {
            const mockStorage = {
                initialize: () => Promise.resolve(undefined),
                save:      ()              => Promise.resolve(undefined),
                saveBatch: ()              => Promise.resolve(undefined),
                query:     ()              => Promise.resolve([] as any),
                close:     ()              => Promise.resolve(undefined),
            };
            const mgr = new MonSQLize.SlowQueryLogManager(
                { enabled: false, batch: { enabled: false, size: 1, interval: 50, maxBufferSize: 10 } },
                null, null, null, { storage: mockStorage },
            );
            const records = await mgr.query({});
            assert.deepEqual(records, []);
        });
    });

    // ── threshold filter ──────────────────────────────────────────────────────

    describe('minExecutionTimeMs threshold', () => {
        it('discards records below threshold', async () => {
            const mgr = makeManager({ filter: { minExecutionTimeMs: 500 } });
            await mgr.save({ database: 'app', collection: 'users', operation: 'find', durationMs: 300, query: {} });
            const records = await mgr.query({});
            assert.equal(records.length, 0);
        });

        it('saves records at or above threshold', async () => {
            const mgr = makeManager({ filter: { minExecutionTimeMs: 500 } });
            await mgr.save({ database: 'app', collection: 'orders', operation: 'find', durationMs: 500, query: {} });
            await mgr.save({ database: 'app', collection: 'orders', operation: 'find', durationMs: 700, query: {} });
            const records = await mgr.query({ collection: 'orders' });
            assert.equal(records.length, 1);
            assert.equal(records[0].count, 2);
        });

        it('mixed: below-threshold records are excluded from aggregation', async () => {
            const mgr = makeManager({ filter: { minExecutionTimeMs: 400 } });
            await mgr.save({ database: 'app', collection: 'items', operation: 'find', durationMs: 200, query: {} });
            await mgr.save({ database: 'app', collection: 'items', operation: 'find', durationMs: 600, query: {} });
            const records = await mgr.query({ collection: 'items' });
            assert.equal(records.length, 1);
            assert.equal(records[0].count, 1);
            assert.equal(records[0].maxTimeMs, 600);
        });
    });

    // ── collection / database / operation exclude filters ─────────────────────

    describe('excludeCollections filter', () => {
        it('excludes records for excluded collections', async () => {
            const mgr = makeManager({ filter: { excludeCollections: ['ignored'] } });
            await mgr.save({ database: 'app', collection: 'ignored', operation: 'find', durationMs: 800, query: {} });
            await mgr.save({ database: 'app', collection: 'tracked', operation: 'find', durationMs: 900, query: {} });
            const records = await mgr.query({});
            assert.equal(records.length, 1);
            assert.equal(records[0].collection, 'tracked');
        });
    });

    describe('excludeDatabases filter', () => {
        it('excludes records for excluded databases', async () => {
            const mgr = makeManager({ filter: { excludeDatabases: ['internal'] } });
            await mgr.save({ database: 'internal', collection: 'logs', operation: 'find', durationMs: 800, query: {} });
            await mgr.save({ database: 'prod', collection: 'users', operation: 'find', durationMs: 600, query: {} });
            const records = await mgr.query({});
            assert.equal(records.length, 1);
            assert.equal(records[0].database, 'prod');
        });
    });

    describe('excludeOperations filter', () => {
        it('excludes records for excluded operations', async () => {
            const mgr = makeManager({ filter: { excludeOperations: ['aggregate'] } });
            await mgr.save({ database: 'app', collection: 'stats', operation: 'aggregate', durationMs: 900, query: [] });
            await mgr.save({ database: 'app', collection: 'stats', operation: 'find', durationMs: 700, query: {} });
            const records = await mgr.query({});
            assert.equal(records.length, 1);
            assert.equal(records[0].operation, 'find');
        });
    });

    // ── batch disabled: direct save ───────────────────────────────────────────

    describe('batch: disabled', () => {
        it('records are immediately queryable after save', async () => {
            const mgr = makeManager();
            await mgr.save({ database: 'db', collection: 'col', operation: 'findOne', durationMs: 650, query: { id: 1 } });
            const records = await mgr.query({ collection: 'col' });
            assert.equal(records.length, 1);
            assert.equal(records[0].operation, 'findOne');
        });

        it('aggregates multiple saves of the same query key', async () => {
            const mgr = makeManager();
            const entry = { database: 'db', collection: 'products', operation: 'find', query: { active: true } };
            await mgr.save({ ...entry, durationMs: 500 });
            await mgr.save({ ...entry, durationMs: 700 });
            await mgr.save({ ...entry, durationMs: 300 });
            const records = await mgr.query({ collection: 'products' });
            assert.equal(records.length, 1);
            assert.equal(records[0].count, 3);
            assert.equal(records[0].totalTimeMs, 1500);
            assert.equal(records[0].minTimeMs, 300);
            assert.equal(records[0].maxTimeMs, 700);
        });
    });

    // ── query filtering and options ───────────────────────────────────────────

    describe('query() filtering and options', () => {
        it('filters by collection', async () => {
            const mgr = makeManager();
            await mgr.save({ database: 'db', collection: 'alpha', operation: 'find', durationMs: 600, query: {} });
            await mgr.save({ database: 'db', collection: 'beta',  operation: 'find', durationMs: 700, query: {} });
            const records = await mgr.query({ collection: 'alpha' });
            assert.equal(records.length, 1);
            assert.equal(records[0].collection, 'alpha');
        });

        it('filters by operation', async () => {
            const mgr = makeManager();
            await mgr.save({ database: 'db', collection: 'c', operation: 'find',    durationMs: 600, query: {} });
            await mgr.save({ database: 'db', collection: 'c', operation: 'findOne', durationMs: 700, query: { x: 1 } });
            const records = await mgr.query({ operation: 'findOne' });
            assert.equal(records.length, 1);
            assert.equal(records[0].operation, 'findOne');
        });

        it('limit option caps the number of returned records', async () => {
            const mgr = makeManager();
            const bases = ['a', 'b', 'c', 'd'];
            for (const col of bases) {
                await mgr.save({ database: 'db', collection: col, operation: 'find', durationMs: 600, query: {} });
            }
            const records = await mgr.query({}, { limit: 2 });
            assert.equal(records.length, 2);
        });
    });

    // ── queryHash is present on records ──────────────────────────────────────

    describe('queryHash on records', () => {
        it('saved records include a string queryHash', async () => {
            const mgr = makeManager();
            await mgr.save({ database: 'db', collection: 'x', operation: 'find', durationMs: 800, query: { a: 1 } });
            const records = await mgr.query({ collection: 'x' });
            assert.equal(records.length, 1);
            assert.ok(typeof records[0].queryHash === 'string');
            assert.ok(records[0].queryHash.length > 0);
        });
    });

    // ── close() resets initialized state ─────────────────────────────────────

    describe('close()', () => {
        it('resets the manager so it can accept new records after re-init', async () => {
            const mgr = makeManager();
            await mgr.save({ database: 'db', collection: 'z', operation: 'find', durationMs: 600, query: {} });
            await mgr.close();

            // Should be able to use again after close
            await mgr.save({ database: 'db', collection: 'z', operation: 'find', durationMs: 700, query: {} });
            const records = await mgr.query({ collection: 'z' });
            assert.ok(records.length >= 1);
        });
    });
});
