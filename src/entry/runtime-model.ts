import { Model, ModelInstance } from '../capabilities/model';
import { ErrorCodes, createError } from '../core/errors';
import type { MonSQLizeOptions } from '../../types/monsqlize';
import type { ModelInstanceCacheEntry } from '../types/internal/model';
import type { ModelCollectionLike, ModelRuntimeLike } from '../capabilities/model/populate-promise';
import { resolveDatabaseName } from './runtime-db-facade';

export type RuntimeModelHost = {
    options: MonSQLizeOptions;
    _modelInstances: Map<string, ModelInstanceCacheEntry>;
    runtime: ModelRuntimeLike;
    scopedCollection<TDocument = Record<string, unknown>>(
        name: string,
        options?: { database?: string; pool?: string },
    ): ModelCollectionLike<TDocument>;
};

export function createRuntimeModelHost(config: {
    options: MonSQLizeOptions;
    modelInstances: Map<string, ModelInstanceCacheEntry>;
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
    const cached = host._modelInstances.get(cacheKey);
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
