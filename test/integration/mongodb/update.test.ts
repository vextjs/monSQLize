import { after, before, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ObjectId } from 'mongodb';
import { createMemoryServerBootstrap } from '../../bootstrap/memory-server';

const MonSQLize = require('../../../dist/cjs/index.cjs');

describe('updateOne() / updateMany() / replaceOne() / upsertOne() / incrementOne()', () => {
    const bootstrap = createMemoryServerBootstrap();
    let uri = '';
    let runtime: any;
    let col: any;
    let seedIds: ObjectId[] = [];

    before(async () => {
        const ctx = await bootstrap.setup();
        uri = ctx.uri;
        runtime = new MonSQLize({
            type: 'mongodb',
            databaseName: 'test_update',
            config: { uri },
        });
        await runtime.connect();
        col = runtime.collection('users');
    });

    after(async () => {
        if (runtime) await runtime.close();
        await bootstrap.teardown();
    });

    beforeEach(async () => {
        const db = runtime._adapter.db;
        await db.collection('users').deleteMany({});

        const docs = [
            { name: 'Alice', age: 25, role: 'user', score: 100, active: true },
            { name: 'Bob',   age: 30, role: 'admin', score: 200, active: true },
            { name: 'Carol', age: 35, role: 'user', score: 150, active: false },
            { name: 'Dave',  age: 40, role: 'user', score: 50,  active: true },
            { name: 'Eve',   age: 28, role: 'vip',  score: 300, active: true },
        ];
        const result = await db.collection('users').insertMany(docs);
        seedIds = Object.values(result.insertedIds) as ObjectId[];
    });

    // ── updateOne() ───────────────────────────────────────────────────���───────

    describe('updateOne() basic results', () => {
        it('updates a matching document', async () => {
            const result = await col.updateOne({ name: 'Alice' }, { $set: { age: 26 } });
            assert.ok(result.acknowledged);
            assert.equal(result.modifiedCount, 1);
            assert.equal(result.matchedCount, 1);
        });

        it('change is reflected in subsequent read', async () => {
            await col.updateOne({ name: 'Bob' }, { $set: { role: 'superadmin' } });
            const doc = await col.findOne({ name: 'Bob' });
            assert.equal(doc.role, 'superadmin');
        });

        it('returns matchedCount=0 when no document matches', async () => {
            const result = await col.updateOne({ name: 'Nonexistent' }, { $set: { age: 99 } });
            assert.equal(result.matchedCount, 0);
            assert.equal(result.modifiedCount, 0);
        });

        it('only modifies the first matching document', async () => {
            const result = await col.updateOne({ role: 'user' }, { $set: { score: 999 } });
            assert.equal(result.modifiedCount, 1);
            const count = await col.count({ score: 999 });
            assert.equal(count, 1);
        });

        it('$inc increments a numeric field', async () => {
            await col.updateOne({ name: 'Alice' }, { $inc: { score: 50 } });
            const doc = await col.findOne({ name: 'Alice' });
            assert.equal(doc.score, 150);
        });

        it('$unset removes a field', async () => {
            await col.updateOne({ name: 'Carol' }, { $unset: { active: '' } });
            const doc = await col.findOne({ name: 'Carol' });
            assert.equal(doc.active, undefined);
        });

        it('update with upsert option creates a new document when no match', async () => {
            const result = await col.updateOne(
                { name: 'Frank' },
                { $set: { name: 'Frank', role: 'guest' } },
                { upsert: true },
            );
            assert.ok(result.upsertedId !== null && result.upsertedId !== undefined);
            const doc = await col.findOne({ name: 'Frank' });
            assert.equal(doc.role, 'guest');
        });

        it('accepts aggregation pipeline as update', async () => {
            const result = await col.updateOne(
                { name: 'Dave' },
                [{ $set: { age: { $add: ['$age', 1] } } }],
            );
            assert.ok(result.acknowledged);
            const doc = await col.findOne({ name: 'Dave' });
            assert.equal(doc.age, 41);
        });
    });

    describe('updateOne() argument validation', () => {
        it('throws when filter is null', async () => {
            await assert.rejects(
                () => col.updateOne(null, { $set: { age: 1 } }),
                /filter must be/i,
            );
        });

        it('throws when update has no $ operators', async () => {
            await assert.rejects(
                () => col.updateOne({ name: 'Alice' }, { age: 99 }),
                /update.*operator|operator.*update/i,
            );
        });

        it('throws when update is an empty object', async () => {
            await assert.rejects(
                () => col.updateOne({ name: 'Alice' }, {}),
                /empty|update/i,
            );
        });

        it('throws when update is null', async () => {
            await assert.rejects(
                () => col.updateOne({ name: 'Alice' }, null),
                /update/i,
            );
        });
    });

    // ── updateMany() ──────────────────────────────────────────────────────────

    describe('updateMany() basic results', () => {
        it('updates all matching documents', async () => {
            const result = await col.updateMany({ role: 'user' }, { $set: { score: 0 } });
            assert.ok(result.acknowledged);
            assert.ok(result.modifiedCount >= 1);
            const remaining = await col.count({ role: 'user', score: { $ne: 0 } });
            assert.equal(remaining, 0);
        });

        it('returns modifiedCount matching the count of affected documents', async () => {
            const before = await col.count({ active: true });
            const result = await col.updateMany({ active: true }, { $set: { active: false } });
            assert.equal(result.modifiedCount, before);
        });

        it('returns matchedCount=0 when no documents match', async () => {
            const result = await col.updateMany({ role: 'superadmin' }, { $set: { score: 9999 } });
            assert.equal(result.matchedCount, 0);
            assert.equal(result.modifiedCount, 0);
        });

        it('$inc all matching documents', async () => {
            await col.updateMany({ role: 'user' }, { $inc: { score: 10 } });
            const users = await col.find({ role: 'user' });
            for (const u of users) {
                assert.ok(typeof u.score === 'number');
            }
        });
    });

    describe('updateMany() argument validation', () => {
        it('throws when filter is null', async () => {
            await assert.rejects(
                () => col.updateMany(null, { $set: { age: 1 } }),
                /filter must be/i,
            );
        });

        it('throws when update has no $ operators', async () => {
            await assert.rejects(
                () => col.updateMany({ role: 'user' }, { score: 0 }),
                /update.*operator|operator.*update/i,
            );
        });
    });

    // ── replaceOne() ──────────────────────────────────────────────────────────

    describe('replaceOne() basic results', () => {
        it('replaces document fields entirely', async () => {
            await col.replaceOne({ name: 'Alice' }, { name: 'Alice', age: 99, replaced: true });
            const doc = await col.findOne({ name: 'Alice' });
            assert.equal(doc.age, 99);
            assert.equal(doc.replaced, true);
            assert.equal(doc.role, undefined);
        });

        it('returns modifiedCount=1 on successful replace', async () => {
            const result = await col.replaceOne({ name: 'Bob' }, { name: 'Bob', freshField: 'yes' });
            assert.equal(result.modifiedCount, 1);
            assert.equal(result.matchedCount, 1);
        });

        it('returns matchedCount=0 when no document matches', async () => {
            const result = await col.replaceOne({ name: 'Nonexistent' }, { name: 'Nonexistent' });
            assert.equal(result.matchedCount, 0);
        });

        it('preserves _id on replacement', async () => {
            const original = await col.findOne({ name: 'Carol' });
            await col.replaceOne({ name: 'Carol' }, { name: 'Carol', newField: true });
            const replaced = await col.findOne({ name: 'Carol' });
            assert.equal(String(replaced._id), String(original._id));
        });

        it('upsert creates new document when filter misses', async () => {
            const result = await col.replaceOne(
                { name: 'Zelda' },
                { name: 'Zelda', role: 'guest' },
                { upsert: true },
            );
            assert.ok(result.upsertedId !== null && result.upsertedId !== undefined);
        });
    });

    describe('replaceOne() argument validation', () => {
        it('throws when filter is null', async () => {
            await assert.rejects(
                () => col.replaceOne(null, { name: 'x' }),
                /filter must be/i,
            );
        });

        it('throws when replacement contains $ operators', async () => {
            await assert.rejects(
                () => col.replaceOne({ name: 'Alice' }, { $set: { age: 1 } }),
                /update.*operator|operator/i,
            );
        });
    });

    // ── upsertOne() ───────────────────────────────────────────────────────────

    describe('upsertOne() basic results', () => {
        it('updates when document exists', async () => {
            const result = await col.upsertOne({ name: 'Alice' }, { $set: { score: 500 } });
            assert.ok(result.acknowledged);
            assert.equal(result.upsertedId, undefined);
            const doc = await col.findOne({ name: 'Alice' });
            assert.equal(doc.score, 500);
        });

        it('inserts when document does not exist', async () => {
            const result = await col.upsertOne({ name: 'NewUser' }, { $set: { role: 'guest' } });
            assert.ok(result.acknowledged);
            assert.ok(result.upsertedId !== undefined);
            const doc = await col.findOne({ name: 'NewUser' });
            assert.equal(doc.role, 'guest');
        });

        it('wraps plain object in $set when no $ operators', async () => {
            await col.upsertOne({ name: 'Bob' }, { score: 999 });
            const doc = await col.findOne({ name: 'Bob' });
            assert.equal(doc.score, 999);
        });

        it('upserts with plain object creates new document', async () => {
            const result = await col.upsertOne({ name: 'Unique' }, { role: 'vip', score: 100 });
            assert.ok(result.acknowledged);
            const doc = await col.findOne({ name: 'Unique' });
            assert.ok(doc !== null);
        });
    });

    describe('upsertOne() argument validation', () => {
        it('throws when filter is null', async () => {
            await assert.rejects(
                () => col.upsertOne(null, { $set: { x: 1 } }),
                /filter must be/i,
            );
        });

        it('throws when update is null', async () => {
            await assert.rejects(
                () => col.upsertOne({ name: 'x' }, null),
                /update must be/i,
            );
        });
    });

    // ── incrementOne() ────────────────────────────────────────────────────────

    describe('incrementOne() basic results', () => {
        it('increments a field by 1 (default)', async () => {
            const result = await col.incrementOne({ name: 'Alice' }, 'score');
            assert.ok(result.acknowledged);
            assert.equal(result.value?.score, 101);
        });

        it('increments a field by custom amount', async () => {
            const result = await col.incrementOne({ name: 'Bob' }, 'score', 50);
            assert.equal(result.value?.score, 250);
        });

        it('decrements a field with negative increment', async () => {
            const result = await col.incrementOne({ name: 'Eve' }, 'score', -100);
            assert.equal(result.value?.score, 200);
        });

        it('returns value as the updated document by default (returnDocument: after)', async () => {
            const result = await col.incrementOne({ name: 'Alice' }, 'score', 10);
            assert.ok(result.value !== null);
            assert.equal(result.value.name, 'Alice');
            assert.equal(result.value.score, 110);
        });

        it('returns null value when filter matches nothing', async () => {
            const result = await col.incrementOne({ name: 'NoOne' }, 'score', 1);
            assert.equal(result.value, null);
            assert.equal(result.matchedCount, 0);
        });

        it('increments multiple fields via object syntax', async () => {
            const result = await col.incrementOne({ name: 'Carol' }, { score: 10, age: 1 });
            assert.ok(result.value !== null);
            assert.equal(result.value.score, 160);
            assert.equal(result.value.age, 36);
        });

        it('$set option sets additional fields on increment', async () => {
            const result = await col.incrementOne({ name: 'Dave' }, 'score', 5, { $set: { active: true } });
            assert.equal(result.value?.score, 55);
            assert.equal(result.value?.active, true);
        });

        it('projection option returns only specified fields', async () => {
            const result = await col.incrementOne({ name: 'Alice' }, 'score', 1, { projection: { score: 1 } });
            assert.ok(result.value !== null);
            assert.ok(typeof result.value.score === 'number');
            assert.equal(result.value.name, undefined);
        });

        it('maxTimeMS option is accepted without error', async () => {
            const result = await col.incrementOne({ name: 'Bob' }, 'score', 1, { maxTimeMS: 5000 });
            assert.ok(result.acknowledged);
        });
    });

    describe('incrementOne() argument validation', () => {
        it('throws when filter is null', async () => {
            await assert.rejects(
                () => col.incrementOne(null, 'score'),
                /filter must be/i,
            );
        });

        it('throws when increment is a non-number (string)', async () => {
            await assert.rejects(
                () => col.incrementOne({ name: 'Alice' }, 'score', 'ten' as any),
                /increment must be a number/i,
            );
        });
    });
});
