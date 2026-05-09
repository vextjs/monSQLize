const { after, before, describe, it } = require('node:test');
const assert = require('node:assert/strict');

const MonSQLize = require('../../../lib/index.js');
const { createMemoryServerBootstrap } = require('../../bootstrap/memory-server');

describe('P2-B MongoDB expression/queries', () => {
    const bootstrap = createMemoryServerBootstrap();
    let uri;

    before(async () => {
        const context = await bootstrap.setup();
        uri = context.uri;
    });

    after(async () => {
        await bootstrap.teardown();
    });

    it('应恢复最小 query façade：find/findOne/count/distinct/findPage 与原生写入透传', async () => {
        const runtime = new MonSQLize({
            type: 'mongodb',
            databaseName: 'p2b_queries',
            config: { uri },
        });

        await runtime.connect();
        const users = runtime.collection('users');

        const insertAda = await users.insertOne({ firstName: 'Ada', lastName: 'Lovelace', category: 'engineer', score: 99 });
        await users.insertOne({ firstName: 'Grace', lastName: 'Hopper', category: 'engineer', score: 98 });
        await users.insertOne({ firstName: 'Alan', lastName: 'Turing', category: 'research', score: 97 });
        const updateAda = await users.updateOne({ firstName: 'Ada' }, { $set: { score: 100 } });

        const found = await users.find({ category: 'engineer' }, { sort: { score: -1 } });
        const one = await users.findOne({ firstName: 'Ada' });
        const count = await users.count({ category: 'engineer' });
        const categories = await users.distinct('category');
        const page = await users.findPage({
            query: {},
            page: 2,
            limit: 2,
            sort: { score: -1 },
        });
        const watcher = users.watch([]);
        const deleteAlan = await users.deleteOne({ firstName: 'Alan' });

        assert.equal(found.length, 2);
        assert.equal(insertAda.acknowledged, true);
        assert.equal(typeof insertAda.insertedId?.toHexString, 'function');
        assert.equal(updateAda.acknowledged, true);
        assert.equal(updateAda.matchedCount, 1);
        assert.equal(typeof updateAda.upsertedCount, 'number');
        assert.equal(found[0].firstName, 'Ada');
        assert.equal(one.lastName, 'Lovelace');
        assert.equal(one.score, 100);
        assert.equal(count, 2);
        assert.deepEqual(categories.sort(), ['engineer', 'research']);
        assert.equal(page.data.length, 1);
        assert.deepEqual(page.page, { page: 2, limit: 2 });
        assert.deepEqual(page.totals, { total: 3, totalPages: 2 });
        assert.equal(deleteAlan.acknowledged, true);
        assert.equal(deleteAlan.deletedCount, 1);
        assert.equal(typeof users.raw, 'function');
        assert.equal(typeof watcher.close, 'function');

        await watcher.close();

        await runtime.close();
    });

    it('aggregate() 应支持最小表达式编译子集', async () => {
        const runtime = new MonSQLize({
            type: 'mongodb',
            databaseName: 'p2b_aggregate',
            config: { uri },
        });

        await runtime.connect();
        const orders = runtime.collection('orders');

        await orders.insertOne({ firstName: 'Ada', lastName: 'Lovelace', amount: 10, createdAt: new Date('2026-05-01T00:00:00Z') });
        await orders.insertOne({ firstName: 'Grace', lastName: 'Hopper', amount: 20, createdAt: new Date('2026-05-02T00:00:00Z') });

        const rows = await orders.aggregate([
            {
                $project: {
                    _id: 0,
                    fullName: MonSQLize.expr("CONCAT(firstName, ' ', lastName)"),
                    orderYear: MonSQLize.expr('YEAR(createdAt)'),
                    amount: 1,
                },
            },
            {
                $sort: { amount: 1 },
            },
        ]);

        assert.deepEqual(rows, [
            { fullName: 'Ada Lovelace', orderYear: 2026, amount: 10 },
            { fullName: 'Grace Hopper', orderYear: 2026, amount: 20 },
        ]);

        await runtime.close();
    });

    it('无效分页参数与不支持的表达式应被阻止', async () => {
        const runtime = new MonSQLize({
            type: 'mongodb',
            databaseName: 'p2b_negative',
            config: { uri },
        });

        await runtime.connect();
        const logs = runtime.collection('logs');

        await assert.rejects(
            () => logs.findPage({ page: 0, limit: 10 }),
            (error) => error && error.code === 'INVALID_PAGINATION',
        );

        await assert.rejects(
            () => logs.aggregate([{ $project: { unsupported: MonSQLize.expr('UNSUPPORTED(metric)') } }]),
            (error) => error && error.code === 'INVALID_EXPRESSION',
        );

        await runtime.close();
    });

    it('应恢复首批 writes-core convenience：insertMany/updateMany/deleteMany', async () => {
        const runtime = new MonSQLize({
            type: 'mongodb',
            databaseName: 'p2c_write_convenience',
            config: { uri },
        });

        await runtime.connect();
        const tasks = runtime.collection('tasks');

        const inserted = await tasks.insertMany([
            { title: 'A', status: 'draft', archived: false },
            { title: 'B', status: 'draft', archived: false },
            { title: 'C', status: 'published', archived: false },
        ]);
        const updated = await tasks.updateMany(
            { status: 'draft' },
            { $set: { archived: true } },
        );
        const archivedTasks = await tasks.find({ archived: true }, { sort: { title: 1 } });
        const deleted = await tasks.deleteMany({ archived: true });
        const remaining = await tasks.count({});

        assert.equal(inserted.acknowledged, true);
        assert.equal(inserted.insertedCount, 3);
        assert.deepEqual(Object.keys(inserted.insertedIds), ['0', '1', '2']);
        assert.equal(updated.acknowledged, true);
        assert.equal(updated.matchedCount, 2);
        assert.equal(updated.modifiedCount, 2);
        assert.equal(updated.upsertedCount, 0);
        assert.deepEqual(archivedTasks.map((item) => item.title), ['A', 'B']);
        assert.equal(deleted.acknowledged, true);
        assert.equal(deleted.deletedCount, 2);
        assert.equal(remaining, 1);

        await runtime.close();
    });

    it('应恢复剩余 writes-core convenience：replaceOne/findOneAnd*/upsertOne', async () => {
        const runtime = new MonSQLize({
            type: 'mongodb',
            databaseName: 'p2c_write_convenience_remaining',
            config: { uri },
        });

        await runtime.connect();
        const profiles = runtime.collection('profiles');

        await profiles.insertOne({ name: 'Ada', role: 'engineer', visits: 1, status: 'active' });

        const replaced = await profiles.replaceOne(
            { name: 'Ada' },
            { name: 'Ada', role: 'architect', visits: 2, status: 'active' },
        );
        const replacedDoc = await profiles.findOne({ name: 'Ada' });
        const updatedDoc = await profiles.findOneAndUpdate(
            { name: 'Ada' },
            { $set: { status: 'inactive' } },
            { returnDocument: 'after' },
        );
        const deletedDoc = await profiles.findOneAndDelete({ name: 'Ada' });
        const afterDeleteCount = await profiles.count({});
        const upserted = await profiles.upsertOne(
            { name: 'Grace' },
            { $set: { role: 'scientist', visits: 1, status: 'active' } },
            { upsert: false },
        );
        const upsertedDoc = await profiles.findOne({ name: 'Grace' });

        assert.equal(replaced.acknowledged, true);
        assert.equal(replaced.matchedCount, 1);
        assert.equal(replaced.modifiedCount, 1);
        assert.equal(replacedDoc.role, 'architect');
        assert.equal(replacedDoc.visits, 2);
        assert.equal(updatedDoc.status, 'inactive');
        assert.equal(deletedDoc.name, 'Ada');
        assert.equal(afterDeleteCount, 0);
        assert.equal(upserted.acknowledged, true);
        assert.equal(upserted.upsertedCount, 1);
        assert.equal(typeof upserted.upsertedId?.toHexString, 'function');
        assert.equal(upsertedDoc.role, 'scientist');

        await runtime.close();
    });
});


