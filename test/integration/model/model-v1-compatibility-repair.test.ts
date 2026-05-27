import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { createMemoryServerBootstrap } from '../../bootstrap/memory-server';

const MonSQLize = require('../../../dist/cjs/index.cjs');
const { Model } = MonSQLize;
const { dsl } = require('schema-dsl');

function defineModel(name: string, options: Record<string, unknown> = {}) {
    try {
        Model.define(name, { collection: name.toLowerCase(), ...options });
    } catch {
        // Model registry is process-wide; repeated test builds can reuse names.
    }
}

describe('model — v1 compatibility repair coverage', () => {
    const bootstrap = createMemoryServerBootstrap();
    let runtime: any;

    before(async () => {
        const { uri } = await bootstrap.setup();
        Model.clear?.();
        runtime = new MonSQLize({ type: 'mongodb', databaseName: 'test_model_v1_compat', config: { uri } });
        await runtime.connect();
    });

    after(async () => {
        if (runtime) await runtime.close();
        await bootstrap.teardown();
        Model.clear?.();
    });

    it('validates direct schema object definitions and returns validation data', async () => {
        defineModel('CompatObjectSchemaModel', {
            schema: dsl({ name: 'string!' }),
        });
        const model = runtime.model('CompatObjectSchemaModel');

        await assert.rejects(() => model.insertOne({}), /Schema validation failed/);

        const validation = model.validate({ name: 'Ada' });
        assert.equal(validation.valid, true);
        assert.deepEqual(validation.data, { name: 'Ada' });
    });

    it('returns data for validate() when no schema is configured', async () => {
        defineModel('CompatNoSchemaValidateModel', {
            schema: () => undefined,
        });
        const model = runtime.model('CompatNoSchemaValidateModel');

        assert.deepEqual(model.validate({ loose: true }), {
            valid: true,
            errors: [],
            data: { loose: true },
        });
    });

    it('lets operation-level validate:true override model validate:false', async () => {
        defineModel('CompatValidateOverrideModel', {
            schema: dsl({ name: 'string!' }),
            options: { validate: false },
        });
        const model = runtime.model('CompatValidateOverrideModel');

        await model.insertOne({});
        await assert.rejects(() => model.insertOne({}, { validate: true }), /Schema validation failed/);
    });

    it('accepts populate arrays in v1 top-level form', async () => {
        defineModel('CompatPopulatePost', {
            schema: dsl({ owner: 'string!', title: 'string!' }),
        });
        defineModel('CompatPopulateUser', {
            schema: dsl({ name: 'string!' }),
            relations: {
                posts: {
                    from: 'CompatPopulatePost',
                    localField: 'name',
                    foreignField: 'owner',
                },
            },
        });
        const users = runtime.model('CompatPopulateUser');
        const posts = runtime.model('CompatPopulatePost');

        await users.insertOne({ name: 'ada' });
        await posts.insertOne({ owner: 'ada', title: 'notes' });

        const result = await users.find({ name: 'ada' }).populate(['posts']);
        assert.equal(result.length, 1);
        assert.equal(result[0].posts.length, 1);
        assert.equal(result[0].posts[0].title, 'notes');

        assert.throws(() => users.find({}).populate([123 as any]), /populate param must be a string, array, or object/);
    });

    it('exposes selected v1 collection proxy methods on Model instances', async () => {
        defineModel('CompatDelegateModel', {
            schema: dsl({ tag: 'string' }),
        });
        const model = runtime.model('CompatDelegateModel');
        const methodNames = [
            'deleteBatch',
            'stream',
            'explain',
            'prewarmBookmarks',
            'listBookmarks',
            'clearBookmarks',
            'invalidate',
            'dropCollection',
            'createCollection',
            'createView',
            'setValidator',
            'getValidator',
            'stats',
            'renameCollection',
            'collMod',
            'convertToCapped',
            'indexStats',
        ];

        for (const methodName of methodNames) {
            assert.equal(typeof model[methodName], 'function', methodName);
        }
    });

    it('delegates selected v1 collection proxy methods through the Model facade', async () => {
        defineModel('CompatDelegateExecutionModel', {
            schema: dsl({ tag: 'string' }),
        });
        const model = runtime.model('CompatDelegateExecutionModel');
        const called: string[] = [];
        model.extendedCollection = () => ({
            deleteBatch: async () => { called.push('deleteBatch'); return { acknowledged: true, deletedCount: 0 }; },
            prewarmBookmarks: async () => { called.push('prewarmBookmarks'); return { warmed: 0, pages: [] }; },
            listBookmarks: async () => { called.push('listBookmarks'); return { bookmarks: [] }; },
            clearBookmarks: async () => { called.push('clearBookmarks'); return { cleared: 0 }; },
            stream: () => { called.push('stream'); return Readable.from([]); },
            explain: async () => { called.push('explain'); return { ok: 1 }; },
            invalidate: async () => { called.push('invalidate'); return 1; },
            dropCollection: async () => { called.push('dropCollection'); return true; },
            createCollection: async () => { called.push('createCollection'); return true; },
            createView: async () => { called.push('createView'); return true; },
            indexStats: async () => { called.push('indexStats'); return []; },
            setValidator: async () => { called.push('setValidator'); return { ok: 1, collection: 'compatdelegateexecutionmodel' }; },
            setValidationLevel: async () => { called.push('setValidationLevel'); return { ok: 1, validationLevel: 'moderate' }; },
            setValidationAction: async () => { called.push('setValidationAction'); return { ok: 1, validationAction: 'warn' }; },
            getValidator: async () => { called.push('getValidator'); return { validator: null, validationLevel: 'strict', validationAction: 'error' }; },
            stats: async () => { called.push('stats'); return { ns: 'db.compat', count: 0, size: 0, storageSize: 0, totalIndexSize: 0, nindexes: 0 }; },
            renameCollection: async () => { called.push('renameCollection'); return { renamed: true, from: 'old', to: 'new' }; },
            collMod: async () => { called.push('collMod'); return { ok: 1 }; },
            convertToCapped: async () => { called.push('convertToCapped'); return { ok: 1, collection: 'compatdelegateexecutionmodel', capped: true, size: 1024 }; },
        });

        await model.deleteBatch({ missing: true });
        await model.prewarmBookmarks({ limit: 1 }, [1]);
        await model.listBookmarks({ limit: 1 });
        await model.clearBookmarks({ limit: 1 });
        model.stream({});
        await model.explain({});
        await model.invalidate('find');
        await model.dropCollection();
        await model.createCollection('compat_delegate_execution_model');
        await model.createView('compat_delegate_view', 'compat_delegate_execution_model', []);
        await model.indexStats();
        await model.setValidator({ $jsonSchema: { bsonType: 'object' } });
        await model.setValidationLevel('moderate');
        await model.setValidationAction('warn');
        await model.getValidator();
        await model.stats({ scale: 1 });
        await model.renameCollection('renamed', { dropTarget: true });
        await model.collMod({ validationLevel: 'moderate' });
        await model.convertToCapped(1024, { max: 10 });

        assert.deepEqual(called, [
            'deleteBatch',
            'prewarmBookmarks',
            'listBookmarks',
            'clearBookmarks',
            'stream',
            'explain',
            'invalidate',
            'dropCollection',
            'createCollection',
            'createView',
            'indexStats',
            'setValidator',
            'setValidationLevel',
            'setValidationAction',
            'getValidator',
            'stats',
            'renameCollection',
            'collMod',
            'convertToCapped',
        ]);
    });

    it('runs v1 find hooks for additional query methods', async () => {
        const calls: Array<{ phase: string; marker: string }> = [];
        defineModel('CompatHookCoverageModel', {
            schema: dsl({ tag: 'string!' }),
            hooks: () => ({
                find: {
                    before(context: Record<string, unknown>, firstArg: unknown) {
                        calls.push({ phase: 'before', marker: Array.isArray(firstArg) ? 'array' : typeof firstArg });
                    },
                    after(context: Record<string, unknown>, result: unknown) {
                        calls.push({ phase: 'after', marker: Array.isArray(result) ? 'array' : typeof result });
                        return result;
                    },
                },
            }),
        });
        const model = runtime.model('CompatHookCoverageModel');
        await model.insertMany([{ tag: 'a' }, { tag: 'b' }]);
        const first = await model.findOne({ tag: 'a' });

        await model.count({});
        await model.aggregate([{ $match: {} }]);
        await model.distinct('tag');
        await model.findOneById(first._id);
        await model.findByIds([first._id]);
        await model.findPage({ page: 1, limit: 1 });
        await model.findAndCount({});

        const beforeCalls = calls.filter((call) => call.phase === 'before');
        const afterCalls = calls.filter((call) => call.phase === 'after');
        assert.ok(beforeCalls.length >= 8);
        assert.ok(afterCalls.length >= 8);
    });
});
