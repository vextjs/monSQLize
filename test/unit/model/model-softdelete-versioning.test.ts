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
            await model.updateOne({ _id: result.insertedId }, { $set: { x: 1 } });
            const doc = await model.findOneById(result.insertedId);
            assert.equal(doc.version, 1);
        });

        it('multiple updates increment version cumulatively', async () => {
            const model = runtime.model('ver_items');
            const result = await model.insertOne({ name: 'wendy' });
            await model.updateOne({ _id: result.insertedId }, { $set: { x: 1 } });
            await model.updateOne({ _id: result.insertedId }, { $set: { x: 2 } });
            const doc = await model.findOneById(result.insertedId);
            assert.equal(doc.version, 2);
        });
    });
});
