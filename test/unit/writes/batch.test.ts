import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

const MonSQLize = require('../../../dist/cjs/index.cjs');

type Calls = {
    insertMany: unknown[][];
    updateMany: unknown[];
    deleteMany: unknown[];
    findOneAndUpdate: Array<{ filter: unknown; update: unknown; options: unknown }>;
};

type FilterWithIds = {
    _id: {
        $in: unknown[];
    };
};

describe('P2-C writes-batch extension', () => {
    it('exposes insertBatch/updateBatch/deleteBatch/incrementOne through public accessors', async () => {
        const calls: Calls = {
            insertMany: [],
            updateMany: [],
            deleteMany: [],
            findOneAndUpdate: [],
        };

        const fakeCollection = {
            insertMany: (documents: unknown[]) => {
                calls.insertMany.push(documents);
                return {
                    acknowledged: true,
                    insertedCount: documents.length,
                    insertedIds: Object.fromEntries(documents.map((_, index) => [index, { index }])),
                };
            },
            find: () => ({
                map(transform: (document: { _id: number }) => unknown) {
                    return {
                        toArray() {
                            return [{ _id: 1 }, { _id: 2 }, { _id: 3 }].map(transform);
                        },
                    };
                },
            }),
            updateMany: (filter: FilterWithIds) => {
                calls.updateMany.push(filter);
                return {
                    acknowledged: true,
                    matchedCount: filter._id.$in.length,
                    modifiedCount: filter._id.$in.length,
                    upsertedCount: 0,
                    upsertedId: null,
                };
            },
            deleteMany: (filter: FilterWithIds) => {
                calls.deleteMany.push(filter);
                return {
                    acknowledged: true,
                    deletedCount: filter._id.$in.length,
                };
            },
            findOneAndUpdate: (filter: unknown, update: unknown, options: unknown) => {
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
        assert.equal(incremented.modifiedCount, 1);
        assert.deepEqual(incremented.value, { _id: 1, count: 5 });
        assert.deepEqual(calls.findOneAndUpdate[0].update, {
            $inc: { count: 2 },
            $set: { touched: true },
        });
    });
});