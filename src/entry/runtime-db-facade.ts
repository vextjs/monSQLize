/**
 * runtime 数据库外观（DbFacade）工厂函数。
 *
 * 封装 MongoDbAccessor 的实例化逻辑，并提供数据库名解析与 ConnectResult 构建工具，
 * 避免在 runtime-core 中直接处理构造参数组装的细节。
 */

import type { MongoClient } from 'mongodb';
import type { Logger } from '../core/logger';
import type { MemoryCache } from '../capabilities/cache';
import {
    MongoDbAccessor as DbFacadeImpl,
    MongoCollectionAccessor as CollectionFacade,
} from '../adapters/mongodb/common/accessors';
import type { RuntimeDefaults } from '../types/internal/query';
import type { ConnectResult, ScopedUseResult } from '../types/internal/runtime';
import type { MonSQLizeOptions } from '../../types/monsqlize';
import type { MongoDbAccessor as DbFacade } from '../adapters/mongodb/common/accessors';

/**
 * `createRuntimeDbFacade` 所需的宿主契约。
 * 宿主须提供 `_client` / `_logger` / `_runtimeDefaults` 及缓存解析方法。
 */
export type RuntimeDbFacadeHost = {
    options: MonSQLizeOptions;
    _client: MongoClient;
    _logger: Logger;
    _runtimeDefaults: RuntimeDefaults;
    resolveAdapterCache(): MemoryCache | null;
};

type RuntimeAccessorConfig<TRuntime> = {
    defaultDb: DbFacade;
    runtime: TRuntime;
    db: (name?: string) => DbFacade;
    use: (name: string) => ScopedUseResult;
    getIidCache: () => Map<string, string> | null;
    setIidCache: (value: Map<string, string>) => void;
};

/**
 * 创建指定数据库的 `MongoDbAccessor`（DbFacade）实例，
 * 将缓存、查询缓存、日志器与默认查询参数一并注入。
 */
export function createRuntimeDbFacade(host: RuntimeDbFacadeHost, databaseName: string): DbFacade {
    return new DbFacadeImpl(
        databaseName,
        host._client.db(databaseName),
        {
            cache: host.resolveAdapterCache(),
            queryCache: host.resolveAdapterCache(),
            getCache: () => host.resolveAdapterCache(),
            getQueryCache: () => host.resolveAdapterCache(),
            logger: host._logger,
            defaults: host._runtimeDefaults,
            cacheAutoInvalidate: !!(host.options.cache as Record<string, unknown> | undefined)?.autoInvalidate,
        },
    ) as DbFacade;
}

/**
 * 解析 runtime 使用的默认数据库名称。
 * 按优先级：`options.database`（v1 兼容字段）> `options.databaseName` > `'default'`。
 */
export function resolveDatabaseName(options: MonSQLizeOptions): string {
    return (options as Record<string, unknown>)['database'] as string | undefined
        ?? options.databaseName
        ?? 'default';
}

/**
 * 构建 `connect()` 返回的访问器对象（`ConnectResult<TRuntime>`）。
 *
 * 包含 `collection` / `db` / `use` / `instance` 四个字段，
 * 其中 `collection` 会在访问前进行名称合法性校验并初始化 IID 缓存。
 */
export function createRuntimeAccessors<TRuntime>(config: RuntimeAccessorConfig<TRuntime>): ConnectResult<TRuntime> {
    return {
        collection: (name: string) => {
            if (!name || typeof name !== 'string' || !name.trim()) {
                const error = new Error('Collection name must be a non-empty string') as Error & { code: string };
                error.code = 'INVALID_COLLECTION_NAME';
                throw error;
            }
            if (!config.getIidCache()) {
                config.setIidCache(new Map<string, string>());
            }
            return config.defaultDb.collection(name) as CollectionFacade;
        },
        db: (name?: string) => config.db(name),
        use: (name: string) => config.use(name),
        instance: config.runtime,
    };
}
