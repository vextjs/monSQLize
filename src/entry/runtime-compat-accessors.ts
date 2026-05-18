import {
    MongoCollectionAccessor as CollectionFacade,
} from '../adapters/mongodb/common/accessors';
import { ErrorCodes, createError } from '../core/errors';
import {
    ModelInstance,
    type ModelDefinition,
} from '../capabilities/model';
import type { ModelCollectionLike, ModelRuntimeLike } from '../capabilities/model/populate-promise';

export type RuntimeDbInstanceLike = {
    collection: (name: string) => unknown;
    db: (name?: string) => unknown;
};

export type RuntimePoolScope = {
    collection: (name: string) => CollectionFacade;
    model: <TDocument = Record<string, unknown>>(name: string) => ModelInstance<TDocument>;
    use: (dbName: string) => {
        collection: (name: string) => CollectionFacade;
        model: <TDocument = Record<string, unknown>>(name: string) => ModelInstance<TDocument>;
    };
};

export type RuntimePoolScopeHost = {
    scopedCollection: (name: string, options?: { database?: string; pool?: string }) => CollectionFacade;
    scopedModel: <TDocument = Record<string, unknown>>(
        name: string,
        options?: { database?: string; pool?: string },
    ) => ModelInstance<TDocument>;
};

export type RuntimeCompatRecord = Record<string, unknown> & {
    dbInstance?: RuntimeDbInstanceLike | null;
    _poolManager?: Record<string, unknown> | null;
    _modelInstances?: Map<string, ModelInstance<Record<string, unknown>>> | null;
    databaseName?: string;
};

export function asRuntimeCompatRecord(value: unknown): RuntimeCompatRecord {
    return value as unknown as RuntimeCompatRecord;
}

export function requireCompatDbInstance(value: unknown): RuntimeDbInstanceLike {
    const dbInstance = asRuntimeCompatRecord(value).dbInstance;
    if (!dbInstance) {
        throw createError(ErrorCodes.NOT_CONNECTED, 'Database is not connected. Call connect() first.');
    }
    return dbInstance;
}

export function requireCompatPoolManagerRecord(value: unknown): Record<string, unknown> {
    const poolManager = asRuntimeCompatRecord(value)._poolManager;
    if (!poolManager) {
        throw createError(ErrorCodes.NO_POOL_MANAGER, 'No pool manager configured. Add pools to MonSQLize constructor options.');
    }
    return poolManager;
}

export function assertCompatPoolExists(poolManager: Record<string, unknown>, poolName: string): void {
    const getPoolV1 = poolManager['_getPool'] as ((name: string) => unknown) | undefined;
    const getPoolV2 = poolManager['getPool'] as ((name: string) => unknown) | undefined;
    let client: unknown = null;
    if (typeof getPoolV1 === 'function') {
        client = getPoolV1.call(poolManager, poolName);
    } else if (typeof getPoolV2 === 'function') {
        try {
            client = getPoolV2.call(poolManager, poolName);
        } catch {
            client = null;
        }
    }
    if (client) {
        return;
    }
    const getNames = poolManager['getPoolNames'] as (() => string[]) | undefined;
    const available = typeof getNames === 'function' ? getNames.call(poolManager) : [];
    const error = createError(ErrorCodes.POOL_NOT_FOUND, `Pool '${poolName}' not found. Available pools: [${available.join(', ')}]`);
    (error as unknown as Record<string, unknown>)['available'] = available;
    throw error;
}

export function createPoolScope(runtime: RuntimePoolScopeHost, poolName: string): RuntimePoolScope {
    return {
        collection: (name: string) => runtime.scopedCollection(name, { pool: poolName }),
        model: <TDocument = Record<string, unknown>>(name: string) => runtime.scopedModel<TDocument>(name, { pool: poolName }),
        use: (dbName: string) => ({
            collection: (name: string) => runtime.scopedCollection(name, { pool: poolName, database: dbName }),
            model: <TDocument = Record<string, unknown>>(name: string) => runtime.scopedModel<TDocument>(name, { pool: poolName, database: dbName }),
        }),
    };
}

export function getRegisteredModelMetadata<TDocument>(registered: {
    collectionName: string;
    definition: ModelDefinition<TDocument>;
}): {
    actualCollectionName: string;
    connection?: { pool?: string; database?: string };
} {
    const definition = registered.definition as ModelDefinition<TDocument> & {
        collection?: string;
        name?: string;
        connection?: { pool?: string; database?: string };
    };
    return {
        actualCollectionName: definition.collection ?? definition.name ?? registered.collectionName,
        connection: definition.connection,
    };
}

export function getRuntimeDatabaseName(value: unknown): string {
    return asRuntimeCompatRecord(value).databaseName ?? 'default';
}

export function getCompatModelInstanceCache(
    value: unknown,
): Map<string, ModelInstance<Record<string, unknown>>> {
    const record = asRuntimeCompatRecord(value);
    if (!record._modelInstances) {
        record._modelInstances = new Map<string, ModelInstance<Record<string, unknown>>>();
    }
    return record._modelInstances;
}

export function createCompatModelInstance<TDocument>(config: {
    collection: unknown;
    runtime: unknown;
    collectionName: string;
    dbName: string;
    poolName?: string;
    definition: ModelDefinition<TDocument>;
}): ModelInstance<TDocument> {
    return new ModelInstance<TDocument>(
        config.collection as ModelCollectionLike<TDocument>,
        config.runtime as ModelRuntimeLike,
        {
            collectionName: config.collectionName,
            dbName: config.dbName,
            poolName: config.poolName,
            definition: config.definition,
        },
    );
}
