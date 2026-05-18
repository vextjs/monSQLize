import type { MongoClient } from 'mongodb';
import {
    MongoCollectionAccessor as CollectionFacade,
    type MongoDbAccessor as DbFacade,
} from '../adapters/mongodb/common/accessors';
import type { MemoryCache } from '../capabilities/cache';
import type { Logger } from '../core/logger';
import type { ConnectionPoolManager } from '../capabilities/pool';
import { ErrorCodes, createError } from '../core/errors';
import type { RuntimeDefaults } from '../types/internal/query';
import type { MonSQLizeOptions } from '../../types/monsqlize';

type ResolveScopedCollectionConfig = {
    collectionName: string;
    connection: { pool?: string; database?: string };
    options: MonSQLizeOptions;
    self: Record<string, unknown>;
    client: MongoClient | null;
    poolManager: ConnectionPoolManager | null;
    cache: MemoryCache;
    logger: Logger;
    runtimeDefaults: RuntimeDefaults;
    db: (name?: string) => DbFacade;
};

export function resolveScopedCollection(config: ResolveScopedCollectionConfig): unknown {
    const poolName = config.connection.pool;
    const defaultDbName = (config.self['databaseName'] as string | undefined)
        ?? ((config.options as Record<string, unknown>)['database'] as string | undefined)
        ?? config.options.databaseName
        ?? 'default';
    const databaseName = config.connection.database || defaultDbName;

    if (poolName) {
        const poolManagerRecord = config.self['_poolManager'] as Record<string, unknown> | null;
        if (!poolManagerRecord) {
            throw createError(ErrorCodes.NO_POOL_MANAGER, `Model '${config.collectionName}' requires pool '${poolName}' but no pools are configured. Add 'pools' to MonSQLize constructor options.`);
        }
        let client: unknown = null;
        const getPoolV1 = poolManagerRecord['_getPool'] as ((name: string) => unknown) | undefined;
        const getPoolV2 = poolManagerRecord['getPool'] as ((name: string) => unknown) | undefined;
        if (typeof getPoolV1 === 'function') {
            client = getPoolV1.call(poolManagerRecord, poolName);
        } else if (typeof getPoolV2 === 'function') {
            try {
                client = getPoolV2.call(poolManagerRecord, poolName);
            } catch {
                client = null;
            }
        }
        if (!client) {
            const getNames = poolManagerRecord['getPoolNames'] as (() => string[]) | undefined;
            const available = typeof getNames === 'function' ? getNames.call(poolManagerRecord) : [];
            const error = createError(ErrorCodes.POOL_NOT_FOUND, `Pool '${poolName}' not found. Available pools: [${available.join(', ')}]`);
            (error as unknown as Record<string, unknown>)['available'] = available;
            throw error;
        }
        const adapter = config.self['_adapter'] as Record<string, unknown> | undefined;
        if (adapter && typeof adapter['collectionFromClient'] === 'function') {
            return (adapter['collectionFromClient'] as (currentClient: unknown, dbName: string, collectionName: string) => unknown)(
                client,
                databaseName,
                config.collectionName,
            );
        }
        if (config.poolManager) {
            const selected = config.poolManager.selectPool('read', { pool: poolName, databaseName });
            return new CollectionFacade(
                databaseName,
                config.collectionName,
                selected.collection(databaseName, config.collectionName),
                { cache: config.cache, logger: config.logger, defaults: config.runtimeDefaults },
            );
        }
        return null;
    }

    if (config.client) {
        return config.db(databaseName).collection(config.collectionName);
    }
    const dbInstance = config.self['dbInstance'] as { db: (name: string) => { collection: (name: string) => unknown } } | null;
    if (!dbInstance) {
        throw createError(ErrorCodes.NOT_CONNECTED, 'Database is not connected. Call connect() first.');
    }
    return dbInstance.db(databaseName).collection(config.collectionName);
}
