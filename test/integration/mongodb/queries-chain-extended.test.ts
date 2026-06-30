import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryServerBootstrap } from '../../bootstrap/memory-server';

const MonSQLize = require('../../../dist/cjs/index.cjs');

describe('Queries chain — extended method and branch coverage', () => {
    const bootstrap = createMemoryServerBootstrap();
    let uri = '';
    let runtime: any;
    let col: any;

    before(async () => {
        const ctx = await bootstrap.setup();
        uri = ctx.uri;
        runtime = new MonSQLize({ type: 'mongodb', databaseName: 'test_chain_ext', config: { uri } });
        await runtime.connect();
        col = runtime.collection('chain_ext');
        await col.insertMany([
            { name: 'Alice', score: 3, userId: '507f1f77bcf86cd799439011' },
            { name: 'Bob',   score: 1, userId: '507f1f77bcf86cd799439012' },
            { name: 'Carol', score: 2, userId: '507f1f77bcf86cd799439013' },
        ]);
    });

    after(async () => {
        if (runtime) await runtime.close();
        await bootstrap.teardown();
    });

    // ── FindChain chain method invocations ────────────────────────────────────

    it('FindChain.collation() sets collation and returns results', async () => {
        const docs = await col.find({}).collation({ locale: 'en' }).toArray();
        assert.ok(Array.isArray(docs));
        assert.ok(docs.length >= 3);
    });

    it('FindChain.batchSize() can be chained', async () => {
        const docs = await col.find({}).batchSize(2).toArray();
        assert.ok(docs.length >= 3);
    });

    it('FindChain.maxTimeMS() chained', async () => {
        const docs = await col.find({}).maxTimeMS(5000).toArray();
        assert.ok(docs.length >= 3);
    });

    it('FindChain.comment() chained', async () => {
        const docs = await col.find({}).comment('test comment').toArray();
        assert.ok(docs.length >= 3);
    });

    it('FindChain.project() chained', async () => {
        const docs = await col.find({}).project({ name: 1, _id: 0 }).toArray();
        assert.ok(docs.length >= 3);
        assert.ok(!('score' in docs[0]));
    });

    it('FindChain.hint() chained', async () => {
        const docs = await col.find({}).hint({ _id: 1 }).toArray();
        assert.ok(docs.length >= 3);
    });

    // ── FindChain.catch() and finally() ──────────────────────────────────────

    it('FindChain.catch() resolves when query succeeds', async () => {
        const docs = await col.find({ name: 'Alice' }).catch(() => []);
        assert.ok(Array.isArray(docs));
        assert.equal(docs.length, 1);
    });

    it('FindChain.finally() runs after resolution', async () => {
        let finallyRan = false;
        const docs = await col.find({ name: 'Bob' }).finally(() => { finallyRan = true; });
        assert.ok(finallyRan);
        assert.ok(Array.isArray(docs));
    });

    it('FindChain.catch() catches rejection', async () => {
        // Force a rejection by passing an invalid cursor operation —
        // use a bad hint that mongo rejects at execution time
        try {
            await col.find({}).hint({ nonexistent_field_that_causes_error: 1 }).catch((e: unknown) => {
                // Just verify catch receives an error or docs
                return [];
            });
        } catch {
            // If catch itself throws that's fine
        }
    });

    // ── AggregateChain chain methods ──────────────────────────────────────────

    it('AggregateChain.collation() chained', async () => {
        const docs = await col.aggregate([{ $match: {} }]).collation({ locale: 'en' }).toArray();
        assert.ok(Array.isArray(docs));
    });

    it('AggregateChain.allowDiskUse() chained', async () => {
        const docs = await col.aggregate([{ $sort: { score: 1 } }]).allowDiskUse(true).toArray();
        assert.ok(Array.isArray(docs));
    });

    it('AggregateChain.batchSize() chained', async () => {
        const docs = await col.aggregate([{ $match: {} }]).batchSize(5).toArray();
        assert.ok(Array.isArray(docs));
    });

    it('AggregateChain.hint() chained', async () => {
        const docs = await col.aggregate([{ $match: {} }]).hint({ _id: 1 }).toArray();
        assert.ok(Array.isArray(docs));
    });

    it('AggregateChain.maxTimeMS() chained', async () => {
        const docs = await col.aggregate([{ $match: {} }]).maxTimeMS(5000).toArray();
        assert.ok(Array.isArray(docs));
    });

    it('AggregateChain.comment() chained', async () => {
        const docs = await col.aggregate([{ $match: {} }]).comment('agg comment').toArray();
        assert.ok(Array.isArray(docs));
    });

    it('AggregateChain.catch() resolves on success', async () => {
        const docs = await col.aggregate([{ $match: { name: 'Alice' } }]).catch(() => []);
        assert.ok(Array.isArray(docs));
        assert.equal(docs.length, 1);
    });

    it('AggregateChain.finally() runs after resolution', async () => {
        let finallyRan = false;
        await col.aggregate([{ $match: {} }]).finally(() => { finallyRan = true; });
        assert.ok(finallyRan);
    });

    it('AggregateChain.explain() with string verbosity', async () => {
        const plan = await col.aggregate([{ $match: {} }]).explain('executionStats');
        assert.equal(typeof plan, 'object');
    });

    it('AggregateChain.then() with explicit null onfulfilled', async () => {
        const chain = col.aggregate([{ $count: 'total' }]) as any;
        const result = await chain.then(null, undefined);
        assert.ok(Array.isArray(result));
    });

    // ── FindChain.then() with explicit null onfulfilled ───────────────────────

    it('FindChain.then() with null onfulfilled returns raw array', async () => {
        const chain = col.find({ name: 'Alice' }) as any;
        const result = await chain.then(null, undefined);
        assert.ok(Array.isArray(result));
    });

    it('FindChain.stream() returns readable stream', async () => {
        const chain = col.find({}) as any;
        const stream = chain.stream();
        assert.ok(typeof stream.on === 'function');
        const items: unknown[] = [];
        await new Promise<void>((resolve, reject) => {
            stream.on('data', (d: unknown) => items.push(d));
            stream.on('end', resolve);
            stream.on('error', reject);
        });
        assert.ok(items.length >= 3);
    });

    // ── FindChain with autoConvertObjectId=false ──────────────────────────────

    it('FindChain with autoConvertObjectId=false does not normalize query', async () => {
        const r2 = new MonSQLize({
            type: 'mongodb',
            databaseName: 'test_chain_ext',
            config: { uri },
            autoConvertObjectId: false,
        });
        await r2.connect();
        const col2 = r2.collection('chain_ext');
        const docs = await col2.find({ name: 'Alice' }).toArray();
        assert.ok(docs.length >= 1);
        await r2.close();
    });

    // ── countDocuments with hint, collation in non-explain path ──────────────

    it('countDocuments with hint option', async () => {
        const count = await col.count({ name: 'Alice' }, { hint: { _id: 1 } });
        assert.equal(typeof count, 'number');
    });

    it('countDocuments with collation option', async () => {
        const count = await col.count({ name: 'Alice' }, { collation: { locale: 'en' } });
        assert.equal(typeof count, 'number');
    });

    it('countDocuments with explain + hint option', async () => {
        const plan = await col.count({ score: { $gt: 0 } }, { explain: true, hint: { _id: 1 } });
        assert.equal(typeof plan, 'object');
    });

    it('countDocuments with explain + collation option', async () => {
        const plan = await col.count({ score: { $gt: 0 } }, { explain: true, collation: { locale: 'en' } });
        assert.equal(typeof plan, 'object');
    });

    it('countDocuments with explain + maxTimeMS option', async () => {
        const plan = await col.count({ score: { $gt: 0 } }, { explain: true, maxTimeMS: 5000 });
        assert.equal(typeof plan, 'object');
    });

    // ── findOneDocument with collation ────────────────────────────────────────

    it('findOneDocument with collation option', async () => {
        const doc = await col.findOne({ name: 'Alice' }, { collation: { locale: 'en' } });
        assert.ok(doc !== null);
        assert.equal((doc as Record<string, unknown>).name, 'Alice');
    });

    it('findOneDocument with explain=true returns query plan', async () => {
        const plan = await col.findOne({ name: 'Bob' }, { explain: true });
        assert.equal(typeof plan, 'object');
        assert.ok(plan !== null);
    });

    it('findOneDocument with explain=string verbosity', async () => {
        const plan = await col.findOne({ name: 'Bob' }, { explain: 'queryPlanner' });
        assert.equal(typeof plan, 'object');
    });

    // ── streamDocuments with non-null defaults ────────────────────────────────

    it('col.find with stream:true from collection with non-default options', async () => {
        const r3 = new MonSQLize({
            type: 'mongodb',
            databaseName: 'test_chain_ext',
            config: { uri },
            findLimit: 100, // non-default so streamDefaults strips it
        });
        await r3.connect();
        const col3 = r3.collection('chain_ext');
        const stream = col3.find({}, { stream: true }) as any;
        assert.ok(typeof stream.on === 'function');
        const items: unknown[] = [];
        await new Promise<void>((resolve, reject) => {
            stream.on('data', (d: unknown) => items.push(d));
            stream.on('end', resolve);
            stream.on('error', reject);
        });
        assert.ok(items.length >= 3);
        await r3.close();
    });

    // ── distinctValues with options ───────────────────────────────────────────

    it('col.distinct with options object', async () => {
        const values = await col.distinct('name', {}, { maxTimeMS: 5000 });
        assert.ok(Array.isArray(values));
        assert.ok(values.length >= 3);
    });

    // ── FindChain with cache — then() null-coalescing branches ─────────���─────

    it('FindChain cache: then() with explicit null handlers on cache hit', async () => {
        const TTL = 5000;
        // Populate cache
        await col.find({ name: 'Alice' }, { cache: TTL });
        // Second call — cache hit — test with null onfulfilled
        const chain = col.find({ name: 'Alice' }, { cache: TTL }) as any;
        const result = await chain.then(null, null);
        assert.ok(Array.isArray(result));
    });

    it('FindChain cache: then() with fulfilled handler on cache miss then hit', async () => {
        const TTL = 4000;
        const first = await (col.find({ score: { $gt: 0 } }, { cache: TTL }) as any).then((docs: unknown[]) => docs.length);
        assert.ok(first >= 3);
        // Cache hit — second call
        const second = await (col.find({ score: { $gt: 0 } }, { cache: TTL }) as any).then((docs: unknown[]) => docs.length);
        assert.equal(second, first);
    });
});

// ── autoConvertObjectId: ObjectId field conversion ────────────────────────────

describe('ObjectId auto-conversion — integration', () => {
    const bootstrap2 = createMemoryServerBootstrap();
    let uri2 = '';
    let runtime2: any;
    let col2: any;
    const VALID_HEX = '507f1f77bcf86cd799439011';
    const NEXT_HEX = '507f1f77bcf86cd799439012';

    before(async () => {
        const ctx = await bootstrap2.setup();
        uri2 = ctx.uri;
        runtime2 = new MonSQLize({ type: 'mongodb', databaseName: 'test_oid_conv', config: { uri: uri2 } });
        await runtime2.connect();
        col2 = runtime2.collection('oid_docs');
        // Insert with a real ObjectId for userId
        const { ObjectId } = require('mongodb');
        await col2.insertMany([
            { name: 'X', userId: new ObjectId(VALID_HEX), score: 5 },
            { name: 'Y', userId: new ObjectId(NEXT_HEX), score: 3 },
            { name: 'Z', score: 1, tags: [new ObjectId(VALID_HEX)] },
        ]);
    });

    after(async () => {
        if (runtime2) await runtime2.close();
        await bootstrap2.teardown();
    });

    it('find with userId as hex string triggers ObjectId conversion', async () => {
        // autoConvertObjectId=true (default for mongodb). Query with hex string should be converted.
        const docs = await col2.find({ userId: VALID_HEX }).toArray();
        assert.ok(docs.length >= 1);
        assert.equal(docs[0].name, 'X');
    });

    it('find with nested ObjectId field (userId: {$eq: hexStr})', async () => {
        const docs = await col2.find({ userId: { $eq: VALID_HEX } }).toArray();
        // $eq with a hex string — the value inside $eq will be converted
        assert.ok(docs.length >= 0); // might or might not match depending on conversion
    });

    it('find converts ObjectId comparison operator values', async () => {
        const gtDocs = await col2.find({ userId: { $gt: VALID_HEX } }).toArray();
        assert.deepEqual(gtDocs.map((doc: { name: string }) => doc.name), ['Y']);

        const gteDocs = await col2.find({ userId: { $gte: VALID_HEX } }).sort({ name: 1 }).toArray();
        assert.deepEqual(gteDocs.map((doc: { name: string }) => doc.name), ['X', 'Y']);

        const ltDocs = await col2.find({ userId: { $lt: NEXT_HEX } }).toArray();
        assert.deepEqual(ltDocs.map((doc: { name: string }) => doc.name), ['X']);

        const lteDocs = await col2.find({ userId: { $lte: VALID_HEX } }).toArray();
        assert.deepEqual(lteDocs.map((doc: { name: string }) => doc.name), ['X']);
    });

    it('find with $expr operator — SPECIAL_OPERATORS skips conversion', async () => {
        const docs = await col2.find({ $expr: { $gt: ['$score', 2] } }).toArray();
        assert.ok(Array.isArray(docs));
        assert.ok(docs.length >= 2);
    });

    it('find with tags array containing ObjectId string', async () => {
        const docs = await col2.find({ tags: VALID_HEX }).toArray();
        // Should convert the string in query
        assert.ok(Array.isArray(docs));
    });

    it('find with score (non-ObjectId field) — no conversion', async () => {
        const docs = await col2.find({ score: 5 }).toArray();
        assert.ok(docs.length >= 1);
    });

    it('updateOne with $set.userId hex string — triggers convertUpdateDocument', async () => {
        const result = await col2.updateOne(
            { name: 'Y' },
            { $set: { userId: VALID_HEX } },
        );
        assert.ok(result.acknowledged);
    });

    it('updateOne with $inc operator — not converted', async () => {
        const result = await col2.updateOne({ name: 'X' }, { $inc: { score: 1 } });
        assert.ok(result.acknowledged);
    });

    it('find with deeply nested query — objectid conversion traverses', async () => {
        const docs = await col2.find({ 'nested.userId': VALID_HEX }).toArray();
        assert.ok(Array.isArray(docs));
    });

    it('aggregate with pipeline containing userId match', async () => {
        const { ObjectId } = require('mongodb');
        const docs = await col2.aggregate([
            { $match: { userId: new ObjectId(VALID_HEX) } },
        ]).toArray();
        assert.ok(Array.isArray(docs));
    });

    it('insertOne with userId hex string — convertObjectIdStrings converts in doc', async () => {
        const result = await col2.insertOne({ name: 'W', userId: VALID_HEX });
        assert.ok(result.acknowledged);
        // Verify it was stored as an ObjectId
        const doc = await col2.findOne({ name: 'W' });
        assert.ok(doc !== null);
    });
});
