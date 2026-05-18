/**
 * 作用域集合解析工具（runtime-scoped-collection）。
 *
 * 根据 Model 的连接配置（pool / database）确定最终使用的 MongoClient 与集合实例，
 * 支持以下三种路径：
 *   1. 指定 pool 且存在 CollectionFromClient adapter → 通过 adapter 路由
 *   2. 指定 pool 且存在 poolManager → 通过 poolManager.selectPool 路由
 *   3. 无 pool 配置 → 通过默认 MongoClient 路由
 *
 * 兼容 v1 poolManager API (`_getPool`) 和 v2 API (`getPool`)。
 */

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

/**
 * `resolveScopedCollection` 所需的全量配置参数。
 *
 * 包含从 runtime-core 传入的 collectionName / connection scope / 内部状态引用等，
 * 以减少 scoped-collection 对 runtime-core 私有字段的直接依赖。
 */
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

/**
 * 解析并返回指定连接配置下的 MongoDB 集合实例。
 *
 * 根据 `config.connection.pool` 是否存在走不同分支：
 * - 有 pool → 优先通过 adapter 或 poolManager 获取池中的 Collection
 * - 无 pool → 通过默认连接的 `db(databaseName).collection(collectionName)` 获取
 *
 * @throws `NO_POOL_MANAGER` — Model 指定了 pool 但未配置 pools 选项
 * @throws `POOL_NOT_FOUND` — 指定的 pool 名称不在池管理器中
 * @throws `NOT_CONNECTED` — 无 pool 且未连接时
 */
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
