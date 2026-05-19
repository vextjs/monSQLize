/**
 * Runtime Model instance management utilities.
 *
 * Encapsulates Model registry lookup, instance cache hit/invalidation detection,
 * and ModelInstance construction, allowing runtime-core to focus on connection
 * lifecycle without directly handling Model assembly details.
 *
 * Cache key format: `<pool>:<database>:<collectionName>`. Uses `Model.getRevision()`
 * to detect schema changes; stale instances are automatically discarded when the
 * revision changes.
 */

import { Model, ModelInstance } from '../capabilities/model';
import type { MemoryCache } from '../capabilities/cache';
import { ErrorCodes, createError } from '../core/errors';
import type { MonSQLizeOptions } from '../../types/monsqlize';
import type { ModelInstanceCacheEntry } from '../types/internal/model';
import type { ModelCollectionLike, ModelRuntimeLike } from '../capabilities/model/populate-promise';
import { resolveDatabaseName } from './runtime-db-facade';

/**
 * Input config for `createRuntimeModelHost`,
 * keeping the host and the Model factory decoupled.
 */
export type RuntimeModelHost = {
    options: MonSQLizeOptions;
    _modelInstances: MemoryCache;
    runtime: ModelRuntimeLike;
    scopedCollection<TDocument = Record<string, unknown>>(
        name: string,
        options?: { database?: string; pool?: string },
    ): ModelCollectionLike<TDocument>;
};

/**
 * Assemble loose config parameters into a standard `RuntimeModelHost` object.
 * Primarily normalises generic types and field name mapping to simplify call sites.
 */
export function createRuntimeModelHost(config: {
    options: MonSQLizeOptions;
    modelInstances: MemoryCache;
    runtime: unknown;
    scopedCollection: <TDocument = Record<string, unknown>>(
        name: string,
        options?: { database?: string; pool?: string },
    ) => unknown;
}): RuntimeModelHost {
    return {
        options: config.options,
        _modelInstances: config.modelInstances,
        runtime: config.runtime as ModelRuntimeLike,
        scopedCollection: <TDocument = Record<string, unknown>>(name: string, options?: { database?: string; pool?: string }) =>
            config.scopedCollection(name, options) as ModelCollectionLike<TDocument>,
    };
}

/**
 * Get or create a `ModelInstance` for the given name.
 *
 * Returns the cached instance directly when it exists and the revision is unchanged.
 * Discards the stale instance and rebuilds when the revision changes (Model definition updated).
 *
 * @param host - Runtime host providing options / _modelInstances / scopedCollection / runtime
 * @param name - Name of the registered Model
 * @param scope - Optional database and pool scope
 * @throws `MODEL_NOT_DEFINED` — when no Model with the given name has been registered
 */
export function createRuntimeModelInstance<TDocument = Record<string, unknown>>(
    host: RuntimeModelHost,
    name: string,
    scope: { database?: string; pool?: string },
): ModelInstance<TDocument> {
    const registered = Model.get<TDocument>(name);
    if (!registered) {
        throw createError(ErrorCodes.MODEL_NOT_DEFINED, `Model '${name}' is not defined.`);
    }

    const databaseName = registered.definition.connection?.database ?? scope.database ?? resolveDatabaseName(host.options);
    const poolName = registered.definition.connection?.pool ?? scope.pool;
    const cacheKey = `${poolName ?? 'default'}:${databaseName}:${registered.collectionName}`;
    const revision = Model.getRevision(registered.collectionName);
    const cached = host._modelInstances.get(cacheKey) as ModelInstanceCacheEntry | undefined;
    if (cached && cached.revision === revision) {
        return cached.instance as ModelInstance<TDocument>;
    }

    const instance = new ModelInstance<TDocument>(
        host.scopedCollection(registered.collectionName, { database: databaseName }),
        host.runtime,
        {
            collectionName: registered.collectionName,
            dbName: databaseName,
            poolName,
            definition: registered.definition,
        },
    );
    host._modelInstances.set(cacheKey, {
        revision,
        instance: instance as ModelInstance<Record<string, unknown>>,
    });
    return instance;
}
