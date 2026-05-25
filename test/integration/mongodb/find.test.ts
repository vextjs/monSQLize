import { after, before, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryServerBootstrap } from '../../bootstrap/memory-server';

const MonSQLize = require('../../../dist/cjs/index.cjs');

type Product = {
    _id?: unknown;
    productId: string;
    name: string;
    price: number;
    category: string;
    inStock: boolean;
    sales: number;
    tags: string[];
    createdAt: Date;
};

describe('find() method', () => {
    const bootstrap = createMemoryServerBootstrap();
    let uri = '';
    let runtime: any;
    let col: any;

    before(async () => {
        const ctx = await bootstrap.setup();
        uri = ctx.uri;
        runtime = new MonSQLize({
            type: 'mongodb',
            databaseName: 'test_find',
            config: { uri },
            findLimit: 200,
        });
        await runtime.connect();
        col = runtime.collection('products');
    });

    after(async () => {
        if (runtime) await runtime.close();
        await bootstrap.teardown();
    });

    beforeEach(async () => {
        const db = runtime._adapter.db;
        await db.collection('products').deleteMany({});

        const docs: Product[] = [];
        for (let i = 1; i <= 100; i++) {
            docs.push({
                productId: `PROD-${String(i).padStart(5, '0')}`,
                name: `Product ${i}`,
                price: i * 100,
                category: i % 3 === 0 ? 'electronics' : i % 3 === 1 ? 'books' : 'clothing',
                inStock: i % 4 !== 0,
                sales: i * 10,
                tags: ['test', `group-${Math.floor(i / 20)}`],
                createdAt: new Date(Date.now() - i * 86400000),
            });
        }
        await db.collection('products').insertMany(docs);
    });

    describe('basic results', () => {
        it('returns an array', async () => {
            const result = await col.find({}, { limit: 10 });
            assert.ok(Array.isArray(result));
            assert.ok(result.length > 0);
            assert.ok(result.length <= 10);
        });

        it('returns empty array when no documents match', async () => {
            const result = await col.find({ category: 'nonexistent' }, { limit: 10 });
            assert.ok(Array.isArray(result));
            assert.equal(result.length, 0);
        });

        it('applies filter condition', async () => {
            const result = await col.find({ category: 'electronics' }, { limit: 50 });
            assert.ok(result.length > 0);
            for (const doc of result) {
                assert.equal(doc.category, 'electronics');
            }
        });

        it('applies sort ascending', async () => {
            const result = await col.find({}, { sort: { price: 1 }, limit: 20 });
            for (let i = 1; i < result.length; i++) {
                assert.ok(result[i - 1].price <= result[i].price);
            }
        });

        it('applies sort descending', async () => {
            const result = await col.find({}, { sort: { price: -1 }, limit: 20 });
            for (let i = 1; i < result.length; i++) {
                assert.ok(result[i - 1].price >= result[i].price);
            }
        });

        it('applies object projection (include)', async () => {
            const result = await col.find({}, { projection: { name: 1, price: 1 }, limit: 5 });
            for (const doc of result) {
                assert.ok(doc._id !== undefined);
                assert.ok(typeof doc.name === 'string');
                assert.ok(typeof doc.price === 'number');
                assert.equal(doc.category, undefined);
                assert.equal(doc.sales, undefined);
            }
        });

        it('applies array projection (select)', async () => {
            const result = await col.find({}, { projection: ['name', 'price', 'category'], limit: 5 });
            for (const doc of result) {
                assert.ok(doc.name !== undefined);
                assert.ok(doc.price !== undefined);
                assert.ok(doc.category !== undefined);
                assert.equal(doc.sales, undefined);
            }
        });

        it('respects limit', async () => {
            const result = await col.find({}, { limit: 7 });
            assert.ok(result.length <= 7);
        });
    });

    describe('complex filter conditions', () => {
        it('supports range query ($gte / $lte)', async () => {
            const result = await col.find({ price: { $gte: 500, $lte: 3000 } }, { limit: 50 });
            assert.ok(result.length > 0);
            for (const doc of result) {
                assert.ok(doc.price >= 500);
                assert.ok(doc.price <= 3000);
            }
        });

        it('supports $in filter', async () => {
            const cats = ['electronics', 'books'];
            const result = await col.find({ category: { $in: cats } }, { limit: 50 });
            assert.ok(result.length > 0);
            for (const doc of result) {
                assert.ok(cats.includes(doc.category));
            }
        });

        it('supports $and compound filter', async () => {
            const result = await col.find({
                $and: [{ inStock: true }, { price: { $gte: 1000 } }, { category: 'electronics' }],
            }, { limit: 30 });
            for (const doc of result) {
                assert.equal(doc.inStock, true);
                assert.ok(doc.price >= 1000);
                assert.equal(doc.category, 'electronics');
            }
        });

        it('supports $or compound filter', async () => {
            const result = await col.find({
                $or: [{ category: 'electronics' }, { sales: { $gte: 800 } }],
            }, { limit: 50 });
            assert.ok(result.length > 0);
            for (const doc of result) {
                assert.ok(doc.category === 'electronics' || doc.sales >= 800);
            }
        });

        it('supports array field element query', async () => {
            const result = await col.find({ tags: 'test' }, { limit: 20 });
            assert.ok(result.length > 0);
            for (const doc of result) {
                assert.ok(Array.isArray(doc.tags));
                assert.ok(doc.tags.includes('test'));
            }
        });

        it('supports nested $or inside $and', async () => {
            const result = await col.find({
                $or: [
                    { $and: [{ category: 'electronics' }, { price: { $gte: 1000 } }] },
                    { $and: [{ category: 'books' }, { sales: { $gte: 500 } }] },
                ],
            }, { limit: 30 });
            assert.ok(Array.isArray(result));
        });
    });

    describe('skip and limit pagination', () => {
        it('skip returns non-overlapping pages', async () => {
            const page1 = await col.find({}, { sort: { price: 1 }, limit: 10, skip: 0 });
            const page2 = await col.find({}, { sort: { price: 1 }, limit: 10, skip: 10 });

            assert.equal(page1.length, 10);
            assert.equal(page2.length, 10);

            const ids1 = new Set(page1.map((d: any) => String(d._id)));
            for (const d of page2) {
                assert.equal(ids1.has(String(d._id)), false);
            }
        });

        it('three consecutive pages contain unique documents', async () => {
            const size = 15;
            const pages = await Promise.all(
                [0, 1, 2].map((i) => col.find({}, { sort: { price: 1 }, limit: size, skip: i * size })),
            );
            const allIds = pages.flat().map((d: any) => String(d._id));
            assert.equal(allIds.length, new Set(allIds).size);
        });

        it('large skip returns empty array', async () => {
            const result = await col.find({}, { sort: { price: 1 }, skip: 1_000_000, limit: 10 });
            assert.equal(result.length, 0);
        });
    });

    describe('multi-field sort', () => {
        it('sorts by multiple fields', async () => {
            const result = await col.find({}, { sort: { category: 1, price: -1 }, limit: 30 });
            assert.ok(Array.isArray(result));
            for (let i = 1; i < result.length; i++) {
                const prev = result[i - 1];
                const cur = result[i];
                if (prev.category === cur.category) {
                    assert.ok(prev.price >= cur.price);
                } else {
                    assert.ok(prev.category <= cur.category);
                }
            }
        });
    });

    describe('query options', () => {
        it('hint is accepted without error', async () => {
            const result = await col.find({ category: 'electronics' }, {
                sort: { price: -1 },
                hint: { _id: 1 },
                limit: 5,
            });
            assert.ok(Array.isArray(result));
        });

        it('maxTimeMS is accepted without error', async () => {
            const result = await col.find({ category: 'books' }, { maxTimeMS: 5000, limit: 5 });
            assert.ok(Array.isArray(result));
        });

        it('collation is accepted without error', async () => {
            const result = await col.find({}, {
                sort: { name: 1 },
                collation: { locale: 'en', strength: 2 },
                limit: 5,
            });
            assert.ok(Array.isArray(result));
        });

        it('empty projection is accepted', async () => {
            const result = await col.find({}, { projection: {}, limit: 5 });
            assert.ok(Array.isArray(result));
        });
    });

    describe('explain mode', () => {
        it('returns queryPlanner with explain: true', async () => {
            const plan = await col.find({ category: 'electronics' }, {
                sort: { price: -1 },
                limit: 10,
                explain: true,
            });
            assert.ok(plan !== null && typeof plan === 'object');
            assert.ok('queryPlanner' in plan);
        });

        it('returns executionStats with explain: "executionStats"', async () => {
            const plan = await col.find({ inStock: true }, {
                sort: { sales: -1 },
                limit: 10,
                explain: 'executionStats',
            });
            assert.ok('executionStats' in plan);
            assert.equal(typeof plan.executionStats.executionTimeMillis, 'number');
        });
    });

    describe('stream mode', () => {
        it('returns a readable stream', async () => {
            const result = await col.find({}, { sort: { price: -1 }, stream: true });
            assert.equal(typeof result.on, 'function');
            assert.equal(typeof result.pipe, 'function');
            result.destroy?.();
        });

        it('streams all matching documents', async () => {
            const stream = await col.find({ inStock: true }, { stream: true });
            const items: unknown[] = [];
            await new Promise<void>((resolve, reject) => {
                stream.on('data', (doc: any) => {
                    assert.equal(doc.inStock, true);
                    items.push(doc);
                });
                stream.on('end', () => {
                    assert.ok(items.length > 0);
                    resolve();
                });
                stream.on('error', reject);
            });
        });

        it('stream respects sort order', async () => {
            const stream = await col.find({}, { sort: { price: 1 }, stream: true, limit: 30 });
            const prices: number[] = [];
            await new Promise<void>((resolve, reject) => {
                stream.on('data', (doc: any) => prices.push(doc.price));
                stream.on('end', () => {
                    for (let i = 1; i < prices.length; i++) {
                        assert.ok(prices[i - 1] <= prices[i]);
                    }
                    resolve();
                });
                stream.on('error', reject);
            });
        });
    });

    describe('FindChain chaining API', () => {
        it('chained .limit() overrides options limit', async () => {
            const result = await col.find({}).limit(5);
            assert.ok(result.length <= 5);
        });

        it('chained .skip() offsets results', async () => {
            const all = await col.find({}, { sort: { price: 1 }, limit: 20 });
            const skipped = await col.find({}).sort({ price: 1 }).skip(5).limit(10);
            assert.equal(String(skipped[0]._id), String(all[5]._id));
            assert.equal(String(skipped[4]._id), String(all[9]._id));
        });

        it('chained .sort() applies ordering', async () => {
            const result = await col.find({}).sort({ sales: -1 }).limit(10);
            for (let i = 1; i < result.length; i++) {
                assert.ok(result[i - 1].sales >= result[i].sales);
            }
        });

        it('chained .project() applies projection', async () => {
            const result = await col.find({}).project({ name: 1 }).limit(5);
            for (const doc of result) {
                assert.ok(typeof doc.name === 'string');
                assert.equal(doc.price, undefined);
            }
        });

        it('chained .hint() accepted without error', async () => {
            const result = await col.find({ category: 'books' }).hint({ _id: 1 }).limit(5);
            assert.ok(Array.isArray(result));
        });

        it('chained .maxTimeMS() accepted without error', async () => {
            const result = await col.find({}).maxTimeMS(5000).limit(5);
            assert.ok(Array.isArray(result));
        });

        it('chained .collation() accepted without error', async () => {
            const result = await col.find({}).collation({ locale: 'en' }).sort({ name: 1 }).limit(5);
            assert.ok(Array.isArray(result));
        });

        it('chained .stream() returns readable stream', () => {
            const stream = col.find({}).limit(10).stream();
            assert.equal(typeof stream.on, 'function');
            stream.destroy?.();
        });

        it('chained .explain() returns plan object', async () => {
            const plan = await col.find({ category: 'electronics' }).sort({ price: -1 }).explain();
            assert.ok(plan !== null && typeof plan === 'object');
        });

        it('limit() rejects negative value', () => {
            assert.throws(() => col.find({}).limit(-1), /non-negative/);
        });

        it('skip() rejects negative value', () => {
            assert.throws(() => col.find({}).skip(-1), /non-negative/);
        });
    });

    describe('cache option', () => {
        it('returns consistent results on repeated cached query', async () => {
            const opts = { sort: { price: 1 }, limit: 5, cache: 60_000 };
            const first = await col.find({ category: 'books' }, opts);
            const second = await col.find({ category: 'books' }, opts);
            assert.equal(first.length, second.length);
            if (first.length > 0) {
                assert.equal(String(first[0]._id), String(second[0]._id));
            }
        });

        it('cached result is served even after document is deleted from DB', async () => {
            const opts = { sort: { price: 1 }, limit: 3, cache: 60_000 };
            const first = await col.find({ category: 'clothing' }, opts);
            assert.ok(first.length > 0);

            const db = runtime._adapter.db;
            await db.collection('products').deleteMany({ category: 'clothing' });

            const cached = await col.find({ category: 'clothing' }, opts);
            assert.equal(cached.length, first.length);
        });

        it('different queries use separate cache entries', async () => {
            const r1 = await col.find({ category: 'electronics' }, { limit: 3, cache: 60_000 });
            const r2 = await col.find({ category: 'books' }, { limit: 3, cache: 60_000 });
            const cats1 = r1.map((d: any) => d.category);
            const cats2 = r2.map((d: any) => d.category);
            assert.ok(cats1.every((c: string) => c === 'electronics'));
            assert.ok(cats2.every((c: string) => c === 'books'));
        });
    });
});
