import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    assertWritePathAllowed,
    normalizeWritePathPolicy,
    resolveWritePathRule,
} from '../../../src/capabilities/write-path-policy';

const MonSQLize = require('../../../dist/cjs/index.cjs');

type RuntimeOptions = Record<string, unknown>;

type RuntimeHarness = {
    runtime: any;
    calls: Array<{ op: string; db?: string; collection?: string }>;
};

function createFakeCollection(dbName: string, collectionName: string, calls: RuntimeHarness['calls']) {
    return {
        collectionName,
        namespace: `${dbName}.${collectionName}`,
        insertOne: async () => {
            calls.push({ op: 'insertOne', db: dbName, collection: collectionName });
            return { acknowledged: true, insertedId: `${collectionName}-id` };
        },
        updateOne: async () => {
            calls.push({ op: 'updateOne', db: dbName, collection: collectionName });
            return { acknowledged: true, matchedCount: 1, modifiedCount: 1, upsertedCount: 0, upsertedId: null };
        },
        deleteOne: async () => {
            calls.push({ op: 'deleteOne', db: dbName, collection: collectionName });
            return { acknowledged: true, deletedCount: 1 };
        },
        createIndex: async () => {
            calls.push({ op: 'createIndex', db: dbName, collection: collectionName });
            return `${collectionName}_idx`;
        },
        createIndexes: async () => {
            calls.push({ op: 'createIndexes', db: dbName, collection: collectionName });
            return [`${collectionName}_idx`];
        },
        listIndexes: () => ({
            toArray: async () => [],
        }),
        aggregate: () => ({
            toArray: async () => {
                calls.push({ op: 'aggregate', db: dbName, collection: collectionName });
                return [];
            },
        }),
    };
}

function createFakeDb(dbName: string, calls: RuntimeHarness['calls']) {
    return {
        databaseName: dbName,
        collection: (collectionName: string) => createFakeCollection(dbName, collectionName, calls),
        command: async () => {
            calls.push({ op: 'runCommand', db: dbName });
            return { ok: 1 };
        },
        dropDatabase: async () => {
            calls.push({ op: 'dropDatabase', db: dbName });
            return true;
        },
        listCollections: () => ({
            toArray: async () => [],
        }),
        admin: () => ({
            listDatabases: async () => ({ databases: [] }),
        }),
    };
}

function createConnectedRuntime(options: RuntimeOptions = {}): RuntimeHarness {
    const calls: RuntimeHarness['calls'] = [];
    const runtime = new MonSQLize({
        type: 'mongodb',
        databaseName: 'policy_db',
        ...options,
    });
    runtime._connected = true;
    runtime._client = {
        db: (dbName: string) => createFakeDb(dbName, calls),
    };
    return { runtime, calls };
}

async function expectBlocked(operation: Promise<unknown> | (() => unknown)): Promise<void> {
    if (typeof operation === 'function') {
        assert.throws(operation, /writePathPolicy blocked/);
        return;
    }
    await assert.rejects(operation, /writePathPolicy blocked/);
}

describe('writePathPolicy runtime enforcement', () => {
    afterEach(() => {
        MonSQLize.Model._clear();
    });

    it('keeps collection writes allowed when writePathPolicy is not configured', async () => {
        const { runtime, calls } = createConnectedRuntime();

        await runtime.collection('users').insertOne({ name: 'Ada' });
        runtime.collection('users').raw();

        assert.deepEqual(calls.map((call) => call.op), ['insertOne']);
    });

    it('blocks direct collection writes, raw access, and db raw commands in model-only mode', async () => {
        const { runtime, calls } = createConnectedRuntime({
            writePathPolicy: {
                default: 'model-only',
            },
        });

        await expectBlocked(runtime.collection('users').insertOne({ name: 'Ada' }));
        await expectBlocked(() => runtime.collection('users').raw());
        await expectBlocked(runtime.db().runCommand({ ping: 1 }));
        await expectBlocked(() => runtime.collection('users').aggregate([{ $out: 'users_archive' }]));
        await expectBlocked(runtime._adapter.collection('policy_db', 'users').aggregate([{ $merge: 'users_archive' }]));

        assert.equal(calls.length, 0);
    });

    it('allows model writes and model management operations in model-only mode', async () => {
        const { runtime, calls } = createConnectedRuntime({
            writePathPolicy: {
                default: 'model-only',
            },
        });
        MonSQLize.Model.define('users', { schema: {} });

        const users = runtime.model('users');
        await users.insertOne({ name: 'Ada' });
        await users.createIndex({ name: 1 });
        await users.aggregate([{ $match: {} }, { $out: 'users_archive' }]);

        assert.deepEqual(calls.map((call) => call.op), ['insertOne', 'createIndex', 'aggregate']);
    });

    it('honors namespace overrides without relaxing unrelated collections', async () => {
        const { runtime, calls } = createConnectedRuntime({
            writePathPolicy: {
                default: 'model-only',
                namespaces: {
                    'policy_db.users': 'allow-both',
                },
            },
        });

        await runtime.collection('users').insertOne({ name: 'Ada' });
        await expectBlocked(runtime.collection('orders').insertOne({ total: 42 }));

        assert.deepEqual(calls, [{ op: 'insertOne', db: 'policy_db', collection: 'users' }]);
    });

    it('supports explicit raw and management overrides under model-only mode', async () => {
        const { runtime, calls } = createConnectedRuntime({
            writePathPolicy: {
                default: {
                    mode: 'model-only',
                    raw: 'allow',
                    management: 'allow',
                },
            },
        });

        runtime.collection('users').raw();
        await runtime.collection('users').createIndex({ name: 1 });
        await expectBlocked(runtime.collection('users').insertOne({ name: 'Ada' }));

        assert.deepEqual(calls, [{ op: 'createIndex', db: 'policy_db', collection: 'users' }]);
    });

    it('matches pool-scoped namespace rules before db and collection fallbacks', () => {
        const policy = normalizeWritePathPolicy({
            default: 'model-only',
            namespaces: {
                'analytics:policy_db.users': 'allow-both',
                'policy_db.users': {
                    mode: 'model-only',
                    onViolation: 'warn',
                },
            },
        });

        const poolRule = resolveWritePathRule(policy, {
            pool: 'analytics',
            db: 'policy_db',
            collection: 'users',
        });
        const dbRule = resolveWritePathRule(policy, {
            db: 'policy_db',
            collection: 'users',
        });

        assert.equal(poolRule.key, 'analytics:policy_db.users');
        assert.equal(poolRule.rule.mode, 'allow-both');
        assert.equal(dbRule.key, 'policy_db.users');
        assert.equal(dbRule.rule.mode, 'model-only');
        assert.equal(dbRule.rule.onViolation, 'warn');
    });

    it('validates malformed writePathPolicy options at construction time', () => {
        assert.throws(
            () => new MonSQLize({
                type: 'mongodb',
                databaseName: 'policy_db',
                writePathPolicy: {
                    default: {
                        mode: 'invalid',
                    },
                },
            }),
            /Invalid writePathPolicy config/,
        );
    });

    it('warns instead of throwing when onViolation is warn', () => {
        const warnings: unknown[][] = [];
        const policy = normalizeWritePathPolicy({
            default: {
                mode: 'model-only',
                onViolation: 'warn',
            },
        });

        assert.doesNotThrow(() => assertWritePathAllowed({
            policy,
            namespace: { db: 'policy_db', collection: 'users' },
            source: 'collection',
            operation: 'insertOne',
            category: 'write',
            logger: {
                warn: (...args: unknown[]) => warnings.push(args),
            },
        }));

        assert.equal(warnings.length, 1);
        assert.match(String(warnings[0][0]), /WritePathPolicy/);
    });
});
