import { after, before, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ObjectId } from 'mongodb';
import { createMemoryServerBootstrap } from '../../bootstrap/memory-server';

const MonSQLize = require('../../../dist/cjs/index.cjs');

describe('deleteOne() / deleteMany() / findOneAndUpdate() / findOneAndReplace() / findOneAndDelete()', () => {
    const bootstrap = createMemoryServerBootstrap();
    let uri = '';
    let runtime: any;
    let col: any;

    before(async () => {
        const ctx = await bootstrap.setup();
        uri = ctx.uri;
        runtime = new MonSQLize({
            type: 'mongodb',
            databaseName: 'test_delete',
            config: { uri },
        });
        await runtime.connect();
        col = runtime.collection('tasks');
    });

    after(async () => {
        if (runtime) await runtime.close();
        await bootstrap.teardown();
    });

    beforeEach(async () => {
        const db = runtime._adapter.db;
        await db.collection('tasks').deleteMany({});

        await db.collection('tasks').insertMany([
            { title: 'Task A', status: 'pending',   priority: 1, assignee: 'alice' },
            { title: 'Task B', status: 'in-progress', priority: 2, assignee: 'bob' },
            { title: 'Task C', status: 'pending',   priority: 3, assignee: 'carol' },
            { title: 'Task D', status: 'done',      priority: 1, assignee: 'alice' },
            { title: 'Task E', status: 'pending',   priority: 2, assignee: 'bob' },
        ]);
    });

    // ── deleteOne() ───────────────────────────────────────────────────────────

    describe('deleteOne() basic results', () => {
        it('deletes a matching document', async () => {
            const result = await col.deleteOne({ title: 'Task A' });
            assert.ok(result.acknowledged);
            assert.equal(result.deletedCount, 1);
        });

        it('deleted document is no longer findable', async () => {
            await col.deleteOne({ title: 'Task B' });
            const doc = await col.findOne({ title: 'Task B' });
            assert.equal(doc, null);
        });

        it('returns deletedCount=0 when no document matches', async () => {
            const result = await col.deleteOne({ title: 'Nonexistent' });
            assert.equal(result.deletedCount, 0);
        });

        it('only deletes one document when multiple match', async () => {
            const before = await col.count({ status: 'pending' });
            await col.deleteOne({ status: 'pending' });
            const after = await col.count({ status: 'pending' });
            assert.equal(after, before - 1);
        });

        it('total collection count decreases by 1 after delete', async () => {
            const before = await col.count({});
            await col.deleteOne({ title: 'Task C' });
            const after = await col.count({});
            assert.equal(after, before - 1);
        });
    });

    describe('deleteOne() argument validation', () => {
        it('throws when filter is null', async () => {
            await assert.rejects(
                () => col.deleteOne(null),
                /filter must be/i,
            );
        });

        it('throws when filter is undefined', async () => {
            await assert.rejects(
                () => col.deleteOne(undefined),
                /filter must be/i,
            );
        });

        it('throws when filter is an array', async () => {
            await assert.rejects(
                () => col.deleteOne([]),
                /filter must be/i,
            );
        });

        it('throws when filter is a string', async () => {
            await assert.rejects(
                () => col.deleteOne('title'),
                /filter must be/i,
            );
        });
    });

    // ── deleteMany() ──────────────────────────────────────────────────────────

    describe('deleteMany() basic results', () => {
        it('deletes all matching documents', async () => {
            const pendingCount = await col.count({ status: 'pending' });
            const result = await col.deleteMany({ status: 'pending' });
            assert.ok(result.acknowledged);
            assert.equal(result.deletedCount, pendingCount);
        });

        it('deleted documents are no longer findable', async () => {
            await col.deleteMany({ assignee: 'alice' });
            const remaining = await col.find({ assignee: 'alice' });
            assert.equal(remaining.length, 0);
        });

        it('returns deletedCount=0 when no documents match', async () => {
            const result = await col.deleteMany({ status: 'cancelled' });
            assert.equal(result.deletedCount, 0);
        });

        it('empty filter deletes all documents', async () => {
            const result = await col.deleteMany({});
            assert.equal(result.deletedCount, 5);
            const remaining = await col.count({});
            assert.equal(remaining, 0);
        });

        it('deletes exactly matched documents, leaves others', async () => {
            await col.deleteMany({ assignee: 'bob' });
            const remaining = await col.find({});
            assert.ok(remaining.every((d: any) => d.assignee !== 'bob'));
        });
    });

    describe('deleteMany() argument validation', () => {
        it('throws when filter is null', async () => {
            await assert.rejects(
                () => col.deleteMany(null),
                /filter must be/i,
            );
        });

        it('throws when filter is an array', async () => {
            await assert.rejects(
                () => col.deleteMany([]),
                /filter must be/i,
            );
        });
    });

    // ── findOneAndUpdate() ────────────────────────────────────────────────────

    describe('findOneAndUpdate() basic results', () => {
        it('returns the updated document when returnDocument: after', async () => {
            const doc = await col.findOneAndUpdate(
                { title: 'Task A' },
                { $set: { status: 'done' } },
                { returnDocument: 'after' },
            );
            assert.ok(doc !== null);
            assert.equal(doc.title, 'Task A');
            assert.equal(doc.status, 'done');
        });

        it('returns old document with returnDocument: before', async () => {
            const doc = await col.findOneAndUpdate(
                { title: 'Task B' },
                { $set: { status: 'done' } },
                { returnDocument: 'before' },
            );
            assert.ok(doc !== null);
            assert.equal(doc.status, 'in-progress');
        });

        it('returns null when no document matches', async () => {
            const doc = await col.findOneAndUpdate(
                { title: 'Nonexistent' },
                { $set: { status: 'done' } },
            );
            assert.equal(doc, null);
        });

        it('$inc update is applied atomically', async () => {
            const doc = await col.findOneAndUpdate(
                { title: 'Task C' },
                { $inc: { priority: 10 } },
                { returnDocument: 'after' },
            );
            assert.ok(doc !== null);
            assert.equal(doc.priority, 13);
        });

        it('upsert option creates new document when filter misses', async () => {
            const doc = await col.findOneAndUpdate(
                { title: 'New Task' },
                { $set: { status: 'pending', priority: 5, assignee: 'dave' } },
                { upsert: true, returnDocument: 'after' },
            );
            assert.ok(doc !== null);
            assert.equal(doc.title, 'New Task');
        });

        it('projection limits returned fields', async () => {
            const doc = await col.findOneAndUpdate(
                { title: 'Task A' },
                { $set: { status: 'done' } },
                { projection: { title: 1 } },
            );
            assert.ok(doc !== null);
            assert.ok(typeof doc.title === 'string');
            assert.equal(doc.status, undefined);
        });
    });

    describe('findOneAndUpdate() argument validation', () => {
        it('throws when filter is null', async () => {
            await assert.rejects(
                () => col.findOneAndUpdate(null, { $set: { status: 'done' } }),
                /filter must be/i,
            );
        });

        it('throws when update has no $ operators', async () => {
            await assert.rejects(
                () => col.findOneAndUpdate({ title: 'Task A' }, { status: 'done' }),
                /operator|update/i,
            );
        });
    });

    // ── findOneAndReplace() ───────────────────────────────────────────────────

    describe('findOneAndReplace() basic results', () => {
        it('returns the replaced document when returnDocument: after', async () => {
            const doc = await col.findOneAndReplace(
                { title: 'Task A' },
                { title: 'Task A', status: 'done', priority: 0 },
                { returnDocument: 'after' },
            );
            assert.ok(doc !== null);
            assert.equal(doc.status, 'done');
        });

        it('entire document is replaced (no old fields remain)', async () => {
            await col.findOneAndReplace(
                { title: 'Task B' },
                { title: 'Task B', replaced: true },
            );
            const doc = await col.findOne({ title: 'Task B' });
            assert.equal(doc.replaced, true);
            assert.equal(doc.status, undefined);
        });

        it('returns null when no document matches', async () => {
            const doc = await col.findOneAndReplace(
                { title: 'Nonexistent' },
                { title: 'Nonexistent' },
            );
            assert.equal(doc, null);
        });

        it('preserves _id on replacement', async () => {
            const original = await col.findOne({ title: 'Task C' });
            const replaced = await col.findOneAndReplace(
                { title: 'Task C' },
                { title: 'Task C', fresh: true },
            );
            assert.equal(String(replaced._id), String(original._id));
        });
    });

    describe('findOneAndReplace() argument validation', () => {
        it('throws when filter is null', async () => {
            await assert.rejects(
                () => col.findOneAndReplace(null, { title: 'x' }),
                /filter must be/i,
            );
        });

        it('throws when replacement contains $ operators', async () => {
            await assert.rejects(
                () => col.findOneAndReplace({ title: 'Task A' }, { $set: { status: 'done' } }),
                /operator/i,
            );
        });
    });

    // ── findOneAndDelete() ────────────────────────────────────────────────────

    describe('findOneAndDelete() basic results', () => {
        it('returns the deleted document', async () => {
            const doc = await col.findOneAndDelete({ title: 'Task A' });
            assert.ok(doc !== null);
            assert.equal(doc.title, 'Task A');
        });

        it('deleted document is no longer in collection', async () => {
            await col.findOneAndDelete({ title: 'Task B' });
            const found = await col.findOne({ title: 'Task B' });
            assert.equal(found, null);
        });

        it('returns null when no document matches', async () => {
            const doc = await col.findOneAndDelete({ title: 'Nonexistent' });
            assert.equal(doc, null);
        });

        it('only deletes one document when multiple match', async () => {
            const pendingBefore = await col.count({ status: 'pending' });
            await col.findOneAndDelete({ status: 'pending' });
            const pendingAfter = await col.count({ status: 'pending' });
            assert.equal(pendingAfter, pendingBefore - 1);
        });

        it('projection limits fields in returned document', async () => {
            const doc = await col.findOneAndDelete(
                { title: 'Task C' },
                { projection: { title: 1, _id: 0 } },
            );
            assert.ok(doc !== null);
            assert.ok(typeof doc.title === 'string');
            assert.equal(doc._id, undefined);
            assert.equal(doc.status, undefined);
        });

        it('sort option controls which document is deleted first', async () => {
            const doc = await col.findOneAndDelete(
                { status: 'pending' },
                { sort: { priority: -1 } },
            );
            assert.ok(doc !== null);
            assert.equal(doc.priority, 3);
        });
    });

    describe('findOneAndDelete() argument validation', () => {
        it('throws when filter is null', async () => {
            await assert.rejects(
                () => col.findOneAndDelete(null),
                /filter must be/i,
            );
        });

        it('throws when filter is an array', async () => {
            await assert.rejects(
                () => col.findOneAndDelete([]),
                /filter must be/i,
            );
        });
    });
});
