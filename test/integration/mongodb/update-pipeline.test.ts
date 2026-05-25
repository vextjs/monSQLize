import { after, before, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryServerBootstrap } from '../../bootstrap/memory-server';

const MonSQLize = require('../../../dist/cjs/index.cjs');

function hasErrorCode(error: unknown, code: string): boolean {
    return Boolean(error && typeof error === 'object' && 'code' in error && error.code === code);
}

describe('update aggregation pipeline', () => {
    const bootstrap = createMemoryServerBootstrap();
    let uri = '';
    let runtime: any;
    let col: any;

    before(async () => {
        const ctx = await bootstrap.setup();
        uri = ctx.uri;
        runtime = new MonSQLize({
            type: 'mongodb',
            databaseName: 'test_update_pipeline',
            config: { uri },
        });
        await runtime.connect();
        col = runtime.collection('employees');
    });

    after(async () => {
        if (runtime) await runtime.close();
        await bootstrap.teardown();
    });

    beforeEach(async () => {
        const db = runtime._adapter.db;
        await db.collection('employees').deleteMany({});
        await db.collection('employees').insertMany([
            { name: 'Alice', salary: 100, level: 1, active: true,  score: 80 },
            { name: 'Bob',   salary: 200, level: 2, active: false, score: 60 },
            { name: 'Carol', salary: 150, level: 1, active: true,  score: 90 },
            { name: 'Dave',  salary: 300, level: 3, active: true,  score: 70 },
            { name: 'Eve',   salary: 250, level: 2, active: false, score: 50 },
        ]);
    });

    // ── updateOne with aggregation pipeline ──────────────────────────────────

    describe('updateOne() with aggregation pipeline', () => {
        it('$set with $add expression increments a field', async () => {
            await col.updateOne({ name: 'Alice' }, [{ $set: { salary: { $add: ['$salary', 50] } } }]);
            const doc = await col.findOne({ name: 'Alice' });
            assert.equal(doc.salary, 150);
        });

        it('$set with $multiply expression scales a field', async () => {
            await col.updateOne({ name: 'Bob' }, [{ $set: { salary: { $multiply: ['$salary', 2] } } }]);
            const doc = await col.findOne({ name: 'Bob' });
            assert.equal(doc.salary, 400);
        });

        it('$set with $cond expression applies conditional logic', async () => {
            await col.updateOne(
                { name: 'Alice' },
                [{ $set: { bonus: { $cond: { if: '$active', then: 100, else: 0 } } } }],
            );
            const doc = await col.findOne({ name: 'Alice' });
            assert.equal(doc.bonus, 100);
        });

        it('multi-stage pipeline: $set then $unset', async () => {
            await col.updateOne(
                { name: 'Carol' },
                [
                    { $set: { newScore: { $add: ['$score', 10] } } },
                    { $unset: 'score' },
                ],
            );
            const doc = await col.findOne({ name: 'Carol' });
            assert.equal(doc.newScore, 100);
            assert.equal(doc.score, undefined);
        });

        it('$addFields adds a computed field without removing existing ones', async () => {
            await col.updateOne({ name: 'Dave' }, [{ $addFields: { doubled: { $multiply: ['$salary', 2] } } }]);
            const doc = await col.findOne({ name: 'Dave' });
            assert.equal(doc.doubled, 600);
            assert.equal(doc.salary, 300);
        });
    });

    // ── updateMany with aggregation pipeline ─────────────────────────────────

    describe('updateMany() with aggregation pipeline', () => {
        it('$set expression applied to all matching documents', async () => {
            await col.updateMany({ active: true }, [{ $set: { salary: { $add: ['$salary', 100] } } }]);
            const docs = await col.find({ active: true });
            const salaries = docs.map((d: any) => d.salary).sort((a: number, b: number) => a - b);
            assert.deepEqual(salaries, [200, 250, 400]);
        });

        it('$cond conditional update across all documents', async () => {
            await col.updateMany({}, [
                { $set: { category: { $cond: { if: { $gte: ['$score', 75] }, then: 'high', else: 'low' } } } },
            ]);
            const high = await col.find({ category: 'high' });
            const low  = await col.find({ category: 'low' });
            assert.equal(high.length, 2);
            assert.equal(low.length, 3);
        });

        it('multi-stage pipeline applied to a filtered subset', async () => {
            await col.updateMany(
                { level: 1 },
                [
                    { $set: { senior: false } },
                    { $set: { score: { $add: ['$score', 5] } } },
                ],
            );
            const docs = await col.find({ level: 1 });
            assert.equal(docs.length, 2);
            assert.ok(docs.every((d: any) => d.senior === false));
            const scores = docs.map((d: any) => d.score).sort((a: number, b: number) => a - b);
            assert.deepEqual(scores, [85, 95]);
        });
    });

    // ── findOneAndUpdate with aggregation pipeline ────────────────────────────

    describe('findOneAndUpdate() with aggregation pipeline', () => {
        it('returns updated document after pipeline update', async () => {
            const doc = await col.findOneAndUpdate(
                { name: 'Alice' },
                [{ $set: { salary: { $add: ['$salary', 25] } } }],
                { returnDocument: 'after' },
            );
            assert.ok(doc !== null);
            assert.equal(doc.salary, 125);
        });

        it('pipeline $unset removes field from returned document', async () => {
            const doc = await col.findOneAndUpdate(
                { name: 'Bob' },
                [{ $set: { promoted: true } }, { $unset: 'level' }],
                { returnDocument: 'after' },
            );
            assert.ok(doc !== null);
            assert.equal(doc.promoted, true);
            assert.equal(doc.level, undefined);
        });
    });

    // ── pipeline validation ───────────────────────────────────────────────────

    describe('pipeline validation', () => {
        it('throws INVALID_ARGUMENT for empty pipeline array', async () => {
            await assert.rejects(
                () => col.updateOne({ name: 'Alice' }, []),
                (e: unknown) => hasErrorCode(e, 'INVALID_ARGUMENT'),
            );
        });

        it('throws INVALID_ARGUMENT for stage with non-$ operator key', async () => {
            await assert.rejects(
                () => col.updateOne({ name: 'Alice' }, [{ set: { salary: 0 } }]),
                (e: unknown) => hasErrorCode(e, 'INVALID_ARGUMENT'),
            );
        });

        it('throws INVALID_ARGUMENT for empty stage object', async () => {
            await assert.rejects(
                () => col.updateOne({ name: 'Alice' }, [{}]),
                (e: unknown) => hasErrorCode(e, 'INVALID_ARGUMENT'),
            );
        });

        it('throws INVALID_ARGUMENT for null stage in pipeline', async () => {
            await assert.rejects(
                () => col.updateOne({ name: 'Alice' }, [null]),
                (e: unknown) => hasErrorCode(e, 'INVALID_ARGUMENT'),
            );
        });
    });
});
