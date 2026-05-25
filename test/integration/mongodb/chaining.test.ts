import { after, before, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryServerBootstrap } from '../../bootstrap/memory-server';

const MonSQLize = require('../../../dist/cjs/index.cjs');

type Item = {
    _id?: unknown;
    name: string;
    category: string;
    value: number;
    active: boolean;
};

describe('FindChain / AggregateChain / stream / invalidate / bookmarks', () => {
    const bootstrap = createMemoryServerBootstrap();
    let uri = '';
    let runtime: any;
    let col: any;

    before(async () => {
        const ctx = await bootstrap.setup();
        uri = ctx.uri;
        runtime = new MonSQLize({
            type: 'mongodb',
            databaseName: 'test_chaining',
            config: { uri },
            findLimit: 200,
        });
        await runtime.connect();
        col = runtime.collection('items');
    });

    after(async () => {
        if (runtime) await runtime.close();
        await bootstrap.teardown();
    });

    beforeEach(async () => {
        const db = runtime._adapter.db;
        await db.collection('items').deleteMany({});

        const docs: Omit<Item, '_id'>[] = [];
        for (let i = 1; i <= 30; i++) {
            docs.push({
                name: `Item ${i}`,
                category: i % 3 === 0 ? 'A' : i % 3 === 1 ? 'B' : 'C',
                value: i * 10,
                active: i % 5 !== 0,
            });
        }
        await db.collection('items').insertMany(docs);
    });

    // ── FindChain uncovered methods ────────────────────────────────────────────

    describe('FindChain.comment() and batchSize()', () => {
        it('comment() is accepted without error', async () => {
            const results = await col.find({}).comment('integration test').limit(5);
            assert.ok(Array.isArray(results));
            assert.equal(results.length, 5);
        });

        it('batchSize() is accepted without error', async () => {
            const results = await col.find({}).batchSize(5).limit(10);
            assert.ok(Array.isArray(results));
            assert.equal(results.length, 10);
        });

        it('chaining comment + batchSize together', async () => {
            const results = await col.find({ active: true })
                .comment('combined chain')
                .batchSize(3)
                .sort({ value: 1 })
                .limit(5);
            assert.ok(Array.isArray(results));
            assert.equal(results.length, 5);
        });
    });

    describe('FindChain double-execute guard', () => {
        it('calling toArray() twice on the same chain throws', async () => {
            const chain = col.find({}).limit(5);
            await chain.toArray();
            assert.throws(() => chain.toArray(), /already executed/i);
        });
    });

    // ── AggregateChain double-execute guard ────────────────────────────────────

    describe('AggregateChain double-execute guard', () => {
        it('calling toArray() twice on the same aggregate chain throws', async () => {
            const chain = col.aggregate([{ $match: {} }]);
            await chain.toArray();
            assert.throws(() => chain.toArray(), /already executed/i);
        });
    });

    // ── col.stream() accessor ──────────────────────────────────────────────────

    describe('col.stream() direct accessor', () => {
        it('returns a readable stream', () => {
            const s = col.stream({});
            assert.equal(typeof s.on, 'function');
            assert.equal(typeof s.pipe, 'function');
            s.destroy?.();
        });

        it('streams all documents matching filter', async () => {
            const s = col.stream({ category: 'A' });
            const docs: any[] = [];
            await new Promise<void>((resolve, reject) => {
                s.on('data', (doc: any) => {
                    assert.equal(doc.category, 'A');
                    docs.push(doc);
                });
                s.on('end', () => {
                    assert.ok(docs.length > 0);
                    resolve();
                });
                s.on('error', reject);
            });
        });

        it('stream with sort option delivers ordered documents', async () => {
            const s = col.stream({}, { sort: { value: 1 }, limit: 10 });
            const values: number[] = [];
            await new Promise<void>((resolve, reject) => {
                s.on('data', (doc: any) => values.push(doc.value));
                s.on('end', () => {
                    assert.equal(values.length, 10);
                    for (let i = 1; i < values.length; i++) {
                        assert.ok(values[i - 1] <= values[i]);
                    }
                    resolve();
                });
                s.on('error', reject);
            });
        });

        it('stream with no matching filter produces empty stream', async () => {
            const s = col.stream({ category: 'NONEXISTENT' });
            const docs: any[] = [];
            await new Promise<void>((resolve, reject) => {
                s.on('data', (doc: any) => docs.push(doc));
                s.on('end', () => {
                    assert.equal(docs.length, 0);
                    resolve();
                });
                s.on('error', reject);
            });
        });
    });

    // ── AggregateChain.stream() ────────────────────────────────────────────────

    describe('AggregateChain.stream()', () => {
        it('returns a readable stream', () => {
            const s = col.aggregate([{ $match: {} }]).stream();
            assert.equal(typeof s.on, 'function');
            s.destroy?.();
        });

        it('streams grouped results', async () => {
            const s = col.aggregate([
                { $group: { _id: '$category', count: { $sum: 1 } } },
            ]).stream();
            const results: any[] = [];
            await new Promise<void>((resolve, reject) => {
                s.on('data', (doc: any) => results.push(doc));
                s.on('end', () => {
                    assert.equal(results.length, 3);
                    resolve();
                });
                s.on('error', reject);
            });
        });
    });

    // ── invalidate() ─────────────────────────────────────────────────────────

    describe('invalidate()', () => {
        it('invalidate() with no arg runs without error', async () => {
            const n = await col.invalidate();
            assert.ok(typeof n === 'number');
        });

        it('invalidate("find") runs without error', async () => {
            const n = await col.invalidate('find');
            assert.ok(typeof n === 'number');
        });

        it('invalidate("findOne") runs without error', async () => {
            const n = await col.invalidate('findOne');
            assert.ok(typeof n === 'number');
        });

        it('invalidate("count") runs without error', async () => {
            const n = await col.invalidate('count');
            assert.ok(typeof n === 'number');
        });

        it('invalidate("findPage") runs without error', async () => {
            const n = await col.invalidate('findPage');
            assert.ok(typeof n === 'number');
        });

        it('invalidate("all") runs without error', async () => {
            const n = await col.invalidate('all');
            assert.ok(typeof n === 'number');
        });

        it('cached result is invalidated after invalidate("find")', async () => {
            await col.find({ active: true }, { limit: 5, cache: 60_000 });
            await col.insertMany([{ name: 'New', category: 'A', value: 999, active: true }]);
            await col.invalidate('find');
            const fresh = await col.find({ active: true }, { limit: 30, cache: 60_000 });
            const hasNew = fresh.some((d: any) => d.value === 999);
            assert.ok(hasNew, 'invalidated cache should include newly inserted document');
        });
    });

    // ── Bookmarks ─────────────────────────────────────────────────────────────

    describe('bookmark lifecycle', () => {
        it('prewarmBookmarks pre-populates pages and listBookmarks returns them', async () => {
            const keyDims = { query: { active: true }, sort: { value: 1 }, limit: 5 };
            const prewarmed = await col.prewarmBookmarks(keyDims, [1, 2]);
            assert.ok(prewarmed.warmed >= 1);
            const listed = await col.listBookmarks(keyDims);
            assert.ok(listed.count >= 1);
        });

        it('clearBookmarks removes previously warmed entries', async () => {
            const keyDims = { query: { category: 'B' }, sort: { value: 1 }, limit: 5 };
            await col.prewarmBookmarks(keyDims, [1]);
            await col.clearBookmarks(keyDims);
            const listed = await col.listBookmarks(keyDims);
            assert.equal(listed.count, 0);
        });

        it('prewarmBookmarks throws INVALID_PAGES for empty pages array', async () => {
            await assert.rejects(
                () => col.prewarmBookmarks({}, []),
                (err: any) => err.code === 'INVALID_PAGES' || /invalid.*pages/i.test(err.message),
            );
        });

        it('listBookmarks without prior prewarm returns empty result', async () => {
            const keyDims = { query: { category: 'NONEXISTENT' }, sort: { value: 1 }, limit: 5 };
            const listed = await col.listBookmarks(keyDims);
            assert.equal(listed.count, 0);
        });
    });
});
