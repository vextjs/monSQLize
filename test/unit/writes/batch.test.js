const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const MonSQLize = require('../../../lib/index.js');

describe('P2-C writes-batch extension', () => {
    it('应通过公开 accessor 暴露 insertBatch/updateBatch/deleteBatch/incrementOne', async () => {
        const calls = {
            insertMany: [],
            updateMany: [],
            deleteMany: [],
            findOneAndUpdate: [],
        };

        const fakeCollection = {
            insertMany: (documents) => {
                calls.insertMany.push(documents);
                return {
                    acknowledged: true,
                    insertedCount: documents.length,
                    insertedIds: Object.fromEntries(documents.map((_, index) => [index, { index }])),
                };
            },
            find: () => ({
                map(transform) {
                    return {
                        toArray() {
                            return [{ _id: 1 }, { _id: 2 }, { _id: 3 }].map(transform);
                        },
                    };
                },
            }),
            updateMany: (filter) => {
                calls.updateMany.push(filter);
                return {
                    acknowledged: true,
                    matchedCount: filter._id.$in.length,
                    modifiedCount: filter._id.$in.length,
                    upsertedCount: 0,
                    upsertedId: null,
                };
            },
            deleteMany: (filter) => {
                calls.deleteMany.push(filter);
                return {
                    acknowledged: true,
                    deletedCount: filter._id.$in.length,
                };
            },
            findOneAndUpdate: (filter, update, options) => {
                calls.findOneAndUpdate.push({ filter, update, options });
                return { _id: 1, count: 5 };
            },
            collectionName: 'users',
        };

        const runtime = new MonSQLize({ type: 'mongodb', databaseName: 'unit_batch' });
        runtime._connected = true;
        runtime._client = {
            db() {
                return {
                    collection() {
                        return fakeCollection;
                    },
                };
            },
        };

        const users = runtime.collection('users');
        const inserted = await users.insertBatch([{ name: 'Ada' }, { name: 'Grace' }, { name: 'Linus' }], { batchSize: 2 });
        const updated = await users.updateBatch({ active: true }, { $set: { active: false } }, { batchSize: 2 });
        const deleted = await users.deleteBatch({ stale: true }, { batchSize: 2 });
        const incremented = await users.incrementOne({ _id: 1 }, 'count', 2, { $set: { touched: true } });

        assert.equal(inserted.insertedCount, 3);
        assert.equal(inserted.batchCount, 2);
        assert.equal(calls.insertMany.length, 2);
        assert.equal(updated.matchedCount, 3);
        assert.equal(updated.batchCount, 2);
        assert.equal(calls.updateMany.length, 2);
        assert.equal(deleted.deletedCount, 3);
        assert.equal(deleted.batchCount, 2);
        assert.equal(calls.deleteMany.length, 2);
        assert.deepEqual(incremented, { _id: 1, count: 5 });
        assert.deepEqual(calls.findOneAndUpdate[0].update, {
            $inc: { count: 2 },
            $set: { touched: true },
        });
    });
});



