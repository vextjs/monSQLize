import { after, before, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryServerBootstrap } from '../../bootstrap/memory-server';

const MonSQLize = require('../../../dist/cjs/index.cjs');

describe('ModelInstance — helper branches coverage', () => {
    const bootstrap = createMemoryServerBootstrap();
    let uri = '';
    let runtime: any;

    before(async () => {
        const ctx = await bootstrap.setup();
        uri = ctx.uri;
    });

    after(async () => {
        if (runtime) await runtime.close();
        MonSQLize.Model._clear();
        await bootstrap.teardown();
    });

    // ─────────────────────────────────────────────────────────────────────────
    // populateModelPath — empty docs, undefined relation, empty keys
    // ─────────────────────────────────────────────────────────────────────────

    describe('populateModelPath branches', () => {
        before(async () => {
            MonSQLize.Model._clear();
            MonSQLize.Model.define('orders', {
                schema: {},
                relations: {
                    customer: { from: 'customers', localField: 'customerId', foreignField: '_id', single: true },
                    tags: { from: 'tagsCol', localField: 'tagIds', foreignField: '_id', single: false },
                },
            });
            MonSQLize.Model.define('customers', { schema: {} });
            MonSQLize.Model.define('tagsCol', { schema: {} });
            runtime = new MonSQLize({ type: 'mongodb', databaseName: 'test_model_instance', config: { uri } });
            await runtime.connect();
        });

        beforeEach(async () => {
            const db = runtime._adapter.db;
            await db.collection('orders').deleteMany({});
            await db.collection('customers').deleteMany({});
            await db.collection('tagsCol').deleteMany({});
        });

        it('populate on empty result set returns empty array without error', async () => {
            const orderModel = runtime.model('orders');
            const result = await orderModel.find({ _noMatch: true }).populate('customer');
            assert.deepEqual(result, []);
        });

        it('populate with undefined relation throws INVALID_ARGUMENT', async () => {
            const orderModel = runtime.model('orders');
            await orderModel.insertOne({ name: 'O1', customerId: null });
            await assert.rejects(
                () => orderModel.find({}).populate('nonExistentRelation'),
                (e: unknown) => (e as { code?: string }).code === 'INVALID_ARGUMENT',
            );
        });

        it('populate when all localField values are null sets path to null for single', async () => {
            const orderModel = runtime.model('orders');
            await orderModel.insertOne({ name: 'O1', customerId: null });
            const result = await orderModel.find({}).populate('customer');
            assert.equal(result.length, 1);
            assert.equal(result[0].customer, null);
        });

        it('populate when all localField values are null sets path to [] for multi', async () => {
            const orderModel = runtime.model('orders');
            await orderModel.insertOne({ name: 'O1', tagIds: null });
            const result = await orderModel.find({}).populate('tags');
            assert.equal(result.length, 1);
            assert.deepEqual(result[0].tags, []);
        });

        it('populate with sort config sorts related docs', async () => {
            const customerModel = runtime.model('customers');
            const ins = await customerModel.insertOne({ name: 'Alice' });
            const db = runtime._adapter.db;
            await db.collection('tagsCol').insertMany([
                { _id: undefined, orderId: ins.insertedId, name: 'B', seq: 2 },
                { _id: undefined, orderId: ins.insertedId, name: 'A', seq: 1 },
            ]);
            // Build a model that has tags referenced by orderId
            MonSQLize.Model._clear();
            MonSQLize.Model.define('orders2', {
                schema: {},
                relations: {
                    tags: { from: 'tagsCol2', localField: '_id', foreignField: 'orderId', single: false },
                },
            });
            MonSQLize.Model.define('tagsCol2', { schema: {} });
            const r2 = new MonSQLize({ type: 'mongodb', databaseName: 'test_model_instance', config: { uri } });
            await r2.connect();
            const col2 = r2._adapter.db.collection('tagsCol2');
            const orderInsert = await r2._adapter.db.collection('orders2').insertOne({ name: 'X' });
            await col2.insertMany([
                { orderId: orderInsert.insertedId, name: 'B', seq: 2 },
                { orderId: orderInsert.insertedId, name: 'A', seq: 1 },
            ]);
            const orderModel2 = r2.model('orders2');
            const result = await orderModel2.find({}).populate({ path: 'tags', sort: { seq: 1 } });
            assert.equal(result.length, 1);
            assert.equal(result[0].tags.length, 2);
            assert.equal(result[0].tags[0].seq, 1);
            await r2.close();
        });

        it('populate with skip and limit applies slicing', async () => {
            MonSQLize.Model._clear();
            MonSQLize.Model.define('orders3', {
                schema: {},
                relations: {
                    items: { from: 'items3', localField: '_id', foreignField: 'orderId', single: false },
                },
            });
            MonSQLize.Model.define('items3', { schema: {} });
            const r3 = new MonSQLize({ type: 'mongodb', databaseName: 'test_model_instance', config: { uri } });
            await r3.connect();
            const insertedOrder = await r3._adapter.db.collection('orders3').insertOne({ name: 'O3' });
            await r3._adapter.db.collection('items3').insertMany([
                { orderId: insertedOrder.insertedId, n: 1 },
                { orderId: insertedOrder.insertedId, n: 2 },
                { orderId: insertedOrder.insertedId, n: 3 },
                { orderId: insertedOrder.insertedId, n: 4 },
            ]);
            const m3 = r3.model('orders3');
            const result = await m3.find({}).populate({ path: 'items', skip: 1, limit: 2 });
            assert.equal(result.length, 1);
            assert.equal(result[0].items.length, 2);
            await r3.close();
        });

        it('populate with select omits unselected fields', async () => {
            MonSQLize.Model._clear();
            MonSQLize.Model.define('orders4', {
                schema: {},
                relations: {
                    items: { from: 'items4', localField: '_id', foreignField: 'orderId', single: false },
                },
            });
            MonSQLize.Model.define('items4', { schema: {} });
            const r4 = new MonSQLize({ type: 'mongodb', databaseName: 'test_model_instance', config: { uri } });
            await r4.connect();
            const insertedOrder = await r4._adapter.db.collection('orders4').insertOne({ name: 'O4' });
            await r4._adapter.db.collection('items4').insertOne({
                orderId: insertedOrder.insertedId, name: 'Item1', secret: 'hidden',
            });
            const m4 = r4.model('orders4');
            const result = await m4.find({}).populate({ path: 'items', select: ['name'] });
            assert.equal(result.length, 1);
            const item = result[0].items[0];
            assert.ok('name' in item);
            assert.ok(!('secret' in item));
            await r4.close();
        });
    });

    // ─────────────────────────────────────────────────────────────────────────
    // hydrateModelDocument — null doc, virtual setter, methods
    // ─────────────────────────────────────────────────────────────────────────

    describe('hydrateModelDocument branches', () => {
        before(() => {
            MonSQLize.Model._clear();
        });

        it('hydrateDocuments filters out null/undefined docs', async () => {
            MonSQLize.Model.define('hydtest', { schema: {} });
            const r = new MonSQLize({ type: 'mongodb', databaseName: 'test_model_instance', config: { uri } });
            await r.connect();
            const m = r.model('hydtest');
            // hydrateDocuments is exposed on model
            const result = m.hydrateDocuments([null, undefined, { name: 'ok' }]);
            assert.equal(result.length, 1);
            assert.equal(result[0].name, 'ok');
            await r.close();
        });

        it('virtual with setter: set invokes setter function', async () => {
            MonSQLize.Model._clear();
            MonSQLize.Model.define('virtual_test', {
                schema: {},
                virtuals: {
                    displayName: {
                        get() { return (this as any)._displayName || ''; },
                        set(value: string) { (this as any)._displayName = value.toUpperCase(); },
                    },
                },
            });
            const r = new MonSQLize({ type: 'mongodb', databaseName: 'test_model_instance', config: { uri } });
            await r.connect();
            const db = r._adapter.db;
            await db.collection('virtual_test').insertOne({ _displayName: 'test' });
            const m = r.model('virtual_test');
            const docs = await m.find({});
            assert.equal(docs.length, 1);
            // Trigger the setter via the virtual property
            docs[0].displayName = 'hello';
            assert.equal((docs[0] as any)._displayName, 'HELLO');
            await r.close();
        });

        it('model with object-form methods attaches methods to hydrated doc', async () => {
            MonSQLize.Model._clear();
            MonSQLize.Model.define('methods_test', {
                schema: {},
                methods: {
                    greet() { return `Hello, ${(this as any).name}`; },
                },
            });
            const r = new MonSQLize({ type: 'mongodb', databaseName: 'test_model_instance', config: { uri } });
            await r.connect();
            const db = r._adapter.db;
            await db.collection('methods_test').insertOne({ name: 'World' });
            const m = r.model('methods_test');
            const docs = await m.find({});
            assert.equal(docs.length, 1);
            assert.equal(typeof docs[0].greet, 'function');
            assert.equal(docs[0].greet(), 'Hello, World');
            await r.close();
        });
    });

    // ─────────────────────────────────────────────────────────────────────────
    // validateModelDocument — schemaError path, no cache path
    // ─────────────────────────────────────────────────────────────────────────

    describe('validateModelDocument branches', () => {
        it('validate() returns valid=true when no schema cache', async () => {
            MonSQLize.Model._clear();
            MonSQLize.Model.define('noschema_model', { schema: {} });
            const r = new MonSQLize({ type: 'mongodb', databaseName: 'test_model_instance', config: { uri } });
            await r.connect();
            const db = r._adapter.db;
            await db.collection('noschema_model').insertOne({ x: 1 });
            const m = r.model('noschema_model');
            const docs = await m.find({});
            const validation = await docs[0].validate();
            assert.equal(validation.valid, true);
            assert.deepEqual(validation.errors, []);
            await r.close();
        });

        it('validate() returns valid=false when model has schema error', async () => {
            MonSQLize.Model._clear();
            // Inject a model with a forced schemaError via defining with a schema function
            // that throws a schema compile error on first use
            MonSQLize.Model.define('schema_err_model', {
                schema: {},
            });
            const r = new MonSQLize({ type: 'mongodb', databaseName: 'test_model_instance', config: { uri } });
            await r.connect();
            const db = r._adapter.db;
            await db.collection('schema_err_model').insertOne({ x: 1 });
            const m = r.model('schema_err_model');
            // Inject a schema error directly
            (m as any)._schemaError = new Error('Schema compile failed');
            const docs = await m.find({});
            const validation = await docs[0].validate();
            assert.equal(validation.valid, false);
            assert.ok(validation.errors[0].message.includes('Schema validation failed'));
            await r.close();
        });
    });

    // ─────────────────────────────────────────────────────────────────────────
    // applyModelDefaults — function default branch
    // ─────────────────────────────────────────────────────────────────────────

    describe('applyModelDefaults — function default', () => {
        it('function default is called with context', async () => {
            MonSQLize.Model._clear();
            MonSQLize.Model.define('defaults_model', {
                schema: {},
                defaults: {
                    seq: (ctx: unknown, doc: Record<string, unknown>) => (doc?.base as number ?? 0) + 1,
                    status: 'active',
                },
            });
            const r = new MonSQLize({ type: 'mongodb', databaseName: 'test_model_instance', config: { uri } });
            await r.connect();
            const m = r.model('defaults_model');
            const result = await m.insertOne({ base: 10 });
            assert.ok(result.acknowledged);
            const doc = await m.findOne({ _id: result.insertedId });
            assert.ok(doc !== null);
            assert.equal(doc!.seq, 11);
            assert.equal(doc!.status, 'active');
            await r.close();
        });
    });

    // ─────────────────────────────────────────────────────────────────────────
    // saveModelDocument — insert (no _id) vs update (with _id)
    // ─────────────────────────────────────────────────────────────────────────

    describe('saveModelDocument — save() method', () => {
        it('doc.save() without _id inserts and attaches _id', async () => {
            MonSQLize.Model._clear();
            MonSQLize.Model.define('save_test', { schema: {} });
            const r = new MonSQLize({ type: 'mongodb', databaseName: 'test_model_instance', config: { uri } });
            await r.connect();
            const db = r._adapter.db;
            await db.collection('save_test').insertOne({ name: 'initial' });
            const m = r.model('save_test');
            const docs = await m.find({});
            const doc = docs[0];
            const id = doc._id;
            // Remove _id to simulate a new doc that doesn't have one
            delete (doc as Record<string, unknown>)._id;
            const saved = await doc.save();
            assert.ok((saved as Record<string, unknown>)._id !== undefined);
            await r.close();
        });

        it('doc.save() with _id does upsert/replace', async () => {
            MonSQLize.Model._clear();
            MonSQLize.Model.define('save_upsert', { schema: {} });
            const r = new MonSQLize({ type: 'mongodb', databaseName: 'test_model_instance', config: { uri } });
            await r.connect();
            const db = r._adapter.db;
            await db.collection('save_upsert').insertOne({ name: 'original' });
            const m = r.model('save_upsert');
            const docs = await m.find({});
            const doc = docs[0];
            (doc as Record<string, unknown>).name = 'updated';
            await doc.save();
            const reloaded = await m.findOne({ _id: doc._id });
            assert.equal(reloaded!.name, 'updated');
            await r.close();
        });

        it('doc.remove() without _id returns false', async () => {
            MonSQLize.Model._clear();
            MonSQLize.Model.define('remove_test', { schema: {} });
            const r = new MonSQLize({ type: 'mongodb', databaseName: 'test_model_instance', config: { uri } });
            await r.connect();
            const db = r._adapter.db;
            await db.collection('remove_test').insertOne({ name: 'x' });
            const m = r.model('remove_test');
            const docs = await m.find({});
            const doc = docs[0];
            delete (doc as Record<string, unknown>)._id;
            const result = await doc.remove();
            assert.equal(result, false);
            await r.close();
        });
    });

    // ─────────────────────────────────────────────────────────────────────────
    // toObject / toJSON — serialization
    // ─────────────────────────────────────────────────────────────────────────

    describe('toObject / toJSON on hydrated doc', () => {
        it('toObject() returns plain object', async () => {
            MonSQLize.Model._clear();
            MonSQLize.Model.define('serial_test', { schema: {} });
            const r = new MonSQLize({ type: 'mongodb', databaseName: 'test_model_instance', config: { uri } });
            await r.connect();
            const db = r._adapter.db;
            await db.collection('serial_test').insertOne({ name: 'Alice', age: 30 });
            const m = r.model('serial_test');
            const docs = await m.find({});
            const plain = docs[0].toObject();
            assert.equal(typeof plain, 'object');
            assert.equal((plain as any).name, 'Alice');
            await r.close();
        });
    });
});
