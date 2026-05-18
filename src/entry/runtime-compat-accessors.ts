/**
 * runtime 兼容层访问器工具集。
 *
 * 本文件封装了在 runtime-core 中通过 `unknown` cast 访问内部字段时所用的
 * 通用 accessor 函数，避免在核心文件中散落大量 `as Record<string, unknown>` 类型断言。
 *
 * 说明：
 * - 所有函数均为纯工具函数，无副作用
 * - 仅供 entry 层内部使用，不对外暴露
 */

import {
    MongoCollectionAccessor as CollectionFacade,
} from '../adapters/mongodb/common/accessors';
import { MemoryCache } from '../capabilities/cache';
import { ErrorCodes, createError } from '../core/errors';
import {
    ModelInstance,
    type ModelDefinition,
} from '../capabilities/model';
import type { ModelCollectionLike, ModelRuntimeLike } from '../capabilities/model/populate-promise';

/**
 * 运行时 db 实例的最小鸭子类型约束。
 * 用于在连接状态下对 dbInstance 字段进行类型安全断言。
 */
export type RuntimeDbInstanceLike = {
    collection: (name: string) => unknown;
    db: (name?: string) => unknown;
};

/**
 * 连接池作用域访问器形状。
 * 由 `createPoolScope` 创建，通过 `pool(name)` 方法对外暴露。
 */
export type RuntimePoolScope = {
    collection: (name: string) => CollectionFacade;
    model: <TDocument = Record<string, unknown>>(name: string) => ModelInstance<TDocument>;
    use: (dbName: string) => {
        collection: (name: string) => CollectionFacade;
        model: <TDocument = Record<string, unknown>>(name: string) => ModelInstance<TDocument>;
    };
};

/**
 * 创建 Pool 作用域所需的宿主契约。
 * 由 runtime-core 实现，向下传递给 `createPoolScope`。
 */
export type RuntimePoolScopeHost = {
    scopedCollection: (name: string, options?: { database?: string; pool?: string }) => CollectionFacade;
    scopedModel: <TDocument = Record<string, unknown>>(
        name: string,
        options?: { database?: string; pool?: string },
    ) => ModelInstance<TDocument>;
};

/**
 * runtime 内部状态的宽松类型视图，用于 v1 兼容层的字段访问。
 * 只读取少量必要字段，不依赖具体实现类。
 */
export type RuntimeCompatRecord = Record<string, unknown> & {
    dbInstance?: RuntimeDbInstanceLike | null;
    _poolManager?: Record<string, unknown> | null;
    _modelInstances?: MemoryCache | null;
    databaseName?: string;
};

/**
 * 将 `unknown` 值安全 cast 为 `RuntimeCompatRecord` 视图。
 * 仅在 entry 层内部的 v1 兼容路径中使用，不做运行时校验。
 */
export function asRuntimeCompatRecord(value: unknown): RuntimeCompatRecord {
    return value as unknown as RuntimeCompatRecord;
}

/**
 * 断言 runtime 已完成连接并返回 dbInstance。
 * 若未连接则抛出 `NOT_CONNECTED` 错误。
 */
export function requireCompatDbInstance(value: unknown): RuntimeDbInstanceLike {
    const dbInstance = asRuntimeCompatRecord(value).dbInstance;
    if (!dbInstance) {
        throw createError(ErrorCodes.NOT_CONNECTED, 'Database is not connected. Call connect() first.');
    }
    return dbInstance;
}

/**
 * 断言连接池管理器已初始化并返回其原始记录对象。
 * 若未配置池管理器则抛出 `NO_POOL_MANAGER` 错误。
 */
export function requireCompatPoolManagerRecord(value: unknown): Record<string, unknown> {
    const poolManager = asRuntimeCompatRecord(value)._poolManager;
    if (!poolManager) {
        throw createError(ErrorCodes.NO_POOL_MANAGER, 'No pool manager configured. Add pools to MonSQLize constructor options.');
    }
    return poolManager;
}

/**
 * 断言指定连接池在池管理器中存在。
 * 兼容 v1 (`_getPool`) 和 v2 (`getPool`) 两种获取接口。
 * 若池不存在则抛出 `POOL_NOT_FOUND` 错误，并附带当前可用池名列表。
 */
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

/**
 * 在指定连接池上创建作用域访问器对象。
 * 返回的对象可以通过 `collection` / `model` / `use` 在该池中进行集合与模型操作。
 */
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

/**
 * 读取已注册 Model 的元数据（集合名、连接配置）。
 * 优先使用 `definition.collection`，再回退到 `definition.name`，最后使用 `collectionName`。
 */
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

/**
 * 读取 runtime 当前默认数据库名称，未设置时回退为 `'default'`。
 */
export function getRuntimeDatabaseName(value: unknown): string {
    return asRuntimeCompatRecord(value).databaseName ?? 'default';
}

/**
 * 获取 runtime 内部的 Model 实例缓存 Map。
 * 若缓存尚未初始化则自动创建空 Map 并写回。
 */
export function getCompatModelInstanceCache(
    value: unknown,
): MemoryCache {
    const record = asRuntimeCompatRecord(value);
    if (!record._modelInstances) {
        record._modelInstances = new MemoryCache({
            maxEntries: 100_000,
            enableStats: false,
        });
    }
    return record._modelInstances;
}

/**
 * 创建具有完整上下文的 ModelInstance 实例。
 * 此函数将 collection / runtime / 元数据组合为标准 ModelInstance 对象。
 */
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
