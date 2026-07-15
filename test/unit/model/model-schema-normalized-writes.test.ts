import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    orchestrateModelFindOneAndReplace,
    orchestrateModelInsertBatch,
    orchestrateModelInsertMany,
    orchestrateModelInsertOne,
    orchestrateModelReplaceOne,
    type ModelMutationContext,
} from '../../../src/capabilities/model/model-mutation-orchestrator';
import {
    saveModelDocument,
    validateModelDocument,
} from '../../../src/capabilities/model/model-instance-helpers';
import { validateModelSchemaPayload } from '../../../src/capabilities/model/model-write-helpers';

type Call = { method: string; args: unknown[] };

function createCollection() {
    const calls: Call[] = [];
    const record = (method: string, result: unknown) => async (...args: unknown[]) => {
        calls.push({ method, args });
        return result;
    };
    return {
        calls,
        find: record('find', []),
        findOne: record('findOne', { __v: 0 }),
        insertOne: record('insertOne', { acknowledged: true, insertedId: 'new-id' }),
        insertMany: record('insertMany', { acknowledged: true, insertedCount: 1 }),
        replaceOne: record('replaceOne', { acknowledged: true, matchedCount: 1, modifiedCount: 1 }),
        findOneAndReplace: record('findOneAndReplace', { id: 'replaced' }),
        insertBatch: record('insertBatch', { acknowledged: true, insertedCount: 1 }),
    };
}

function createMutationContext(
    overrides: Partial<ModelMutationContext<Record<string, unknown>>> = {},
) {
    const collection = createCollection();
    const now = new Date('2026-07-15T09:00:00.000Z');
    const context: ModelMutationContext<Record<string, unknown>> = {
        collectionName: 'normalized_documents',
        collection: collection as never,
        extendedCollection: () => collection as never,
        applyDefaults: (document = {}) => ({ modelDefault: true, ...document }),
        nowDate: () => now,
        timestampsConfig: { createdAt: 'createdAt', updatedAt: 'updatedAt' },
        softDeleteConfig: null,
        versionConfig: { enabled: true, field: '__v', updateMany: 'counter' },
        validateEnabled: true,
        schemaCache: {},
        schemaValidateFn: () => ({ valid: true }),
        hooksFactory: null,
        runHook: async () => {},
        ...overrides,
    };
    return { collection, context, now };
}

describe('Model normalized full-document writes', () => {
    it('persists normalized schema data across all orchestrator write paths', async () => {
        const previousCreatedAt = new Date('2025-01-01T00:00:00.000Z');
        const { context, collection, now } = createMutationContext({
            schemaValidateFn: (_schema, document) => {
                const payload = document as Record<string, unknown>;
                return {
                    valid: true,
                    data: {
                        name: payload.name,
                        age: Number(payload.age),
                        schemaDefault: 'normalized',
                    },
                };
            },
        });

        await orchestrateModelInsertOne(context, { name: 'one', age: '21' });
        await orchestrateModelInsertMany(context, [{ name: 'many', age: '22' }]);
        await orchestrateModelInsertBatch(context, [{ name: 'batch', age: '23' }]);
        await orchestrateModelReplaceOne(context, { id: 1, __v: 0 }, { name: 'replace', age: '24', createdAt: previousCreatedAt });
        await orchestrateModelFindOneAndReplace(context, { id: 2, __v: 0 }, { name: 'find-replace', age: '25', createdAt: previousCreatedAt });

        const insertOnePayload = collection.calls.find((call) => call.method === 'insertOne')?.args[0] as Record<string, unknown>;
        const insertManyPayload = collection.calls.find((call) => call.method === 'insertMany')?.args[0] as Array<Record<string, unknown>>;
        const insertBatchPayload = collection.calls.find((call) => call.method === 'insertBatch')?.args[0] as Array<Record<string, unknown>>;
        const replacePayload = collection.calls.find((call) => call.method === 'replaceOne')?.args[1] as Record<string, unknown>;
        const findReplacePayload = collection.calls.find((call) => call.method === 'findOneAndReplace')?.args[1] as Record<string, unknown>;

        for (const [payload, age] of [
            [insertOnePayload, 21],
            [insertManyPayload[0], 22],
            [insertBatchPayload[0], 23],
            [replacePayload, 24],
            [findReplacePayload, 25],
        ] as Array<[Record<string, unknown>, number]>) {
            assert.equal(payload.age, age);
            assert.equal(payload.schemaDefault, 'normalized');
            assert.equal(payload.updatedAt, now);
            assert.equal(typeof payload.__v, 'number');
        }
        assert.equal(replacePayload.createdAt, previousCreatedAt);
        assert.equal(findReplacePayload.createdAt, previousCreatedAt);
    });

    it('applies bulk defaults before hooks and schema normalization before system fields', async () => {
        const stages: string[] = [];
        const hookSnapshots: unknown[] = [];
        const { context, collection } = createMutationContext({
            applyDefaults: (document = {}) => {
                stages.push('defaults');
                return { defaulted: true, ...document };
            },
            hooksFactory: () => ({
                find: undefined,
                insert: {
                    before: (_hookContext, documents) => {
                        stages.push('hook');
                        hookSnapshots.push(structuredClone(documents));
                        for (const document of documents as Array<Record<string, unknown>>) {
                            document.hooked = true;
                        }
                    },
                },
                update: undefined,
                delete: undefined,
            }),
            schemaValidateFn: (_schema, document) => {
                stages.push('schema');
                assert.equal((document as Record<string, unknown>).defaulted, true);
                assert.equal((document as Record<string, unknown>).hooked, true);
                assert.equal((document as Record<string, unknown>).createdAt, undefined);
                assert.equal((document as Record<string, unknown>).__v, undefined);
                return { valid: true, data: { ...(document as Record<string, unknown>), normalized: true } };
            },
        });

        await orchestrateModelInsertMany(context, [{ name: 'many' }]);
        await orchestrateModelInsertBatch(context, [{ name: 'batch' }]);

        assert.deepEqual(stages, ['defaults', 'hook', 'schema', 'defaults', 'hook', 'schema']);
        assert.deepEqual(hookSnapshots, [
            [{ defaulted: true, name: 'many' }],
            [{ defaulted: true, name: 'batch' }],
        ]);
        const many = collection.calls.find((call) => call.method === 'insertMany')?.args[0] as Array<Record<string, unknown>>;
        const batch = collection.calls.find((call) => call.method === 'insertBatch')?.args[0] as Array<Record<string, unknown>>;
        assert.equal(many[0].normalized, true);
        assert.equal(batch[0].normalized, true);
    });

    it('blocks failed and non-object results before driver reads or writes', async () => {
        const failed = createMutationContext({
            schemaValidateFn: () => ({
                valid: false,
                data: { mustNotWrite: true },
                errors: [{ path: '/name', message: 'name is required' }],
            }),
        });
        await assert.rejects(
            () => orchestrateModelInsertMany(failed.context, [{ name: 'first' }]),
            (error: unknown) => {
                const typed = error as Error & { code?: string; errors?: unknown; index?: number };
                assert.equal(typed.code, 'VALIDATION_ERROR');
                assert.deepEqual(typed.errors, [{ field: '/name', message: 'name is required' }]);
                assert.equal(typed.index, 0);
                return true;
            },
        );
        assert.equal(failed.collection.calls.length, 0);

        const invalidData = createMutationContext({
            schemaValidateFn: () => ({ valid: true, data: ['not', 'a', 'document'] }),
        });
        await assert.rejects(
            () => orchestrateModelReplaceOne(invalidData.context, { _id: 'id-with-lock-lookup' }, { name: 'Ada' }),
            (error: unknown) => {
                const typed = error as Error & { code?: string; errors?: unknown };
                assert.equal(typed.code, 'VALIDATION_ERROR');
                assert.deepEqual(typed.errors, [{
                    field: '_schema',
                    message: 'Schema validation returned non-object data for a complete-document write.',
                }]);
                return true;
            },
        );
        assert.equal(invalidData.collection.calls.length, 0);

        const original = { untouched: true };
        assert.equal(validateModelSchemaPayload({
            validateEnabled: false,
            schemaCache: {},
            schemaValidateFn: () => ({ valid: true, data: { changed: true } }),
        }, original), original);
    });

    it('keeps public validation data exact and persists normalized save payloads', async () => {
        assert.deepEqual(validateModelDocument({
            schemaError: null,
            schemaCache: {},
            schemaValidateFn: () => ({ valid: true, data: false }),
        }, { original: true }), {
            valid: true,
            errors: [],
            data: false,
        });

        const calls: Array<[string, ...unknown[]]> = [];
        const collection = {
            async replaceOne(...args: unknown[]) {
                calls.push(['replaceOne', ...args]);
                return { matchedCount: 1, modifiedCount: 1 };
            },
            async insertOne(...args: unknown[]) {
                calls.push(['insertOne', ...args]);
                return { insertedId: 'new-id' };
            },
        };
        const now = new Date('2026-07-15T09:00:00.000Z');
        const schemaValidationContext = {
            validateEnabled: true,
            schemaCache: {},
            schemaValidateFn: (_schema: unknown, document: unknown) => {
                const payload = document as Record<string, unknown>;
                assert.equal(payload.updatedAt, undefined);
                const { _id: _removedBySchema, ...normalized } = payload;
                void _removedBySchema;
                return {
                    valid: true,
                    data: { ...normalized, age: Number(payload.age), schemaDefault: 'saved' },
                };
            },
        };

        const inserted = { name: 'New', age: '31' } as Record<string, unknown>;
        await saveModelDocument(collection as never, inserted, {
            schemaValidationContext,
            timestampsConfig: { createdAt: 'createdAt', updatedAt: 'updatedAt' },
            versionConfig: { enabled: true, field: '__v', updateMany: 'counter' },
            nowFactory: () => now,
        });
        assert.deepEqual(calls[0][1], {
            name: 'New',
            age: 31,
            schemaDefault: 'saved',
            createdAt: now,
            updatedAt: now,
            __v: 0,
        });

        const existing = { _id: 'known-id', name: 'Existing', age: '32', __v: 4 } as Record<string, unknown>;
        Object.defineProperty(existing, 'displayName', {
            configurable: true,
            enumerable: true,
            get: () => `${existing.name}`,
        });
        await saveModelDocument(collection as never, existing, {
            schemaValidationContext,
            timestampsConfig: { createdAt: 'createdAt', updatedAt: 'updatedAt' },
            versionConfig: { enabled: true, field: '__v', updateMany: 'counter' },
            nowFactory: () => now,
        });
        const replacementPayload = calls[1][2] as Record<string, unknown>;
        assert.deepEqual(calls[1][1], { _id: 'known-id', __v: 4 });
        assert.equal(replacementPayload._id, undefined);
        assert.equal(replacementPayload.age, 32);
        assert.equal(replacementPayload.schemaDefault, 'saved');
        assert.equal(replacementPayload.updatedAt, now);
        assert.equal(replacementPayload.__v, 5);
        assert.equal(existing.age, 32);
        assert.equal(existing.schemaDefault, 'saved');
        assert.equal(existing.__v, 5);
        assert.equal(existing._id, 'known-id');
        assert.equal(existing.displayName, 'Existing');
        assert.equal((replacementPayload as Record<string, unknown>).displayName, undefined);

        const writeCount = calls.length;
        await assert.rejects(() => saveModelDocument(collection as never, { name: 'Invalid' } as never, {
            schemaValidationContext: {
                validateEnabled: true,
                schemaCache: {},
                schemaValidateFn: () => ({ valid: false, data: { mustNotWrite: true }, errors: [{ path: '/name', message: 'invalid' }] }),
            },
        }));
        assert.equal(calls.length, writeCount);
    });

    it('applies replace timestamps after normalization when save versioning is disabled', async () => {
        const calls: unknown[][] = [];
        const collection = {
            async replaceOne(...args: unknown[]) {
                calls.push(args);
                return { matchedCount: 1, modifiedCount: 1 };
            },
            async insertOne() {
                throw new Error('insertOne must not be called for an existing document');
            },
        };
        const now = new Date('2026-07-15T10:00:00.000Z');
        const createdAt = new Date('2025-01-01T00:00:00.000Z');
        const document = { _id: 'existing-id', age: '41', createdAt } as Record<string, unknown>;

        await saveModelDocument(collection as never, document, {
            schemaValidationContext: {
                validateEnabled: true,
                schemaCache: {},
                schemaValidateFn: (_schema, input) => {
                    const { _id: _removed, ...payload } = input as Record<string, unknown>;
                    void _removed;
                    return { valid: true, data: { ...payload, age: Number(payload.age) } };
                },
            },
            timestampsConfig: { createdAt: 'createdAt', updatedAt: 'updatedAt' },
            nowFactory: () => now,
        });

        assert.deepEqual(calls[0]?.[0], { _id: 'existing-id' });
        assert.deepEqual(calls[0]?.[1], { age: 41, createdAt, updatedAt: now });
        assert.equal(document._id, 'existing-id');
        assert.equal(document.age, 41);
        assert.equal(document.createdAt, createdAt);
        assert.equal(document.updatedAt, now);
    });
});
