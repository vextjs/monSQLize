import { after, before, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryServerBootstrap } from '../../bootstrap/memory-server';

const MonSQLize = require('../../../dist/cjs/index.cjs');

type Order = {
    _id?: unknown;
    orderId: string;
    amount: number;
    status: string;
    customerId: string;
    priority: number;
    metrics: { rank: number };
    createdAt: Date;
};

describe('findPage() / findAndCount()', () => {
    const bootstrap = createMemoryServerBootstrap();
    let uri = '';
    let runtime: any;
    let col: any;

    before(async () => {
        const ctx = await bootstrap.setup();
        uri = ctx.uri;
        runtime = new MonSQLize({
            type: 'mongodb',
            databaseName: 'test_findpage',
            config: { uri },
            findLimit: 200,
        });
        await runtime.connect();
        col = runtime.collection('orders');
    });

    after(async () => {
        if (runtime) await runtime.close();
        await bootstrap.teardown();
    });

    beforeEach(async () => {
        const db = runtime._adapter.db;
        await db.collection('orders').deleteMany({});

        const docs: Omit<Order, '_id'>[] = [];
        for (let i = 1; i <= 100; i++) {
            docs.push({
                orderId: `ORD-${String(i).padStart(5, '0')}`,
                amount: i * 100,
                status: i % 3 === 0 ? 'completed' : i % 3 === 1 ? 'paid' : 'pending',
                customerId: `CUST-${Math.floor(i / 10)}`,
                priority: i % 5,
                metrics: { rank: i },
                createdAt: new Date(Date.now() - i * 86400000),
            });
        }
        await db.collection('orders').insertMany(docs);
    });

    // ── findAndCount() ────────────────────────────────────────────────────────

    describe('findAndCount() basic results', () => {
        it('returns { data, total } for all documents', async () => {
            const result = await col.findAndCount({});
            assert.ok(Array.isArray(result.data));
            assert.equal(result.data.length, 100);
            assert.equal(result.total, 100);
        });

        it('total reflects full collection size regardless of limit', async () => {
            const result = await col.findAndCount({ status: 'paid' }, { limit: 5 });
            assert.ok(result.total > 5);
            assert.equal(result.data.length, 5);
        });

        it('filters data and total consistently', async () => {
            const result = await col.findAndCount({ status: 'completed' });
            assert.ok(result.total > 0);
            assert.equal(result.data.length, result.total);
            for (const doc of result.data) {
                assert.equal(doc.status, 'completed');
            }
        });

        it('applies limit to data but not to total', async () => {
            const result = await col.findAndCount({ status: 'paid' }, { limit: 10 });
            const expected = await col.findAndCount({ status: 'paid' });
            assert.equal(result.total, expected.total);
            assert.equal(result.data.length, 10);
        });

        it('applies skip for pagination offset', async () => {
            const page1 = await col.findAndCount({}, { sort: { amount: 1 }, limit: 10, skip: 0 });
            const page2 = await col.findAndCount({}, { sort: { amount: 1 }, limit: 10, skip: 10 });
            assert.equal(page1.total, page2.total);
            assert.equal(page1.data.length, 10);
            assert.equal(page2.data.length, 10);
            assert.notEqual(String(page1.data[0]._id), String(page2.data[0]._id));
        });

        it('applies sort to data array', async () => {
            const result = await col.findAndCount({}, { sort: { amount: -1 }, limit: 5 });
            assert.equal(result.data.length, 5);
            for (let i = 1; i < result.data.length; i++) {
                assert.ok(result.data[i - 1].amount >= result.data[i].amount);
            }
        });

        it('applies projection to data', async () => {
            const result = await col.findAndCount({}, { projection: { orderId: 1, amount: 1 }, limit: 5 });
            assert.equal(result.data.length, 5);
            for (const doc of result.data) {
                assert.ok(doc._id !== undefined);
                assert.ok(typeof doc.orderId === 'string');
                assert.ok(typeof doc.amount === 'number');
                assert.equal(doc.status, undefined);
            }
        });

        it('applies project alias to data projection', async () => {
            const result = await col.findAndCount({}, { project: { orderId: 1, amount: 1 }, limit: 5 });
            assert.equal(result.data.length, 5);
            for (const doc of result.data) {
                assert.ok(doc._id !== undefined);
                assert.ok(typeof doc.orderId === 'string');
                assert.ok(typeof doc.amount === 'number');
                assert.equal(doc.status, undefined);
            }
        });

        it('returns { data: [], total: 0 } when nothing matches', async () => {
            const result = await col.findAndCount({ status: 'nonexistent' });
            assert.equal(result.total, 0);
            assert.equal(result.data.length, 0);
            assert.ok(Array.isArray(result.data));
        });

        it('treats null query as match-all', async () => {
            const result = await col.findAndCount(null as any);
            assert.equal(result.total, 100);
        });

        it('supports $and compound filter', async () => {
            const result = await col.findAndCount({
                $and: [{ status: 'paid' }, { amount: { $gte: 1000 } }],
            });
            assert.ok(result.total > 0);
            for (const doc of result.data) {
                assert.equal(doc.status, 'paid');
                assert.ok(doc.amount >= 1000);
            }
        });

        it('three pages cover all documents exactly once', async () => {
            const pageSize = 10;
            const status = 'paid';
            const [p1, p2, p3] = await Promise.all([
                col.findAndCount({ status }, { sort: { amount: 1 }, limit: pageSize, skip: 0 }),
                col.findAndCount({ status }, { sort: { amount: 1 }, limit: pageSize, skip: pageSize }),
                col.findAndCount({ status }, { sort: { amount: 1 }, limit: pageSize, skip: pageSize * 2 }),
            ]);
            const allIds = [...p1.data, ...p2.data, ...p3.data].map((d: any) => String(d._id));
            assert.equal(allIds.length, new Set(allIds).size);
        });

        it('hint is accepted without error', async () => {
            const result = await col.findAndCount({ status: 'paid' }, { hint: { _id: 1 }, limit: 5 });
            assert.ok(Array.isArray(result.data));
        });

        it('maxTimeMS is accepted without error', async () => {
            const result = await col.findAndCount({}, { maxTimeMS: 5000, limit: 5 });
            assert.ok(Array.isArray(result.data));
        });
    });

    // ── findPage() ─────────────────────────────────────────────────────────────

    describe('findPage() basic cursor pagination', () => {
        it('returns items and pageInfo on first page', async () => {
            const result = await col.findPage({ query: {}, sort: { amount: 1 }, limit: 10 });
            assert.ok(Array.isArray(result.items));
            assert.equal(result.items.length, 10);
            assert.ok(result.pageInfo !== undefined);
            assert.equal(typeof result.pageInfo.hasNext, 'boolean');
            assert.equal(typeof result.pageInfo.hasPrev, 'boolean');
            assert.ok(typeof result.pageInfo.startCursor === 'string');
            assert.ok(typeof result.pageInfo.endCursor === 'string');
            assert.equal(result.pageInfo.hasPrev, false);
            assert.equal(result.pageInfo.hasNext, true);
        });

        it('next page via after cursor has non-overlapping documents', async () => {
            const page1 = await col.findPage({ query: {}, sort: { amount: 1 }, limit: 10 });
            assert.ok(page1.pageInfo.hasNext, 'first page should have a next page');

            const page2 = await col.findPage({
                query: {},
                sort: { amount: 1 },
                limit: 10,
                after: page1.pageInfo.endCursor,
            });

            assert.ok(page2.items.length > 0);
            assert.equal(page2.pageInfo.hasPrev, true);

            const ids1 = new Set(page1.items.map((d: any) => String(d._id)));
            for (const doc of page2.items) {
                assert.equal(ids1.has(String(doc._id)), false);
            }
        });

        it('paginates correctly with nested sort fields', async () => {
            const page1 = await col.findPage({ query: {}, sort: { 'metrics.rank': 1 }, limit: 10 });
            assert.deepEqual(page1.items.map((doc: any) => doc.metrics.rank), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);

            const page2 = await col.findPage({
                query: {},
                sort: { 'metrics.rank': 1 },
                limit: 10,
                after: page1.pageInfo.endCursor,
            });
            assert.deepEqual(page2.items.map((doc: any) => doc.metrics.rank), [11, 12, 13, 14, 15, 16, 17, 18, 19, 20]);
        });

        it('last page has hasNext: false', async () => {
            const result = await col.findPage({ query: {}, sort: { amount: 1 }, limit: 100 });
            assert.equal(result.pageInfo.hasNext, false);
            assert.equal(result.items.length, 100);
        });

        it('applies filter to items', async () => {
            const result = await col.findPage({ query: { status: 'paid' }, sort: { amount: -1 }, limit: 10 });
            assert.ok(result.items.length > 0);
            for (const doc of result.items) {
                assert.equal(doc.status, 'paid');
            }
        });

        it('items are in correct sort order', async () => {
            const result = await col.findPage({ query: {}, sort: { amount: 1 }, limit: 20 });
            for (let i = 1; i < result.items.length; i++) {
                assert.ok(result.items[i - 1].amount <= result.items[i].amount);
            }
        });
    });

    describe('findPage() jump pagination', () => {
        it('jumps to page N and returns currentPage in pageInfo', async () => {
            const page3 = await col.findPage({
                query: {},
                sort: { amount: 1 },
                limit: 10,
                page: 3,
                jump: { step: 10, maxHops: 20 },
            });
            assert.ok(Array.isArray(page3.items));
            assert.ok(page3.items.length > 0);
            assert.equal(page3.pageInfo.currentPage, 3);
        });

        it('page 1 documents do not overlap page 3 documents', async () => {
            const opts = { query: {}, sort: { amount: 1 }, limit: 10, jump: { step: 10, maxHops: 20 } };
            const page1 = await col.findPage({ ...opts, page: 1 });
            const page3 = await col.findPage({ ...opts, page: 3 });
            const ids1 = new Set(page1.items.map((d: any) => String(d._id)));
            for (const doc of page3.items) {
                assert.equal(ids1.has(String(doc._id)), false);
            }
        });

        it('JUMP_TOO_FAR error when jump distance exceeds maxHops', async () => {
            await assert.rejects(
                () => col.findPage({
                    query: {},
                    sort: { amount: 1 },
                    limit: 10,
                    page: 100,
                    jump: { step: 10, maxHops: 3 },
                }),
                (err: any) => err.code === 'JUMP_TOO_FAR' || /jump/i.test(err.message),
            );
        });

        it('uses prewarmed bookmark pages as jump resume points', async () => {
            const keyDims = { query: {}, sort: { amount: 1 }, limit: 10 };
            const warmed = await col.prewarmBookmarks(keyDims, [2]);
            assert.equal(warmed.warmed, 1);

            const page3 = await col.findPage({
                ...keyDims,
                page: 3,
                jump: { step: 10, maxHops: 1 },
                meta: { level: 'sub' },
            });

            assert.equal(page3.pageInfo.currentPage, 3);
            assert.equal(page3.items[0].amount, 2100);
            assert.ok(page3.meta.steps.some((step: { name: string }) => step.name === 'bookmark-2'));
        });

        it('uses prewarmed bookmark pages with the default page limit', async () => {
            const keyDims = { query: {}, sort: { amount: 1 } };
            const warmed = await col.prewarmBookmarks(keyDims, [2]);
            assert.equal(warmed.warmed, 1);

            const page3 = await col.findPage({
                ...keyDims,
                page: 3,
                jump: { step: 10, maxHops: 1 },
                meta: { level: 'sub' },
            });

            assert.equal(page3.pageInfo.currentPage, 3);
            assert.equal(page3.items[0].amount, 4100);
            assert.ok(page3.meta.steps.some((step: { name: string }) => step.name === 'bookmark-2'));
        });
    });

    describe('findPage() empty and edge cases', () => {
        it('returns empty items when filter matches nothing', async () => {
            const result = await col.findPage({ query: { status: 'nonexistent' }, sort: { amount: 1 }, limit: 10 });
            assert.equal(result.items.length, 0);
            assert.equal(result.pageInfo.hasNext, false);
        });

        it('limit 1 returns exactly 1 item per page', async () => {
            const result = await col.findPage({ query: {}, sort: { amount: 1 }, limit: 1 });
            assert.equal(result.items.length, 1);
            assert.equal(result.pageInfo.hasNext, true);
        });
    });
});
