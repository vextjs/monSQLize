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

export interface NormalizedDataTaskDataRule extends Omit<DataTaskDataRule, 'strategy' | 'batchSize' | 'maxDocuments' | 'rename' | 'set' | 'unset'> {
    strategy: 'upsert' | 'insert';
    batchSize: number;
    maxDocuments: number;
    rename: Record<string, string>;
    set: GenericRecord;
    unset: string[];
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

export function isDataTaskJobRuntime(value: DataTaskConnection): value is DataTaskConnection & { collection(name: string): unknown } {
    return isRecord(value) && typeof value.collection === 'function';
}

export function connectionOptions(value: DataTaskConnection): MonSQLizeOptions | undefined {
    if (isDataTaskJobRuntime(value)) {
        const options = (value as { options?: unknown }).options;
        return isRecord(options) ? options as MonSQLizeOptions : undefined;
    }
    return value as MonSQLizeOptions;
}

function connectionDescriptor(value: DataTaskConnection): GenericRecord {
    const options = connectionOptions(value);
    if (!options) return { kind: 'runtime' };
    return {
        kind: isDataTaskJobRuntime(value) ? 'runtime' : 'options',
        type: options.type,
        databaseName: options.databaseName,
        configHash: hashDataTaskValue(options.config ?? {}),
    };
}

function validateConnection(value: DataTaskConnection, field: 'source' | 'target'): void {
    if (isDataTaskJobRuntime(value)) return;
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

const FORBIDDEN_FIELD_PATH_SEGMENTS = new Set(['__proto__', 'prototype', 'constructor']);
const BSON_PRIMITIVE_TYPES = new Set(['string', 'number', 'boolean']);
const BSON_UNSUPPORTED_TYPES = new Set(['undefined', 'function', 'symbol', 'bigint']);
const PLAIN_OBJECT_PROTOTYPES = new Set<unknown>([Object.prototype, null]);

function assertBsonLiteral(value: unknown, pathName: string, collection: string, stack = new WeakSet<object>()): void {
    const valueType = typeof value;
    if (value === null || BSON_PRIMITIVE_TYPES.has(valueType)) return;
    if (BSON_UNSUPPORTED_TYPES.has(valueType)) {
        invalid(`${pathName} must contain only BSON-compatible literals.`, collection);
    }
    if (value instanceof Date || value instanceof RegExp || Buffer.isBuffer(value)) return;
    if (Array.isArray(value)) {
        if (stack.has(value)) invalid(`${pathName} must not contain circular values.`, collection);
        stack.add(value);
        value.forEach((item, position) => assertBsonLiteral(item, `${pathName}[${position}]`, collection, stack));
        stack.delete(value);
        return;
    }
    if (!isRecord(value)) invalid(`${pathName} must contain only BSON-compatible literals.`, collection);
    if (typeof (value as { _bsontype?: unknown })._bsontype === 'string') return;
    const prototype = Object.getPrototypeOf(value);
    if (!PLAIN_OBJECT_PROTOTYPES.has(prototype)) invalid(`${pathName} must contain only BSON-compatible literals.`, collection);
    if (stack.has(value)) invalid(`${pathName} must not contain circular values.`, collection);
    stack.add(value);
    for (const [key, item] of Object.entries(value)) assertBsonLiteral(item, `${pathName}.${key}`, collection, stack);
    stack.delete(value);
}

function normalizeFieldPath(value: unknown, pathName: string, collection: string): string {
    if (typeof value !== 'string' || value.trim() === '') invalid(`${pathName} must be a non-empty field path.`, collection);
    const field = value.trim();
    const segments = field.split('.');
    if (segments.some((segment) => segment === '' || segment.startsWith('$') || FORBIDDEN_FIELD_PATH_SEGMENTS.has(segment))) {
        invalid(`${pathName} contains an unsafe field path.`, collection);
    }
    return field;
}

function pathsOverlap(left: string, right: string): boolean {
    return left === right || left.startsWith(`${right}.`) || right.startsWith(`${left}.`);
}

function projectionIncludes(projection: GenericRecord, field: string): boolean {
    if (field === '_id') return projection._id !== 0 && projection._id !== false;
    const included = Object.entries(projection)
        .filter(([key, value]) => key !== '_id' && value !== 0 && value !== false)
        .map(([key]) => key);
    if (included.length === 0) {
        return !Object.entries(projection).some(([key, value]) => (
            (value === 0 || value === false) && (key === field || field.startsWith(`${key}.`))
        ));
    }
    return included.some((key) => key === field || field.startsWith(`${key}.`));
}

function normalizeFieldPatch(
    data: DataTaskDataRule,
    identityFields: string[],
    collection: string,
): Pick<NormalizedDataTaskDataRule, 'rename' | 'set' | 'unset'> {
    if (data.rename !== undefined && !isRecord(data.rename)) invalid('data.rename must be an object.', collection);
    if (data.set !== undefined && !isRecord(data.set)) invalid('data.set must be an object.', collection);
    if (data.unset !== undefined && !Array.isArray(data.unset)) invalid('data.unset must be an array.', collection);

    const renameEntries = Object.entries(data.rename ?? {}).map(([source, destination], position) => {
        const normalizedSource = normalizeFieldPath(source, `data.rename source ${position}`, collection);
        const normalizedDestination = normalizeFieldPath(destination, `data.rename.${source}`, collection);
        if (pathsOverlap(normalizedSource, normalizedDestination)) invalid('data.rename source and destination must not overlap.', collection);
        return [normalizedSource, normalizedDestination] as const;
    });
    const setEntries = Object.entries(data.set ?? {}).map(([field, value], position) => {
        const normalizedField = normalizeFieldPath(field, `data.set field ${position}`, collection);
        assertBsonLiteral(value, `data.set.${field}`, collection);
        try {
            canonicalStringify(value);
        } catch {
            invalid(`data.set.${field} must be a BSON-compatible literal.`, collection);
        }
        return [normalizedField, value] as const;
    });
    const unset = (data.unset ?? []).map((field, position) => normalizeFieldPath(field, `data.unset[${position}]`, collection));
    if (new Set(unset).size !== unset.length) invalid('data.unset must not contain duplicates.', collection);
    const destinations = renameEntries.map(([, destination]) => destination);
    if (new Set(destinations).size !== destinations.length) invalid('data.rename destinations must be unique.', collection);

    const configuredPaths = [
        ...renameEntries.flatMap(([source, destination]) => [
            { path: source, label: `rename source "${source}"` },
            { path: destination, label: `rename destination "${destination}"` },
        ]),
        ...setEntries.map(([field]) => ({ path: field, label: `set "${field}"` })),
        ...unset.map((field) => ({ path: field, label: `unset "${field}"` })),
    ];
    for (let left = 0; left < configuredPaths.length; left += 1) {
        for (let right = left + 1; right < configuredPaths.length; right += 1) {
            if (pathsOverlap(configuredPaths[left].path, configuredPaths[right].path)) {
                invalid(`${configuredPaths[left].label} conflicts with ${configuredPaths[right].label}.`, collection);
            }
        }
    }
    for (const configured of configuredPaths) {
        if (configured.path === '_id' || configured.path.startsWith('_id.') || identityFields.some((identity) => pathsOverlap(configured.path, identity))) {
            invalid(`${configured.label} must not overlap _id or an identity field.`, collection);
        }
    }
    if (data.projection) {
        for (const required of [...identityFields, ...renameEntries.map(([source]) => source)]) {
            if (!projectionIncludes(data.projection, required)) invalid(`data.projection must include required field "${required}".`, collection);
        }
    }
    return {
        rename: Object.fromEntries([...renameEntries].sort(([left], [right]) => left.localeCompare(right))),
        set: Object.fromEntries([...setEntries].sort(([left], [right]) => left.localeCompare(right))),
        unset: [...unset].sort(),
    };
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
    if (data.projection) assertBsonLiteral(data.projection, 'data.projection', collection);
    if (hasFilter) assertBsonLiteral(data.filter, 'data.filter', collection);
    const identityFields = identity.mode === 'fields' ? identity.fields : ['_id', ...(identity.conflictBy ?? [])];
    const patch = normalizeFieldPatch(data, identityFields, collection);
    const batchSize = data.batchSize ?? 500;
    if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 10_000) invalid('data.batchSize must be an integer from 1 to 10000.', collection);
    const maxDocuments = data.maxDocuments ?? DEFAULT_DATA_TASK_MAX_DOCUMENTS;
    if (!Number.isInteger(maxDocuments) || maxDocuments < 1 || maxDocuments > 1_000_000) {
        invalid('data.maxDocuments must be an integer from 1 to 1000000.', collection);
    }
    const strategy = data.strategy ?? 'upsert';
    if (strategy !== 'upsert' && strategy !== 'insert') invalid('data.strategy must be upsert or insert.', collection);
    return { ...data, ...patch, filter: hasFilter ? data.filter : {}, all: data.all === true, identity, strategy, batchSize, maxDocuments };
}

function normalizeIndexes(indexes: DataTaskIndexDefinition[] | undefined, collection: string): DataTaskIndexDefinition[] {
    if (indexes === undefined) return [];
    if (!Array.isArray(indexes)) invalid('indexes must be an array.', collection);
    const names = new Set<string>();
    return indexes.map((index, position) => {
        if (!isRecord(index) || !isRecord(index.key) || Object.keys(index.key).length === 0) invalid(`indexes[${position}].key must be non-empty.`, collection);
        assertBsonLiteral(index.key, `indexes[${position}].key`, collection);
        if (index.name !== undefined && (typeof index.name !== 'string' || index.name.trim() === '')) invalid(`indexes[${position}].name must be non-empty.`, collection);
        if (index.name && names.has(index.name)) invalid(`duplicate index name "${index.name}".`, collection);
        if (index.name) names.add(index.name);
        if (index.options !== undefined && !isRecord(index.options)) invalid(`indexes[${position}].options must be an object.`, collection);
        if (index.options) assertBsonLiteral(index.options, `indexes[${position}].options`, collection);
        if (index.options && 'name' in index.options) invalid(`indexes[${position}].options.name is not allowed; use indexes[${position}].name.`, collection);
        if ((Object.keys(index.key).length === 1 && index.key._id === 1) || index.name === '_id_') invalid('indexes must not declare the built-in _id index.', collection);
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
    };
    return { ...normalizedBase, jobHash: hashDataTaskValue(hashable) };
}
