import { after, before, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryServerBootstrap } from '../../bootstrap/memory-server';

const MonSQLize = require('../../../dist/cjs/index.cjs');

describe('Model softDelete / versioning behavior', () => {
    const bootstrap = createMemoryServerBootstrap();
    let runtime: any;

    before(async () => {
        const ctx = await bootstrap.setup();
        const uri = ctx.uri;

        MonSQLize.Model.define('sd_docs', {
            schema: (dsl: any) => dsl({}),
            options: { softDelete: true },
        });
        MonSQLize.Model.define('sd_bool', {
            schema: (dsl: any) => dsl({}),
            options: {
                softDelete: { field: 'removedAt', type: 'boolean', ttl: 7200 },
            },
        });
        MonSQLize.Model.define('ver_items', {
            schema: (dsl: any) => dsl({}),
            options: { version: true },
        });
        MonSQLize.Model.define('pipeline_ts_items', {
            schema: (dsl: any) => dsl({}),
            options: { timestamps: true },
        });

        runtime = new MonSQLize({
            type: 'mongodb',
            databaseName: 'test_model_softdelete_v',
            config: { uri },
        });
        await runtime.connect();
    });

    after(async () => {
        if (runtime) await runtime.close();
        await bootstrap.teardown();
    });

    beforeEach(async () => {
        const db = runtime._adapter.db;
        await Promise.all([
            db.collection('sd_docs').deleteMany({}),
            db.collection('sd_bool').deleteMany({}),
            db.collection('ver_items').deleteMany({}),
            db.collection('pipeline_ts_items').deleteMany({}),
        ]);
    });

    // ── config resolution ─────────────────────────────────────────────────────

    describe('softDelete config resolution', () => {
        it('softDelete: true → default config (field=deletedAt, type=timestamp, ttl=null)', () => {
            const model = runtime.model('sd_docs');
            assert.deepEqual(model.softDeleteConfig, {
                enabled: true,
                field: 'deletedAt',
                type: 'timestamp',
                ttl: null,
            });
        });

        it('softDelete: { field, type, ttl } → custom config', () => {
            const model = runtime.model('sd_bool');
            assert.deepEqual(model.softDeleteConfig, {
                enabled: true,
                field: 'removedAt',
                type: 'boolean',
                ttl: 7200,
            });
        });

        it('no softDelete option → softDeleteConfig is null', () => {
            const model = runtime.model('ver_items');
            assert.equal(model.softDeleteConfig, null);
        });
    });

    // ── deleteOne soft-marks document ─────────────────────────────────────────

    describe('deleteOne behavior', () => {
        it('sets deletedAt on the document instead of removing it', async () => {
            const model = runtime.model('sd_docs');
            await model.insertOne({ name: 'alice' });
            await model.deleteOne({ name: 'alice' });

            const db = runtime._adapter.db;
            const raw = await db.collection('sd_docs').findOne({ name: 'alice' });
            assert.ok(raw !== null, 'document should remain in DB');
            assert.ok(raw.deletedAt instanceof Date, 'deletedAt should be a Date');
        });

        it('find() excludes soft-deleted documents', async () => {
            const model = runtime.model('sd_docs');
            await model.insertOne({ name: 'bob' });
            await model.insertOne({ name: 'carol' });
            await model.deleteOne({ name: 'bob' });

            const docs = await model.find({});
            assert.equal(docs.length, 1);
            assert.equal(docs[0].name, 'carol');
        });

        it('count() excludes soft-deleted documents', async () => {
            const model = runtime.model('sd_docs');
            await model.insertOne({ name: 'dave' });
            await model.insertOne({ name: 'eve' });
            await model.deleteOne({ name: 'dave' });

            assert.equal(await model.count({}), 1);
        });

        it('all standard read paths exclude soft-deleted documents by default', async () => {
            const model = runtime.model('sd_docs');
            const deleted = await model.insertOne({ name: 'soft-gone', group: 'read-paths' });
            const active = await model.insertOne({ name: 'soft-live', group: 'read-paths' });
            await model.deleteOne({ _id: deleted.insertedId });

            assert.equal(await model.findOneById(deleted.insertedId), null);
            assert.equal((await model.findOneById(deleted.insertedId, { withDeleted: true })).name, 'soft-gone');

            const byIds = await model.findByIds([deleted.insertedId, active.insertedId]);
            assert.deepEqual(byIds.map((doc: any) => doc.name), ['soft-live']);

            const page = await model.findPage({ query: { group: 'read-paths' }, sort: { name: 1 }, limit: 10 });
            assert.deepEqual(page.items.map((doc: any) => doc.name), ['soft-live']);

            assert.deepEqual(await model.distinct('name', { group: 'read-paths' }), ['soft-live']);

            const aggregateRows = await model.aggregate([
                { $match: { group: 'read-paths' } },
                { $group: { _id: null, names: { $push: '$name' } } },
            ]);
            assert.deepEqual(aggregateRows[0].names, ['soft-live']);

            const streamed: string[] = [];
            await new Promise<void>((resolve, reject) => {
                model.stream({ group: 'read-paths' })
                    .on('data', (doc: any) => streamed.push(doc.name))
                    .on('error', reject)
                    .on('end', resolve);
            });
            assert.deepEqual(streamed, ['soft-live']);
        });

        it('boolean type sets field to true instead of a Date', async () => {
            const model = runtime.model('sd_bool');
            await model.insertOne({ name: 'frank' });
            await model.deleteOne({ name: 'frank' });

            const db = runtime._adapter.db;
            const raw = await db.collection('sd_bool').findOne({ name: 'frank' });
            assert.equal(raw?.removedAt, true);
        });
    });

    // ── findWithDeleted / findOnlyDeleted ─────────────────────────────────────

    describe('findWithDeleted / findOnlyDeleted', () => {
        it('findWithDeleted includes both active and soft-deleted documents', async () => {
            const model = runtime.model('sd_docs');
            await model.insertOne({ name: 'grace' });
            await model.insertOne({ name: 'hank' });
            await model.deleteOne({ name: 'grace' });

            const docs = await model.findWithDeleted({});
            assert.equal(docs.length, 2);
        });

        it('findOnlyDeleted returns only soft-deleted documents', async () => {
            const model = runtime.model('sd_docs');
            await model.insertOne({ name: 'iris' });
            await model.insertOne({ name: 'jack' });
            await model.deleteOne({ name: 'iris' });

            const docs = await model.findOnlyDeleted({});
            assert.equal(docs.length, 1);
            assert.equal(docs[0].name, 'iris');
        });

        it('countWithDeleted includes soft-deleted documents', async () => {
            const model = runtime.model('sd_docs');
            await model.insertOne({ name: 'kate' });
            await model.insertOne({ name: 'leo' });
            await model.deleteOne({ name: 'kate' });

            assert.equal(await model.countWithDeleted({}), 2);
        });

        it('countOnlyDeleted returns count of soft-deleted documents only', async () => {
            const model = runtime.model('sd_docs');
            await model.insertOne({ name: 'mia' });
            await model.insertOne({ name: 'nora' });
            await model.deleteOne({ name: 'mia' });

            assert.equal(await model.countOnlyDeleted({}), 1);
        });
    });

    // ── restore ───────────────────────────────────────────────────────────────

    describe('restore()', () => {
        it('restore() un-marks a soft-deleted document', async () => {
            const model = runtime.model('sd_docs');
            await model.insertOne({ name: 'oliver' });
            await model.deleteOne({ name: 'oliver' });
            assert.equal((await model.find({})).length, 0);

            await model.restore({ name: 'oliver' });
            const docs = await model.find({});
            assert.equal(docs.length, 1);
            assert.equal(docs[0].name, 'oliver');
        });

        it('restoreMany() un-marks multiple soft-deleted documents', async () => {
            const model = runtime.model('sd_docs');
            await model.insertOne({ tag: 'batch', name: 'penny' });
            await model.insertOne({ tag: 'batch', name: 'quinn' });
            await model.deleteOne({ name: 'penny' });
            await model.deleteOne({ name: 'quinn' });
            assert.equal((await model.find({ tag: 'batch' })).length, 0);

            await model.restoreMany({ tag: 'batch' });
            assert.equal((await model.find({ tag: 'batch' })).length, 2);
        });
    });

    // ── forceDelete ───────────────────────────────────────────────────────────

    describe('forceDelete()', () => {
        it('permanently removes document from the database', async () => {
            const model = runtime.model('sd_docs');
            await model.insertOne({ name: 'rose' });
            await model.forceDelete({ name: 'rose' });

            const db = runtime._adapter.db;
            const raw = await db.collection('sd_docs').findOne({ name: 'rose' });
            assert.equal(raw, null);
        });

        it('forceDeleteMany() permanently removes multiple documents', async () => {
            const model = runtime.model('sd_docs');
            await model.insertOne({ tag: 'purge', name: 'sam' });
            await model.insertOne({ tag: 'purge', name: 'tara' });
            await model.forceDeleteMany({ tag: 'purge' });

            const db = runtime._adapter.db;
            const count = await db.collection('sd_docs').countDocuments({ tag: 'purge' });
            assert.equal(count, 0);
        });
    });

    // ── version increment ─────────────────────────────────────────────────────

    describe('version increment', () => {
        it('insertOne sets version to 0', async () => {
            const model = runtime.model('ver_items');
            const result = await model.insertOne({ name: 'uma' });
            const doc = await model.findOneById(result.insertedId);
            assert.equal(doc.version, 0);
        });

        it('updateOne increments version by 1', async () => {
            const model = runtime.model('ver_items');
            const result = await model.insertOne({ name: 'victor' });
            await model.updateOne({ _id: result.insertedId, version: 0 }, { $set: { x: 1 } });
            const doc = await model.findOneById(result.insertedId);
            assert.equal(doc.version, 1);
        });

        it('multiple updates increment version cumulatively', async () => {
            const model = runtime.model('ver_items');
            const result = await model.insertOne({ name: 'wendy' });
            await model.updateOne({ _id: result.insertedId, version: 0 }, { $set: { x: 1 } });
            await model.updateOne({ _id: result.insertedId, version: 1 }, { $set: { x: 2 } });
            const doc = await model.findOneById(result.insertedId);
            assert.equal(doc.version, 2);
        });

        it('updateOne rejects stale expected versions', async () => {
            const model = runtime.model('ver_items');
            const result = await model.insertOne({ name: 'stale' });
            await model.updateOne({ _id: result.insertedId, version: 0 }, { $set: { x: 1 } });
            await assert.rejects(
                () => model.updateOne({ _id: result.insertedId, version: 0 }, { $set: { x: 2 } }),
                /optimistic lock conflict/i,
            );
        });

        it('findOneAndReplace enforces expected version and advances the replacement version', async () => {
            const model = runtime.model('ver_items');
            const result = await model.insertOne({ name: 'replace-occ' });

            await model.findOneAndReplace(
                { _id: result.insertedId },
                { name: 'replace-occ-next' },
                { expectedVersion: 0, returnDocument: 'after' },
            );

            const doc = await model.findOneById(result.insertedId);
            assert.equal(doc.name, 'replace-occ-next');
            assert.equal(doc.version, 1);
            await assert.rejects(
                () => model.findOneAndReplace(
                    { _id: result.insertedId },
                    { name: 'replace-occ-stale' },
                    { expectedVersion: 0 },
                ),
                /optimistic lock conflict/i,
            );
        });

        it('updateMany is rejected for versioned models', async () => {
            const model = runtime.model('ver_items');
            await assert.rejects(
                () => model.updateMany({}, { $set: { x: 1 } }),
                /single-document only/i,
            );
        });

        it('updateOne preserves pipeline updates while advancing version', async () => {
            const model = runtime.model('ver_items');
            const result = await model.insertOne({ name: 'pipeline-version', score: 1 });

            await model.updateOne(
                { _id: result.insertedId, version: 0 },
                [{ $set: { score: { $add: ['$score', 4] } } }],
            );

            const doc = await model.findOneById(result.insertedId);
            assert.equal(doc.score, 5);
            assert.equal(doc.version, 1);
        });
    });

    describe('pipeline update timestamps', () => {
        it('updateOne preserves pipeline updates while appending updatedAt', async () => {
            const model = runtime.model('pipeline_ts_items');
            const result = await model.insertOne({ name: 'pipeline-ts', score: 1 });

            await model.updateOne(
                { _id: result.insertedId },
                [{ $set: { score: { $add: ['$score', 2] } } }],
            );

            const doc = await model.findOneById(result.insertedId);
            assert.equal(doc.score, 3);
            assert.ok(doc.updatedAt instanceof Date);
        });

        it('upsertOne rejects pipeline updates instead of rewriting them into update documents', async () => {
            const model = runtime.model('pipeline_ts_items');

            await assert.rejects(
                () => model.upsertOne(
                    { name: 'pipeline-upsert' },
                    [{ $set: { score: 9 } }],
                ),
                /update must be a non-empty object/,
            );
        });
    });
});
