import { createHash } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { BSON } from 'mongodb';
import type {
    DataTaskBackupOptions,
    DataTaskCollectionJob,
    DataTaskConnection,
    DataTaskDataRule,
    DataTaskIndexDefinition,
    DataTaskJob,
    DataTaskJobErrorCode,
    DataTaskLeaseLockOptions,
    DataTaskVerifyRule,
} from '../../../types/data-tasks';
import type { MonSQLizeOptions } from '../../../types/monsqlize';
import { isRecord, type GenericRecord } from './support';

export class DataTaskJobError extends Error {
    constructor(
        readonly code: DataTaskJobErrorCode,
        message: string,
        readonly phase = 'validate',
        readonly collection?: string,
    ) {
        super(`[DataTask:${code}] ${message}`);
        this.name = 'DataTaskJobError';
    }
}

export const DEFAULT_DATA_TASK_MAX_DOCUMENTS = 10_000;
export const DEFAULT_DATA_TASK_BACKUP_MAX_BYTES = 256 * 1024 * 1024;

export interface NormalizedDataTaskDataRule extends Omit<DataTaskDataRule, 'strategy' | 'batchSize' | 'maxDocuments'> {
    strategy: 'upsert' | 'insert';
    batchSize: number;
    maxDocuments: number;
}

export interface NormalizedDataTaskCollection extends Omit<DataTaskCollectionJob, 'targetName' | 'indexes' | 'data' | 'verify'> {
    targetName: string;
    indexes: DataTaskIndexDefinition[];
    data?: NormalizedDataTaskDataRule;
    verify: Required<Pick<DataTaskVerifyRule, 'mode' | 'sampleSize'>> & Pick<DataTaskVerifyRule, 'fields'>;
}

export interface NormalizedDataTaskJob extends Omit<DataTaskJob, 'collections' | 'backup' | 'lock'> {
    collections: NormalizedDataTaskCollection[];
    backup: Required<DataTaskBackupOptions>;
    lock: false | Required<DataTaskLeaseLockOptions>;
    production: boolean;
    jobHash: string;
}

const ENVIRONMENTS = new Set(['development', 'test', 'staging', 'production', 'prod', 'live']);
const PRODUCTION_ENVIRONMENTS = new Set(['production', 'prod', 'live']);

function invalid(message: string, collection?: string): never {
    throw new DataTaskJobError('INVALID_JOB', message, 'validate', collection);
}

function canonicalize(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(canonicalize);
    if (isRecord(value)) {
        return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]));
    }
    return value;
}

export function canonicalStringify(value: unknown): string {
    return JSON.stringify(canonicalize(BSON.EJSON.serialize(value, { relaxed: false })));
}

export function hashDataTaskValue(value: unknown): string {
    return createHash('sha256').update(canonicalStringify(value)).digest('hex');
}

export function isDataTaskRuntime(value: DataTaskConnection): value is DataTaskConnection & { collection(name: string): unknown } {
    return isRecord(value) && typeof value.collection === 'function';
}

export function connectionOptions(value: DataTaskConnection): MonSQLizeOptions | undefined {
    if (isDataTaskRuntime(value)) {
        const options = (value as { options?: unknown }).options;
        return isRecord(options) ? options as MonSQLizeOptions : undefined;
    }
    return value as MonSQLizeOptions;
}

function connectionDescriptor(value: DataTaskConnection): GenericRecord {
    const options = connectionOptions(value);
    if (!options) return { kind: 'runtime' };
    return {
        kind: isDataTaskRuntime(value) ? 'runtime' : 'options',
        type: options.type,
        databaseName: options.databaseName,
        configHash: hashDataTaskValue(options.config ?? {}),
    };
}

function validateConnection(value: DataTaskConnection, field: 'source' | 'target'): void {
    if (isDataTaskRuntime(value)) return;
    if (!isRecord(value) || value.type !== 'mongodb') invalid(`${field} must be a monSQLize runtime or MongoDB MonSQLizeOptions.`);
    if (typeof value.databaseName !== 'string' || value.databaseName.trim() === '') invalid(`${field}.databaseName is required.`);
    if (!isRecord(value.config) || typeof value.config.uri !== 'string' || value.config.uri.trim() === '') invalid(`${field}.config.uri is required.`);
}

function uniqueFields(value: unknown, pathName: string, collection: string): string[] {
    if (!Array.isArray(value) || value.length === 0) invalid(`${pathName} must be a non-empty string array.`, collection);
    const fields = value.map((item) => typeof item === 'string' ? item.trim() : '');
    if (fields.some((item) => item === '')) invalid(`${pathName} must contain non-empty strings.`, collection);
    if (new Set(fields).size !== fields.length) invalid(`${pathName} must not contain duplicates.`, collection);
    return fields;
}

function normalizeData(data: DataTaskDataRule | undefined, collection: string): NormalizedDataTaskDataRule | undefined {
    if (data === undefined) return undefined;
    if (!isRecord(data)) invalid('data must be an object.', collection);
    const hasFilter = isRecord(data.filter) && Object.keys(data.filter).length > 0;
    if (hasFilter === (data.all === true)) invalid('data requires exactly one of a non-empty filter or all: true.', collection);
    if (!isRecord(data.identity) || (data.identity.mode !== 'fields' && data.identity.mode !== 'source-id')) {
        invalid('data.identity.mode must be fields or source-id.', collection);
    }

    const identity = data.identity.mode === 'fields'
        ? { mode: 'fields' as const, fields: uniqueFields(data.identity.fields, 'identity.fields', collection) }
        : {
            mode: 'source-id' as const,
            ...(data.identity.conflictBy === undefined ? {} : { conflictBy: uniqueFields(data.identity.conflictBy, 'identity.conflictBy', collection) }),
        };
    if (data.projection !== undefined && !isRecord(data.projection)) invalid('data.projection must be an object.', collection);
    const identityFields = identity.mode === 'fields' ? identity.fields : ['_id', ...(identity.conflictBy ?? [])];
    for (const field of identityFields) {
        if (data.projection?.[field] === 0 || data.projection?.[field] === false) {
            invalid(`data.projection cannot exclude identity field "${field}".`, collection);
        }
    }
    if (data.transform !== undefined) {
        if (!isRecord(data.transform)) invalid('data.transform must be an object.', collection);
        const hasPipeline = Array.isArray(data.transform.pipeline);
        const hasHandler = typeof data.transform.handler === 'function';
        if (hasPipeline === hasHandler) invalid('data.transform requires exactly one of pipeline or handler.', collection);
        if (hasPipeline) {
            if (data.transform.pipeline!.length === 0) invalid('transform.pipeline must not be empty.', collection);
            for (const stage of data.transform.pipeline!) {
                if (!isRecord(stage) || Object.keys(stage).length !== 1) invalid('each transform.pipeline stage must contain one operator.', collection);
                if ('$out' in stage || '$merge' in stage) invalid('transform.pipeline cannot contain $out or $merge.', collection);
            }
        }
    }
    const batchSize = data.batchSize ?? 500;
    if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 10_000) invalid('data.batchSize must be an integer from 1 to 10000.', collection);
    const maxDocuments = data.maxDocuments ?? DEFAULT_DATA_TASK_MAX_DOCUMENTS;
    if (!Number.isInteger(maxDocuments) || maxDocuments < 1 || maxDocuments > 1_000_000) {
        invalid('data.maxDocuments must be an integer from 1 to 1000000.', collection);
    }
    const strategy = data.strategy ?? 'upsert';
    if (strategy !== 'upsert' && strategy !== 'insert') invalid('data.strategy must be upsert or insert.', collection);
    return { ...data, filter: hasFilter ? data.filter : {}, all: data.all === true, identity, strategy, batchSize, maxDocuments };
}

function normalizeIndexes(indexes: DataTaskIndexDefinition[] | undefined, collection: string): DataTaskIndexDefinition[] {
    if (indexes === undefined) return [];
    if (!Array.isArray(indexes)) invalid('indexes must be an array.', collection);
    const names = new Set<string>();
    return indexes.map((index, position) => {
        if (!isRecord(index) || !isRecord(index.key) || Object.keys(index.key).length === 0) invalid(`indexes[${position}].key must be non-empty.`, collection);
        if (index.name !== undefined && (typeof index.name !== 'string' || index.name.trim() === '')) invalid(`indexes[${position}].name must be non-empty.`, collection);
        if (index.name && names.has(index.name)) invalid(`duplicate index name "${index.name}".`, collection);
        if (index.name) names.add(index.name);
        if (index.options !== undefined && !isRecord(index.options)) invalid(`indexes[${position}].options must be an object.`, collection);
        return { key: { ...index.key }, ...(index.name ? { name: index.name } : {}), options: { ...(index.options ?? {}) } };
    });
}

function normalizeVerify(verify: DataTaskVerifyRule | undefined, collection: string): NormalizedDataTaskCollection['verify'] {
    if (verify !== undefined && !isRecord(verify)) invalid('verify must be an object.', collection);
    const input = verify as DataTaskVerifyRule | undefined;
    const mode = input?.mode ?? 'sample';
    if (mode !== 'sample' && mode !== 'full') invalid('verify.mode must be sample or full.', collection);
    const sampleSize = input?.sampleSize ?? 20;
    if (!Number.isInteger(sampleSize) || sampleSize < 1 || sampleSize > 1000) invalid('verify.sampleSize must be an integer from 1 to 1000.', collection);
    const fields = input?.fields === undefined ? undefined : uniqueFields(input.fields, 'verify.fields', collection);
    return { mode, sampleSize, ...(fields ? { fields } : {}) };
}

function normalizeBackup(backup: DataTaskBackupOptions | undefined, production: boolean): Required<DataTaskBackupOptions> {
    if (backup !== undefined && !isRecord(backup)) invalid('backup must be an object.');
    const input = backup as DataTaskBackupOptions | undefined;
    if (production && (typeof input?.dir !== 'string' || input.dir.trim() === '')) invalid('production jobs require an explicit durable backup.dir.');
    const dir = typeof input?.dir === 'string' && input.dir.trim() ? input.dir : path.join(os.tmpdir(), 'monsqlize-data-tasks');
    const compression = input?.compression ?? 'gzip';
    if (compression !== 'gzip' && compression !== 'none') invalid('backup.compression must be gzip or none.');
    if (input?.format !== undefined && input.format !== 'extended-jsonl') invalid('backup.format must be extended-jsonl.');
    const retentionDays = input?.retentionDays ?? 7;
    if (!Number.isInteger(retentionDays) || retentionDays < 1) invalid('backup.retentionDays must be a positive integer.');
    const maxBytes = input?.maxBytes ?? DEFAULT_DATA_TASK_BACKUP_MAX_BYTES;
    if (!Number.isSafeInteger(maxBytes) || maxBytes < 1) invalid('backup.maxBytes must be a positive safe integer.');
    return { dir, format: 'extended-jsonl', compression, retentionDays, maxBytes };
}

function normalizeLock(lock: DataTaskJob['lock']): NormalizedDataTaskJob['lock'] {
    if (!lock) return false;
    if (lock !== true && !isRecord(lock)) invalid('lock must be a boolean or lease options object.');
    const options: DataTaskLeaseLockOptions = lock === true ? {} : lock as DataTaskLeaseLockOptions;
    const ttlMs = options.ttlMs ?? 120_000;
    const waitTimeoutMs = options.waitTimeoutMs ?? 0;
    if (!Number.isInteger(ttlMs) || ttlMs < 1000) invalid('lock.ttlMs must be an integer of at least 1000.');
    if (!Number.isInteger(waitTimeoutMs) || waitTimeoutMs < 0) invalid('lock.waitTimeoutMs must be a non-negative integer.');
    return { ttlMs, waitTimeoutMs };
}

export function normalizeDataTaskJob(job: DataTaskJob): NormalizedDataTaskJob {
    if (!isRecord(job)) invalid('job must be an object.');
    if (typeof job.name !== 'string' || job.name.trim() === '') invalid('job.name is required.');
    validateConnection(job.source, 'source');
    validateConnection(job.target, 'target');
    if (job.source === job.target) invalid('source and target must be independent runtimes or connection options.');
    const sourceOptions = connectionOptions(job.source);
    const targetOptions = connectionOptions(job.target);
    if (sourceOptions && targetOptions
        && sourceOptions.databaseName === targetOptions.databaseName
        && sourceOptions.config?.uri === targetOptions.config?.uri) invalid('source and target resolve to the same MongoDB database.');
    if (typeof job.targetEnvironment !== 'string' || !ENVIRONMENTS.has(job.targetEnvironment.toLowerCase())) {
        invalid('targetEnvironment must be development, test, staging, production, prod, or live.');
    }
    if (!Array.isArray(job.collections) || job.collections.length === 0) invalid('collections must be a non-empty array.');
    const targetNames = new Set<string>();
    const collections = job.collections.map((collection, position): NormalizedDataTaskCollection => {
        if (!isRecord(collection) || typeof collection.name !== 'string' || collection.name.trim() === '') invalid(`collections[${position}].name is required.`);
        const name = collection.name.trim();
        const targetName = typeof collection.targetName === 'string' && collection.targetName.trim() ? collection.targetName.trim() : name;
        if (targetNames.has(targetName)) invalid(`target collection "${targetName}" is configured more than once.`, name);
        targetNames.add(targetName);
        const indexes = normalizeIndexes(collection.indexes, name);
        const data = normalizeData(collection.data, name);
        if (indexes.length === 0 && !data) invalid('each collection requires indexes or data.', name);
        return { name, targetName, indexes, ...(data ? { data } : {}), verify: normalizeVerify(collection.verify, name) };
    });
    const production = PRODUCTION_ENVIRONMENTS.has(job.targetEnvironment.toLowerCase());
    const normalizedBase = {
        ...job,
        name: job.name.trim(),
        collections,
        backup: normalizeBackup(job.backup, production),
        lock: normalizeLock(job.lock),
        production,
    };
    const hashable = {
        ...normalizedBase,
        source: connectionDescriptor(job.source),
        target: connectionDescriptor(job.target),
        collections: collections.map((collection) => ({
            ...collection,
            data: collection.data ? {
                ...collection.data,
                transform: collection.data.transform
                    && 'handler' in collection.data.transform
                    && typeof collection.data.transform.handler === 'function'
                    ? { handlerHash: hashDataTaskValue(collection.data.transform.handler.toString()) }
                    : collection.data.transform,
            } : undefined,
        })),
    };
    return { ...normalizedBase, jobHash: hashDataTaskValue(hashable) };
}
