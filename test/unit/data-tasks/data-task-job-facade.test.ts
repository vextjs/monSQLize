import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { DataTaskJobService } from '../../../src/capabilities/data-tasks/job-service';
import { normalizeDataTaskJob } from '../../../src/capabilities/data-tasks/job-normalizer';
import { classifyDataTaskIndexes, planDataTaskJob } from '../../../src/capabilities/data-tasks/job-planner';
import {
    comparableIndexOptions,
    getByPath,
    indexOptions,
    orderedIndexKeyString,
    stableStringify,
    stringifyExtendedJson,
    type DataTaskCollectionLike,
    type DataTaskJobRuntimeHost,
    type GenericRecord,
} from '../../../src/capabilities/data-tasks/support';
import {
    cloneDocumentValue,
    deepMergeDocuments,
    deleteDocumentPath,
    setDocumentPath,
} from '../../../src/capabilities/data-tasks/document-utils';

function matches(document: GenericRecord, filter: GenericRecord): boolean {
    return Object.entries(filter).every(([key, value]) => {
        if (key === '$or') return Array.isArray(value) && value.some((item) => matches(document, item as GenericRecord));
        if (key === '$and') return Array.isArray(value) && value.every((item) => matches(document, item as GenericRecord));
        const actual = key.split('.').reduce<unknown>((current, part) => (
            current && typeof current === 'object' ? (current as GenericRecord)[part] : undefined
        ), document);
        if (value && typeof value === 'object' && !Array.isArray(value) && '$in' in value) {
            return Array.isArray((value as GenericRecord).$in)
                && ((value as GenericRecord).$in as unknown[]).some((item) => JSON.stringify(item) === JSON.stringify(actual));
        }
        return JSON.stringify(actual) === JSON.stringify(value);
    });
}

function collection(documents: GenericRecord[], indexes: GenericRecord[] = [{ name: '_id_', key: { _id: 1 }, unique: true }]): DataTaskCollectionLike & { writes: number; findCalls: number } {
    return {
        writes: 0,
        findCalls: 0,
        find(filter: GenericRecord = {}, options?: GenericRecord) {
            this.findCalls += 1;
            let rows = documents.filter((document) => matches(document, filter));
            const projection = options?.projection as GenericRecord | undefined;
            if (projection) {
                const included = Object.entries(projection).filter(([, value]) => value !== 0 && value !== false).map(([key]) => key);
                if (included.length > 0) {
                    rows = rows.map((document) => Object.fromEntries(
                        included
                            .filter((key) => Object.prototype.hasOwnProperty.call(document, key))
                            .map((key) => [key, document[key]]),
                    ));
                }
            }
            return {
                sort() { return this; },
                limit(limit: number) { rows = rows.slice(0, limit); return this; },
                toArray: async () => structuredClone(rows),
            };
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

function runtime(collections: Record<string, DataTaskCollectionLike>): DataTaskJobRuntimeHost {
    return { collection: (name: string) => collections[name] };
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

    it('keeps document and index helper edge behavior deterministic', () => {
        const date = new Date('2026-07-13T00:00:00.000Z');
        const buffer = Buffer.from('ok');
        assert.notEqual(cloneDocumentValue(date), date);
        assert.notEqual(cloneDocumentValue(buffer), buffer);
        assert.deepEqual(cloneDocumentValue([date, buffer, { nested: true }]), [date, buffer, { nested: true }]);
        const custom = new (class CustomValue {})();
        assert.equal(cloneDocumentValue(custom), custom);

        const document: GenericRecord = {};
        setDocumentPath(document, '', 1);
        setDocumentPath(document, 'meta.version', 2);
        assert.deepEqual(document, { meta: { version: 2 } });
        deleteDocumentPath(document, '');
        deleteDocumentPath(document, 'missing.value');
        deleteDocumentPath(document, 'meta.version');
        assert.deepEqual(document, { meta: {} });
        assert.deepEqual(deepMergeDocuments({ nested: { left: 1 }, retained: true }, { nested: { right: 2 }, replaced: 'yes' }), {
            nested: { left: 1, right: 2 },
            retained: true,
            replaced: 'yes',
        });

        assert.equal(stableStringify(['b', { a: 1 }]), '["b",{"a":1}]');
        assert.equal(stringifyExtendedJson(date), '{"$date":"2026-07-13T00:00:00.000Z"}');
        assert.equal(stringifyExtendedJson(buffer), '{"$binary":"b2s="}');
        assert.equal(stringifyExtendedJson([{ _bsontype: 'ObjectId', toHexString: () => 'abc' }]), '[{"$oid":"abc"}]');
        assert.equal(stringifyExtendedJson({ _bsontype: 'Decimal128', toString: () => '1.5' }), '{"$Decimal128":"1.5"}');
        assert.equal(getByPath({ nested: 1 }, 'nested.value'), undefined);
        assert.deepEqual(indexOptions({ key: { code: 1 } }), {});
        assert.deepEqual(indexOptions({ key: { code: 1 }, name: 'code_1', options: { unique: true } }), { unique: true, name: 'code_1' });
        assert.deepEqual(comparableIndexOptions({ unique: true, expireAfterSeconds: 60 }), {
            unique: true,
            sparse: false,
            hidden: false,
            expireAfterSeconds: 60,
        });
        assert.equal(orderedIndexKeyString('invalid'), '"invalid"');
    });

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
                data: { all: true, identity: { mode: 'fields', fields: ['code'] }, set: { version: 2 } },
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

    it('rejects unsafe filters, missing unique identity indexes, and identity-changing patches', async () => {
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
                data: { all: true, identity: { mode: 'fields', fields: ['code'] }, set: { code: 'B' } },
            }],
        });
        assert.equal(changed.passed, false);
        assert.match(changed.errors[0], /must not overlap.*identity/);
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
            ['must include required field', (job) => { job.collections[0].data.projection = { code: 0 }; return job; }],
            ['data.rename must be', (job) => { job.collections[0].data.rename = []; return job; }],
            ['data.set must be', (job) => { job.collections[0].data.set = []; return job; }],
            ['data.unset must be', (job) => { job.collections[0].data.unset = {}; return job; }],
            ['unsafe field path', (job) => { job.collections[0].data.set = { '__proto__.polluted': true }; return job; }],
            ['source and destination must not overlap', (job) => { job.collections[0].data.rename = { old: 'old.child' }; return job; }],
            ['destinations must be unique', (job) => { job.collections[0].data.rename = { old: 'name', legacy: 'name' }; return job; }],
            ['conflicts with', (job) => { job.collections[0].data.rename = { old: 'name' }; job.collections[0].data.set = { name: 'fixed' }; return job; }],
            ['BSON-compatible literal', (job) => { job.collections[0].data.set = { version: undefined }; return job; }],
            ['BSON-compatible literals', (job) => { job.collections[0].data.set = { metadata: { resolve: () => 'value' } }; return job; }],
            ['BSON-compatible literals', (job) => { job.collections[0].data.filter = { code: { $where: Symbol('unsafe') } }; delete job.collections[0].data.all; return job; }],
            ['BSON-compatible literals', (job) => { job.collections[0].indexes[0].options.partialFilterExpression = { resolve: () => true }; return job; }],
            ['circular values', (job) => { const values: unknown[] = []; values.push(values); job.collections[0].data.set = { values }; return job; }],
            ['circular values', (job) => { const value: any = {}; value.self = value; job.collections[0].data.set = { value }; return job; }],
            ['BSON-compatible literals', (job) => { job.collections[0].data.set = { value: new (class CustomValue {})() }; return job; }],
            ['BSON-compatible literal', (job) => { job.collections[0].data.set = { value: { _bsontype: 'Unsupported' } }; return job; }],
            ['options.name is not allowed', (job) => { job.collections[0].indexes[0].options.name = 'nested'; return job; }],
            ['built-in _id index', (job) => { job.collections[0].indexes[0] = { key: { _id: 1 } }; return job; }],
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
            set: {
                values: [1, 'two', true, null],
                createdAt: new Date('2026-07-13T00:00:00.000Z'),
                pattern: /^release-/,
                bytes: Buffer.from('ok'),
            },
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

        const racedSource = collection([{ _id: 1, code: 'A' }, { _id: 2, code: 'B' }, { _id: 3, code: 'C' }]);
        racedSource.count = async () => 1;
        const originalFind = racedSource.find.bind(racedSource);
        let requestedLimit = 0;
        racedSource.find = ((...args: Parameters<typeof racedSource.find>) => {
            const chain = originalFind(...args);
            const originalLimit = chain.limit!.bind(chain);
            chain.limit = (limit: number) => {
                requestedLimit = limit;
                return originalLimit(limit);
            };
            return chain;
        }) as typeof racedSource.find;
        const racedSourceJob = validJob();
        racedSourceJob.source = runtime({ items: racedSource });
        racedSourceJob.collections[0].data.maxDocuments = 1;
        const racedSourceResult = await service.preview(racedSourceJob);
        assert.equal(racedSourceResult.passed, false);
        assert.equal(requestedLimit, 2);
        assert.match(racedSourceResult.errors[0], /data\.maxDocuments=1/);

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

    it('validates field patches and rejects ambiguous target identities', async () => {
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

        const missingRenameSource = await preview(collection([{ _id: 1, code: 'A' }]), collection([]), {
            all: true,
            identity: { mode: 'fields', fields: ['code'] },
            rename: { legacyName: 'name' },
        });
        assert.equal(missingRenameSource.passed, true, missingRenameSource.errors.join('\n'));

        assert.match((await preview(collection([{ _id: 1, code: 'A', legacyName: 'Alice', name: 'Bob' }]), collection([]), {
            all: true,
            identity: { mode: 'fields', fields: ['code'] },
            rename: { legacyName: 'name' },
        })).errors[0], /already contains a different value/);

        assert.match((await preview(collection([{ _id: 1, code: 'A', meta: 'scalar' }]), collection([]), {
            all: true,
            identity: { mode: 'fields', fields: ['code'] },
            set: { 'meta.version': 2 },
        })).errors[0], /crosses a non-object/);

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

        const projectedPatch = await preview(
            collection([{ _id: 1, code: 'A', legacyName: 'Alice', developmentOnly: true, ignored: true }]),
            collection([]),
            {
                all: true,
                projection: { _id: 1, code: 1, legacyName: 1, developmentOnly: 1 },
                identity: { mode: 'fields', fields: ['code'] },
                rename: { legacyName: 'name' },
                set: { schemaVersion: 2 },
                unset: ['developmentOnly'],
            },
        );
        assert.equal(projectedPatch.passed, true, projectedPatch.errors.join('\n'));
        assert.deepEqual(projectedPatch.collections[0].samples[0].after, {
            code: 'A',
            name: 'Alice',
            schemaVersion: 2,
        });
    });

    it('batches target identity lookups instead of issuing one query per source document', async () => {
        const documents = Array.from({ length: 1_001 }, (_, index) => ({ _id: index + 1, code: `C${index + 1}` }));
        const sourceCollection = collection(documents);
        const targetCollection = collection([]);
        const result = await new DataTaskJobService(() => { throw new Error('not used'); }).preview({
            name: 'batched-target-lookups',
            source: runtime({ items: sourceCollection }),
            target: runtime({ items: targetCollection }),
            targetEnvironment: 'test',
            collections: [{
                name: 'items',
                indexes: [{ key: { code: 1 }, options: { unique: true } }],
                data: {
                    all: true,
                    batchSize: 500,
                    maxDocuments: 1_100,
                    identity: { mode: 'fields', fields: ['code'] },
                },
            }],
        });
        assert.equal(result.passed, true, result.errors.join('\n'));
        assert.ok(targetCollection.findCalls <= 5, `expected batched lookups, received ${targetCollection.findCalls} find calls`);
    });
});
