import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { DataTaskJobService } from '../../../src/capabilities/data-tasks/job-service';
import { normalizeDataTaskJob } from '../../../src/capabilities/data-tasks/job-normalizer';
import { classifyDataTaskIndexes, planDataTaskJob } from '../../../src/capabilities/data-tasks/job-planner';
import type { DataTaskCollectionLike, DataTaskRuntimeHost, GenericRecord } from '../../../src/capabilities/data-tasks/support';

function matches(document: GenericRecord, filter: GenericRecord): boolean {
    return Object.entries(filter).every(([key, value]) => JSON.stringify(document[key]) === JSON.stringify(value));
}

function collection(documents: GenericRecord[], indexes: GenericRecord[] = [{ name: '_id_', key: { _id: 1 }, unique: true }]): DataTaskCollectionLike & { writes: number } {
    return {
        writes: 0,
        find(filter: GenericRecord = {}) {
            let rows = documents.filter((document) => matches(document, filter));
            return {
                sort() { return this; },
                limit(limit: number) { rows = rows.slice(0, limit); return this; },
                toArray: async () => structuredClone(rows),
            };
        },
        aggregate: async (pipeline: GenericRecord[]) => {
            let rows = structuredClone(documents);
            for (const stage of pipeline) {
                if (stage.$match) rows = rows.filter((document) => matches(document, stage.$match as GenericRecord));
                if (stage.$set) rows = rows.map((document) => ({ ...document, ...(stage.$set as GenericRecord) }));
                if (stage.$unset) {
                    const fields = Array.isArray(stage.$unset) ? stage.$unset : [stage.$unset];
                    rows = rows.map((document) => {
                        const next = { ...document };
                        for (const field of fields) delete next[String(field)];
                        return next;
                    });
                }
            }
            return rows;
        },
        count: async (filter: GenericRecord = {}) => documents.filter((document) => matches(document, filter)).length,
        findOne: async (filter: GenericRecord) => documents.find((document) => matches(document, filter)) ?? null,
        insertOne: async () => { throw new Error('preview must not write'); },
        updateOne: async () => { throw new Error('preview must not write'); },
        updateMany: async () => { throw new Error('preview must not write'); },
        replaceOne: async () => { throw new Error('preview must not write'); },
        createIndex: async () => { throw new Error('preview must not write'); },
        listIndexes: async () => structuredClone(indexes),
    };
}

function runtime(collections: Record<string, DataTaskCollectionLike>): DataTaskRuntimeHost {
    return {
        collection: (name: string) => collections[name],
        db: () => ({ collection: (name: string) => collections[name] }),
        ensureModelIndexes: async () => { throw new Error('not used'); },
        tryAcquireLock: async () => null,
    };
}

describe('dataTasks job facade preview', () => {
    function validJob(): any {
        return {
            name: 'valid-job',
            source: runtime({ items: collection([{ _id: 1, code: 'A' }]) }),
            target: runtime({ items: collection([]) }),
            targetEnvironment: 'test',
            collections: [{
                name: 'items',
                indexes: [{ key: { code: 1 }, name: 'code_unique', options: { unique: true } }],
                data: { all: true, identity: { mode: 'fields', fields: ['code'] } },
            }],
        };
    }

    it('normalizes the canonical collection job and production backup defaults', () => {
        const source = runtime({ source: collection([]) });
        const target = runtime({ target: collection([]) });
        const normalized = normalizeDataTaskJob({
            name: ' release ', source, target, targetEnvironment: 'production',
            collections: [{ name: 'source', targetName: 'target', indexes: [{ key: { code: 1 }, options: { unique: true } }], data: { all: true, identity: { mode: 'fields', fields: ['code'] } } }],
            backup: { dir: '.backup' },
        });
        assert.equal(normalized.name, 'release');
        assert.equal(normalized.collections[0].data?.strategy, 'upsert');
        assert.equal(normalized.collections[0].data?.batchSize, 500);
        assert.equal(normalized.collections[0].data?.maxDocuments, 10_000);
        assert.equal(normalized.backup.maxBytes, 256 * 1024 * 1024);
        assert.equal(normalized.production, true);
    });

    it('lists target indexes before planning and performs no database writes', async () => {
        const sourceCollection = collection([{ _id: 1, code: 'A', value: 2 }, { _id: 2, code: 'B', value: 3 }]);
        const targetCollection = collection(
            [{ _id: 10, code: 'A', value: 1 }],
            [{ name: '_id_', key: { _id: 1 }, unique: true }, { name: 'code_unique', key: { code: 1 }, unique: true }],
        );
        const source = runtime({ items: sourceCollection });
        const target = runtime({ items: targetCollection });
        const service = new DataTaskJobService(() => { throw new Error('factory must not run for supplied runtimes'); });
        const preview = await service.preview({
            name: 'preview-items', source, target, targetEnvironment: 'test',
            collections: [{
                name: 'items',
                indexes: [{ key: { code: 1 }, name: 'code_unique', options: { unique: true } }],
                data: { all: true, identity: { mode: 'fields', fields: ['code'] }, transform: { handler: (document) => ({ ...document, version: 2 }) } },
            }],
        });
        assert.equal(preview.passed, true, preview.errors.join('\n'));
        assert.deepEqual(preview.collections[0].data, { source: 2, insert: 1, update: 1, unchanged: 0, conflict: 0 });
        assert.equal(preview.collections[0].indexes[0].status, 'existing');
        assert.ok(preview.collections[0].backupBytes > 0);
        assert.equal(sourceCollection.writes, 0);
        assert.equal(targetCollection.writes, 0);
        assert.equal(preview.approval?.kind, 'apply');
    });

    it('preserves source _id intent and rejects logical conflicts', async () => {
        const source = runtime({ seeds: collection([{ _id: 'source-id', code: 'A' }]) });
        const target = runtime({ seeds: collection([{ _id: 'other-id', code: 'A' }]) });
        const service = new DataTaskJobService(() => { throw new Error('not used'); });
        const preview = await service.preview({
            name: 'source-id-conflict', source, target, targetEnvironment: 'test',
            collections: [{ name: 'seeds', data: { all: true, identity: { mode: 'source-id', conflictBy: ['code'] } } }],
        });
        assert.equal(preview.passed, false);
        assert.match(preview.errors.join(' '), /different _id/);
    });

    it('rejects unsafe filters, missing unique identity indexes, and identity-changing transforms', async () => {
        const source = runtime({ items: collection([{ _id: 1, code: 'A' }]) });
        const target = runtime({ items: collection([]) });
        const service = new DataTaskJobService(() => { throw new Error('not used'); });
        const unsafe = await service.preview({
            name: 'unsafe', source, target, targetEnvironment: 'test',
            collections: [{ name: 'items', data: { filter: {}, identity: { mode: 'fields', fields: ['code'] } } }],
        });
        assert.equal(unsafe.passed, false);
        assert.match(unsafe.errors[0], /exactly one/);

        const noIndex = await service.preview({
            name: 'no-index', source, target, targetEnvironment: 'test',
            collections: [{ name: 'items', data: { all: true, identity: { mode: 'fields', fields: ['code'] } } }],
        });
        assert.equal(noIndex.passed, false);
        assert.match(noIndex.errors[0], /unique index/);

        const changed = await service.preview({
            name: 'changed', source, target, targetEnvironment: 'test',
            collections: [{
                name: 'items',
                indexes: [{ key: { code: 1 }, options: { unique: true } }],
                data: { all: true, identity: { mode: 'fields', fields: ['code'] }, transform: { handler: (document) => ({ ...document, code: 'B' }) } },
            }],
        });
        assert.equal(changed.passed, false);
        assert.match(changed.errors[0], /changed an identity/);
    });

    it('rejects unique indexes that would contain duplicate keys after apply', async () => {
        const source = runtime({
            items: collection([
                { _id: 1, code: 'A', email: 'same@example.com' },
                { _id: 2, code: 'B', email: 'same@example.com' },
            ]),
        });
        const target = runtime({ items: collection([]) });
        const service = new DataTaskJobService(() => { throw new Error('not used'); });
        const preview = await service.preview({
            name: 'duplicate-unique-index', source, target, targetEnvironment: 'test',
            collections: [{
                name: 'items',
                indexes: [
                    { key: { code: 1 }, name: 'code_unique', options: { unique: true } },
                    { key: { email: 1 }, name: 'email_unique', options: { unique: true } },
                ],
                data: { all: true, identity: { mode: 'fields', fields: ['code'] } },
            }],
        });
        assert.equal(preview.passed, false);
        assert.match(preview.errors[0], /email_unique.*duplicate keys/);
    });

    it('covers invalid job configuration branches with stable error codes', () => {
        const cases: Array<[string, (job: any) => any]> = [
            ['job must be an object', () => null],
            ['job.name is required', (job) => { job.name = ''; return job; }],
            ['source must be', (job) => { job.source = {}; return job; }],
            ['source.databaseName', (job) => { job.source = { type: 'mongodb', config: { uri: 'mongodb://source' } }; return job; }],
            ['source.config.uri', (job) => { job.source = { type: 'mongodb', databaseName: 'source', config: {} }; return job; }],
            ['target must be', (job) => { job.target = {}; return job; }],
            ['source and target must be independent', (job) => { job.target = job.source; return job; }],
            ['same MongoDB database', (job) => {
                job.source = { type: 'mongodb', databaseName: 'same', config: { uri: 'mongodb://same' } };
                job.target = { type: 'mongodb', databaseName: 'same', config: { uri: 'mongodb://same' } };
                return job;
            }],
            ['targetEnvironment must be', (job) => { job.targetEnvironment = 'prodution'; return job; }],
            ['collections must be', (job) => { job.collections = []; return job; }],
            ['collections[0].name', (job) => { job.collections[0].name = ''; return job; }],
            ['configured more than once', (job) => { job.collections.push({ ...job.collections[0] }); return job; }],
            ['requires indexes or data', (job) => { job.collections[0] = { name: 'items' }; return job; }],
            ['indexes must be an array', (job) => { job.collections[0].indexes = {}; return job; }],
            ['indexes[0].key', (job) => { job.collections[0].indexes = [{ key: {} }]; return job; }],
            ['indexes[0].name', (job) => { job.collections[0].indexes[0].name = ''; return job; }],
            ['duplicate index name', (job) => { job.collections[0].indexes.push({ key: { email: 1 }, name: 'code_unique' }); return job; }],
            ['indexes[0].options', (job) => { job.collections[0].indexes[0].options = 'unique'; return job; }],
            ['data must be an object', (job) => { job.collections[0].data = []; return job; }],
            ['exactly one', (job) => { job.collections[0].data = { filter: {}, identity: { mode: 'source-id' } }; return job; }],
            ['exactly one', (job) => { job.collections[0].data.filter = { code: 'A' }; job.collections[0].data.all = true; return job; }],
            ['identity.mode', (job) => { job.collections[0].data.identity = {}; return job; }],
            ['identity.fields', (job) => { job.collections[0].data.identity.fields = []; return job; }],
            ['identity.fields must contain', (job) => { job.collections[0].data.identity.fields = ['']; return job; }],
            ['identity.fields must contain', (job) => { job.collections[0].data.identity.fields = [123]; return job; }],
            ['must not contain duplicates', (job) => { job.collections[0].data.identity.fields = ['code', 'code']; return job; }],
            ['projection must be', (job) => { job.collections[0].data.projection = []; return job; }],
            ['cannot exclude identity', (job) => { job.collections[0].data.projection = { code: 0 }; return job; }],
            ['transform must be', (job) => { job.collections[0].data.transform = []; return job; }],
            ['exactly one of pipeline or handler', (job) => { job.collections[0].data.transform = {}; return job; }],
            ['exactly one of pipeline or handler', (job) => { job.collections[0].data.transform = { pipeline: [{}], handler: () => ({}) }; return job; }],
            ['must not be empty', (job) => { job.collections[0].data.transform = { pipeline: [] }; return job; }],
            ['one operator', (job) => { job.collections[0].data.transform = { pipeline: [{ $set: {}, $unset: 'x' }] }; return job; }],
            ['cannot contain', (job) => { job.collections[0].data.transform = { pipeline: [{ $merge: 'items' }] }; return job; }],
            ['batchSize', (job) => { job.collections[0].data.batchSize = 0; return job; }],
            ['batchSize', (job) => { job.collections[0].data.batchSize = 10_001; return job; }],
            ['maxDocuments', (job) => { job.collections[0].data.maxDocuments = 0; return job; }],
            ['maxDocuments', (job) => { job.collections[0].data.maxDocuments = 1_000_001; return job; }],
            ['strategy', (job) => { job.collections[0].data.strategy = 'replace'; return job; }],
            ['verify must be', (job) => { job.collections[0].verify = []; return job; }],
            ['verify.mode', (job) => { job.collections[0].verify = { mode: 'none' }; return job; }],
            ['verify.sampleSize', (job) => { job.collections[0].verify = { sampleSize: 0 }; return job; }],
            ['verify.fields', (job) => { job.collections[0].verify = { fields: [] }; return job; }],
            ['backup must be', (job) => { job.backup = []; return job; }],
            ['explicit durable backup.dir', (job) => { job.targetEnvironment = 'production'; return job; }],
            ['backup.compression', (job) => { job.backup = { compression: 'zip' }; return job; }],
            ['backup.format', (job) => { job.backup = { format: 'json' }; return job; }],
            ['backup.retentionDays', (job) => { job.backup = { retentionDays: 0 }; return job; }],
            ['backup.maxBytes', (job) => { job.backup = { maxBytes: 0 }; return job; }],
            ['lock must be', (job) => { job.lock = 'yes'; return job; }],
            ['lock.ttlMs', (job) => { job.lock = { ttlMs: 999 }; return job; }],
            ['lock.waitTimeoutMs', (job) => { job.lock = { waitTimeoutMs: -1 }; return job; }],
        ];
        for (const [message, mutate] of cases) {
            assert.throws(
                () => normalizeDataTaskJob(mutate(validJob())),
                (error: any) => error.code === 'INVALID_JOB' && error.message.includes(message),
                message,
            );
        }
    });

    it('normalizes positive optional variants and classifies all index states', () => {
        const job = validJob();
        job.targetEnvironment = 'LIVE';
        job.backup = { dir: '.backup', format: 'extended-jsonl', compression: 'none', retentionDays: 30, maxBytes: 4096 };
        job.lock = { ttlMs: 5_000, waitTimeoutMs: 10 };
        job.collections[0].data = {
            filter: { code: 'A' },
            identity: { mode: 'source-id', conflictBy: ['code'] },
            strategy: 'insert',
            projection: { _id: 1, code: 1 },
            maxDocuments: 25,
        };
        job.collections[0].verify = { mode: 'full', sampleSize: 50, fields: ['code'] };
        const normalized = normalizeDataTaskJob(job);
        assert.equal(normalized.production, true);
        assert.equal(normalized.backup.compression, 'none');
        assert.equal(normalized.backup.maxBytes, 4096);
        assert.equal(normalized.collections[0].data?.maxDocuments, 25);
        assert.deepEqual(normalized.lock, { ttlMs: 5_000, waitTimeoutMs: 10 });

        const existing = [
            { name: 'same', key: { code: 1 }, unique: true },
            { name: 'different-name', key: { email: 1 } },
            { name: 'changed', key: { old: 1 } },
            { name: 'plain', key: { plain: 1 } },
        ];
        assert.deepEqual(
            classifyDataTaskIndexes([
                { name: 'same', key: { code: 1 }, options: { unique: true } },
                { name: 'missing', key: { missing: 1 } },
                { name: 'changed', key: { changed: 1 } },
                { name: 'expected-name', key: { email: 1 } },
                { key: { email: 1 } },
                { key: { code: 1 }, options: { sparse: true } },
                { name: 'plain', key: { plain: 1 } },
                { key: { plain: 1 }, options: { sparse: true } },
            ], existing).map((index) => index.status),
            ['existing', 'missing', 'conflict', 'conflict', 'existing', 'conflict', 'existing', 'conflict'],
        );
    });

    it('rejects source, backup, and missing-index scans that exceed configured safety limits', async () => {
        const service = new DataTaskJobService(() => { throw new Error('not used'); });
        const sourceLimitJob = validJob();
        sourceLimitJob.source = runtime({ items: collection([{ _id: 1, code: 'A' }, { _id: 2, code: 'B' }]) });
        sourceLimitJob.collections[0].data.maxDocuments = 1;
        const sourceLimit = await service.preview(sourceLimitJob);
        assert.equal(sourceLimit.passed, false);
        assert.match(sourceLimit.errors[0], /data\.maxDocuments=1/);

        const backupLimitJob = validJob();
        backupLimitJob.backup = { maxBytes: 1 };
        const backupLimit = await service.preview(backupLimitJob);
        assert.equal(backupLimit.passed, false);
        assert.match(backupLimit.errors[0], /backup\.maxBytes=1/);

        const largeTarget = collection([]);
        largeTarget.count = async () => 10_001;
        const uniqueScanJob = validJob();
        uniqueScanJob.target = runtime({ items: largeTarget });
        const uniqueScan = await service.preview(uniqueScanJob);
        assert.equal(uniqueScan.passed, false);
        assert.match(uniqueScan.errors[0], /safe preview limit is 10000/);
    });

    it('rejects preview limits and unique index shapes that cannot be proved safely', async () => {
        const normalized = normalizeDataTaskJob(validJob());
        await assert.rejects(() => planDataTaskJob(normalized, normalized.source as any, normalized.target as any, { sampleSize: -1 }), /sampleSize/);
        await assert.rejects(() => planDataTaskJob(normalized, normalized.source as any, normalized.target as any, { approvalTtlMs: 999 }), /approvalTtlMs/);
        for (const [options, sourceDocuments, message] of [
            [{ unique: true, partialFilterExpression: { active: true } }, [{ _id: 1, code: 'A', special: 'A', active: true }], /cannot prove safely/],
            [{ unique: true, collation: { locale: 'en', strength: 2 } }, [{ _id: 1, code: 'A', special: 'A' }], /cannot prove safely/],
            [{ unique: true }, [{ _id: 1, code: 'A', special: ['A'] }], /multikey/],
        ] as const) {
            const source = runtime({ items: collection(sourceDocuments as unknown as GenericRecord[]) });
            const target = runtime({ items: collection([]) });
            const service = new DataTaskJobService(() => { throw new Error('not used'); });
            const preview = await service.preview({
                name: 'special-unique', source, target, targetEnvironment: 'test',
                collections: [{
                    name: 'items',
                    indexes: [
                        { key: { code: 1 }, name: 'code_unique', options: { unique: true } },
                        { key: { special: 1 }, name: 'special_unique', options },
                    ],
                    data: { all: true, identity: { mode: 'fields', fields: ['code'] } },
                }],
            });
            assert.equal(preview.passed, false);
            assert.match(preview.errors[0], message);
        }

        const unsupported = await new DataTaskJobService(() => { throw new Error('not used'); }).preview({
            name: 'unsupported-unique',
            source: runtime({ items: collection([{ _id: 1, code: 'A', special: 'A' }]) }),
            target: runtime({ items: collection([]) }),
            targetEnvironment: 'test',
            collections: [{
                name: 'items',
                indexes: [
                    { key: { code: 1 }, options: { unique: true } },
                    { key: { special: 'hashed' }, options: { unique: true } },
                ],
                data: { all: true, identity: { mode: 'fields', fields: ['code'] } },
            }],
        });
        assert.match(unsupported.errors[0], /unsupported key type/);

        const sparse = await new DataTaskJobService(() => { throw new Error('not used'); }).preview({
            name: 'sparse-unique',
            source: runtime({ items: collection([{ _id: 1, code: 'A' }, { _id: 2, code: 'B' }]) }),
            target: runtime({ items: collection([]) }),
            targetEnvironment: 'test',
            collections: [{
                name: 'items',
                indexes: [
                    { key: { code: 1 }, options: { unique: true } },
                    { key: { special: 1 }, options: { unique: true, sparse: true } },
                ],
                data: { all: true, identity: { mode: 'fields', fields: ['code'] } },
            }],
        });
        assert.equal(sparse.passed, true, sparse.errors.join('\n'));

        const missingAsNull = await new DataTaskJobService(() => { throw new Error('not used'); }).preview({
            name: 'missing-unique-value',
            source: runtime({ items: collection([{ _id: 1, code: 'A' }]) }),
            target: runtime({ items: collection([]) }),
            targetEnvironment: 'test',
            collections: [{
                name: 'items',
                indexes: [
                    { key: { code: 1 }, options: { unique: true } },
                    { key: { optional: 1 }, options: { unique: true } },
                ],
                data: { all: true, identity: { mode: 'fields', fields: ['code'] } },
            }],
        });
        assert.equal(missingAsNull.passed, true, missingAsNull.errors.join('\n'));
    });

    it('rejects non-deterministic transforms and ambiguous target identities', async () => {
        const service = new DataTaskJobService(() => { throw new Error('not used'); });
        const preview = (sourceCollection: DataTaskCollectionLike, targetCollection: DataTaskCollectionLike, data: any) => service.preview({
            name: 'planner-branches',
            source: runtime({ items: sourceCollection }),
            target: runtime({ items: targetCollection }),
            targetEnvironment: 'test',
            collections: [{
                name: 'items',
                indexes: [{ key: { code: 1 }, name: 'code_unique', options: { unique: true } }],
                data,
            }],
        });

        const noAggregate = collection([{ _id: 1, code: 'A' }]);
        delete (noAggregate as any).aggregate;
        assert.match((await preview(noAggregate, collection([]), {
            all: true, identity: { mode: 'fields', fields: ['code'] }, transform: { pipeline: [{ $set: { value: 1 } }] },
        })).errors[0], /aggregate support/);

        const nonDeterministic = collection([{ _id: 1, code: 'A' }]);
        let aggregateCalls = 0;
        nonDeterministic.aggregate = async () => [{ _id: 1, code: 'A', value: aggregateCalls += 1 }];
        assert.match((await preview(nonDeterministic, collection([]), {
            all: true, identity: { mode: 'fields', fields: ['code'] }, transform: { pipeline: [{ $set: { value: 1 } }] },
        })).errors[0], /non-deterministic/);

        const cardinality = collection([{ _id: 1, code: 'A' }]);
        cardinality.aggregate = async () => [];
        assert.match((await preview(cardinality, collection([]), {
            all: true, identity: { mode: 'fields', fields: ['code'] }, transform: { pipeline: [{ $set: { value: 1 } }] },
        })).errors[0], /cardinality/);

        assert.match((await preview(collection([{ _id: 1, code: 'A' }]), collection([]), {
            all: true, identity: { mode: 'fields', fields: ['code'] }, transform: { handler: () => null },
        })).errors[0], /must return a document/);

        let handlerCalls = 0;
        assert.match((await preview(collection([{ _id: 1, code: 'A' }]), collection([]), {
            all: true,
            identity: { mode: 'fields', fields: ['code'] },
            transform: { handler: (document: GenericRecord) => ({ ...document, value: handlerCalls += 1 }) },
        })).errors[0], /non-deterministic/);

        assert.match((await preview(
            collection([{ _id: 1, code: 'A' }, { _id: 2, code: 'A' }]),
            collection([]),
            { all: true, identity: { mode: 'fields', fields: ['code'] } },
        )).errors[0], /duplicate identities/);

        assert.match((await preview(
            collection([{ _id: 1 }]),
            collection([]),
            { all: true, identity: { mode: 'fields', fields: ['code'] } },
        )).errors[0], /identity field "code" is missing/);

        assert.match((await preview(
            collection([{ _id: 1, code: 'A' }, { _id: 2, code: 'B' }]),
            collection([]),
            {
                all: true,
                identity: { mode: 'fields', fields: ['code'] },
                transform: { handler: (document: GenericRecord) => document.code === 'B' ? { ...document, code: 'A' } : document },
            },
        )).errors[0], /duplicate identities/);

        assert.match((await preview(
            collection([{ _id: 1, code: 'A' }]),
            collection([{ _id: 10, code: 'A' }, { _id: 11, code: 'A' }]),
            { all: true, identity: { mode: 'fields', fields: ['code'] } },
        )).errors[0], /multiple target documents/);

        assert.match((await preview(
            collection([{ _id: 'source', code: 'A' }]),
            collection([]),
            { all: true, identity: { mode: 'source-id', conflictBy: ['missing'] } },
        )).errors[0], /conflictBy field is missing/);

        assert.match((await preview(
            collection([{ _id: 1, code: 'A' }]),
            collection([{ _id: 10, code: 'A' }]),
            { all: true, identity: { mode: 'fields', fields: ['code'] }, strategy: 'insert' },
        )).errors[0], /insert strategy/);

        const unchanged = await preview(
            collection([{ _id: 1, code: 'A', value: 1 }]),
            collection([{ _id: 10, code: 'A', value: 1 }], [{ name: '_id_', key: { _id: 1 }, unique: true }, { name: 'code_unique', key: { code: 1 }, unique: true }]),
            { all: true, identity: { mode: 'fields', fields: ['code'] } },
        );
        assert.equal(unchanged.passed, true, unchanged.errors.join('\n'));
        assert.equal(unchanged.collections[0].data.unchanged, 1);

        const projectedPipeline = await preview(
            collection([{ _id: 1, code: 'A', ignored: true }]),
            collection([]),
            {
                all: true,
                projection: { _id: 1, code: 1 },
                identity: { mode: 'fields', fields: ['code'] },
                transform: { pipeline: [{ $set: { migrated: true } }] },
            },
        );
        assert.equal(projectedPipeline.passed, true, projectedPipeline.errors.join('\n'));
    });
});
