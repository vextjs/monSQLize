import type {
    DataTaskApproval,
    DataTaskChangeSample,
    DataTaskCollectionPreview,
    DataTaskIndexDefinition,
    DataTaskIndexPlan,
    DataTaskPreviewOptions,
    DataTaskPreviewResult,
} from '../../../types/data-tasks';
import { BSON } from 'mongodb';
import {
    comparableIndexOptions,
    getByPath,
    indexOptions,
    isRecord,
    orderedIndexKeyString,
    type DataTaskCollectionLike,
    type DataTaskRuntimeHost,
    type GenericRecord,
} from './support';
import {
    DataTaskJobError,
    canonicalStringify,
    hashDataTaskValue,
    type NormalizedDataTaskCollection,
    type NormalizedDataTaskJob,
} from './job-normalizer';
import { cloneDocument } from './document-utils';

export interface PlannedDataChange {
    collection: string;
    targetCollection: string;
    identity: GenericRecord;
    filter: GenericRecord;
    operation: 'insert' | 'update';
    before: GenericRecord | null;
    after: GenericRecord;
}

export interface PlannedCollection extends DataTaskCollectionPreview {
    changes: PlannedDataChange[];
    existingIndexes: GenericRecord[];
}

export interface DataTaskJobPlan extends DataTaskPreviewResult {
    normalized: NormalizedDataTaskJob;
    plannedCollections: PlannedCollection[];
    hashes: { jobHash: string; sourceHash: string; targetHash: string; indexHash: string };
}

export function publicDataTaskCollections(planned: PlannedCollection[]): DataTaskCollectionPreview[] {
    return planned.map(({ changes: _changes, existingIndexes: _indexes, ...collection }) => collection);
}

function identityFor(document: GenericRecord, config: NormalizedDataTaskCollection): GenericRecord {
    const identity = config.data!.identity;
    const fields = identity.mode === 'fields' ? identity.fields : ['_id'];
    const result: GenericRecord = {};
    for (const field of fields) {
        const value = getByPath(document, field);
        if (value === undefined) throw new DataTaskJobError('IDENTITY_CONFLICT', `identity field "${field}" is missing.`, 'preview', config.name);
        result[field] = value;
    }
    return result;
}

const MAX_MISSING_UNIQUE_INDEX_SCAN_DOCUMENTS = 10_000;

async function findAll(
    collection: DataTaskCollectionLike,
    filter: GenericRecord,
    projection?: GenericRecord,
    limit?: number,
): Promise<GenericRecord[]> {
    let chain = collection.find(filter, projection ? { projection } : undefined);
    if (typeof chain.sort === 'function') chain = chain.sort({ _id: 1 });
    if (limit !== undefined && typeof chain.limit === 'function') chain = chain.limit(limit);
    return (await chain.toArray()).map(cloneDocument);
}

async function aggregateTransform(collection: DataTaskCollectionLike, config: NormalizedDataTaskCollection): Promise<GenericRecord[]> {
    if (!collection.aggregate) throw new DataTaskJobError('INVALID_JOB', 'transform.pipeline requires aggregate support.', 'preview', config.name);
    const data = config.data!;
    const transform = data.transform;
    const stages = transform && 'pipeline' in transform && Array.isArray(transform.pipeline) ? transform.pipeline : [];
    const pipeline: GenericRecord[] = [
        { $match: data.filter ?? {} },
        ...(data.projection ? [{ $project: data.projection }] : []),
        ...stages,
        { $limit: data.maxDocuments + 1 },
    ];
    const first = (await collection.aggregate(pipeline)).map(cloneDocument);
    const second = (await collection.aggregate(pipeline)).map(cloneDocument);
    if (hashDataTaskValue(first) !== hashDataTaskValue(second)) {
        throw new DataTaskJobError('IDENTITY_CONFLICT', 'transform.pipeline produced non-deterministic output.', 'preview', config.name);
    }
    return first;
}

async function transformSource(collection: DataTaskCollectionLike, config: NormalizedDataTaskCollection): Promise<GenericRecord[]> {
    const data = config.data!;
    const sourceCount = await collection.count(data.filter ?? {});
    if (sourceCount > data.maxDocuments) {
        throw new DataTaskJobError(
            'INVALID_JOB',
            `source matched ${sourceCount} documents, exceeding data.maxDocuments=${data.maxDocuments}.`,
            'preview',
            config.name,
        );
    }
    const originals = await findAll(collection, data.filter ?? {}, data.projection);
    if (originals.length > data.maxDocuments) {
        throw new DataTaskJobError('INVALID_JOB', `source exceeded data.maxDocuments=${data.maxDocuments} while previewing.`, 'preview', config.name);
    }
    let transformed: GenericRecord[];
    if (!data.transform) {
        transformed = originals;
    } else if ('pipeline' in data.transform) {
        transformed = await aggregateTransform(collection, config);
        if (transformed.length !== originals.length) {
            throw new DataTaskJobError('IDENTITY_CONFLICT', 'transform.pipeline cannot change document cardinality.', 'preview', config.name);
        }
    } else {
        transformed = [];
        for (const original of originals) {
            const first = await data.transform.handler(cloneDocument(original));
            const second = await data.transform.handler(cloneDocument(original));
            if (!isRecord(first) || !isRecord(second)) {
                throw new DataTaskJobError('INVALID_JOB', 'transform.handler must return a document.', 'preview', config.name);
            }
            if (hashDataTaskValue(first) !== hashDataTaskValue(second)) {
                throw new DataTaskJobError('IDENTITY_CONFLICT', 'transform.handler produced non-deterministic output.', 'preview', config.name);
            }
            transformed.push(cloneDocument(first));
        }
    }

    const originalsByIdentity = new Map(originals.map((document) => [canonicalStringify(identityFor(document, config)), document]));
    if (originalsByIdentity.size !== originals.length) {
        throw new DataTaskJobError('IDENTITY_CONFLICT', 'source contains duplicate identities.', 'preview', config.name);
    }
    const transformedByIdentity = new Map<string, GenericRecord>();
    for (const document of transformed) {
        const key = canonicalStringify(identityFor(document, config));
        if (!originalsByIdentity.has(key)) throw new DataTaskJobError('IDENTITY_CONFLICT', 'transform changed an identity field.', 'preview', config.name);
        if (transformedByIdentity.has(key)) throw new DataTaskJobError('IDENTITY_CONFLICT', 'transform produced duplicate identities.', 'preview', config.name);
        transformedByIdentity.set(key, document);
    }
    if (transformedByIdentity.size !== originalsByIdentity.size) {
        throw new DataTaskJobError('IDENTITY_CONFLICT', 'transform removed an identity.', 'preview', config.name);
    }
    return [...originalsByIdentity.keys()].map((key) => transformedByIdentity.get(key)!);
}

function declaredIndexOptions(index: DataTaskIndexDefinition): GenericRecord {
    return indexOptions(index);
}

function existingIndexOptions(index: GenericRecord): GenericRecord {
    const { key: _key, name: _name, v: _v, ns: _ns, ...options } = index;
    return options;
}

function equivalentIndex(declared: DataTaskIndexDefinition, existing: GenericRecord): boolean {
    return orderedIndexKeyString(declared.key) === orderedIndexKeyString(existing.key)
        && canonicalStringify(comparableIndexOptions(declaredIndexOptions(declared)))
            === canonicalStringify(comparableIndexOptions(existingIndexOptions(existing)));
}

export function classifyDataTaskIndexes(declared: DataTaskIndexDefinition[], existing: GenericRecord[]): DataTaskIndexPlan[] {
    return declared.map((index) => {
        const byName = index.name ? existing.find((candidate) => candidate.name === index.name) : undefined;
        if (byName) {
            return equivalentIndex(index, byName)
                ? { name: index.name, key: index.key, options: index.options ?? {}, status: 'existing' }
                : { name: index.name, key: index.key, options: index.options ?? {}, status: 'conflict', reason: 'same name has a different key or options' };
        }
        const byKey = existing.find((candidate) => orderedIndexKeyString(candidate.key) === orderedIndexKeyString(index.key));
        if (!byKey) return { ...(index.name ? { name: index.name } : {}), key: index.key, options: index.options ?? {}, status: 'missing' };
        if (!equivalentIndex(index, byKey)) {
            return { ...(index.name ? { name: index.name } : {}), key: index.key, options: index.options ?? {}, status: 'conflict', reason: 'same key has different options' };
        }
        if (index.name && byKey.name !== index.name) {
            return { name: index.name, key: index.key, options: index.options ?? {}, status: 'conflict', reason: `equivalent key already exists as "${String(byKey.name)}"` };
        }
        return { ...(index.name ? { name: index.name } : {}), key: index.key, options: index.options ?? {}, status: 'existing' };
    });
}

function uniqueIdentityCovered(config: NormalizedDataTaskCollection, existing: GenericRecord[]): boolean {
    if (!config.data || config.data.identity.mode === 'source-id') return true;
    const expected = orderedIndexKeyString(Object.fromEntries(config.data.identity.fields.map((field) => [field, 1])));
    const candidates: Array<{ key: unknown; options: GenericRecord }> = [
        ...existing.map((index) => ({ key: index.key, options: existingIndexOptions(index) })),
        ...config.indexes.map((index) => ({ key: index.key, options: declaredIndexOptions(index) })),
    ];
    return candidates.some((candidate) => orderedIndexKeyString(candidate.key) === expected
        && candidate.options.unique === true
        && candidate.options.partialFilterExpression === undefined);
}

function payloadForWrite(document: GenericRecord, config: NormalizedDataTaskCollection): GenericRecord {
    const payload = cloneDocument(document);
    if (config.data!.identity.mode === 'fields') delete payload._id;
    return payload;
}

function payloadChanged(before: GenericRecord, payload: GenericRecord): boolean {
    return Object.keys(payload).some((key) => canonicalStringify(before[key]) !== canonicalStringify(payload[key]));
}

interface UniqueIndexCandidate {
    key: GenericRecord;
    options: GenericRecord;
    name?: string;
    missing: boolean;
}

function uniqueIndexCandidates(
    config: NormalizedDataTaskCollection,
    indexes: DataTaskIndexPlan[],
    existingIndexes: GenericRecord[],
): UniqueIndexCandidate[] {
    const candidates: UniqueIndexCandidate[] = [
        ...config.indexes.map((index, position) => ({
            key: index.key,
            options: declaredIndexOptions(index),
            ...(index.name ? { name: index.name } : {}),
            missing: indexes[position]?.status === 'missing',
        })),
        ...existingIndexes.map((index) => ({
            key: isRecord(index.key) ? index.key : {},
            options: existingIndexOptions(index),
            ...(typeof index.name === 'string' ? { name: index.name } : {}),
            missing: false,
        })),
    ].filter((index) => index.options.unique === true);
    const seen = new Set<string>();
    return candidates.filter((index) => {
        const key = `${orderedIndexKeyString(index.key)}:${canonicalStringify(comparableIndexOptions(index.options))}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}

function indexAffected(candidate: UniqueIndexCandidate, changes: PlannedDataChange[]): boolean {
    if (candidate.missing) return true;
    const fields = Object.keys(candidate.key);
    return changes.some((change) => change.operation === 'insert' || fields.some((field) => (
        canonicalStringify(getByPath(change.before ?? {}, field)) !== canonicalStringify(getByPath(change.after, field))
    )));
}

function applyPlannedChanges(documents: GenericRecord[], changes: PlannedDataChange[]): GenericRecord[] {
    const result = documents.map(cloneDocument);
    for (const change of changes) {
        if (change.before?._id !== undefined) {
            const position = result.findIndex((document) => canonicalStringify(document._id) === canonicalStringify(change.before!._id));
            if (position < 0) throw new DataTaskJobError('IDENTITY_CONFLICT', 'target document disappeared while validating unique indexes.', 'preview', change.collection);
            result[position] = cloneDocument(change.after);
        } else {
            result.push(cloneDocument(change.after));
        }
    }
    return result;
}

function uniqueKey(
    candidate: UniqueIndexCandidate,
    document: GenericRecord,
    generatedPosition?: number,
): { key: string; query?: GenericRecord; skip: boolean } {
    const fields = Object.keys(candidate.key);
    const values = fields.map((field) => getByPath(document, field));
    const label = candidate.name ?? orderedIndexKeyString(candidate.key);
    if (values.some(Array.isArray)) {
        throw new DataTaskJobError('INDEX_CONFLICT', `unique multikey index "${label}" cannot be proved safely during preview.`, 'preview');
    }
    if (candidate.options.sparse === true && values.every((value) => value === undefined)) {
        return { key: '', skip: true };
    }
    const normalized = values.map((value, position) => {
        if (value !== undefined) return value;
        if (fields[position] === '_id' && generatedPosition !== undefined) return { generatedId: generatedPosition };
        return null;
    });
    if (fields.length === 1 && fields[0] === '_id' && values[0] === undefined) {
        return { key: canonicalStringify(normalized), skip: false };
    }
    return {
        key: canonicalStringify(normalized),
        query: Object.fromEntries(fields.map((field, position) => [field, values[position] === undefined ? null : values[position]])),
        skip: false,
    };
}

function assertSupportedUniqueIndex(candidate: UniqueIndexCandidate, collection: string): void {
    const label = candidate.name ?? orderedIndexKeyString(candidate.key);
    if (candidate.options.partialFilterExpression !== undefined || candidate.options.collation !== undefined) {
        throw new DataTaskJobError(
            'INDEX_CONFLICT',
            `unique index "${label}" uses partialFilterExpression or collation, which preview cannot prove safely.`,
            'preview',
            collection,
        );
    }
    if (Object.values(candidate.key).some((direction) => direction !== 1 && direction !== -1)) {
        throw new DataTaskJobError('INDEX_CONFLICT', `unique index "${label}" uses an unsupported key type for safe preview.`, 'preview', collection);
    }
}

async function validateExistingUniqueIndex(
    target: DataTaskCollectionLike,
    config: NormalizedDataTaskCollection,
    candidate: UniqueIndexCandidate,
    changes: PlannedDataChange[],
): Promise<void> {
    const label = candidate.name ?? orderedIndexKeyString(candidate.key);
    const finalKeysByTargetId = new Map<string, string>();
    for (let position = 0; position < changes.length; position += 1) {
        const change = changes[position];
        if (change.before?._id !== undefined) {
            finalKeysByTargetId.set(canonicalStringify(change.before._id), uniqueKey(candidate, change.after, position).key);
        }
    }
    const plannedKeys = new Set<string>();
    for (let position = 0; position < changes.length; position += 1) {
        const change = changes[position];
        const finalKey = uniqueKey(candidate, change.after, position);
        if (finalKey.skip) continue;
        if (plannedKeys.has(finalKey.key)) {
            throw new DataTaskJobError('INDEX_CONFLICT', `unique index "${label}" would contain duplicate planned keys after apply.`, 'preview', config.name);
        }
        plannedKeys.add(finalKey.key);
        if (!finalKey.query) continue;
        const matches = await findAll(target, finalKey.query, undefined, 2);
        for (const match of matches) {
            const matchId = match._id === undefined ? undefined : canonicalStringify(match._id);
            const currentId = change.before?._id === undefined ? undefined : canonicalStringify(change.before._id);
            if (matchId !== undefined && matchId === currentId) continue;
            const plannedMatchKey = matchId === undefined ? undefined : finalKeysByTargetId.get(matchId);
            if (plannedMatchKey !== undefined && plannedMatchKey !== finalKey.key) continue;
            throw new DataTaskJobError('INDEX_CONFLICT', `unique index "${label}" would conflict with an existing target document.`, 'preview', config.name);
        }
    }
}

async function validateUniqueIndexes(
    target: DataTaskCollectionLike,
    config: NormalizedDataTaskCollection,
    indexes: DataTaskIndexPlan[],
    existingIndexes: GenericRecord[],
    changes: PlannedDataChange[],
): Promise<void> {
    const candidates = uniqueIndexCandidates(config, indexes, existingIndexes)
        .filter((candidate) => indexAffected(candidate, changes));
    if (candidates.length === 0) return;
    for (const candidate of candidates) {
        assertSupportedUniqueIndex(candidate, config.name);
        if (!candidate.missing) {
            await validateExistingUniqueIndex(target, config, candidate, changes);
            continue;
        }
        const targetCount = await target.count({});
        if (targetCount > MAX_MISSING_UNIQUE_INDEX_SCAN_DOCUMENTS) {
            const label = candidate.name ?? orderedIndexKeyString(candidate.key);
            throw new DataTaskJobError(
                'INDEX_CONFLICT',
                `missing unique index "${label}" requires scanning ${targetCount} target documents; the safe preview limit is ${MAX_MISSING_UNIQUE_INDEX_SCAN_DOCUMENTS}. Validate and create the index separately, then preview again.`,
                'preview',
                config.name,
            );
        }
        const targetDocuments = await findAll(target, {}, undefined, MAX_MISSING_UNIQUE_INDEX_SCAN_DOCUMENTS);
        const targetCountAfterScan = await target.count({});
        if (targetCountAfterScan > MAX_MISSING_UNIQUE_INDEX_SCAN_DOCUMENTS) {
            const label = candidate.name ?? orderedIndexKeyString(candidate.key);
            throw new DataTaskJobError(
                'INDEX_CONFLICT',
                `missing unique index "${label}" exceeded the safe preview scan limit of ${MAX_MISSING_UNIQUE_INDEX_SCAN_DOCUMENTS} target documents. Validate and create the index separately, then preview again.`,
                'preview',
                config.name,
            );
        }
        if (targetDocuments.length !== targetCountAfterScan) {
            throw new DataTaskJobError(
                'INDEX_CONFLICT',
                'target collection changed while validating a missing unique index; preview again.',
                'preview',
                config.name,
            );
        }
        const documents = applyPlannedChanges(targetDocuments, changes);
        const seen = new Set<string>();
        for (let position = 0; position < documents.length; position += 1) {
            const value = uniqueKey(candidate, documents[position], position);
            if (value.skip) continue;
            if (seen.has(value.key)) {
                const label = candidate.name ?? orderedIndexKeyString(candidate.key);
                throw new DataTaskJobError('INDEX_CONFLICT', `unique index "${label}" would contain duplicate keys after apply.`, 'preview', config.name);
            }
            seen.add(value.key);
        }
    }
}

async function planCollection(
    sourceHost: DataTaskRuntimeHost,
    targetHost: DataTaskRuntimeHost,
    config: NormalizedDataTaskCollection,
    sampleSize: number,
): Promise<PlannedCollection> {
    const source = sourceHost.collection(config.name);
    const target = targetHost.collection(config.targetName);
    const existingIndexes = await target.listIndexes();
    const indexes = classifyDataTaskIndexes(config.indexes, existingIndexes);
    if (indexes.some((index) => index.status === 'conflict')) {
        throw new DataTaskJobError('INDEX_CONFLICT', 'declared indexes conflict with target indexes.', 'preview', config.name);
    }
    if (!uniqueIdentityCovered(config, existingIndexes)) {
        throw new DataTaskJobError('INDEX_CONFLICT', 'fields identity requires an exact non-partial unique index in the target or indexes[].', 'preview', config.name);
    }
    const changes: PlannedDataChange[] = [];
    let unchanged = 0;
    if (config.data) {
        const sourceDocuments = await transformSource(source, config);
        for (const document of sourceDocuments) {
            const identity = identityFor(document, config);
            const matches = await findAll(target, identity, undefined, 2);
            if (matches.length > 1) throw new DataTaskJobError('IDENTITY_CONFLICT', 'identity matches multiple target documents.', 'preview', config.name);
            if (config.data.identity.mode === 'source-id' && config.data.identity.conflictBy?.length) {
                const conflictFilter = Object.fromEntries(config.data.identity.conflictBy.map((field) => [field, getByPath(document, field)]));
                if (Object.values(conflictFilter).some((value) => value === undefined)) {
                    throw new DataTaskJobError('IDENTITY_CONFLICT', 'a conflictBy field is missing.', 'preview', config.name);
                }
                const logicalMatches = await findAll(target, conflictFilter, undefined, 2);
                if (logicalMatches.some((candidate) => canonicalStringify(candidate._id) !== canonicalStringify(document._id))) {
                    throw new DataTaskJobError('IDENTITY_CONFLICT', 'business identity exists with a different _id.', 'preview', config.name);
                }
            }
            const before = matches[0] ?? null;
            if (before && config.data.strategy === 'insert') {
                throw new DataTaskJobError('IDENTITY_CONFLICT', 'insert strategy found an existing identity.', 'preview', config.name);
            }
            const payload = payloadForWrite(document, config);
            if (before && !payloadChanged(before, payload)) {
                unchanged += 1;
                continue;
            }
            changes.push({
                collection: config.name,
                targetCollection: config.targetName,
                identity,
                filter: identity,
                operation: before ? 'update' : 'insert',
                before,
                after: before ? { ...cloneDocument(before), ...payload } : payload,
            });
        }
    }
    await validateUniqueIndexes(target, config, indexes, existingIndexes, changes);
    const samples: DataTaskChangeSample[] = changes.slice(0, sampleSize).map((change) => ({
        identity: change.identity,
        operation: change.operation,
        before: change.before,
        after: change.after,
    }));
    const backupBytes = changes.reduce((total, change) => total + Buffer.byteLength(`${BSON.EJSON.stringify({
        ...change,
        beforeHash: hashDataTaskValue(change.before),
        plannedAfterHash: hashDataTaskValue(change.after),
    }, { relaxed: false })}\n`), 0);
    return {
        source: config.name,
        target: config.targetName,
        data: {
            source: changes.length + unchanged,
            insert: changes.filter((change) => change.operation === 'insert').length,
            update: changes.filter((change) => change.operation === 'update').length,
            unchanged,
            conflict: 0,
        },
        indexes,
        samples,
        backupDocuments: changes.length,
        backupBytes,
        changes,
        existingIndexes,
    };
}

function createApproval(job: NormalizedDataTaskJob, hashes: DataTaskJobPlan['hashes'], ttlMs: number): DataTaskApproval {
    const issuedAt = new Date();
    const payload = {
        kind: 'apply' as const,
        jobHash: job.jobHash,
        sourceHash: hashes.sourceHash,
        targetHash: hashes.targetHash,
        indexHash: hashes.indexHash,
        issuedAt: issuedAt.toISOString(),
        expiresAt: new Date(issuedAt.getTime() + ttlMs).toISOString(),
    };
    return { ...payload, token: hashDataTaskValue(payload) };
}

export async function planDataTaskJob(
    normalized: NormalizedDataTaskJob,
    source: DataTaskRuntimeHost,
    target: DataTaskRuntimeHost,
    options: DataTaskPreviewOptions = {},
): Promise<DataTaskJobPlan> {
    const sampleSize = options.sampleSize ?? 5;
    if (!Number.isInteger(sampleSize) || sampleSize < 0 || sampleSize > 100) {
        throw new DataTaskJobError('INVALID_JOB', 'preview sampleSize must be an integer from 0 to 100.');
    }
    const approvalTtlMs = options.approvalTtlMs ?? 15 * 60_000;
    if (!Number.isInteger(approvalTtlMs) || approvalTtlMs < 1_000 || approvalTtlMs > 24 * 60 * 60_000) {
        throw new DataTaskJobError('INVALID_JOB', 'preview approvalTtlMs must be an integer from 1000 to 86400000.');
    }
    const plannedCollections: PlannedCollection[] = [];
    for (const collection of normalized.collections) {
        plannedCollections.push(await planCollection(source, target, collection, sampleSize));
    }
    const backupBytes = plannedCollections.reduce((total, collection) => total + collection.backupBytes, 0);
    if (backupBytes > normalized.backup.maxBytes) {
        throw new DataTaskJobError(
            'BACKUP_FAILED',
            `estimated backup size ${backupBytes} bytes exceeds backup.maxBytes=${normalized.backup.maxBytes}.`,
            'preview',
        );
    }
    const hashes = {
        jobHash: normalized.jobHash,
        sourceHash: hashDataTaskValue(plannedCollections.map((item) => item.changes.map((change) => ({ identity: change.identity, after: change.after })))),
        targetHash: hashDataTaskValue(plannedCollections.map((item) => item.changes.map((change) => ({ identity: change.identity, before: change.before })))),
        indexHash: hashDataTaskValue(plannedCollections.map((item) => item.existingIndexes)),
    };
    const approval = createApproval(normalized, hashes, approvalTtlMs);
    return {
        mode: 'preview',
        jobName: normalized.name,
        passed: true,
        collections: publicDataTaskCollections(plannedCollections),
        warnings: [],
        errors: [],
        approval,
        normalized,
        plannedCollections,
        hashes,
    };
}
