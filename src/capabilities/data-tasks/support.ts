import { ErrorCodes, createError } from '../../core/errors';
import type { Lock } from '../lock';
import type { ModelEnsureAllIndexesOptions, ModelIndexEnsureSummary } from '../../../types/model';
import type {
    DataTaskDefinition,
    DataTaskEndpoint,
    DataTaskEnvironment,
    DataTaskEnsureIndexesStep,
    DataTaskExecutionOptions,
    DataTaskIndexDefinition,
    DataTaskPlanResult,
    DataTaskProgress,
    DataTaskSnapshot,
    DataTaskSnapshotFormat,
    DataTaskStep,
    DataTaskStepPlan,
    DataTaskStepType,
    DataTaskSyncDataStep,
    DataTaskVerifyStep,
} from '../../../types/data-tasks';

export type GenericRecord = Record<string, unknown>;

const DATA_TASK_ENVIRONMENTS = new Set(['development', 'test', 'staging', 'production', 'prod', 'live']);

interface InternalExecutionOptions extends DataTaskExecutionOptions {
    dryRun?: boolean;
}

export interface FindChainLike {
    sort?(sort: GenericRecord): FindChainLike;
    limit?(limit: number): FindChainLike;
    batchSize?(batchSize: number): FindChainLike;
    toArray(): Promise<GenericRecord[]>;
}

interface AsyncDocumentStream extends AsyncIterable<GenericRecord> {
    destroy?(error?: Error): void;
}

export interface DataTaskCollectionLike {
    getNamespace?(): { db?: string; collection?: string; pool?: string };
    find(query?: GenericRecord, options?: GenericRecord): FindChainLike;
    stream?(query?: GenericRecord, options?: GenericRecord): AsyncDocumentStream;
    aggregate?(pipeline?: GenericRecord[], options?: GenericRecord): PromiseLike<GenericRecord[]>;
    count(query?: GenericRecord, options?: GenericRecord): Promise<number>;
    findOne(query: GenericRecord, options?: GenericRecord): Promise<GenericRecord | null>;
    insertOne(document: GenericRecord, options?: GenericRecord): Promise<unknown>;
    updateOne(filter: GenericRecord, update: unknown, options?: GenericRecord): Promise<GenericRecord>;
    updateMany(filter: GenericRecord, update: unknown, options?: GenericRecord): Promise<GenericRecord>;
    replaceOne(filter: GenericRecord, replacement: GenericRecord, options?: GenericRecord): Promise<GenericRecord>;
    findOneAndUpdate?(filter: GenericRecord, update: unknown, options?: GenericRecord): Promise<GenericRecord | null>;
    upsertOne?(filter: GenericRecord, update: unknown, options?: GenericRecord): Promise<GenericRecord>;
    createIndex(keys: GenericRecord, options?: GenericRecord): Promise<unknown>;
    listIndexes(): Promise<GenericRecord[]>;
    dropIndex?(name: string): Promise<unknown>;
    deleteOne?(filter: GenericRecord, options?: GenericRecord): Promise<GenericRecord>;
}

interface DataTaskDbLike {
    collection(name: string): DataTaskCollectionLike;
}

interface DataTaskPoolLike {
    collection(name: string): DataTaskCollectionLike;
    use?(database: string): DataTaskDbLike;
}

export interface DataTaskRuntimeHost {
    collection(name: string): DataTaskCollectionLike;
    db(name?: string): DataTaskDbLike;
    pool?(name: string): DataTaskPoolLike;
    scopedCollection?(name: string, options?: { database?: string; pool?: string }): DataTaskCollectionLike;
    ensureModelIndexes(options?: ModelEnsureAllIndexesOptions): Promise<ModelIndexEnsureSummary>;
    tryAcquireLock(key: string, options?: { ttl?: number }): Promise<Lock | null>;
}

export interface SnapshotConfig {
    enabled: boolean;
    dir: string;
    format: DataTaskSnapshotFormat;
    allowRunWithoutSnapshot: boolean;
}

export interface StepContext {
    taskName: string;
    source?: DataTaskEndpoint;
    target: DataTaskEndpoint;
    filter: GenericRecord;
    projection?: GenericRecord;
    sort?: GenericRecord;
    batchSize: number;
}

const DEFAULT_BATCH_SIZE = 500;
const DEFAULT_SNAPSHOT_DIR = '.monsqlize/data-task-snapshots';
const INDEX_OPTION_KEYS = [
    'unique',
    'sparse',
    'expireAfterSeconds',
    'partialFilterExpression',
    'collation',
    'hidden',
    'storageEngine',
    'weights',
    'default_language',
    'language_override',
    'textIndexVersion',
    '2dsphereIndexVersion',
    'bits',
    'min',
    'max',
    'bucketSize',
    'wildcardProjection',
] as const;

export function isRecord(value: unknown): value is GenericRecord {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function asRecord(value: unknown): GenericRecord {
    return isRecord(value) ? value : {};
}

function normalizeProjection(projection: DataTaskDefinition['projection']): GenericRecord | undefined {
    if (Array.isArray(projection)) {
        return Object.fromEntries(projection.map((field) => [field, 1]));
    }
    return isRecord(projection) ? projection : undefined;
}

export function endpointDatabase(endpoint: DataTaskEndpoint | undefined): string | undefined {
    return endpoint?.database ?? endpoint?.db;
}

function endpointKey(endpoint: DataTaskEndpoint | undefined): string {
    if (!endpoint) {
        return '';
    }
    return `${endpoint.pool ?? ''}:${endpointDatabase(endpoint) ?? ''}.${endpoint.collection}`;
}

export function sameEndpoint(source: DataTaskEndpoint | undefined, target: DataTaskEndpoint | undefined): boolean {
    return endpointKey(source) === endpointKey(target);
}

function hasUsefulFilter(filter: unknown): boolean {
    return isRecord(filter) && Object.keys(filter).length > 0;
}

export function sanitizeFileName(value: string): string {
    return value.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'data-task';
}

export function stableStringify(value: unknown): string {
    if (Array.isArray(value)) {
        return `[${value.map(stableStringify).join(',')}]`;
    }
    if (isRecord(value)) {
        return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
    }
    return JSON.stringify(value);
}

function extendedJsonValue(value: unknown): unknown {
    if (value instanceof Date) {
        return { $date: value.toISOString() };
    }
    if (Buffer.isBuffer(value)) {
        return { $binary: value.toString('base64') };
    }
    if (Array.isArray(value)) {
        return value.map(extendedJsonValue);
    }
    if (isRecord(value)) {
        const bsonLike = value as { _bsontype?: string; toHexString?: () => string; toString?: () => string };
        if (typeof bsonLike.toHexString === 'function' && (bsonLike._bsontype === 'ObjectId' || bsonLike._bsontype === 'ObjectID')) {
            return { $oid: bsonLike.toHexString() };
        }
        if (bsonLike._bsontype && typeof bsonLike.toString === 'function') {
            return { [`$${bsonLike._bsontype}`]: bsonLike.toString() };
        }
        return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, extendedJsonValue(item)]));
    }
    return value;
}

export function stringifyExtendedJson(value: unknown): string {
    return JSON.stringify(extendedJsonValue(value));
}

export function resolveSnapshotConfig(raw: DataTaskSnapshot | undefined, options: DataTaskExecutionOptions = {}): SnapshotConfig {
    if (raw === false) {
        return {
            enabled: false,
            dir: options.snapshotDir ?? DEFAULT_SNAPSHOT_DIR,
            format: 'extended-jsonl',
            allowRunWithoutSnapshot: options.allowRunWithoutSnapshot === true,
        };
    }
    if (typeof raw === 'string') {
        return {
            enabled: true,
            dir: options.snapshotDir ?? raw,
            format: 'extended-jsonl',
            allowRunWithoutSnapshot: options.allowRunWithoutSnapshot === true,
        };
    }
    if (isRecord(raw)) {
        return {
            enabled: raw.enabled !== false,
            dir: options.snapshotDir ?? (typeof raw.dir === 'string' ? raw.dir : DEFAULT_SNAPSHOT_DIR),
            format: raw.format === 'jsonl' ? 'jsonl' : 'extended-jsonl',
            allowRunWithoutSnapshot: options.allowRunWithoutSnapshot === true || raw.allowRunWithoutSnapshot === true,
        };
    }
    return {
        enabled: true,
        dir: options.snapshotDir ?? DEFAULT_SNAPSHOT_DIR,
        format: 'extended-jsonl',
        allowRunWithoutSnapshot: options.allowRunWithoutSnapshot === true,
    };
}

export function normalizeContext(task: DataTaskDefinition): StepContext {
    return {
        taskName: typeof task.name === 'string' && task.name.trim() ? task.name.trim() : 'data-task',
        source: task.source,
        target: task.target,
        filter: asRecord(task.filter),
        projection: normalizeProjection(task.projection),
        sort: asRecord(task.sort),
        batchSize: Number.isInteger(task.batchSize) && task.batchSize && task.batchSize > 0 ? task.batchSize : DEFAULT_BATCH_SIZE,
    };
}

function getStepType(step: DataTaskStep | undefined): DataTaskStepType | 'unknown' {
    return typeof step?.type === 'string' ? step.type as DataTaskStepType : 'unknown';
}

export function resolveMatchBy(task: DataTaskDefinition, step?: DataTaskSyncDataStep): string[] {
    const fields = step?.matchBy ?? task.matchBy;
    if (Array.isArray(fields) && fields.length > 0) {
        return fields.filter((item): item is string => typeof item === 'string' && item.trim() !== '');
    }
    if (task.source && sameEndpoint(task.source, task.target)) {
        return ['_id'];
    }
    return [];
}

export function classifyTaskEnvironment(task: DataTaskDefinition): {
    environment?: DataTaskEnvironment;
    explicit: boolean;
    isProduction: boolean;
} {
    const configured = typeof task.environment === 'string' && task.environment.trim() !== ''
        ? task.environment.trim()
        : undefined;
    const configuredKey = configured?.toLowerCase();
    const normalizedConfigured = configuredKey && DATA_TASK_ENVIRONMENTS.has(configuredKey)
        ? configuredKey as DataTaskEnvironment
        : undefined;
    const runtimeKey = process.env.NODE_ENV?.trim().toLowerCase();
    const productionNames = new Set(['production', 'prod', 'live']);
    const isProduction = task.production === true
        || (configuredKey !== undefined && productionNames.has(configuredKey))
        || (runtimeKey !== undefined && productionNames.has(runtimeKey));
    return {
        environment: normalizedConfigured ?? (task.production === true || (runtimeKey && productionNames.has(runtimeKey)) ? 'production' : undefined),
        explicit: configured !== undefined || task.production === true,
        isProduction,
    };
}

export function getByPath(document: GenericRecord, field: string): unknown {
    return field.split('.').reduce<unknown>((current, part) => (isRecord(current) ? current[part] : undefined), document);
}

export function buildMatchFilter(document: GenericRecord, fields: string[]): GenericRecord {
    const filter: GenericRecord = {};
    for (const field of fields) {
        const value = getByPath(document, field);
        if (value === undefined) {
            throw createError(ErrorCodes.INVALID_ARGUMENT, `[DataTask] matchBy field "${field}" is missing on a source document.`);
        }
        filter[field] = value;
    }
    return filter;
}

export function cloneForWrite(document: GenericRecord, preserveSourceId: boolean): GenericRecord {
    const cloned = { ...document };
    if (!preserveSourceId) {
        delete cloned._id;
    }
    return cloned;
}

export function resultNumber(result: unknown, key: string): number {
    const value = isRecord(result) ? result[key] : undefined;
    return typeof value === 'number' ? value : 0;
}

export function requireStep<TStep extends DataTaskStep>(task: DataTaskDefinition, type: TStep['type'], step?: TStep): TStep {
    if (step) {
        return step;
    }
    const found = task.steps.find((candidate) => candidate.type === type);
    if (!found) {
        throw createError(ErrorCodes.INVALID_ARGUMENT, `[DataTask] ${type} step is required.`);
    }
    return found as TStep;
}

function createStepPlan(type: DataTaskStepType, overrides: Partial<DataTaskStepPlan> = {}): DataTaskStepPlan {
    return {
        type,
        willWrite: false,
        requiresSource: false,
        requiresFilter: false,
        requiresSnapshot: false,
        warnings: [],
        errors: [],
        ...overrides,
    };
}

export function indexOptions(definition: DataTaskIndexDefinition): GenericRecord {
    return {
        ...(definition.options ?? {}),
        ...(definition.name ? { name: definition.name } : {}),
    };
}

export function comparableIndexOptions(options: GenericRecord): GenericRecord {
    return {
        unique: options.unique === true,
        sparse: options.sparse === true,
        hidden: options.hidden === true,
        ...Object.fromEntries(INDEX_OPTION_KEYS
        .filter((key) => key !== 'unique' && key !== 'sparse' && key !== 'hidden')
        .filter((key) => options[key] !== undefined)
        .map((key) => [key, options[key]])),
    };
}

export function indexNameFromOperation(operation: unknown): string | undefined {
    if (typeof operation === 'string') {
        return operation;
    }
    if (isRecord(operation) && typeof operation.name === 'string') {
        return operation.name;
    }
    return undefined;
}

export function indexNameFromDeclared(options: unknown): string | undefined {
    return isRecord(options) && typeof options.name === 'string' ? options.name : undefined;
}

export function normalizeIndexKey(key: unknown): GenericRecord {
    return isRecord(key) ? key : { value: key };
}

export function orderedIndexKeyString(key: unknown): string {
    if (!isRecord(key)) {
        return stableStringify(key);
    }
    return `[${Object.entries(key).map(([field, direction]) => `${JSON.stringify(field)}:${stableStringify(direction)}`).join(',')}]`;
}

export function resolveTaskCollection(host: DataTaskRuntimeHost, endpoint: DataTaskEndpoint): DataTaskCollectionLike {
    const database = endpointDatabase(endpoint);
    if (host.scopedCollection) {
        return host.scopedCollection(endpoint.collection, { database, pool: endpoint.pool });
    }
    if (endpoint.pool && host.pool) {
        const pool = host.pool(endpoint.pool);
        if (database && pool.use) {
            return pool.use(database).collection(endpoint.collection);
        }
        return pool.collection(endpoint.collection);
    }
    if (database) {
        return host.db(database).collection(endpoint.collection);
    }
    return host.collection(endpoint.collection);
}

function queryOptions(context: StepContext): GenericRecord {
    return {
        ...(context.projection ? { projection: context.projection } : {}),
        sort: Object.keys(context.sort ?? {}).length > 0 ? context.sort : { _id: 1 },
        batchSize: context.batchSize,
    };
}

export async function* iterateDocuments(
    collection: DataTaskCollectionLike,
    context: StepContext,
    limit?: number,
): AsyncGenerator<GenericRecord> {
    if (limit !== undefined && limit <= 0) {
        return;
    }
    if (collection.stream) {
        const stream = collection.stream(context.filter, queryOptions(context));
        let processed = 0;
        try {
            for await (const document of stream) {
                yield document;
                processed += 1;
                if (limit !== undefined && processed >= limit) {
                    stream.destroy?.();
                    break;
                }
            }
        } finally {
            if (limit !== undefined && processed >= limit) {
                stream.destroy?.();
            }
        }
        return;
    }

    const findOptions = context.projection ? { projection: context.projection } : undefined;
    let chain = collection.find(context.filter, findOptions);
    if (typeof chain.sort === 'function') {
        chain = chain.sort(Object.keys(context.sort ?? {}).length > 0 ? context.sort ?? {} : { _id: 1 });
    }
    if (limit !== undefined && typeof chain.limit === 'function') {
        chain = chain.limit(limit);
    }
    if (typeof chain.batchSize === 'function') {
        chain = chain.batchSize(context.batchSize);
    }
    const documents = await chain.toArray();
    for (const document of limit === undefined ? documents : documents.slice(0, limit)) {
        yield document;
    }
}

export async function* iterateDocumentBatches(
    collection: DataTaskCollectionLike,
    context: StepContext,
): AsyncGenerator<GenericRecord[]> {
    let batch: GenericRecord[] = [];
    for await (const document of iterateDocuments(collection, context)) {
        batch.push(document);
        if (batch.length >= context.batchSize) {
            yield batch;
            batch = [];
        }
    }
    if (batch.length > 0) {
        yield batch;
    }
}

export async function findDocuments(collection: DataTaskCollectionLike, context: StepContext, limit?: number): Promise<GenericRecord[]> {
    const documents: GenericRecord[] = [];
    for await (const document of iterateDocuments(collection, context, limit)) {
        documents.push(document);
    }
    return documents;
}

export async function findMatchingDocuments(
    collection: DataTaskCollectionLike,
    filter: GenericRecord,
    limit = 2,
): Promise<GenericRecord[]> {
    let chain = collection.find(filter);
    if (typeof chain.sort === 'function') chain = chain.sort({ _id: 1 });
    if (typeof chain.limit === 'function') chain = chain.limit(limit);
    return (await chain.toArray()).slice(0, limit);
}

export function reportProgress(options: DataTaskExecutionOptions | undefined, progress: DataTaskProgress): void {
    options?.onProgress?.(progress);
}

function isDryRun(options: DataTaskExecutionOptions): boolean {
    return (options as InternalExecutionOptions).dryRun === true;
}

export function buildPlan(task: DataTaskDefinition, options: DataTaskExecutionOptions = {}): DataTaskPlanResult {
    const taskName = typeof task?.name === 'string' && task.name.trim() ? task.name.trim() : 'data-task';
    const steps: DataTaskStepPlan[] = [];
    const warnings: string[] = [];
    const errors: string[] = [];

    if (!isRecord(task)) {
        errors.push('[DataTask] task must be an object.');
        return {
            mode: 'plan' as const,
            taskName,
            passed: false,
            isProduction: false,
            risk: 'high' as const,
            willWrite: false,
            requiresProductionConfirmation: false,
            requiresSnapshot: false,
            requiresSnapshotApproval: false,
            steps,
            warnings,
            errors,
        };
    }
    if (!taskName || taskName === 'data-task') {
        warnings.push('[DataTask] task.name is recommended for audit output and snapshot filenames.');
    }
    if (!isRecord(task.target) || typeof task.target.collection !== 'string' || task.target.collection.trim() === '') {
        errors.push('[DataTask] target.collection is required.');
    }
    if (task.environment !== undefined
        && (typeof task.environment !== 'string' || !DATA_TASK_ENVIRONMENTS.has(task.environment.trim().toLowerCase()))) {
        errors.push('[DataTask] environment must be one of development, test, staging, production, prod, or live.');
    }
    if (!Array.isArray(task.steps) || task.steps.length === 0) {
        errors.push('[DataTask] steps must be a non-empty array.');
    }
    if (task.batchSize !== undefined && (!Number.isInteger(task.batchSize) || task.batchSize <= 0)) {
        errors.push('[DataTask] batchSize must be a positive integer.');
    }

    const filterOk = hasUsefulFilter(task.filter);
    const allowFullCollection = task.allowFullCollection === true;
    for (const step of task.steps ?? []) {
        const type = getStepType(step);
        if (type === 'unknown') {
            const invalidPlan = createStepPlan('verify', { errors: ['[DataTask] step.type is required.'] });
            steps.push(invalidPlan);
            errors.push('[DataTask] step.type is required.');
            continue;
        }
        const stepPlan = createStepPlan(type as DataTaskStepType);
        if (type === 'ensureIndexes') {
            stepPlan.willWrite = true;
            const indexStep = step as DataTaskEnsureIndexesStep;
            const models = [
                ...(typeof indexStep.model === 'string' ? [indexStep.model] : []),
                ...(Array.isArray(indexStep.models) ? indexStep.models : []),
            ];
            if (models.length === 0 && (!Array.isArray(indexStep.indexes) || indexStep.indexes.length === 0)) {
                stepPlan.errors.push('[DataTask] ensureIndexes requires model/models or indexes.');
            }
        } else if (type === 'syncData') {
            stepPlan.willWrite = true;
            stepPlan.requiresSource = true;
            stepPlan.requiresFilter = true;
            stepPlan.requiresSnapshot = true;
            const syncStep = step as DataTaskSyncDataStep;
            if (syncStep.batchSize !== undefined && (!Number.isInteger(syncStep.batchSize) || syncStep.batchSize <= 0)) {
                stepPlan.errors.push('[DataTask] syncData.batchSize must be a positive integer.');
            }
            if (!task.source) {
                stepPlan.errors.push('[DataTask] syncData requires source.');
            }
            if (!filterOk && !allowFullCollection) {
                stepPlan.errors.push('[DataTask] syncData requires filter unless allowFullCollection is true.');
            }
            const matchBy = resolveMatchBy(task, syncStep);
            if (task.source && !sameEndpoint(task.source, task.target) && matchBy.length === 0) {
                stepPlan.errors.push('[DataTask] syncData across different endpoints requires business matchBy fields.');
            }
            if (task.source && !sameEndpoint(task.source, task.target) && matchBy.includes('_id') && syncStep.allowSourceIdMatch !== true) {
                stepPlan.errors.push('[DataTask] cross-endpoint syncData cannot use source _id unless allowSourceIdMatch is true.');
            }
            if (syncStep.strategy !== undefined && !['insert', 'upsert', 'merge', 'replace'].includes(syncStep.strategy)) {
                stepPlan.errors.push(`[DataTask] unsupported syncData strategy: ${String(syncStep.strategy)}.`);
            }
        } else if (type === 'transformFields') {
            stepPlan.willWrite = true;
            stepPlan.requiresFilter = true;
            stepPlan.requiresSnapshot = true;
            const transformStep = step as { update?: unknown; pipeline?: unknown; transform?: unknown };
            if (!filterOk && !allowFullCollection) {
                stepPlan.errors.push('[DataTask] transformFields requires filter unless allowFullCollection is true.');
            }
            const updateCount = [transformStep.update !== undefined, transformStep.pipeline !== undefined, transformStep.transform !== undefined].filter(Boolean).length;
            if (updateCount === 0) {
                stepPlan.errors.push('[DataTask] transformFields requires update, pipeline, or transform.');
            }
            if (updateCount > 1) {
                stepPlan.errors.push('[DataTask] transformFields accepts only one of update, pipeline, or transform.');
            }
            if ('sampleSize' in step && step.sampleSize !== undefined
                && (typeof step.sampleSize !== 'number' || !Number.isInteger(step.sampleSize) || step.sampleSize < 0)) {
                stepPlan.errors.push('[DataTask] transformFields.sampleSize must be a non-negative integer.');
            }
        } else if (type === 'exportAffected') {
            stepPlan.requiresFilter = true;
            if (!filterOk && !allowFullCollection) {
                stepPlan.errors.push('[DataTask] exportAffected requires filter unless allowFullCollection is true.');
            }
        } else if (type === 'verify') {
            const verifyStep = step as DataTaskVerifyStep;
            if (verifyStep.sample !== undefined && (!Number.isInteger(verifyStep.sample) || verifyStep.sample < 0)) {
                stepPlan.errors.push('[DataTask] verify.sample must be a non-negative integer.');
            }
            if (verifyStep.count === true || (typeof verifyStep.sample === 'number' && verifyStep.sample > 0)) {
                stepPlan.requiresSource = true;
                if (!task.source) {
                    stepPlan.errors.push('[DataTask] verify count/sample requires source.');
                } else if (verifyStep.sample && !sameEndpoint(task.source, task.target)
                    && resolveMatchBy(task, task.steps.find((candidate): candidate is DataTaskSyncDataStep => candidate.type === 'syncData')).length === 0) {
                    stepPlan.errors.push('[DataTask] verify sample across different endpoints requires business matchBy fields.');
                }
            }
        } else {
            stepPlan.errors.push(`[DataTask] unsupported step type: ${String(type)}.`);
        }
        errors.push(...stepPlan.errors);
        warnings.push(...stepPlan.warnings);
        steps.push(stepPlan);
    }

    const willWrite = steps.some((step) => step.willWrite);
    const requiresSnapshot = steps.some((step) => step.requiresSnapshot);
    const environment = classifyTaskEnvironment(task);
    if (willWrite && !environment.explicit) {
        errors.push('[DataTask] write tasks require an explicit environment (development, test, staging, production, prod, or live).');
    }
    if (isRecord(task.lock)) {
        if (task.lock.scope !== undefined && task.lock.scope !== 'process') {
            errors.push('[DataTask] built-in data task locks only support scope: "process".');
        }
        if (task.lock.ttlMs !== undefined
            && (typeof task.lock.ttlMs !== 'number' || !Number.isInteger(task.lock.ttlMs) || task.lock.ttlMs < 2)) {
            errors.push('[DataTask] lock.ttlMs must be an integer greater than or equal to 2.');
        }
        if (task.lock.renewIntervalMs !== undefined
            && (typeof task.lock.renewIntervalMs !== 'number'
                || !Number.isInteger(task.lock.renewIntervalMs)
                || task.lock.renewIntervalMs <= 0)) {
            errors.push('[DataTask] lock.renewIntervalMs must be a positive integer.');
        }
        if (typeof task.lock.ttlMs === 'number' && typeof task.lock.renewIntervalMs === 'number'
            && task.lock.renewIntervalMs >= task.lock.ttlMs) {
            errors.push('[DataTask] lock.renewIntervalMs must be less than lock.ttlMs.');
        }
    }
    const requiresProductionConfirmation = environment.isProduction && willWrite;
    const requiresSnapshotApproval = environment.isProduction && requiresSnapshot;
    const snapshot = resolveSnapshotConfig(task.snapshot, options);
    if (requiresSnapshot && !snapshot.enabled && (!snapshot.allowRunWithoutSnapshot || environment.isProduction) && !isDryRun(options)) {
        errors.push(environment.isProduction
            ? '[DataTask] production data writes cannot disable affected snapshots.'
            : '[DataTask] data write steps require snapshot unless allowRunWithoutSnapshot is true.');
    }
    if (requiresProductionConfirmation) {
        warnings.push('[DataTask] production writes require confirmProduction: true.');
    }
    if (requiresSnapshotApproval) {
        warnings.push('[DataTask] production data writes require an approved snapshot checksum.');
    }
    const risk = requiresProductionConfirmation || allowFullCollection ? 'high' : willWrite ? 'medium' : 'low';
    return {
        mode: 'plan' as const,
        taskName,
        passed: errors.length === 0,
        environment: environment.environment as DataTaskPlanResult['environment'],
        isProduction: environment.isProduction,
        risk,
        willWrite,
        requiresProductionConfirmation,
        requiresSnapshot,
        requiresSnapshotApproval,
        steps,
        warnings,
        errors,
    };
}

export function assertExecutableStep(task: DataTaskDefinition, step: DataTaskStep, options: DataTaskExecutionOptions): void {
    const plan = buildPlan({ ...task, steps: [step] }, options);
    if (plan.errors.length > 0) {
        throw createError(ErrorCodes.INVALID_CONFIG, plan.errors.join(' '));
    }
    if (!isDryRun(options) && plan.requiresProductionConfirmation && options.confirmProduction !== true) {
        throw createError(ErrorCodes.INVALID_OPERATION, '[DataTask] production run requires confirmProduction: true.');
    }
}
