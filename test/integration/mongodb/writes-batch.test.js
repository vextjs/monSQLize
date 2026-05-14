const { after, before, describe, it } = require('node:test');
const assert = require('node:assert/strict');

const MonSQLize = require('../../../lib/index.js');
const { createMemoryServerBootstrap } = require('../../bootstrap/memory-server');

describe('P2-C MongoDB writes-batch extension', () => {
    const bootstrap = createMemoryServerBootstrap();
    let uri;

    before(async () => {
        const context = await bootstrap.setup();
        uri = context.uri;
    });

    after(async () => {
        await bootstrap.teardown();
    });

    it('应恢复 insertBatch / updateBatch / deleteBatch / incrementOne', async () => {
        const runtime = new MonSQLize({
            type: 'mongodb',
            databaseName: 'p2c_writes_batch',
            config: { uri },
        });

        await runtime.connect();
        const users = runtime.collection('users');

        const inserted = await users.insertBatch([
            { name: 'Ada', visits: 1, active: true, stale: false },
            { name: 'Grace', visits: 2, active: true, stale: false },
            { name: 'Linus', visits: 3, active: true, stale: true },
            { name: 'Ken', visits: 4, active: true, stale: true },
        ], { batchSize: 2 });

        const updated = await users.updateBatch(
            { active: true },
            { $set: { active: false } },
            { batchSize: 2 },
        );
        const incremented = await users.incrementOne(
            { name: 'Ada' },
            { visits: 2, score: 10 },
            { $set: { label: 'boosted' } },
        );
        const deleted = await users.deleteBatch({ stale: true }, { batchSize: 1 });
        const remaining = await users.find({}, { sort: { name: 1 } });

        assert.equal(inserted.acknowledged, true);
        assert.equal(inserted.insertedCount, 4);
        assert.equal(inserted.batchCount, 2);
        assert.deepEqual(Object.keys(inserted.insertedIds), ['0', '1', '2', '3']);

        assert.equal(updated.acknowledged, true);
        assert.equal(updated.totalCount, 4);
        assert.equal(updated.matchedCount, 4);
        assert.equal(updated.modifiedCount, 4);
        assert.equal(updated.batchCount, 2);

        assert.equal(incremented.value.name, 'Ada');
        assert.equal(incremented.value.visits, 3);
        assert.equal(incremented.value.score, 10);
        assert.equal(incremented.value.label, 'boosted');

        assert.equal(deleted.acknowledged, true);
        assert.equal(deleted.totalCount, 2);
        assert.equal(deleted.deletedCount, 2);
        assert.equal(deleted.batchCount, 2);

        assert.deepEqual(
            remaining.map((item) => ({ name: item.name, active: item.active, stale: item.stale })),
            [
                { name: 'Ada', active: false, stale: false },
                { name: 'Grace', active: false, stale: false },
            ],
        );

        await assert.rejects(
            () => users.insertBatch([], { batchSize: 2 }),
            (error) => error && error.code === 'INVALID_ARGUMENT',
        );

        await assert.rejects(
            () => users.incrementOne({ name: 'Ada' }, ''),
            (error) => error && error.code === 'INVALID_ARGUMENT',
        );

        await runtime.close();
    });
});

