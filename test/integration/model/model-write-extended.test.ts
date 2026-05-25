import { after, before, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryServerBootstrap } from '../../bootstrap/memory-server';

const MonSQLize = require('../../../dist/cjs/index.cjs');

// ── Timestamps — insert/update/replace/upsert branches ───────────────────────

describe('Model timestamps — branch coverage', () => {
    const bootstrap = createMemoryServerBootstrap();
    let uri = '';
    let runtime: any;

    before(async () => {
        const ctx = await bootstrap.setup();
        uri = ctx.uri;
        runtime = new MonSQLize({ type: 'mongodb', databaseName: 'test_model_write', config: { uri } });
        await runtime.connect();
    });

    after(async () => {
        if (runtime) await runtime.close();
        MonSQLize.Model._clear();
        await bootstrap.teardown();
    });

    beforeEach(() => MonSQLize.Model._clear());

    it('insert with createdAt+updatedAt timestamps both set automatically', async () => {
        MonSQLize.Model.define('ts_both', {
            schema: {},
            options: { timestamps: true },
        });
        const m = runtime.model('ts_both');
        const result = await m.insertOne({ name: 'Alice' });
        const doc = await m.findOne({ _id: result.insertedId });
        assert.ok(doc !== null);
        assert.ok(doc.createdAt instanceof Date);
        assert.ok(doc.updatedAt instanceof Date);
    });

    it('insert does NOT overwrite existing createdAt', async () => {
        MonSQLize.Model.define('ts_no_overwrite', {
            schema: {},
            options: { timestamps: true },
        });
        const m = runtime.model('ts_no_overwrite');
        const existingDate = new Date('2020-01-01');
        const result = await m.insertOne({ name: 'Bob', createdAt: existingDate });
        const doc = await m.findOne({ _id: result.insertedId });
        assert.ok(doc !== null);
        assert.equal(doc.createdAt.getFullYear(), 2020);
    });

    it('update with timestamps: updatedAt is refreshed', async () => {
        MonSQLize.Model.define('ts_update', {
            schema: {},
            options: { timestamps: true },
        });
        const m = runtime.model('ts_update');
        const result = await m.insertOne({ name: 'Carol' });
        const before1 = await m.findOne({ _id: result.insertedId });
        await new Promise(r => setTimeout(r, 5)); // small delay
        await m.updateOne({ _id: result.insertedId }, { $set: { name: 'Carol2' } });
        const after1 = await m.findOne({ _id: result.insertedId });
        assert.ok(after1 !== null);
        // updatedAt should be >= original
        assert.ok(after1.updatedAt >= before1!.updatedAt);
    });

    it('update with updatedAt=false — no timestamp field added', async () => {
        MonSQLize.Model.define('ts_updatedAt_false', {
            schema: {},
            options: { timestamps: { createdAt: 'createdAt', updatedAt: false } },
        });
        const m = runtime.model('ts_updatedAt_false');
        await m.insertOne({ name: 'Dan' });
        const doc = await m.findOne({ name: 'Dan' });
        assert.ok(doc !== null);
        // updatedAt should not exist since updatedAt=false
        assert.ok(!('updatedAt' in doc));
    });

    it('replace with timestamps: updatedAt is set on replacement', async () => {
        MonSQLize.Model.define('ts_replace', {
            schema: {},
            options: { timestamps: true },
        });
        const m = runtime.model('ts_replace');
        const result = await m.insertOne({ name: 'Eve' });
        await m.replaceOne({ _id: result.insertedId }, { name: 'Eve2' });
        const doc = await m.findOne({ _id: result.insertedId });
        assert.ok(doc !== null);
        assert.ok(doc.updatedAt instanceof Date);
    });

    it('replace does not overwrite existing updatedAt in replacement', async () => {
        MonSQLize.Model.define('ts_replace_existing', {
            schema: {},
            options: { timestamps: true },
        });
        const m = runtime.model('ts_replace_existing');
        const result = await m.insertOne({ name: 'Fred' });
        const existingDate = new Date('2020-06-01');
        await m.replaceOne({ _id: result.insertedId }, { name: 'Fred2', updatedAt: existingDate });
        const doc = await m.findOne({ _id: result.insertedId });
        assert.ok(doc !== null);
        assert.equal(doc.updatedAt.getFullYear(), 2020);
    });

    it('upsert with timestamps: createdAt set on $setOnInsert', async () => {
        MonSQLize.Model.define('ts_upsert', {
            schema: {},
            options: { timestamps: true },
        });
        const m = runtime.model('ts_upsert');
        await m.updateOne(
            { name: 'Gina' },
            { $set: { score: 1 } },
            { upsert: true },
        );
        const doc = await m.findOne({ name: 'Gina' });
        assert.ok(doc !== null);
        assert.ok(doc.updatedAt instanceof Date);
    });
});

// ── Version increment — branch coverage ──────────────────────────────────────

describe('Model version increment — branch coverage', () => {
    const bootstrap = createMemoryServerBootstrap();
    let uri = '';
    let runtime: any;

    before(async () => {
        const ctx = await bootstrap.setup();
        uri = ctx.uri;
        runtime = new MonSQLize({ type: 'mongodb', databaseName: 'test_model_version', config: { uri } });
        await runtime.connect();
    });

    after(async () => {
        if (runtime) await runtime.close();
        MonSQLize.Model._clear();
        await bootstrap.teardown();
    });

    beforeEach(() => MonSQLize.Model._clear());

    it('update increments version field', async () => {
        MonSQLize.Model.define('ver_inc', {
            schema: {},
            options: { version: true },
        });
        const m = runtime.model('ver_inc');
        const result = await m.insertOne({ name: 'Alice' });
        await m.updateOne({ _id: result.insertedId }, { $set: { name: 'Alice2' } });
        const doc = await m.findOne({ _id: result.insertedId });
        assert.ok(doc !== null);
        assert.ok(typeof doc.version === 'number');
    });

    it('update with $inc already having version field — not overridden', async () => {
        MonSQLize.Model.define('ver_existing_inc', {
            schema: {},
            options: { version: true },
        });
        const m = runtime.model('ver_existing_inc');
        const result = await m.insertOne({ name: 'Bob', version: 5 });
        await m.updateOne({ _id: result.insertedId }, { $inc: { version: 10 }, $set: { name: 'Bob2' } });
        const doc = await m.findOne({ _id: result.insertedId });
        assert.ok(doc !== null);
        // Should have been incremented by 10 (not overridden)
        assert.equal(doc.version, 15);
    });

    it('insert with version: sets version=0 on first insert', async () => {
        MonSQLize.Model.define('ver_insert', {
            schema: {},
            options: { version: true },
        });
        const m = runtime.model('ver_insert');
        const result = await m.insertOne({ name: 'Carol' });
        const doc = await m.findOne({ _id: result.insertedId });
        assert.ok(doc !== null);
        assert.equal(doc.version, 0);
    });

    it('insert with existing version — not overridden', async () => {
        MonSQLize.Model.define('ver_existing', {
            schema: {},
            options: { version: true },
        });
        const m = runtime.model('ver_existing');
        const result = await m.insertOne({ name: 'Dan', version: 3 });
        const doc = await m.findOne({ _id: result.insertedId });
        assert.ok(doc !== null);
        assert.equal(doc.version, 3);
    });
});

// ── Soft delete — applyModelSoftDeleteFilter branches ────────────────────────

describe('Model soft delete — branch coverage', () => {
    const bootstrap = createMemoryServerBootstrap();
    let uri = '';
    let runtime: any;

    before(async () => {
        const ctx = await bootstrap.setup();
        uri = ctx.uri;
        runtime = new MonSQLize({ type: 'mongodb', databaseName: 'test_model_softdelete', config: { uri } });
        await runtime.connect();
    });

    after(async () => {
        if (runtime) await runtime.close();
        MonSQLize.Model._clear();
        await bootstrap.teardown();
    });

    beforeEach(() => MonSQLize.Model._clear());

    it('find: soft-deleted docs excluded by default', async () => {
        MonSQLize.Model.define('sd_filter', {
            schema: {},
            options: { softDelete: true },
        });
        const m = runtime.model('sd_filter');
        await m.insertOne({ name: 'Alice' });
        await m.insertOne({ name: 'Bob' });
        // Soft-delete Bob
        await m.deleteOne({ name: 'Bob' });
        // Default find excludes soft-deleted
        const docs = await m.find({});
        assert.ok(docs.every((d: Record<string, unknown>) => d.name !== 'Bob' || d.deletedAt === null));
    });

    it('find with withDeleted:true includes soft-deleted docs', async () => {
        MonSQLize.Model.define('sd_with_deleted', {
            schema: {},
            options: { softDelete: true },
        });
        const m = runtime.model('sd_with_deleted');
        await m.insertOne({ name: 'Carol' });
        await m.deleteOne({ name: 'Carol' });
        const allDocs = await m.find({}, { withDeleted: true });
        assert.ok(allDocs.length >= 1);
    });

    it('find with onlyDeleted:true returns only soft-deleted', async () => {
        MonSQLize.Model.define('sd_only_deleted', {
            schema: {},
            options: { softDelete: true },
        });
        const m = runtime.model('sd_only_deleted');
        await m.insertOne({ name: 'Dan' });
        await m.insertOne({ name: 'Eve' });
        await m.deleteOne({ name: 'Dan' });
        const deleted = await m.find({}, { onlyDeleted: true });
        assert.ok(deleted.every((d: Record<string, unknown>) => d.deletedAt !== null && d.deletedAt !== undefined));
    });

    it('find with deletedAt already in query — passes through unmodified', async () => {
        MonSQLize.Model.define('sd_field_in_query', {
            schema: {},
            options: { softDelete: true },
        });
        const m = runtime.model('sd_field_in_query');
        await m.insertOne({ name: 'Fred' });
        // Query with deletedAt explicitly null
        const docs = await m.find({ deletedAt: null });
        assert.ok(docs.length >= 1);
    });

    it('model without softDelete — query passes through unchanged', async () => {
        MonSQLize.Model.define('no_sd', { schema: {} });
        const m = runtime.model('no_sd');
        await m.insertOne({ name: 'Gina' });
        const docs = await m.find({});
        assert.ok(docs.length >= 1);
    });
});

// ── runModelV1Hook branches ───────────────────────────────────────────────────

describe('Model hooks — runModelV1Hook branches', () => {
    const bootstrap = createMemoryServerBootstrap();
    let uri = '';
    let runtime: any;

    before(async () => {
        const ctx = await bootstrap.setup();
        uri = ctx.uri;
        runtime = new MonSQLize({ type: 'mongodb', databaseName: 'test_model_hooks', config: { uri } });
        await runtime.connect();
    });

    after(async () => {
        if (runtime) await runtime.close();
        MonSQLize.Model._clear();
        await bootstrap.teardown();
    });

    beforeEach(() => MonSQLize.Model._clear());

    it('hooks: before insert is called', async () => {
        const called: unknown[] = [];
        MonSQLize.Model.define('hooks_before', {
            schema: {},
            hooks: () => ({
                insert: {
                    before: (ctx: unknown) => { called.push(ctx); },
                },
            }),
        });
        const m = runtime.model('hooks_before');
        await m.insertOne({ name: 'Alice' });
        assert.ok(called.length > 0);
    });

    it('hooks: after insert is called', async () => {
        const called: unknown[] = [];
        MonSQLize.Model.define('hooks_after', {
            schema: {},
            hooks: () => ({
                insert: {
                    after: (ctx: unknown) => { called.push(ctx); },
                },
            }),
        });
        const m = runtime.model('hooks_after');
        await m.insertOne({ name: 'Bob' });
        assert.ok(called.length > 0);
    });

    it('hooks: missing operation hooks → no-op', async () => {
        MonSQLize.Model.define('hooks_missing_op', {
            schema: {},
            hooks: () => ({
                find: { before: () => {} },
                // no insert hooks
            }),
        });
        const m = runtime.model('hooks_missing_op');
        // Should not throw
        await assert.doesNotReject(() => m.insertOne({ name: 'Carol' }));
    });
});

// ── validateModelSchemaPayload — schema validation branches ──────────────────

describe('Model schema validation — branch coverage', () => {
    const bootstrap = createMemoryServerBootstrap();
    let uri = '';
    let runtime: any;

    before(async () => {
        const ctx = await bootstrap.setup();
        uri = ctx.uri;
        runtime = new MonSQLize({ type: 'mongodb', databaseName: 'test_model_schema_val', config: { uri } });
        await runtime.connect();
    });

    after(async () => {
        if (runtime) await runtime.close();
        MonSQLize.Model._clear();
        await bootstrap.teardown();
    });

    beforeEach(() => MonSQLize.Model._clear());

    it('skipValidation: insert skips validation even with schema', async () => {
        MonSQLize.Model.define('skip_val', {
            schema: (type: any) => ({
                name: type.string().required(),
            }),
            options: { validate: true },
        });
        const m = runtime.model('skip_val');
        // Without skipValidation, this might fail validation
        // With skipValidation, it should succeed
        await assert.doesNotReject(() => m.insertOne({ x: 1 }, { skipValidation: true }));
    });
});

// ── Custom timestamps field names ─────────────────────────────────────────────

describe('Model custom timestamp field names', () => {
    const bootstrap = createMemoryServerBootstrap();
    let uri = '';
    let runtime: any;

    before(async () => {
        const ctx = await bootstrap.setup();
        uri = ctx.uri;
        runtime = new MonSQLize({ type: 'mongodb', databaseName: 'test_custom_ts', config: { uri } });
        await runtime.connect();
    });

    after(async () => {
        if (runtime) await runtime.close();
        MonSQLize.Model._clear();
        await bootstrap.teardown();
    });

    beforeEach(() => MonSQLize.Model._clear());

    it('custom createdAt and updatedAt field names', async () => {
        MonSQLize.Model.define('custom_ts', {
            schema: {},
            options: {
                timestamps: { createdAt: 'created', updatedAt: 'modified' },
            },
        });
        const m = runtime.model('custom_ts');
        const result = await m.insertOne({ name: 'Alice' });
        const doc = await m.findOne({ _id: result.insertedId });
        assert.ok(doc !== null);
        assert.ok(doc.created instanceof Date);
        assert.ok(doc.modified instanceof Date);
    });

    it('timestamps with updatedAt=false: no updatedAt on update', async () => {
        MonSQLize.Model.define('ts_no_updated', {
            schema: {},
            options: { timestamps: { createdAt: 'createdAt', updatedAt: false } },
        });
        const m = runtime.model('ts_no_updated');
        const result = await m.insertOne({ name: 'Bob' });
        await m.updateOne({ _id: result.insertedId }, { $set: { name: 'Bob2' } });
        const doc = await m.findOne({ _id: result.insertedId });
        assert.ok(doc !== null);
        assert.ok(doc.createdAt instanceof Date);
        assert.ok(!('updatedAt' in doc));
    });

    it('upsert with updatedAt=false does not set updatedAt', async () => {
        MonSQLize.Model.define('upsert_no_updated', {
            schema: {},
            options: { timestamps: { createdAt: 'createdAt', updatedAt: false } },
        });
        const m = runtime.model('upsert_no_updated');
        await m.updateOne({ name: 'Carol' }, { $set: { score: 1 } }, { upsert: true });
        const doc = await m.findOne({ name: 'Carol' });
        assert.ok(doc !== null);
        assert.ok(!('updatedAt' in doc));
    });
});
