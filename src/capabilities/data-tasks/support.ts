import { ErrorCodes, createError } from '../../core/errors';
import type { Lock } from '../lock';
import type { ModelEnsureAllIndexesOptions, ModelIndexEnsureSummary } from '../../../types/model';
import type {
    DataTaskDefinition,
    DataTaskEndpoint,
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

interface FindChainLike {
    sort?(sort: GenericRecord): FindChainLike;
    limit?(limit: number): FindChainLike;
    toArray(): Promise<GenericRecord[]>;
}

export interface DataTaskCollectionLike {
    getNamespace?(): { db?: string; collection?: string; pool?: string };
    find(query?: GenericRecord, options?: GenericRecord): FindChainLike;
    count(query?: GenericRecord, options?: GenericRecord): Promise<number>;
    findOne(query: GenericRecord, options?: GenericRecord): Promise<GenericRecord | null>;
    insertOne(document: GenericRecord, options?: GenericRecord): Promise<unknown>;
    updateOne(filter: GenericRecord, update: unknown, options?: GenericRecord): Promise<GenericRecord>;
    updateMany(filter: GenericRecord, update: unknown, options?: GenericRecord): Promise<GenericRecord>;
    replaceOne(filter: GenericRecord, replacement: GenericRecord, options?: GenericRecord): Promise<GenericRecord>;
    upsertOne?(filter: GenericRecord, update: unknown, options?: GenericRecord): Promise<GenericRecord>;
    createIndex(keys: GenericRecord, options?: GenericRecord): Promise<unknown>;
    listIndexes(): Promise<GenericRecord[]>;
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

function isProductionTask(task: DataTaskDefinition): boolean {
    return task.production === true || task.environment === 'production';
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
    return Object.fromEntries(INDEX_OPTION_KEYS
        .filter((key) => options[key] !== undefined)
        .map((key) => [key, options[key]]));
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

export async function findDocuments(collection: DataTaskCollectionLike, context: StepContext, limit?: number): Promise<GenericRecord[]> {
    const findOptions = context.projection ? { projection: context.projection } : undefined;
    let chain = collection.find(context.filter, findOptions);
    if (Object.keys(context.sort ?? {}).length > 0 && typeof chain.sort === 'function') {
        chain = chain.sort(context.sort ?? {});
    }
    if (limit !== undefined && typeof chain.limit === 'function') {
        chain = chain.limit(limit);
    }
    return chain.toArray();
}

export function reportProgress(options: DataTaskExecutionOptions | undefined, progress: DataTaskProgress): void {
    options?.onProgress?.(progress);
}

export function buildPlan(task: DataTaskDefinition, options: DataTaskExecutionOptions = {}): DataTaskPlanResult {
    const taskName = typeof task?.name === 'string' && task.name.trim() ? task.name.trim() : 'data-task';
    const steps: DataTaskStepPlan[] = [];
    const warnings: string[] = [];
    const errors: string[] = [];

    if (!isRecord(task)) {
        errors.push('[DataTask] task must be an object.');
        return { mode: 'plan' as const, taskName, risk: 'high' as const, willWrite: false, requiresProductionConfirmation: false, requiresSnapshot: false, steps, warnings, errors };
    }
    if (!taskName || taskName === 'data-task') {
        warnings.push('[DataTask] task.name is recommended for audit output and snapshot filenames.');
    }
    if (!isRecord(task.target) || typeof task.target.collection !== 'string' || task.target.collection.trim() === '') {
        errors.push('[DataTask] target.collection is required.');
    }
    if (!Array.isArray(task.steps) || task.steps.length === 0) {
        errors.push('[DataTask] steps must be a non-empty array.');
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
        } else if (type === 'exportAffected') {
            stepPlan.requiresFilter = true;
            if (!filterOk && !allowFullCollection) {
                stepPlan.errors.push('[DataTask] exportAffected requires filter unless allowFullCollection is true.');
            }
        } else if (type === 'verify') {
            const verifyStep = step as DataTaskVerifyStep;
            if (verifyStep.count === true) {
                stepPlan.requiresSource = true;
                if (!task.source) {
                    stepPlan.errors.push('[DataTask] verify count requires source.');
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
    const requiresProductionConfirmation = isProductionTask(task) && willWrite;
    const snapshot = resolveSnapshotConfig(task.snapshot, options);
    if (requiresSnapshot && !snapshot.enabled && !snapshot.allowRunWithoutSnapshot && options.dryRun !== true) {
        errors.push('[DataTask] data write steps require snapshot unless allowRunWithoutSnapshot is true.');
    }
    if (requiresProductionConfirmation) {
        warnings.push('[DataTask] production writes require confirmProduction: true.');
    }
    const risk = requiresProductionConfirmation || allowFullCollection ? 'high' : willWrite ? 'medium' : 'low';
    return { mode: 'plan' as const, taskName, risk, willWrite, requiresProductionConfirmation, requiresSnapshot, steps, warnings, errors };
}

export function assertExecutableStep(task: DataTaskDefinition, step: DataTaskStep, options: DataTaskExecutionOptions): void {
    const plan = buildPlan({ ...task, steps: [step] }, options);
    if (plan.errors.length > 0) {
        throw createError(ErrorCodes.INVALID_CONFIG, plan.errors.join(' '));
    }
    if (options.dryRun !== true && plan.requiresProductionConfirmation && options.confirmProduction !== true) {
        throw createError(ErrorCodes.INVALID_OPERATION, '[DataTask] production run requires confirmProduction: true.');
    }
}
