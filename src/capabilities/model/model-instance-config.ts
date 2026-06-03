/**
 * ModelInstance configuration resolution helpers.
 *
 * Responsible for deriving collection name, database name, connection pool config,
 * and other ModelInstance initialization parameters from the registered model definition
 * and runtime options.
 */
import type { ModelDefinition } from '../../../types/model';
import type { ModelCollectionLike } from './populate-promise';
import { _makeValidatingDslFn, _schemaDslFn } from './schema-dsl';

type ModelHooksFactory = (
    model: unknown,
) => Record<string, { before?: (...args: unknown[]) => unknown; after?: (...args: unknown[]) => unknown }>;

type ModelMethodsFactory = (
    instance: unknown,
) => {
    instance?: Record<string, (...args: unknown[]) => unknown>;
    static?: Record<string, (...args: unknown[]) => unknown>;
};

export type ModelTimestampsConfig = { createdAt: string | false; updatedAt: string | false };
export type ModelSoftDeleteConfig = { enabled: boolean; field: string; type: string; ttl: number | null };
export type ModelVersionConfig = { enabled: boolean; field: string };

type ModelDefinitionCompat<TDocument> = ModelDefinition<TDocument> & {
    enums?: Record<string, string>;
    statics?: Record<string, (...args: unknown[]) => unknown>;
    schema?: ((dslFn: unknown) => unknown) | Record<string, unknown>;
    hooks?: ModelHooksFactory;
    methods?: ModelMethodsFactory;
    indexes?: Array<{ key: unknown } & Record<string, unknown>>;
    options?: {
        validate?: boolean;
        timestamps?: true | false | {
            createdAt?: string | false;
            updatedAt?: string | false;
        };
        softDelete?: true | {
            enabled?: boolean;
            field?: string;
            type?: string;
            ttl?: number | null;
        };
        version?: true | {
            enabled?: boolean;
            field?: string;
        };
    };
};

type ModelIndexTask = {
    status: 'pending' | 'fulfilled' | 'failed';
    promise: Promise<void>;
    error?: unknown;
};

type ModelIndexScheduleOptions = {
    runtime?: object;
    dbName?: string;
    poolName?: string;
    collectionName?: string;
};

const runtimeModelIndexTasks = new WeakMap<object, Map<string, ModelIndexTask>>();
const fallbackModelIndexTasks = new Map<string, ModelIndexTask>();

function toCompatDefinition<TDocument>(definition: ModelDefinition<TDocument>): ModelDefinitionCompat<TDocument> {
    return definition as ModelDefinitionCompat<TDocument>;
}

function stableIndexStringify(value: unknown): string {
    if (value instanceof Date) {
        return JSON.stringify(value.toISOString());
    }
    if (Array.isArray(value)) {
        return `[${value.map((item) => stableIndexStringify(item)).join(',')}]`;
    }
    if (value && typeof value === 'object') {
        const entries = Object.entries(value as Record<string, unknown>)
            .filter(([, current]) => current !== undefined)
            .sort(([left], [right]) => left.localeCompare(right));
        return `{${entries.map(([key, current]) => `${JSON.stringify(key)}:${stableIndexStringify(current)}`).join(',')}}`;
    }
    return JSON.stringify(value) ?? 'undefined';
}

function getIndexTaskRegistry(runtime: object | undefined): Map<string, ModelIndexTask> {
    if (!runtime) {
        return fallbackModelIndexTasks;
    }
    let registry = runtimeModelIndexTasks.get(runtime);
    if (!registry) {
        registry = new Map<string, ModelIndexTask>();
        runtimeModelIndexTasks.set(runtime, registry);
    }
    return registry;
}

function resolveIndexTaskScope<TDocument>(
    collection: ModelCollectionLike<TDocument>,
    options: ModelIndexScheduleOptions | undefined,
): { dbName: string; poolName: string; collectionName: string } {
    try {
        const namespace = collection.getNamespace();
        return {
            dbName: options?.dbName ?? namespace.db,
            poolName: options?.poolName ?? 'default',
            collectionName: options?.collectionName ?? namespace.collection,
        };
    } catch {
        return {
            dbName: options?.dbName ?? 'default',
            poolName: options?.poolName ?? 'default',
            collectionName: options?.collectionName ?? 'unknown',
        };
    }
}

function warnIndexFailure(runtime: object | undefined, taskKey: string, error: unknown): void {
    const logger = runtime as { logger?: { warn?: (...args: unknown[]) => void } } | undefined;
    logger?.logger?.warn?.('[MonSQLize] model index creation failed', {
        taskKey,
        error: error instanceof Error ? error.message : String(error),
    });
}

function scheduleIndexTask<TDocument>(
    collection: ModelCollectionLike<TDocument>,
    key: unknown,
    indexOptions: Record<string, unknown>,
    options?: ModelIndexScheduleOptions,
): void {
    const scope = resolveIndexTaskScope(collection, options);
    const indexFingerprint = stableIndexStringify({ key, options: indexOptions });
    const taskKey = `${scope.poolName}:${scope.dbName}:${scope.collectionName}:${indexFingerprint}`;
    const registry = getIndexTaskRegistry(options?.runtime);
    const existing = registry.get(taskKey);
    if (existing && existing.status !== 'failed') {
        return;
    }

    const task: ModelIndexTask = {
        status: 'pending',
        promise: new Promise((resolve) => {
            setImmediate(() => {
                Promise.resolve()
                    .then(() => collection.createIndex(key, indexOptions))
                    .then(() => {
                        task.status = 'fulfilled';
                        resolve();
                    })
                    .catch((error: unknown) => {
                        task.status = 'failed';
                        task.error = error;
                        warnIndexFailure(options?.runtime, taskKey, error);
                        resolve();
                    });
            });
        }),
    };
    registry.set(taskKey, task);
}

export function getModelEnums<TDocument>(definition: ModelDefinition<TDocument>): Record<string, string> {
    return toCompatDefinition(definition).enums ?? {};
}

export function attachModelStatics<TDocument>(target: object, definition: ModelDefinition<TDocument>): void {
    const compat = toCompatDefinition(definition);
    if (typeof compat.methods === 'function') {
        return;
    }
    for (const [name, handler] of Object.entries(compat.statics ?? {})) {
        if (typeof handler === 'function' && !(name in target)) {
            Object.defineProperty(target, name, {
                configurable: true,
                enumerable: false,
                writable: false,
                value: (...args: unknown[]) => handler.apply(target, args),
            });
        }
    }
}

export function buildModelSchemaState<TDocument>(definition: ModelDefinition<TDocument>): {
    schemaCache: unknown;
    schemaError: Error | null;
} {
    const compat = toCompatDefinition(definition);
    if (typeof compat.schema !== 'function') {
        return {
            schemaCache: compat.schema ?? null,
            schemaError: null,
        };
    }

    if (_schemaDslFn === null) {
        return {
            schemaCache: null,
            schemaError: null,
        };
    }

    const validatingDsl = _makeValidatingDslFn(_schemaDslFn);
    try {
        return {
            schemaCache: compat.schema.call(definition, validatingDsl),
            schemaError: null,
        };
    } catch (error) {
        const schemaError = error instanceof Error ? error : new Error(String(error));
        if (schemaError instanceof TypeError && schemaError.message.includes('[schema] Invalid type')) {
            throw schemaError;
        }
        return {
            schemaCache: null,
            schemaError,
        };
    }
}

export function isModelValidationEnabled<TDocument>(definition: ModelDefinition<TDocument>): boolean {
    return toCompatDefinition(definition).options?.validate !== false;
}

export function resolveModelTimestampsConfig<TDocument>(
    definition: ModelDefinition<TDocument>,
): ModelTimestampsConfig | null {
    const timestamps = toCompatDefinition(definition).options?.timestamps as
        | true
        | false
        | {
            createdAt?: string | false;
            updatedAt?: string | false;
        }
        | undefined;
    if (timestamps == null || timestamps === false) {
        return null;
    }
    if (timestamps === true) {
        return {
            createdAt: 'createdAt',
            updatedAt: 'updatedAt',
        };
    }
    return {
        createdAt: timestamps.createdAt === false ? false : (typeof timestamps.createdAt === 'string' ? timestamps.createdAt : 'createdAt'),
        updatedAt: timestamps.updatedAt === false ? false : (typeof timestamps.updatedAt === 'string' ? timestamps.updatedAt : 'updatedAt'),
    };
}

export function resolveModelSoftDeleteConfig<TDocument>(
    definition: ModelDefinition<TDocument>,
): ModelSoftDeleteConfig | null {
    const softDelete = toCompatDefinition(definition).options?.softDelete;
    if (!softDelete) {
        return null;
    }
    if (softDelete === true) {
        return {
            enabled: true,
            field: 'deletedAt',
            type: 'timestamp',
            ttl: null,
        };
    }
    return {
        enabled: softDelete.enabled !== false,
        field: softDelete.field ?? 'deletedAt',
        type: softDelete.type ?? 'timestamp',
        ttl: softDelete.ttl ?? null,
    };
}

export function resolveModelVersionConfig<TDocument>(
    definition: ModelDefinition<TDocument>,
): ModelVersionConfig | null {
    const version = toCompatDefinition(definition).options?.version;
    if (!version) {
        return null;
    }
    if (version === true) {
        return {
            enabled: true,
            field: 'version',
        };
    }
    return {
        enabled: version.enabled !== false,
        field: version.field ?? 'version',
    };
}

export function resolveModelHooksFactory<TDocument>(
    definition: ModelDefinition<TDocument>,
): ModelHooksFactory | null {
    const hooks = toCompatDefinition(definition).hooks;
    return typeof hooks === 'function' ? hooks : null;
}

export function initializeModelV1Methods<TDocument>(
    target: object,
    definition: ModelDefinition<TDocument>,
): Record<string, (...args: unknown[]) => unknown> {
    const methods = toCompatDefinition(definition).methods;
    if (typeof methods !== 'function') {
        return {};
    }
    try {
        const customMethods = methods(target);
        for (const [name, fn] of Object.entries(customMethods.static ?? {})) {
            if (typeof fn === 'function' && !(name in target)) {
                Object.defineProperty(target, name, {
                    configurable: true,
                    enumerable: false,
                    writable: false,
                    value: (...args: unknown[]) => fn.apply(target, args),
                });
            }
        }
        return customMethods.instance ?? {};
    } catch (error) {
        // v1 compat: methods() factory errors are non-fatal, but log them so they are diagnosable.
        console.warn('[MonSQLize] initializeModelV1Methods: methods() factory threw an error', error);
        return {};
    }
}

export function scheduleModelIndexes<TDocument>(
    collection: ModelCollectionLike<TDocument>,
    definition: ModelDefinition<TDocument>,
    softDeleteConfig: ModelSoftDeleteConfig | null,
    options?: ModelIndexScheduleOptions,
): void {
    if (softDeleteConfig?.enabled && softDeleteConfig.type === 'timestamp' && softDeleteConfig.ttl) {
        const softDeleteIndex = softDeleteConfig;
        scheduleIndexTask(
            collection,
            { [softDeleteIndex.field]: 1 },
            { expireAfterSeconds: softDeleteIndex.ttl },
            options,
        );
    }

    const indexes = toCompatDefinition(definition).indexes;
    if (!Array.isArray(indexes) || indexes.length === 0) {
        return;
    }
    for (const indexSpec of indexes) {
        if (!indexSpec?.key) {
            continue;
        }
        const { key, ...indexOptions } = indexSpec;
        scheduleIndexTask(collection, key, indexOptions, options);
    }
}
