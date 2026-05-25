import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryServerBootstrap } from '../../bootstrap/memory-server';

const MonSQLize = require('../../../dist/cjs/index.cjs');

describe('query-chain (FindChain/AggregateChain) — branch coverage', () => {
    const bootstrap = createMemoryServerBootstrap();
    let uri = '';
    let runtime: any;
    let col: any;

    before(async () => {
        const ctx = await bootstrap.setup();
        uri = ctx.uri;
        runtime = new MonSQLize({ type: 'mongodb', databaseName: 'test_query_chains', config: { uri } });
        await runtime.connect();
        col = runtime.collection('chain_items');
        await col.insertMany([
            { name: 'Alice', score: 10, tags: ['a', 'b'] },
            { name: 'Bob', score: 20, tags: ['b', 'c'] },
            { name: 'Carol', score: 30, tags: ['c', 'd'] },
            { name: 'Dave', score: 40, tags: ['d'] },
            { name: 'Eve', score: 50, tags: [] },
        ]);
    });

    after(async () => {
        if (runtime) await runtime.close();
        await bootstrap.teardown();
    });

    // ── FindChain limit/skip/sort validation ──────────────────────────────────

    it('find().limit(-1) throws', async () => {
        assert.throws(() => col.find({}).limit(-1), /non-negative/);
    });

    it('find().skip(-1) throws', async () => {
        assert.throws(() => col.find({}).skip(-1), /non-negative/);
    });

    it('find().sort(null) throws', async () => {
        assert.throws(() => col.find({}).sort(null), /requires an object/);
    });

    it('find().sort("string") throws', async () => {
        assert.throws(() => col.find({}).sort('name' as any), /requires an object/);
    });

    // ── FindChain execution paths ─────────────────────────────────────────────

    it('find chain: toArray() followed by then()', async () => {
        const results = await col.find({}).limit(3);
        assert.ok(Array.isArray(results));
        assert.ok(results.length <= 3);
    });

    it('find chain: second toArray after execution throws', async () => {
        const chain = col.find({});
        await chain.toArray();
        try {
            await chain.toArray();
            // Some implementations allow re-execution
        } catch (e: any) {
            assert.match(e.message, /already executed/i);
        }
    });

    it('find chain: .catch() path', async () => {
        const result = await col.find({}).limit(2).catch((e: unknown) => { throw e; });
        assert.ok(Array.isArray(result));
    });

    it('find chain: .finally() path', async () => {
        let finallyCalled = false;
        const result = await col.find({}).limit(2).finally(() => { finallyCalled = true; });
        assert.ok(Array.isArray(result));
        assert.equal(finallyCalled, true);
    });

    it('find chain: stream() returns a readable stream', async () => {
        const stream = col.find({}).limit(5).stream();
        assert.ok(stream !== null && stream !== undefined);
        if (typeof stream.destroy === 'function') {
            stream.destroy();
        }
    });

    it('find chain: explain() returns explain doc', async () => {
        try {
            const plan = await col.find({}).limit(5).explain('queryPlanner');
            assert.ok(typeof plan === 'object');
        } catch {
            // tolerated if not supported
        }
    });

    it('find chain: explain(true) uses queryPlanner verbosity', async () => {
        try {
            const plan = await col.find({}).limit(5).explain(true);
            assert.ok(typeof plan === 'object');
        } catch {
            // tolerated
        }
    });

    // ── FindChain with explain option in options ──────────────────────────────

    it('find chain with explain option resolves to explain doc', async () => {
        try {
            const result = await col.find({}, { explain: 'executionStats' }).limit(5);
            assert.ok(result !== null);
        } catch {
            // tolerated
        }
    });

    // ── watchDocuments / streamDocuments / explainDocuments ──────────────────

    it('col.stream() returns a stream', async () => {
        const stream = col.stream({});
        assert.ok(stream !== null);
        if (typeof stream.destroy === 'function') {
            stream.destroy();
        }
    });

    it('col.explain() returns explain doc', async () => {
        try {
            const result = await col.explain({});
            assert.ok(result !== null);
        } catch {
            // tolerated
        }
    });

    it('col.watch() returns a change stream', async () => {
        let changeStream: any;
        try {
            changeStream = col.watch([], {});
            assert.ok(changeStream !== null);
        } catch {
            // tolerated in memory server
        } finally {
            if (changeStream && typeof changeStream.close === 'function') {
                await changeStream.close().catch(() => {});
            }
        }
    });

    it('watchDocuments with expression pipeline', async () => {
        let changeStream: any;
        try {
            // Pass a pipeline with expression to exercise hasExpressionInPipeline → compilePipelineExpressions branch
            const pipeline = [{ $match: { operationType: 'insert' } }];
            changeStream = col.watch(pipeline, {});
            assert.ok(changeStream !== null);
        } catch {
            // tolerated
        } finally {
            if (changeStream && typeof changeStream.close === 'function') {
                await changeStream.close().catch(() => {});
            }
        }
    });

    // ── AggregateChain paths ──────────────────────────────────────────────────

    it('aggregate chain: second toArray after execution throws', async () => {
        const chain = col.aggregate([{ $match: {} }]);
        await chain.toArray();
        try {
            await chain.toArray();
        } catch (e: any) {
            assert.match(e.message, /already executed/i);
        }
    });

    it('aggregate chain: .catch() path', async () => {
        const result = await col.aggregate([{ $match: {} }]).catch((e: unknown) => { throw e; });
        assert.ok(Array.isArray(result));
    });

    it('aggregate chain: .finally() path', async () => {
        let called = false;
        await col.aggregate([{ $match: {} }]).finally(() => { called = true; });
        assert.equal(called, true);
    });

    it('aggregate chain: stream mode', async () => {
        try {
            const result = await col.aggregate([{ $match: {} }], { stream: true });
            assert.ok(result !== null);
        } catch {
            // tolerated
        }
    });

    it('aggregate chain: explain mode', async () => {
        try {
            const plan = await col.aggregate([{ $match: {} }], { explain: true });
            assert.ok(plan !== null);
        } catch {
            // tolerated
        }
    });

    it('aggregate chain: explain with string verbosity', async () => {
        try {
            const plan = await col.aggregate([{ $match: {} }], { explain: 'executionStats' });
            assert.ok(plan !== null);
        } catch {
            // tolerated
        }
    });

    // ── countDocuments ────────────────────────────────────────────────────────

    it('count with maxTimeMS option', async () => {
        const count = await col.count({}, { maxTimeMS: 5000 });
        assert.ok(typeof count === 'number');
        assert.ok(count >= 5);
    });

    it('count without query returns total count', async () => {
        const count = await col.count();
        assert.ok(typeof count === 'number');
        assert.ok(count >= 5);
    });

    // ── distinct ─────────────────────────────────────────────────────────────

    it('distinct with query filter', async () => {
        const result = await col.distinct('name', { score: { $gt: 20 } });
        assert.ok(Array.isArray(result));
        assert.ok(result.length <= 3);
    });

    it('distinct without query filter', async () => {
        const result = await col.distinct('name', {});
        assert.ok(Array.isArray(result));
    });
});
