import { beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { MongoCollectionAccessor } from '../../../src/adapters/mongodb/common/collection-accessor';

const MonSQLize = require('../../../dist/cjs/index.cjs');

function resolved<T>(value?: T): Promise<T | undefined> {
    return Promise.resolve(value);
}

function createMockCollection(name: string) {
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

    it('creates and caches model instances through the dbInstance compatibility path before connect', () => {
        const runtime = new MonSQLize({ type: 'mongodb', databaseName: 'compat_db' });
        const defaultCollection = createMockCollection('users');
        const scopedCollection = createMockCollection('audit_users');

        Object.defineProperty(runtime, 'dbInstance', {
            configurable: true,
            value: {
                collection(collectionName: string) {
                    return collectionName === 'audit_users' ? scopedCollection : defaultCollection;
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

        runtime._resolveModelCollection = (collectionName: string) => {
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

    it('supports the v1 find(query, projection, options) overload at runtime', async () => {
        let capturedQuery: unknown;
        let capturedOptions: Record<string, unknown> | undefined;

        const nativeCollection = {
            namespace: 'compat_db.users',
            find(query: unknown, options?: Record<string, unknown>) {
                capturedQuery = query;
                capturedOptions = options;
                return {
                    toArray: () => resolved([{ name: 'Ada' }]),
                };
            },
        };

        const accessor = new MongoCollectionAccessor(
            'compat_db',
            'users',
            nativeCollection as never,
        );

        const result = await accessor.find(
            { active: true },
            ['name', 'email'],
            { limit: 2 },
        );

        assert.deepEqual(result, [{ name: 'Ada' }]);
        assert.deepEqual(capturedQuery, { active: true });
        assert.deepEqual(capturedOptions, {
            limit: 2,
            projection: { name: 1, email: 1 },
        });
    });
});
