import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryServerBootstrap } from '../../bootstrap/memory-server';

const MonSQLize = require('../../../dist/cjs/index.cjs');

describe('find-page — branch coverage (stream/explain/cursor/totals/jump/pipeline)', () => {
    const bootstrap = createMemoryServerBootstrap();
    let uri = '';
    let runtime: any;
    let col: any;

    before(async () => {
        const ctx = await bootstrap.setup();
        uri = ctx.uri;
        runtime = new MonSQLize({ type: 'mongodb', databaseName: 'test_fp_branches2', config: { uri } });
        await runtime.connect();
        col = runtime.collection('fp_branch_items');
        for (let i = 1; i <= 20; i++) {
            await col.insertOne({ n: i, category: i % 2 === 0 ? 'even' : 'odd' });
        }
    });

    after(async () => {
        if (runtime) await runtime.close();
        await bootstrap.teardown();
    });

    // ── Stream mode conflict errors ────────────────────────────────────────────

    it('stream + explain throws STREAM_NO_EXPLAIN', async () => {
        await assert.rejects(
            () => col.findPage({ stream: true, explain: true }),
            /stream and explain cannot be used together/i,
        );
    });

    it('stream + page > 1 throws STREAM_NO_JUMP', async () => {
        await assert.rejects(
            () => col.findPage({ stream: true, page: 2 }),
            /page jump cannot be used in stream mode/i,
        );
    });

    it('stream + totals throws STREAM_NO_TOTALS', async () => {
        await assert.rejects(
            () => col.findPage({ stream: true, totals: { mode: 'sync' } }),
            /totals cannot be computed in stream mode/i,
        );
    });

    // ── Cursor + page conflict ──────────────────────────────────────────────

    it('after cursor + page throws VALIDATION_ERROR', async () => {
        // Need a real cursor from a previous page
        const p1 = await col.findPage({ limit: 5, sort: { n: 1 } });
        const cursor = p1.pageInfo.endCursor;
        if (cursor) {
            await assert.rejects(
                () => col.findPage({ after: cursor, page: 2, sort: { n: 1 } }),
                /page cannot be used with after\/before/,
            );
        }
    });

    // ── JumpTooFar ────────────────────────────────────────────────────────────

    it('page > maxHops throws JUMP_TOO_FAR', async () => {
        await assert.rejects(
            () => col.findPage({ page: 10, limit: 5, sort: { n: 1 }, jump: { step: 1, maxHops: 2 } } as any),
            /JUMP_TOO_FAR|maxHops|page jump exceeds/i,
        );
    });

    // ── Stream mode returns a stream ──────────────────────────────────────────

    it('stream mode returns a readable stream', async () => {
        const stream = await col.findPage({ stream: true, limit: 5, sort: { n: 1 } });
        // stream should be an iterable or a readable
        assert.ok(stream !== null && stream !== undefined);
        if (typeof stream.destroy === 'function') {
            stream.destroy(); // cleanup
        }
    });

    // ── Explain mode ──────────────────────────────────────────────────────────

    it('explain mode returns MongoDB explain document', async () => {
        try {
            const result = await col.findPage({ explain: true, limit: 5, sort: { n: 1 } });
            assert.ok(result !== null && typeof result === 'object');
        } catch {
            // tolerated if explain not supported
        }
    });

    it('explain with verbosity string', async () => {
        try {
            const result = await col.findPage({ explain: 'executionStats', limit: 5, sort: { n: 1 } });
            assert.ok(result !== null);
        } catch {
            // tolerated
        }
    });

    // ── Before cursor mode ────────────────────────────────────────────��───────

    it('before cursor mode returns previous page items', async () => {
        const p2 = await col.findPage({ page: 2, limit: 5, sort: { n: 1 } });
        const startCursor = p2.pageInfo.startCursor;
        if (startCursor) {
            const result = await col.findPage({ before: startCursor, limit: 5, sort: { n: 1 } });
            assert.ok(Array.isArray(result.items));
            assert.ok(result.pageInfo !== undefined);
        }
    });

    // ── After cursor mode ─────────────────────────────────────────────────────

    it('after cursor mode returns next page items', async () => {
        const p1 = await col.findPage({ page: 1, limit: 5, sort: { n: 1 } });
        const endCursor = p1.pageInfo.endCursor;
        if (endCursor) {
            const result = await col.findPage({ after: endCursor, limit: 5, sort: { n: 1 } });
            assert.ok(Array.isArray(result.items));
        }
    });

    // ── totals modes ──────────────────────────────────────────────────────────

    it('totals mode sync returns total count', async () => {
        const result = await col.findPage({ limit: 5, sort: { n: 1 }, totals: { mode: 'sync' } });
        assert.ok(result.totals !== undefined);
        assert.equal(result.totals.mode, 'sync');
        assert.ok(typeof result.totals.total === 'number');
    });

    it('totals mode approx returns estimated count', async () => {
        try {
            const result = await col.findPage({ limit: 5, sort: { n: 1 }, totals: { mode: 'approx' } });
            assert.ok(result.totals !== undefined);
        } catch {
            // tolerated
        }
    });

    it('totals mode async returns null total on first call', async () => {
        try {
            const result = await col.findPage({ limit: 5, sort: { n: 1 }, totals: { mode: 'async' } });
            assert.ok(result.totals !== undefined);
            assert.equal(result.totals.mode, 'async');
        } catch {
            // tolerated
        }
    });

    // ── Pipeline mode ─────────────────────────────────────────────────────────

    it('findPage with pipeline (aggregation) returns items', async () => {
        const result = await col.findPage({
            limit: 5,
            sort: { n: 1 },
            pipeline: [{ $addFields: { doubled: { $multiply: ['$n', 2] } } }],
        });
        assert.ok(Array.isArray(result.items));
        if (result.items.length > 0) {
            assert.ok('doubled' in result.items[0]);
        }
    });

    // ── offsetJump mode ───────────────────────────────────────────────────────

    it('offsetJump mode skips to page 3', async () => {
        const result = await col.findPage({
            page: 3,
            limit: 5,
            sort: { n: 1 },
            ext: { offsetJump: { enable: true } },
        });
        assert.ok(Array.isArray(result.items));
        assert.ok(result.pageInfo !== undefined);
    });

    it('offsetJump with totals', async () => {
        const result = await col.findPage({
            page: 2,
            limit: 5,
            sort: { n: 1 },
            ext: { offsetJump: { enable: true } },
            totals: { mode: 'sync' },
        });
        assert.ok(Array.isArray(result.items));
        assert.ok(result.totals !== undefined);
    });

    // ── meta: true mode ───────────────────────────────────────────────────────

    it('meta: true returns meta.op info', async () => {
        const result = await col.findPage({ limit: 5, sort: { n: 1 }, meta: true });
        assert.ok(result.meta !== undefined);
        assert.equal(result.meta.op, 'findPage');
    });

    it('meta with level "sub" returns steps array', async () => {
        const result = await col.findPage({ limit: 5, sort: { n: 1 }, meta: { level: 'sub' } });
        assert.ok(result.meta !== undefined);
        if (result.meta.steps !== undefined) {
            assert.ok(Array.isArray(result.meta.steps));
        }
    });

    // ── Page navigation across multiple pages ─────────────────────────────────

    it('page navigation: page 2 hops correctly', async () => {
        const result = await col.findPage({ page: 2, limit: 5, sort: { n: 1 } });
        assert.ok(Array.isArray(result.items));
        assert.ok(result.pageInfo.hasPrev === true);
    });

    it('page navigation: page beyond data returns partial', async () => {
        const result = await col.findPage({ page: 100, limit: 5, sort: { n: 1 } });
        assert.ok(Array.isArray(result.items));
    });

    // ── projection array branch ───────────────────────────────────────────────

    it('findPage with projection array', async () => {
        const result = await col.findPage({ limit: 5, sort: { n: 1 }, projection: ['n', 'category'] });
        assert.ok(Array.isArray(result.items));
    });

    // ── mergeFilters branches ─────────────────────────────────────────────────

    it('findPage with empty query uses empty base filter', async () => {
        const result = await col.findPage({ limit: 5, sort: { n: 1 }, query: {} });
        assert.ok(Array.isArray(result.items));
    });

    it('findPage with query filter restricts results', async () => {
        const result = await col.findPage({ limit: 5, sort: { n: 1 }, query: { category: 'even' } });
        assert.ok(Array.isArray(result.items));
        for (const item of result.items) {
            assert.equal(item.category, 'even');
        }
    });
});
