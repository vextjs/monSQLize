import { after, before, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ObjectId } from 'mongodb';
import { createMemoryServerBootstrap } from '../../bootstrap/memory-server';

const MonSQLize = require('../../../dist/cjs/index.cjs');

describe('insertOne() / insertMany()', () => {
    const bootstrap = createMemoryServerBootstrap();
    let uri = '';
    let runtime: any;
    let col: any;

    before(async () => {
        const ctx = await bootstrap.setup();
        uri = ctx.uri;
        runtime = new MonSQLize({
            type: 'mongodb',
            databaseName: 'test_insert',
            config: { uri },
        });
        await runtime.connect();
        col = runtime.collection('records');
    });

    after(async () => {
        if (runtime) await runtime.close();
        await bootstrap.teardown();
    });

    beforeEach(async () => {
        const db = runtime._adapter.db;
        await db.collection('records').deleteMany({});
    });

    // ── insertOne() ───────────────────────────────────────────────────────────

    describe('insertOne() basic results', () => {
        it('inserts a document and returns insertedId', async () => {
            const result = await col.insertOne({ name: 'Alice', age: 30 });
            assert.ok(result.acknowledged);
            assert.ok(result.insertedId instanceof ObjectId);
        });

        it('inserted document is retrievable by insertedId', async () => {
            const result = await col.insertOne({ name: 'Bob', role: 'admin' });
            const doc = await col.findOneById(result.insertedId);
            assert.ok(doc !== null);
            assert.equal(doc.name, 'Bob');
            assert.equal(doc.role, 'admin');
        });

        it('inserts document with explicit _id', async () => {
            const id = new ObjectId();
            const result = await col.insertOne({ _id: id, name: 'Carol' });
            assert.equal(String(result.insertedId), String(id));
        });

        it('inserts document with nested fields', async () => {
            const result = await col.insertOne({
                user: { name: 'Dave', age: 25 },
                tags: ['a', 'b'],
            });
            const doc = await col.findOneById(result.insertedId);
            assert.ok(doc !== null);
            assert.equal(doc.user.name, 'Dave');
            assert.deepEqual(doc.tags, ['a', 'b']);
        });

        it('inserts document without any fields (empty object)', async () => {
            const result = await col.insertOne({});
            assert.ok(result.acknowledged);
            assert.ok(result.insertedId instanceof ObjectId);
        });

        it('sequential inserts produce distinct insertedIds', async () => {
            const r1 = await col.insertOne({ n: 1 });
            const r2 = await col.insertOne({ n: 2 });
            assert.notEqual(String(r1.insertedId), String(r2.insertedId));
        });

        it('two independent collection counts match inserts', async () => {
            const db = runtime._adapter.db;
            await col.insertOne({ x: 1 });
            await col.insertOne({ x: 2 });
            const count = await db.collection('records').countDocuments({});
            assert.equal(count, 2);
        });
    });

    describe('insertOne() option pass-through', () => {
        it('comment option is accepted without error', async () => {
            const result = await col.insertOne({ name: 'Eve' }, { comment: 'test insert' });
            assert.ok(result.acknowledged);
        });
    });

    describe('insertOne() duplicate key error', () => {
        it('throws DUPLICATE_KEY on duplicate explicit _id', async () => {
            const id = new ObjectId();
            await col.insertOne({ _id: id, name: 'first' });
            await assert.rejects(
                () => col.insertOne({ _id: id, name: 'second' }),
                (err: any) => err.code === 'DUPLICATE_KEY' || err.code === 11000 || /duplicate/i.test(err.message),
            );
        });

        it('throws DUPLICATE_KEY on unique index violation', async () => {
            const db = runtime._adapter.db;
            await db.collection('records').createIndex({ name: 1 }, { unique: true });
            await col.insertOne({ name: 'unique-one' });
            await assert.rejects(
                () => col.insertOne({ name: 'unique-one' }),
                (err: any) => err.code === 'DUPLICATE_KEY' || /duplicate/i.test(err.message),
            );
            await db.collection('records').dropIndex('name_1');
        });
    });

    describe('insertOne() argument validation', () => {
        it('throws on null document', async () => {
            await assert.rejects(
                () => col.insertOne(null),
                (err: any) => err.code === 'DOCUMENT_REQUIRED' || /document/i.test(err.message),
            );
        });

        it('throws on undefined document', async () => {
            await assert.rejects(
                () => col.insertOne(undefined),
                (err: any) => err.code === 'DOCUMENT_REQUIRED' || /document/i.test(err.message),
            );
        });

        it('throws on array as document', async () => {
            await assert.rejects(
                () => col.insertOne([{ name: 'x' }]),
                (err: any) => err.code === 'DOCUMENT_REQUIRED' || /document/i.test(err.message),
            );
        });

        it('throws on primitive string as document', async () => {
            await assert.rejects(
                () => col.insertOne('not an object'),
                (err: any) => err.code === 'DOCUMENT_REQUIRED' || /document/i.test(err.message),
            );
        });
    });

    // ── insertMany() ──────────────────────────────────────────────────────────

    describe('insertMany() basic results', () => {
        it('inserts multiple documents and returns insertedCount', async () => {
            const docs = [{ n: 1 }, { n: 2 }, { n: 3 }];
            const result = await col.insertMany(docs);
            assert.ok(result.acknowledged);
            assert.equal(result.insertedCount, 3);
        });

        it('insertedIds contains one entry per document', async () => {
            const result = await col.insertMany([{ a: 1 }, { a: 2 }, { a: 3 }]);
            assert.equal(Object.keys(result.insertedIds).length, 3);
        });

        it('all inserted documents are retrievable', async () => {
            const docs = [{ tag: 'x' }, { tag: 'y' }, { tag: 'z' }];
            const result = await col.insertMany(docs);
            const ids = Object.values(result.insertedIds);
            const found = await col.findByIds(ids);
            assert.equal(found.length, 3);
            const tags = new Set(found.map((d: any) => d.tag));
            assert.ok(tags.has('x'));
            assert.ok(tags.has('y'));
            assert.ok(tags.has('z'));
        });

        it('inserts large batch of documents', async () => {
            const docs = Array.from({ length: 50 }, (_, i) => ({ n: i, value: i * 10 }));
            const result = await col.insertMany(docs);
            assert.equal(result.insertedCount, 50);
        });

        it('insertedIds are all distinct ObjectIds', async () => {
            const result = await col.insertMany([{ x: 1 }, { x: 2 }, { x: 3 }]);
            const ids = Object.values(result.insertedIds).map((id) => String(id));
            assert.equal(ids.length, new Set(ids).size);
        });

        it('inserts single-element array', async () => {
            const result = await col.insertMany([{ name: 'only' }]);
            assert.equal(result.insertedCount, 1);
        });
    });

    describe('insertMany() duplicate key error', () => {
        it('throws DUPLICATE_KEY on duplicate explicit _id', async () => {
            const id = new ObjectId();
            await assert.rejects(
                () => col.insertMany([{ _id: id, n: 1 }, { _id: id, n: 2 }]),
                (err: any) => err.code === 'DUPLICATE_KEY' || /duplicate/i.test(err.message),
            );
        });
    });

    describe('insertMany() argument validation', () => {
        it('throws DOCUMENTS_REQUIRED on empty array', async () => {
            await assert.rejects(
                () => col.insertMany([]),
                (err: any) => err.code === 'DOCUMENTS_REQUIRED' || /empty/i.test(err.message),
            );
        });

        it('throws DOCUMENTS_REQUIRED when docs is not an array', async () => {
            await assert.rejects(
                () => col.insertMany({ name: 'x' }),
                (err: any) => err.code === 'DOCUMENTS_REQUIRED' || /array/i.test(err.message),
            );
        });

        it('throws DOCUMENTS_REQUIRED when any element is null', async () => {
            await assert.rejects(
                () => col.insertMany([{ n: 1 }, null, { n: 3 }]),
                (err: any) => err.code === 'DOCUMENTS_REQUIRED' || /object/i.test(err.message),
            );
        });

        it('throws DOCUMENTS_REQUIRED when any element is a primitive', async () => {
            await assert.rejects(
                () => col.insertMany([{ n: 1 }, 'string', { n: 3 }]),
                (err: any) => err.code === 'DOCUMENTS_REQUIRED' || /object/i.test(err.message),
            );
        });

        it('throws DOCUMENTS_REQUIRED when any element is an array', async () => {
            await assert.rejects(
                () => col.insertMany([[1, 2, 3]]),
                (err: any) => err.code === 'DOCUMENTS_REQUIRED' || /object/i.test(err.message),
            );
        });
    });
});
