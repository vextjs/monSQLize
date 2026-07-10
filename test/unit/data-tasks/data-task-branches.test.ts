import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ObjectId } from 'mongodb';
import {
    applyUpdatePreview,
    cloneDocument,
    cloneDocumentValue,
    deepMergeDocuments,
} from '../../../src/capabilities/data-tasks/document-utils';
import {
    assertExecutableStep,
    buildMatchFilter,
    buildPlan,
    classifyTaskEnvironment,
    cloneForWrite,
    comparableIndexOptions,
    endpointDatabase,
    findDocuments,
    findMatchingDocuments,
    indexNameFromDeclared,
    indexNameFromOperation,
    indexOptions,
    iterateDocumentBatches,
    iterateDocuments,
    normalizeContext,
    normalizeIndexKey,
    orderedIndexKeyString,
    requireStep,
    resolveMatchBy,
    resolveSnapshotConfig,
    resolveTaskCollection,
    resultNumber,
    sameEndpoint,
    sanitizeFileName,
    stableStringify,
    stringifyExtendedJson,
    type DataTaskCollectionLike,
    type DataTaskRuntimeHost,
    type GenericRecord,
} from '../../../src/capabilities/data-tasks/support';
import type { DataTaskDefinition } from '../../../types/data-tasks';

describe('dataTasks branch contracts', () => {
    it('clones and merges supported document values without mutating inputs', () => {
        const date = new Date('2026-01-01T00:00:00.000Z');
        const buffer = Buffer.from('abc');
        const objectId = new ObjectId();
        const source = { date, buffer, objectId, nested: { list: [1, { value: 2 }] } };
        const cloned = cloneDocument(source);
        assert.notEqual(cloned, source);
        assert.notEqual(cloned.date, date);
        assert.notEqual(cloned.buffer, buffer);
        assert.equal(cloned.objectId, objectId);
        assert.deepEqual(cloned.nested, source.nested);
        assert.deepEqual(cloneDocumentValue([date, buffer]), [date, buffer]);

        const merged = deepMergeDocuments(
            { profile: { name: 'Old', role: 'admin' }, tags: ['old'] },
            { profile: { name: 'Ada' }, tags: ['new'] },
        );
        assert.deepEqual(merged, { profile: { name: 'Ada', role: 'admin' }, tags: ['new'] });
    });

    it('previews deterministic update operators and rejects ambiguous forms', () => {
        const base = {
            count: 2,
            factor: 3,
            low: 10,
            high: 1,
            oldName: 'Ada',
            tags: ['a'],
            queue: [1, 2],
            remove: ['a', 'b', 'c'],
            nested: { keep: true, remove: true },
        };
        const preview = applyUpdatePreview(base, {
            $set: { 'nested.value': 4 },
            $unset: { 'nested.remove': 1 },
            $inc: { count: 2, createdCount: 1 },
            $mul: { factor: 2, createdFactor: 3 },
            $min: { low: 5, high: 5 },
            $max: { high: 5, low: 5 },
            $rename: { oldName: 'name', missing: 'ignored' },
            $currentDate: { updatedAt: true },
            $setOnInsert: { ignored: true },
            $addToSet: { tags: { $each: ['a', 'b'] }, newTags: 'x' },
            $push: { queue: { $each: [3, 4] } },
            $pullAll: { remove: ['a', 'c'] },
        });
        assert.equal(preview.count, 4);
        assert.equal(preview.factor, 6);
        assert.equal(preview.createdCount, 1);
        assert.equal(preview.createdFactor, 0);
        assert.equal(preview.low, 5);
        assert.equal(preview.high, 5);
        assert.equal(preview.name, 'Ada');
        assert.equal(preview.oldName, undefined);
        assert.deepEqual(preview.tags, ['a', 'b']);
        assert.deepEqual(preview.newTags, ['x']);
        assert.deepEqual(preview.queue, [1, 2, 3, 4]);
        assert.deepEqual(preview.remove, ['b']);
        assert.equal((preview.nested as GenericRecord).remove, undefined);
        assert.ok(preview.updatedAt instanceof Date);

        assert.deepEqual(applyUpdatePreview({ list: [1, 2] }, { $pop: { list: -1 } }).list, [2]);
        assert.deepEqual(applyUpdatePreview({ list: [1, 2] }, { $pop: { list: 1 } }).list, [1]);
        assert.throws(() => applyUpdatePreview({}, { replacement: { value: 1 } }), /cannot preview update operator/);
        assert.throws(() => applyUpdatePreview({}, { $inc: { value: '1' } }), /numeric value/);
        assert.throws(() => applyUpdatePreview({ value: 'x' }, { $inc: { value: 1 } }), /existing numeric value/);
        assert.throws(() => applyUpdatePreview({}, { $rename: { value: 1 } }), /string destination/);
        assert.throws(() => applyUpdatePreview({}, { $currentDate: { value: { $type: 'timestamp' } } }), /cannot safely preview/);
        assert.throws(() => applyUpdatePreview({ tags: 'x' }, { $addToSet: { tags: 'y' } }), /requires an array/);
        assert.throws(() => applyUpdatePreview({ tags: [] }, { $push: { tags: { $each: ['x'], $slice: 1 } } }), /modifiers other than/);
        assert.throws(() => applyUpdatePreview({ list: [] }, { $pop: { list: 0 } }), /direction -1 or 1/);
        assert.throws(() => applyUpdatePreview({ list: 'x' }, { $pullAll: { list: ['x'] } }), /requires array values/);
        assert.throws(() => applyUpdatePreview({}, { $pull: { list: 'x' } }), /does not support update operator/);
    });

    it('normalizes snapshot, endpoint, index, and serialization helpers', () => {
        assert.equal(endpointDatabase({ collection: 'x', db: 'legacy' }), 'legacy');
        assert.equal(endpointDatabase({ collection: 'x', database: 'current', db: 'legacy' }), 'current');
        assert.equal(sameEndpoint(undefined, undefined), true);
        assert.equal(sameEndpoint({ collection: 'x' }, { collection: 'x' }), true);
        assert.equal(sameEndpoint({ collection: 'x' }, { collection: 'y' }), false);
        assert.equal(sanitizeFileName('  release users  '), 'release-users');
        assert.equal(sanitizeFileName('***'), 'data-task');
        assert.equal(stableStringify({ b: 1, a: [2] }), '{"a":[2],"b":1}');
        assert.notEqual(orderedIndexKeyString({ a: 1, b: -1 }), orderedIndexKeyString({ b: -1, a: 1 }));

        const oid = new ObjectId();
        const ejson = stringifyExtendedJson({
            date: new Date('2026-01-01T00:00:00.000Z'),
            buffer: Buffer.from('a'),
            oid,
            values: [1],
            bson: { _bsontype: 'Decimal128', toString: () => '1.0' },
        });
        assert.match(ejson, /\$date/);
        assert.match(ejson, /\$binary/);
        assert.match(ejson, /\$oid/);
        assert.match(ejson, /\$Decimal128/);

        assert.deepEqual(resolveSnapshotConfig(false, { snapshotDir: 'override' }), {
            enabled: false,
            dir: 'override',
            format: 'extended-jsonl',
            allowRunWithoutSnapshot: false,
        });
        assert.equal(resolveSnapshotConfig('snapshots').dir, 'snapshots');
        assert.equal(resolveSnapshotConfig({ enabled: false, dir: 'x', format: 'jsonl', allowRunWithoutSnapshot: true }).format, 'jsonl');
        assert.deepEqual(resolveSnapshotConfig({}), {
            enabled: true,
            dir: '.monsqlize/data-task-snapshots',
            format: 'extended-jsonl',
            allowRunWithoutSnapshot: false,
        });
        assert.equal(resolveSnapshotConfig(undefined).enabled, true);
        assert.deepEqual(normalizeContext({
            name: 'projection-array',
            target: { collection: 'x' },
            projection: ['a', 'b'],
            sort: { a: -1 },
            steps: [{ type: 'verify' }],
        }).projection, { a: 1, b: 1 });
        assert.deepEqual(normalizeContext({
            name: '',
            target: { collection: 'x' },
            projection: { a: 1 },
            steps: [{ type: 'verify' }],
        }).projection, { a: 1 });
        assert.match(stringifyExtendedJson({ value: { _bsontype: 'ObjectID', toHexString: () => 'abc' } }), /\$oid/);

        assert.deepEqual(indexOptions({ key: { a: 1 }, name: 'a_1', options: { unique: true } }), { unique: true, name: 'a_1' });
        assert.deepEqual(comparableIndexOptions({ unique: false, sparse: true, hidden: false, expireAfterSeconds: 5, name: 'ignored' }), {
            unique: false,
            sparse: true,
            hidden: false,
            expireAfterSeconds: 5,
        });
        assert.equal(indexNameFromOperation('a_1'), 'a_1');
        assert.equal(indexNameFromOperation({ name: 'b_1' }), 'b_1');
        assert.equal(indexNameFromOperation({}), undefined);
        assert.equal(indexNameFromDeclared({ name: 'c_1' }), 'c_1');
        assert.equal(indexNameFromDeclared(null), undefined);
        assert.deepEqual(normalizeIndexKey(['text']), { value: ['text'] });
        assert.deepEqual(normalizeIndexKey({ a: 1 }), { a: 1 });
        assert.equal(resultNumber({ matchedCount: 2 }, 'matchedCount'), 2);
        assert.equal(resultNumber(null, 'matchedCount'), 0);
        assert.deepEqual(cloneForWrite({ _id: 1, value: 2 }, false), { value: 2 });
        assert.deepEqual(cloneForWrite({ _id: 1, value: 2 }, true), { _id: 1, value: 2 });
    });

    it('routes collections and iterates stream and fallback query paths', async () => {
        const routes: string[] = [];
        const collection = { id: 'collection' } as unknown as DataTaskCollectionLike;
        const host = {
            collection: (name: string) => { routes.push(`collection:${name}`); return collection; },
            db: (name?: string) => ({ collection: (collectionName: string) => { routes.push(`db:${name}:${collectionName}`); return collection; } }),
            pool: (name: string) => ({
                collection: (collectionName: string) => { routes.push(`pool:${name}:${collectionName}`); return collection; },
                use: (database: string) => ({ collection: (collectionName: string) => { routes.push(`pool-db:${name}:${database}:${collectionName}`); return collection; } }),
            }),
            ensureModelIndexes: () => Promise.resolve({}),
            tryAcquireLock: () => Promise.resolve(null),
        } as unknown as DataTaskRuntimeHost;
        resolveTaskCollection(host, { collection: 'plain' });
        resolveTaskCollection(host, { collection: 'db', database: 'app' });
        resolveTaskCollection(host, { collection: 'pool', pool: 'analytics' });
        resolveTaskCollection(host, { collection: 'poolDb', pool: 'analytics', database: 'app' });
        assert.deepEqual(routes, ['collection:plain', 'db:app:db', 'pool:analytics:pool', 'pool-db:analytics:app:poolDb']);

        let destroyed = 0;
        const streamed = {
            stream() {
                return {
                    async *[Symbol.asyncIterator]() {
                        yield { _id: 1 };
                        yield { _id: 2 };
                    },
                    destroy() { destroyed += 1; },
                };
            },
        } as unknown as DataTaskCollectionLike;
        const context = normalizeContext({ name: 'stream', target: { collection: 'x' }, batchSize: 1, steps: [{ type: 'verify' }] });
        assert.deepEqual(await findDocuments(streamed, context, 1), [{ _id: 1 }]);
        assert.ok(destroyed >= 1);
        assert.deepEqual(await findDocuments(streamed, context, 0), []);
        const batches: GenericRecord[][] = [];
        for await (const batch of iterateDocumentBatches(streamed, { ...context, batchSize: 1 })) batches.push(batch);
        assert.equal(batches.length, 2);

        const chainCalls: string[] = [];
        const fallback = {
            find() {
                let rows = [{ _id: 2 }, { _id: 1 }];
                return {
                    sort() { chainCalls.push('sort'); rows = rows.reverse(); return this; },
                    limit(value: number) { chainCalls.push(`limit:${value}`); rows = rows.slice(0, value); return this; },
                    batchSize(value: number) { chainCalls.push(`batch:${value}`); return this; },
                    toArray: () => Promise.resolve(rows),
                };
            },
        } as unknown as DataTaskCollectionLike;
        const iterated: GenericRecord[] = [];
        for await (const row of iterateDocuments(fallback, context, 1)) iterated.push(row);
        assert.deepEqual(iterated, [{ _id: 1 }]);
        assert.deepEqual(chainCalls, ['sort', 'limit:1', 'batch:1']);
        assert.equal((await findMatchingDocuments(fallback, { _id: 1 }, 1)).length, 1);
    });

    it('exercises plan validation, matching, and execution guards', () => {
        const invalid = buildPlan(null as unknown as DataTaskDefinition);
        assert.equal(invalid.passed, false);
        assert.match(invalid.errors.join(' '), /task must be an object/);

        const invalidTask = buildPlan({
            name: '',
            target: { collection: '' },
            batchSize: 0,
            steps: [
                { type: 'ensureIndexes' },
                { type: 'syncData', batchSize: 0, strategy: 'invalid' as 'upsert' },
                { type: 'transformFields', update: {}, pipeline: [], sampleSize: -1 },
                { type: 'exportAffected' },
                { type: 'verify', count: true, sample: -1 },
                { type: 'invalid' } as never,
            ],
        });
        assert.equal(invalidTask.passed, false);
        assert.ok(invalidTask.errors.length >= 10);
        assert.match(buildPlan({ name: 'no-steps', target: { collection: 'x' }, steps: [] }).errors.join(' '), /non-empty array/);
        assert.match(buildPlan({
            name: 'unknown-step',
            target: { collection: 'x' },
            steps: [{} as never],
        }).errors.join(' '), /step.type is required/);
        assert.equal(buildPlan({
            name: 'model-list',
            environment: 'test',
            target: { collection: 'x' },
            steps: [{ type: 'ensureIndexes', models: ['User'] }],
        }).passed, true);
        assert.match(buildPlan({
            name: 'verify-cross',
            source: { collection: 'source' },
            target: { collection: 'target' },
            steps: [{ type: 'verify', sample: 1 }],
        }).errors.join(' '), /requires business matchBy/);

        const crossId = buildPlan({
            name: 'cross-id',
            environment: 'test',
            source: { collection: 'source' },
            target: { collection: 'target' },
            filter: { active: true },
            matchBy: ['_id'],
            steps: [{ type: 'syncData' }],
        });
        assert.match(crossId.errors.join(' '), /cannot use source _id/);

        const lockErrors = buildPlan({
            name: 'locks',
            environment: 'test',
            target: { collection: 'target' },
            lock: { scope: 'other' as 'process', ttlMs: 1, renewIntervalMs: 2 },
            steps: [{ type: 'ensureIndexes', indexes: [{ key: { a: 1 } }] }],
        });
        assert.match(lockErrors.errors.join(' '), /only support scope/);
        assert.match(lockErrors.errors.join(' '), /ttlMs/);
        assert.match(lockErrors.errors.join(' '), /renewIntervalMs must be less/);
        assert.match(buildPlan({
            name: 'lock-renew-invalid',
            environment: 'test',
            target: { collection: 'target' },
            lock: { renewIntervalMs: 0 },
            steps: [{ type: 'ensureIndexes', indexes: [{ key: { a: 1 } }] }],
        }).errors.join(' '), /renewIntervalMs must be a positive/);

        const noSnapshot = buildPlan({
            name: 'no-snapshot',
            environment: 'test',
            source: { collection: 'source' },
            target: { collection: 'target' },
            filter: { active: true },
            matchBy: ['email'],
            snapshot: false,
            steps: [{ type: 'syncData' }],
        });
        assert.match(noSnapshot.errors.join(' '), /require snapshot/);
        assert.equal(buildPlan({
            name: 'allowed-no-snapshot',
            environment: 'test',
            source: { collection: 'source' },
            target: { collection: 'target' },
            filter: { active: true },
            matchBy: ['email'],
            snapshot: false,
            steps: [{ type: 'syncData' }],
        }, { allowRunWithoutSnapshot: true }).passed, true);
        assert.match(buildPlan({
            name: 'production-no-snapshot',
            environment: 'production',
            source: { collection: 'source' },
            target: { collection: 'target' },
            filter: { active: true },
            matchBy: ['email'],
            snapshot: false,
            steps: [{ type: 'syncData' }],
        }, { allowRunWithoutSnapshot: true }).errors.join(' '), /cannot disable affected snapshots/);

        const production: DataTaskDefinition = {
            name: 'production',
            environment: 'production',
            target: { collection: 'target' },
            steps: [{ type: 'ensureIndexes' as const, indexes: [{ key: { a: 1 } }] }],
        };
        assert.throws(() => assertExecutableStep(production, production.steps[0], {}), /confirmProduction/);
        assert.doesNotThrow(() => assertExecutableStep(production, production.steps[0], { confirmProduction: true }));
        assert.throws(
            () => assertExecutableStep({ ...production, environment: undefined }, production.steps[0], {}),
            /explicit environment \(development, test, staging, production, prod, or live\)/,
        );
        assert.match(buildPlan({ ...production, environment: 'prodution' as any }).errors.join(' '), /environment must be one of/);
        const normalizedEnvironment = buildPlan({ ...production, environment: 'LIVE' as any });
        assert.equal(normalizedEnvironment.environment, 'live');
        assert.equal(normalizedEnvironment.isProduction, true);
        assert.equal(normalizedEnvironment.passed, true);

        assert.deepEqual(buildMatchFilter({ profile: { email: 'a@example.com' } }, ['profile.email']), { 'profile.email': 'a@example.com' });
        assert.throws(() => buildMatchFilter({}, ['email']), /is missing/);
        assert.deepEqual(resolveMatchBy({ name: 'same', source: { collection: 'x' }, target: { collection: 'x' }, steps: [{ type: 'syncData' }] }), ['_id']);
        assert.deepEqual(resolveMatchBy({ name: 'cross', source: { collection: 'x' }, target: { collection: 'y' }, steps: [{ type: 'syncData' }] }), []);
        assert.equal(requireStep(production, 'ensureIndexes').type, 'ensureIndexes');
        assert.equal(requireStep(production, 'ensureIndexes', production.steps[0]), production.steps[0]);
        assert.throws(() => requireStep({ ...production, steps: [] }, 'ensureIndexes'), /step is required/);

        const previous = process.env.NODE_ENV;
        process.env.NODE_ENV = 'live';
        try {
            assert.equal(classifyTaskEnvironment({ ...production, environment: 'test' }).isProduction, true);
        } finally {
            if (previous === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = previous;
        }
    });
});
