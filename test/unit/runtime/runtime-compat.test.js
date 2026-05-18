const { beforeEach, describe, it } = require('node:test');
const assert = require('node:assert/strict');

const MonSQLize = require('../../../lib/index.js');

function resolved(value) {
    return Promise.resolve(value);
}

function createMockCollection(name) {
    return {
        getNamespace() {
            return { iid: `mock:${name}`, type: 'mongodb', db: 'compat_db', collection: name };
        },
        raw() { return {}; },
        find: () => resolved([]),
        findOne: () => resolved(null),
        findOneById: () => resolved(null),
        findByIds: () => resolved([]),
        findPage: () => resolved({ items: [], pageInfo: { hasNext: false, hasPrev: false, startCursor: null, endCursor: null } }),
        findAndCount: () => resolved({ data: [], total: 0 }),
        count: () => resolved(0),
        insertOne: () => resolved({ acknowledged: true, insertedId: 1 }),
        insertMany: () => resolved({ acknowledged: true, insertedCount: 0, insertedIds: {} }),
        updateOne: () => resolved({ acknowledged: true, matchedCount: 0, modifiedCount: 0, upsertedCount: 0, upsertedId: null }),
        updateMany: () => resolved({ acknowledged: true, matchedCount: 0, modifiedCount: 0, upsertedCount: 0, upsertedId: null }),
        replaceOne: () => resolved({ acknowledged: true, matchedCount: 0, modifiedCount: 0, upsertedCount: 0, upsertedId: null }),
        findOneAndUpdate: () => resolved(null),
        findOneAndReplace: () => resolved(null),
        findOneAndDelete: () => resolved(null),
        upsertOne: () => resolved({ acknowledged: true, matchedCount: 0, modifiedCount: 0, upsertedCount: 1, upsertedId: 1 }),
        deleteOne: () => resolved({ acknowledged: true, deletedCount: 0 }),
        deleteMany: () => resolved({ acknowledged: true, deletedCount: 0 }),
        incrementOne: () => resolved({ acknowledged: true, matchedCount: 0, modifiedCount: 0, value: null }),
        insertBatch: () => resolved({ acknowledged: true, totalCount: 0, insertedCount: 0, batchCount: 0, insertedIds: {}, errors: [] }),
        updateBatch: () => resolved({ acknowledged: true, totalCount: 0, matchedCount: 0, modifiedCount: 0, upsertedCount: 0, batchCount: 0, errors: [], retries: [] }),
        deleteBatch: () => resolved({ acknowledged: true, totalCount: 0, deletedCount: 0, batchCount: 0, errors: [], retries: [] }),
        createIndex: () => resolved('idx'),
        createIndexes: () => resolved(['idx']),
        listIndexes: () => resolved([]),
        dropIndex: () => resolved({}),
        dropIndexes: () => resolved({}),
        distinct: () => resolved([]),
        aggregate: () => resolved([]),
        watch: () => ({ close: () => resolved() }),
    };
}

describe('P6 runtime compat mock path', () => {
    beforeEach(() => {
        MonSQLize.Model._clear();
    });

    it('应在未连接场景下通过 dbInstance 兼容路径创建并缓存 model 实例', () => {
        const runtime = new MonSQLize({ type: 'mongodb', databaseName: 'compat_db' });
        const defaultCollection = createMockCollection('users');
        const scopedCollection = createMockCollection('audit_users');

        Object.defineProperty(runtime, 'dbInstance', {
            configurable: true,
            value: {
                collection(name) {
                    return name === 'audit_users' ? scopedCollection : defaultCollection;
                },
                db() {
                    return {};
                },
            },
        });
        Object.defineProperty(runtime, 'databaseName', {
            configurable: true,
            value: 'compat_db',
        });

        runtime._resolveModelCollection = (collectionName) => {
            return collectionName === 'audit_users' ? scopedCollection : defaultCollection;
        };

        MonSQLize.Model.define('users', { schema: {} });
        MonSQLize.Model.define('auditUsers', {
            collection: 'audit_users',
            schema: {},
            connection: { database: 'audit_db' },
        });

        const first = runtime.model('users');
        const second = runtime.model('users');
        assert.strictEqual(first, second);
        assert.equal(first.collectionName, 'users');
        assert.equal(first.dbName, 'compat_db');

        const scoped = runtime.model('auditUsers');
        assert.equal(scoped.collectionName, 'audit_users');
        assert.equal(scoped.dbName, 'compat_db');

        const scopedViaApi = runtime.scopedModel('users');
        assert.equal(scopedViaApi.collectionName, 'users');
        assert.equal(scopedViaApi.getNamespace().collection, 'users');
    });
});
