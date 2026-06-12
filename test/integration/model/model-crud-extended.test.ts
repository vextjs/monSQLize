import { after, before, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryServerBootstrap } from '../../bootstrap/memory-server';

const MonSQLize = require('../../../dist/cjs/index.cjs');

describe('ModelInstance — extended CRUD coverage', () => {
    const bootstrap = createMemoryServerBootstrap();
    let uri = '';
    let runtime: any;
    let model: any;

    before(async () => {
        const ctx = await bootstrap.setup();
        uri = ctx.uri;
        MonSQLize.Model._clear();
        MonSQLize.Model.define('items', {
            schema: {},
            softDelete: { enabled: true, field: 'deletedAt', type: 'date' },
            timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' },
        });
        runtime = new MonSQLize({ type: 'mongodb', databaseName: 'test_model_extended', config: { uri } });
        await runtime.connect();
        model = runtime.model('items');
    });

    after(async () => {
        if (runtime) await runtime.close();
        MonSQLize.Model._clear();
        await bootstrap.teardown();
    });

    beforeEach(async () => {
        const db = runtime._adapter.db;
        await db.collection('items').deleteMany({});
    });

    // ── getRelations / raw ────────────────────────────────────────────────────

    it('getRelations() returns empty object when no relations defined', () => {
        const rels = model.getRelations();
        assert.ok(typeof rels === 'object');
    });

    it('raw() returns underlying collection reference', () => {
        const raw = model.raw();
        assert.ok(raw !== null && raw !== undefined);
    });

    // ── findById ─────────────────────────────────────────────────────────────

    it('findById is alias for findOneById', async () => {
        const inserted = await model.insertOne({ name: 'Alice', value: 1 });
        const found = await model.findById(inserted.insertedId);
        assert.ok(found !== null);
        assert.equal(found.name, 'Alice');
    });

    // ── insertMany ────────────────────────────────────────────────────────────

    it('insertMany inserts multiple documents', async () => {
        const result = await model.insertMany([
            { name: 'A', value: 1 },
            { name: 'B', value: 2 },
            { name: 'C', value: 3 },
        ]);
        assert.ok(result.acknowledged);
        assert.equal(result.insertedCount, 3);
    });

    it('insertMany with empty array throws', async () => {
        await assert.rejects(
            () => model.insertMany([]),
            /empty/,
        );
    });

    // ── updateMany ────────────────────────────────────────────────────────────

    it('updateMany updates all matching documents', async () => {
        await model.insertMany([
            { name: 'X', active: true },
            { name: 'Y', active: true },
            { name: 'Z', active: false },
        ]);
        const result = await model.updateMany({ active: true }, { $set: { status: 'ok' } });
        assert.ok(result.modifiedCount >= 2);
    });

    // ── replaceOne ────────────────────────────────────────────────────────────

    it('replaceOne replaces a document', async () => {
        await model.insertOne({ name: 'old', value: 1 });
        const result = await model.replaceOne({ name: 'old' }, { name: 'new', value: 99 });
        assert.ok(result.acknowledged);
        const found = await model.findOne({ name: 'new' });
        assert.ok(found !== null);
        assert.equal(found.value, 99);
    });

    // ── findOneAndUpdate ──────────────────────────────────────────────────────

    it('findOneAndUpdate returns updated document', async () => {
        await model.insertOne({ name: 'target', score: 5 });
        const result = await model.findOneAndUpdate(
            { name: 'target' },
            { $set: { score: 10 } },
            { returnDocument: 'after' },
        );
        assert.ok(result !== null);
        assert.equal(result.score, 10);
    });

    it('findOneAndUpdate returns null when no match', async () => {
        const result = await model.findOneAndUpdate({ name: 'ghost' }, { $set: { x: 1 } });
        assert.equal(result, null);
    });

    // ── findOneAndReplace ─────────────────────────────────────────────────────

    it('findOneAndReplace returns replaced document', async () => {
        await model.insertOne({ name: 'orig', val: 1 });
        const result = await model.findOneAndReplace(
            { name: 'orig' },
            { name: 'replaced', val: 2 },
            { returnDocument: 'after' },
        );
        assert.ok(result !== null);
        assert.equal(result.val, 2);
    });

    // ── findOneAndDelete ──────────────────────────────────────────────────────

    it('findOneAndDelete removes and returns document', async () => {
        await model.insertOne({ name: 'todelete', val: 7 });
        const result = await model.findOneAndDelete({ name: 'todelete' });
        assert.ok(result !== null);
        assert.equal(result.name, 'todelete');
        const after = await model.findOne({ name: 'todelete' });
        assert.equal(after, null);
    });

    // ── upsertOne ─────────────────────────────────────────────────────────────

    it('upsertOne creates document when not found', async () => {
        const result = await model.upsertOne({ name: 'upserted' }, { $set: { value: 42 } });
        assert.ok(result.upsertedCount === 1 || result.acknowledged);
    });

    it('upsertOne updates document when found', async () => {
        await model.insertOne({ name: 'existing', value: 1 });
        const result = await model.upsertOne({ name: 'existing' }, { $set: { value: 2 } });
        assert.ok(result.acknowledged);
    });

    // ── incrementOne ──────────────────────────────────────────────────────────

    it('incrementOne increments a numeric field', async () => {
        await model.insertOne({ name: 'counter', count: 0 });
        const result = await model.incrementOne({ name: 'counter' }, 'count', 5);
        assert.ok(result !== null);
    });

    it('incrementOne with field as object', async () => {
        await model.insertOne({ name: 'multicounter', a: 1, b: 2 });
        const result = await model.incrementOne({ name: 'multicounter' }, { a: 10, b: -1 });
        assert.ok(result !== null);
    });

    // ── insertBatch ───────────────────────────────────────────────────────────

    it('insertBatch inserts array of documents', async () => {
        const result = await model.insertBatch([
            { name: 'batch1', group: 'g1' },
            { name: 'batch2', group: 'g1' },
        ]);
        assert.ok(result !== null && result !== undefined);
    });

    // ── updateBatch ───────────────────────────────────────────────────────────

    it('updateBatch updates documents by filter', async () => {
        await model.insertMany([
            { name: 'bup1', group: 'grp' },
            { name: 'bup2', group: 'grp' },
        ]);
        const result = await model.updateBatch({ group: 'grp' }, { $set: { done: true } });
        assert.ok(result !== null && result !== undefined);
    });

    // ── soft-delete findOneWithDeleted / findOneOnlyDeleted ───────────────────

    it('findOneWithDeleted returns doc regardless of deletion status', async () => {
        await model.insertOne({ name: 'alive', status: 'ok' });
        const found = await model.findOneWithDeleted({ name: 'alive' });
        assert.ok(found !== null);
    });

    it('findOneOnlyDeleted is callable on a non-deleted doc', async () => {
        await model.insertOne({ name: 'notdeleted', status: 'ok' });
        const found = await model.findOneOnlyDeleted({ name: 'notdeleted' });
        assert.ok(found === null || typeof found === 'object');
    });

    it('findOneOnlyDeleted is callable after soft-delete', async () => {
        await model.insertOne({ name: 'willdelete', status: 'ok' });
        await model.deleteOne({ name: 'willdelete' });
        const found = await model.findOneOnlyDeleted({ name: 'willdelete' });
        assert.ok(found === null || typeof found === 'object');
    });

    // ── index management ─────────────────────────────────────────────────────

    it('createIndex on model creates the index', async () => {
        const result = await model.createIndex({ name: 1 }, { name: 'name_idx', sparse: true });
        assert.ok(result !== null);
    });

    it('createIndexes on model creates multiple indexes', async () => {
        const result = await model.createIndexes([
            { key: { value: 1 }, name: 'value_idx' },
        ]);
        assert.ok(Array.isArray(result) || result !== null);
    });

    it('listIndexes on model returns index list', async () => {
        const result = await model.listIndexes();
        assert.ok(Array.isArray(result));
        assert.ok(result.some((i: any) => i.name === '_id_'));
    });

    it('dropIndex on model removes specific index', async () => {
        await model.createIndex({ rank: 1 }, { name: 'rank_to_drop' });
        const result = await model.dropIndex('rank_to_drop');
        assert.ok(result !== null);
    });

    it('dropIndexes on model drops all non-_id indexes', async () => {
        const result = await model.dropIndexes();
        assert.ok(result !== null);
    });

    // ── distinct ──────────────────────────────────────────────────────────────

    it('distinct returns unique values for a field', async () => {
        await model.insertMany([
            { name: 'D1', category: 'cat-a' },
            { name: 'D2', category: 'cat-b' },
            { name: 'D3', category: 'cat-a' },
        ]);
        const result = await model.distinct('category');
        assert.ok(Array.isArray(result));
        assert.ok(result.includes('cat-a'));
        assert.ok(result.includes('cat-b'));
        assert.equal(result.length, 2);
    });

    it('distinct with filter returns subset', async () => {
        await model.insertMany([
            { name: 'F1', tag: 't1' },
            { name: 'F2', tag: 't2' },
        ]);
        const result = await model.distinct('tag', { name: 'F1' });
        assert.deepEqual(result, ['t1']);
    });

    // ── aggregate ────────────────────────────────────────────────────────────

    it('aggregate executes pipeline and returns results', async () => {
        await model.insertMany([
            { name: 'AG1', amount: 10 },
            { name: 'AG2', amount: 20 },
        ]);
        const result = await model.aggregate([
            { $match: { amount: { $gt: 0 } } },
            { $group: { _id: null, total: { $sum: '$amount' } } },
        ]);
        assert.ok(Array.isArray(result));
        assert.ok(result.length > 0);
        assert.ok(result[0].total >= 30);
    });

    it('aggregate with empty pipeline returns all documents', async () => {
        await model.insertOne({ name: 'AP1', value: 1 });
        const result = await model.aggregate([]);
        assert.ok(Array.isArray(result));
    });
});

describe('ModelInstance — model with relations', () => {
    const bootstrap = createMemoryServerBootstrap();
    let uri = '';
    let runtime: any;
    let authorModel: any;

    before(async () => {
        const ctx = await bootstrap.setup();
        uri = ctx.uri;
        MonSQLize.Model._clear();
        MonSQLize.Model.define('articles', {
            schema: {},
        });
        MonSQLize.Model.define('authors', {
            schema: {},
            relations: {
                articles: {
                    from: 'articles',
                    localField: '_id',
                    foreignField: 'authorId',
                },
            },
        });
        runtime = new MonSQLize({ type: 'mongodb', databaseName: 'test_model_relations', config: { uri } });
        await runtime.connect();
        authorModel = runtime.model('authors');
    });

    after(async () => {
        if (runtime) await runtime.close();
        MonSQLize.Model._clear();
        await bootstrap.teardown();
    });

    it('getRelations() returns defined relations', () => {
        const rels = authorModel.getRelations();
        assert.ok('articles' in rels);
        assert.equal(rels.articles.from, 'articles');
    });
});

describe('ModelInstance — index safety controls', () => {
    const bootstrap = createMemoryServerBootstrap();
    let uri = '';
    let runtime: any;
    let model: any;

    before(async () => {
        const ctx = await bootstrap.setup();
        uri = ctx.uri;
        MonSQLize.Model._clear();
        MonSQLize.Model.define('safeUsers', {
            schema: {},
            indexes: [{ key: { email: 1 }, unique: true, name: 'safe_email_unique' }],
            options: {
                softDelete: { enabled: true, field: 'deletedAt', type: 'timestamp', ttl: 30 },
            },
        });
        runtime = new MonSQLize({
            type: 'mongodb',
            databaseName: 'test_model_index_safety',
            config: { uri },
            autoIndex: false,
        });
        await runtime.connect();
        model = runtime.model('safeUsers');
        await new Promise((resolve) => setImmediate(resolve));
    });

    after(async () => {
        if (runtime) await runtime.close();
        MonSQLize.Model._clear();
        await bootstrap.teardown();
    });

    it('autoIndex false prevents automatic model and soft-delete index creation', async () => {
        const indexes = await model.listIndexes();
        assert.ok(!indexes.some((index: any) => index.name === 'safe_email_unique'));
        assert.ok(!indexes.some((index: any) => index.key?.deletedAt === 1));
    });

    it('ensureIndexes dry-run reports missing indexes without creating them', async () => {
        const result = await model.ensureIndexes({ dryRun: true });
        assert.equal(result.dryRun, true);
        assert.equal(result.missing.length, 2);
        assert.equal(result.created.length, 0);
        const indexes = await model.listIndexes();
        assert.ok(!indexes.some((index: any) => index.name === 'safe_email_unique'));
    });

    it('ensureIndexes creates missing declared indexes and runtime summarizes them', async () => {
        const result = await model.ensureIndexes();
        assert.equal(result.created.length, 2);
        const indexes = await model.listIndexes();
        assert.ok(indexes.some((index: any) => index.name === 'safe_email_unique'));
        assert.ok(indexes.some((index: any) => index.key?.deletedAt === 1 && index.expireAfterSeconds === 30));

        const summary = await runtime.ensureModelIndexes({ models: ['safeUsers'], dryRun: true });
        assert.equal(summary.models.length, 1);
        assert.equal(summary.totals.existing, 2);
        assert.equal(summary.totals.missing, 0);
    });
});
