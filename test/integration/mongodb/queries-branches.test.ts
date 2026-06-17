import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryServerBootstrap } from '../../bootstrap/memory-server';

const MonSQLize = require('../../../dist/cjs/index.cjs');

describe('queries — branch coverage', () => {
    const bootstrap = createMemoryServerBootstrap();
    let uri = '';
    let runtime: any;
    let col: any;

    before(async () => {
        const ctx = await bootstrap.setup();
        uri = ctx.uri;
        runtime = new MonSQLize({ type: 'mongodb', databaseName: 'test_queries_branches', config: { uri } });
        await runtime.connect();
        col = runtime.collection('qbranch');
        await col.insertMany([
            { name: 'Alice', score: 3 },
            { name: 'Bob',   score: 1 },
            { name: 'Carol', score: 2 },
        ]);
    });

    after(async () => {
        if (runtime) await runtime.close();
        await bootstrap.teardown();
    });

    // ── FindChain.sort() error branch ─────────────────────────────────────────

    it('FindChain.sort() throws when given a non-object', () => {
        const chain = col.find({}) as any;
        assert.throws(
            () => chain.sort('invalid'),
            /sort\(\) requires an object or array/,
        );
    });

    it('FindChain.sort() throws when given null', () => {
        const chain = col.find({}) as any;
        assert.throws(
            () => chain.sort(null),
            /sort\(\) requires an object or array/,
        );
    });

    // ── FindChain.explain() branch ────────────────────────────────────────────

    it('FindChain.explain() returns a query plan object', async () => {
        const chain = col.find({}) as any;
        const plan = await chain.explain('queryPlanner');
        assert.equal(typeof plan, 'object');
    });

    it('FindChain: explain option=true routes to explain()', async () => {
        // When explain is passed as an option, the chain.then() routes to explain()
        const result = await col.find({}, { explain: true });
        assert.equal(typeof result, 'object');
        assert.ok(result !== null);
    });

    it('FindChain: explain option as string routes to explain()', async () => {
        const result = await col.find({}, { explain: 'queryPlanner' });
        assert.equal(typeof result, 'object');
    });

    // ── FindChain cache hit branch ────────────────────────────────────────────

    it('FindChain cache: second call returns from cache', async () => {
        const TTL = 5000;
        // First call — should miss cache and populate it
        const first = await col.find({ name: 'Alice' }, { cache: TTL });
        assert.equal(first.length, 1);
        // Second call — should hit cache
        const second = await col.find({ name: 'Alice' }, { cache: TTL });
        assert.equal(second.length, 1);
        assert.equal(second[0].name, 'Alice');
    });

    // ── AggregateChain.explain() ──────────────────────────────────────────────

    it('AggregateChain: explain option routes to explain()', async () => {
        const result = await col.aggregate([{ $match: { name: 'Bob' } }], { explain: true });
        assert.equal(typeof result, 'object');
        assert.ok(result !== null);
    });

    it('AggregateChain: explain string option routes to explain()', async () => {
        const result = await col.aggregate([{ $count: 'total' }], { explain: 'queryPlanner' });
        assert.equal(typeof result, 'object');
    });

    // ── AggregateChain stream option ──────────────────────────────────────────

    it('AggregateChain: stream option returns a ReadableStream', async () => {
        // With stream:true, the chain's then() resolves to a ReadableStream
        const stream = (await col.aggregate([{ $match: {} }], { stream: true })) as any;
        assert.ok(stream && typeof stream.on === 'function', 'stream should be readable');
        const items: unknown[] = [];
        await new Promise<void>((resolve, reject) => {
            stream.on('data', (item: unknown) => items.push(item));
            stream.on('end', resolve);
            stream.on('error', reject);
        });
        assert.ok(items.length >= 3);
    });

    // ── findOneDocument with options ──────────────────────────────────────────

    it('findOne with projection option filters fields', async () => {
        const doc = await col.findOne({ name: 'Alice' }, { projection: { name: 1, _id: 0 } });
        assert.equal(typeof doc, 'object');
        assert.ok(doc !== null);
        assert.equal(doc.name, 'Alice');
        assert.ok(!('score' in doc));
    });

    it('findOne with sort option picks from sorted result', async () => {
        const doc = await col.findOne({}, { sort: { score: -1 } });
        assert.ok(doc !== null);
        assert.equal(doc.name, 'Alice');
    });

    it('findOne with explain option returns query plan', async () => {
        const plan = await col.findOne({ name: 'Bob' }, { explain: true });
        assert.equal(typeof plan, 'object');
        assert.ok(plan !== null);
    });

    it('findOne with hint option executes without error', async () => {
        const doc = await col.findOne({ name: 'Carol' }, { hint: { _id: 1 } });
        assert.ok(doc !== null);
        assert.equal(doc.name, 'Carol');
    });

    it('findOne with maxTimeMS and comment options executes without error', async () => {
        const doc = await col.findOne({ name: 'Bob' }, { maxTimeMS: 5000, comment: 'test-query' });
        assert.ok(doc !== null);
        assert.equal(doc.name, 'Bob');
    });

    // ── countDocuments branches ───────────────────────────────────────────────

    it('count with empty query uses estimatedDocumentCount', async () => {
        const count = await col.count({});
        assert.ok(typeof count === 'number');
        assert.ok(count >= 3);
    });

    it('count with query uses countDocuments', async () => {
        const count = await col.count({ score: { $gt: 1 } });
        assert.ok(typeof count === 'number');
        assert.equal(count, 2);
    });

    it('count with explain + empty query returns mock explain plan', async () => {
        const result = await col.count({}, { explain: true });
        assert.equal(typeof result, 'object');
        assert.ok(result !== null);
    });

    it('count with explain + non-empty query returns real explain plan', async () => {
        const result = await col.count({ score: { $gt: 0 } }, { explain: true });
        assert.equal(typeof result, 'object');
        assert.ok(result !== null);
    });

    it('count with maxTimeMS option executes without error', async () => {
        const count = await col.count({ name: 'Alice' }, { maxTimeMS: 5000 });
        assert.equal(count, 1);
    });

    it('count with skip and limit options executes without error', async () => {
        const count = await col.count({ score: { $gte: 1 } }, { skip: 1, limit: 2 });
        assert.ok(typeof count === 'number');
    });

    it('count with comment option executes without error', async () => {
        const count = await col.count({ name: 'Bob' }, { comment: 'test-count' });
        assert.equal(count, 1);
    });

    // ── streamDocuments with defaults ─────────────────────────────────────────

    it('col.find with stream option returns a readable stream', async () => {
        const stream = col.find({}, { stream: true }) as any;
        assert.ok(typeof stream.on === 'function');
        const items: unknown[] = [];
        await new Promise<void>((resolve, reject) => {
            stream.on('data', (item: unknown) => items.push(item));
            stream.on('end', resolve);
            stream.on('error', reject);
        });
        assert.ok(items.length >= 3);
    });

    // ── FindChain.limit() and skip() error branches ───────────────────────────

    it('FindChain.limit() throws for negative number', () => {
        const chain = col.find({}) as any;
        assert.throws(() => chain.limit(-1), /limit\(\) requires a non-negative integer/);
    });

    it('FindChain.skip() throws for negative number', () => {
        const chain = col.find({}) as any;
        assert.throws(() => chain.skip(-1), /skip\(\) requires a non-negative integer/);
    });

    // ── watchDocuments with expressions ──────────────────────────────────────

    it('watch() with expression pipeline compiles before watching', async () => {
        // pipeline with expression object (will be compiled before passing to watch)
        const pipeline = [{ $project: { name: MonSQLize.expr('UPPER(name)') } }];
        const watcher = col.watch(pipeline);
        assert.ok(typeof watcher.close === 'function');
        await watcher.close();
    });

    it('watch() with empty pipeline works', async () => {
        const watcher = col.watch([]);
        assert.ok(typeof watcher.close === 'function');
        await watcher.close();
    });
});
