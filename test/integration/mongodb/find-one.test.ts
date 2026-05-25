import { after, before, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ObjectId } from 'mongodb';
import { createMemoryServerBootstrap } from '../../bootstrap/memory-server';

const MonSQLize = require('../../../dist/cjs/index.cjs');

type User = {
    _id?: unknown;
    userId: string;
    name: string;
    email: string;
    age: number;
    role: string;
    status: string;
    verified: boolean;
    score: number;
    createdAt: Date;
};

describe('findOne() / findOneById() / findByIds()', () => {
    const bootstrap = createMemoryServerBootstrap();
    let uri = '';
    let runtime: any;
    let col: any;
    let insertedIds: ObjectId[] = [];

    before(async () => {
        const ctx = await bootstrap.setup();
        uri = ctx.uri;
        runtime = new MonSQLize({
            type: 'mongodb',
            databaseName: 'test_findone',
            config: { uri },
            findLimit: 200,
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

        const docs: Omit<User, '_id'>[] = [];
        for (let i = 1; i <= 20; i++) {
            docs.push({
                userId: `USER-${String(i).padStart(5, '0')}`,
                name: `User ${i}`,
                email: `user${i}@example.com`,
                age: 20 + i,
                role: i % 10 === 0 ? 'admin' : i % 5 === 0 ? 'vip' : 'user',
                status: i % 4 === 0 ? 'inactive' : 'active',
                verified: i % 3 !== 0,
                score: i * 100,
                createdAt: new Date(Date.now() - i * 86400000),
            });
        }
        const result = await db.collection('users').insertMany(docs);
        insertedIds = Object.values(result.insertedIds) as ObjectId[];
    });

    // ── findOne() ─────────────────────────────────────────────────────────────

    describe('findOne() basic results', () => {
        it('returns a matching document', async () => {
            const result = await col.findOne({ status: 'active' });
            assert.ok(result !== null);
            assert.equal(result.status, 'active');
        });

        it('returns null when no document matches', async () => {
            const result = await col.findOne({ userId: 'NONEXISTENT' });
            assert.equal(result, null);
        });

        it('applies sort and returns the correct first document', async () => {
            const result = await col.findOne({}, { sort: { score: -1 } });
            const db = runtime._adapter.db;
            const top = await db.collection('users').find({}).sort({ score: -1 }).limit(1).toArray();
            assert.ok(result !== null);
            assert.equal(String(result._id), String(top[0]._id));
        });

        it('applies multi-field sort', async () => {
            const result = await col.findOne({}, { sort: { status: 1, score: -1 } });
            const db = runtime._adapter.db;
            const expected = await db.collection('users').find({}).sort({ status: 1, score: -1 }).limit(1).toArray();
            assert.ok(result !== null);
            assert.equal(String(result._id), String(expected[0]._id));
        });

        it('applies object projection (include)', async () => {
            const result = await col.findOne({}, { projection: { name: 1, email: 1 } });
            assert.ok(result !== null);
            assert.ok(result._id !== undefined);
            assert.ok(typeof result.name === 'string');
            assert.ok(typeof result.email === 'string');
            assert.equal(result.status, undefined);
            assert.equal(result.score, undefined);
        });

        it('applies array projection (select)', async () => {
            const result = await col.findOne({}, { projection: ['name', 'role'] });
            assert.ok(result !== null);
            assert.ok(result.name !== undefined);
            assert.ok(result.role !== undefined);
            assert.equal(result.score, undefined);
        });
    });

    describe('findOne() filter operators', () => {
        it('supports $gt / $lt', async () => {
            const result = await col.findOne({ score: { $gt: 500, $lt: 1500 } });
            if (result !== null) {
                assert.ok(result.score > 500 && result.score < 1500);
            }
        });

        it('supports $in', async () => {
            const result = await col.findOne({ role: { $in: ['admin', 'vip'] } });
            if (result !== null) {
                assert.ok(['admin', 'vip'].includes(result.role));
            }
        });

        it('supports $ne', async () => {
            const result = await col.findOne({ role: { $ne: 'admin' } });
            if (result !== null) {
                assert.notEqual(result.role, 'admin');
            }
        });

        it('supports $and', async () => {
            const result = await col.findOne({
                $and: [{ status: 'active' }, { verified: true }],
            });
            if (result !== null) {
                assert.equal(result.status, 'active');
                assert.equal(result.verified, true);
            }
        });

        it('supports $or', async () => {
            const result = await col.findOne({
                $or: [{ role: 'admin' }, { score: { $gte: 1800 } }],
            });
            if (result !== null) {
                assert.ok(result.role === 'admin' || result.score >= 1800);
            }
        });
    });

    describe('findOne() query options', () => {
        it('hint is accepted without error', async () => {
            const result = await col.findOne({ status: 'active' }, { hint: { _id: 1 } });
            if (result !== null) assert.equal(result.status, 'active');
        });

        it('maxTimeMS is accepted without error', async () => {
            const result = await col.findOne({}, { maxTimeMS: 5000 });
            assert.ok(result === null || typeof result === 'object');
        });

        it('collation is accepted without error', async () => {
            const result = await col.findOne({}, {
                sort: { name: 1 },
                collation: { locale: 'en', strength: 2 },
            });
            assert.ok(result === null || typeof result === 'object');
        });

        it('returns consistent results on repeated cached query', async () => {
            const opts = { sort: { score: 1 }, cache: 60_000 };
            const first = await col.findOne({ role: 'user' }, opts);
            const second = await col.findOne({ role: 'user' }, opts);
            assert.equal(String(first?._id), String(second?._id));
        });
    });

    describe('findOne() explain mode', () => {
        it('explain: true returns queryPlanner', async () => {
            const plan = await col.findOne({ status: 'active' }, { explain: true });
            assert.ok(plan !== null && typeof plan === 'object');
            assert.ok('queryPlanner' in plan);
        });

        it('explain: "executionStats" returns executionStats', async () => {
            const plan = await col.findOne({ role: 'admin' }, { explain: 'executionStats' });
            assert.ok('executionStats' in plan);
            assert.equal(typeof plan.executionStats.executionTimeMillis, 'number');
        });
    });

    // ── findOneById() ─────────────────────────────────────────────────────────

    describe('findOneById() basic results', () => {
        it('finds document by ObjectId', async () => {
            const id = insertedIds[0];
            const result = await col.findOneById(id);
            assert.ok(result !== null);
            assert.equal(String(result._id), String(id));
        });

        it('finds document by string id (auto-converts)', async () => {
            const id = insertedIds[1];
            const result = await col.findOneById(id.toString());
            assert.ok(result !== null);
            assert.equal(String(result._id), String(id));
        });

        it('returns null for non-existent ObjectId', async () => {
            const result = await col.findOneById(new ObjectId());
            assert.equal(result, null);
        });

        it('returns null for valid-format but absent string id', async () => {
            const result = await col.findOneById('507f1f77bcf86cd799439011');
            assert.equal(result, null);
        });

        it('accepts mixed-case hex string id', async () => {
            const id = insertedIds[5];
            const hex = id.toString();
            const mixed = hex.slice(0, 12).toUpperCase() + hex.slice(12).toLowerCase();
            const result = await col.findOneById(mixed);
            assert.ok(result !== null);
            assert.equal(String(result._id), String(id));
        });

        it('result contains all fields when no projection', async () => {
            const id = insertedIds[0];
            const result = await col.findOneById(id);
            assert.ok(result !== null);
            assert.ok(result._id !== undefined);
            assert.ok(typeof result.userId === 'string');
            assert.ok(typeof result.name === 'string');
            assert.ok(typeof result.email === 'string');
            assert.ok(typeof result.score === 'number');
        });
    });

    describe('findOneById() options', () => {
        it('applies object projection', async () => {
            const id = insertedIds[2];
            const result = await col.findOneById(id, { projection: { name: 1, email: 1 } });
            assert.ok(result !== null);
            assert.ok(result._id !== undefined);
            assert.ok(typeof result.name === 'string');
            assert.ok(typeof result.email === 'string');
            assert.equal(result.userId, undefined);
            assert.equal(result.score, undefined);
        });

        it('applies array projection', async () => {
            const id = insertedIds[3];
            const result = await col.findOneById(id, { projection: ['name', 'email', 'age'] });
            assert.ok(result !== null);
            assert.ok(typeof result.name === 'string');
            assert.ok(typeof result.email === 'string');
            assert.ok(typeof result.age === 'number');
            assert.equal(result.userId, undefined);
        });

        it('maxTimeMS is accepted without error', async () => {
            const result = await col.findOneById(insertedIds[4], { maxTimeMS: 5000 });
            assert.ok(result !== null);
        });
    });

    describe('findOneById() argument validation', () => {
        it('throws on null id', async () => {
            await assert.rejects(() => col.findOneById(null), /id is required/);
        });

        it('throws on undefined id', async () => {
            await assert.rejects(() => col.findOneById(undefined), /id is required/);
        });

        it('throws on invalid hex string', async () => {
            await assert.rejects(() => col.findOneById('invalid-id'), /invalid ObjectId format/);
        });

        it('throws on too-short hex string', async () => {
            await assert.rejects(() => col.findOneById('abc123'), /invalid ObjectId format/);
        });

        it('throws on number type', async () => {
            await assert.rejects(() => col.findOneById(12345), /id must be a string or ObjectId/);
        });

        it('throws on plain object (non-ObjectId)', async () => {
            await assert.rejects(() => col.findOneById({ _id: 'test' }), /id must be a string or ObjectId/);
        });
    });

    // ── findByIds() ───────────────────────────────────────────────────────────

    describe('findByIds() basic results', () => {
        it('fetches multiple documents by string ids', async () => {
            const ids = insertedIds.slice(0, 3).map(id => id.toString());
            const results = await col.findByIds(ids);
            assert.equal(results.length, 3);
        });

        it('fetches multiple documents by ObjectId array', async () => {
            const results = await col.findByIds(insertedIds.slice(0, 3));
            assert.equal(results.length, 3);
        });

        it('supports mixed string and ObjectId', async () => {
            const ids = [insertedIds[0].toString(), insertedIds[1], insertedIds[2].toString()];
            const results = await col.findByIds(ids);
            assert.equal(results.length, 3);
        });

        it('deduplicates repeated ids', async () => {
            const id = insertedIds[0].toString();
            const results = await col.findByIds([id, id, insertedIds[1].toString()]);
            assert.equal(results.length, 2);
        });

        it('returns empty array for empty input', async () => {
            const results = await col.findByIds([]);
            assert.deepEqual(results, []);
        });

        it('skips non-existent ids', async () => {
            const ids = [
                insertedIds[0].toString(),
                new ObjectId().toString(),
                insertedIds[1].toString(),
            ];
            const results = await col.findByIds(ids);
            assert.equal(results.length, 2);
        });

        it('returns empty array when all ids are absent', async () => {
            const ids = [new ObjectId().toString(), new ObjectId().toString()];
            const results = await col.findByIds(ids);
            assert.equal(results.length, 0);
        });

        it('handles a single id', async () => {
            const results = await col.findByIds([insertedIds[0].toString()]);
            assert.equal(results.length, 1);
        });
    });

    describe('findByIds() options', () => {
        it('applies projection', async () => {
            const ids = insertedIds.slice(0, 2).map(id => id.toString());
            const results = await col.findByIds(ids, { projection: { name: 1, age: 1 } });
            assert.equal(results.length, 2);
            for (const doc of results) {
                assert.ok(doc._id !== undefined);
                assert.ok(typeof doc.name === 'string');
                assert.ok(typeof doc.age === 'number');
                assert.equal(doc.userId, undefined);
            }
        });

        it('applies sort ascending by score', async () => {
            const ids = insertedIds.slice(0, 5).map(id => id.toString());
            const results = await col.findByIds(ids, { sort: { score: 1 } });
            assert.equal(results.length, 5);
            for (let i = 1; i < results.length; i++) {
                assert.ok(results[i - 1].score <= results[i].score);
            }
        });

        it('preserveOrder: true returns docs in input order', async () => {
            const ordered = [insertedIds[4], insertedIds[1], insertedIds[2]];
            const results = await col.findByIds(
                ordered.map(id => id.toString()),
                { preserveOrder: true },
            );
            assert.equal(results.length, 3);
            assert.equal(String(results[0]._id), String(ordered[0]));
            assert.equal(String(results[1]._id), String(ordered[1]));
            assert.equal(String(results[2]._id), String(ordered[2]));
        });

        it('maxTimeMS is accepted without error', async () => {
            const ids = insertedIds.slice(0, 2).map(id => id.toString());
            const results = await col.findByIds(ids, { maxTimeMS: 5000 });
            assert.equal(results.length, 2);
        });
    });

    describe('findByIds() argument validation', () => {
        it('throws when ids is not an array (string)', async () => {
            await assert.rejects(() => col.findByIds('not-an-array'), /ids must be an array/);
        });

        it('throws when ids is null', async () => {
            await assert.rejects(() => col.findByIds(null), /ids must be an array/);
        });

        it('throws on invalid id string in array', async () => {
            await assert.rejects(
                () => col.findByIds(['invalid-id', insertedIds[0].toString()]),
                /invalid/i,
            );
        });

        it('throws on number element in ids array', async () => {
            await assert.rejects(
                () => col.findByIds([insertedIds[0], 123, insertedIds[1]]),
                /invalid/i,
            );
        });

        it('throws on undefined element in ids array', async () => {
            await assert.rejects(
                () => col.findByIds([insertedIds[0], undefined, insertedIds[1]]),
                /invalid/i,
            );
        });
    });
});
