import type { DbType, ErrorCodes, ExpressionFunction, ExpressionObject, LoggerLike, MonSQLizeError } from './types/base';
import type {
    AdminAccessor,
    AdminBuildInfoView,
    BatchErrorRecord,
    BookmarkClearResult,
    BookmarkListResult,
    BookmarkPrewarmResult,
    Collection,
    DbAccessor,
    DbStatsView,
    DeleteBatchResult,
    DeleteResult,
    HealthView,
    IndexCreateResult,
    InsertBatchResult,
    InsertManyResult,
    InsertOneResult,
    ServerStatusView,
    UpdateBatchResult,
    UpdateResult,
} from './types/collection';
import type { MonSQLize as MonSQLizeInstance, MonSQLizeOptions } from './types/monsqlize';
import {
    CacheLockManager,
    ConnectionPoolManager,
    DistributedCacheInvalidator,
    FunctionCache,
    Logger,
    MemoryCache,
    Model,
    TransactionManager,
    WithCacheOptions,
    CacheStats,
    CachedFunction,
    createExpression,
    createRedisCacheAdapter,
    expr,
    withCache,
} from './types/runtime';

export type {
    DbType,
    ExpressionObject,
    ExpressionFunction,
    LoggerLike,
    MonSQLizeError,
    Collection,
    DbAccessor,
    AdminAccessor,
    BatchErrorRecord,
    InsertOneResult,
    InsertManyResult,
    InsertBatchResult,
    UpdateResult,
    UpdateBatchResult,
    DeleteResult,
    DeleteBatchResult,
    IndexCreateResult,
    BookmarkPrewarmResult,
    BookmarkListResult,
    BookmarkClearResult,
    AdminBuildInfoView,
    ServerStatusView,
    DbStatsView,
    HealthView,
    MonSQLizeOptions,
    WithCacheOptions,
    CacheStats,
    CachedFunction,
};

export { ErrorCodes };

export {
    Logger,
    MemoryCache,
    TransactionManager,
    CacheLockManager,
    DistributedCacheInvalidator,
    ConnectionPoolManager,
    Model,
    expr,
    createExpression,
    createRedisCacheAdapter,
    withCache,
    FunctionCache,
};

export default class MonSQLize implements MonSQLizeInstance {
    constructor(options?: MonSQLizeOptions);
    connect(): Promise<{
        collection: <TSchema = unknown>(name: string) => Collection<TSchema>;
        db: (name?: string) => DbAccessor;
        use: (name: string) => {
            collection: <TSchema = unknown>(collectionName: string) => Collection<TSchema>;
            model: (modelName: string) => Record<string, unknown>;
        };
        instance: MonSQLize;
    }>;
    getCache(): MemoryCache;
    getDefaults(): Record<string, unknown>;
    close(): Promise<void>;
    health(): Promise<HealthView>;
    collection<TSchema = unknown>(name: string): Collection<TSchema>;
    db(name?: string): DbAccessor;
    use(name: string): {
        collection: <TSchema = unknown>(collectionName: string) => Collection<TSchema>;
        model: (modelName: string) => Record<string, unknown>;
    };
    pool(poolName: string): {
        collection: <TSchema = unknown>(name: string) => Collection<TSchema>;
        model: (name: string) => Record<string, unknown>;
        use: (dbName: string) => {
            collection: <TSchema = unknown>(name: string) => Collection<TSchema>;
            model: (name: string) => Record<string, unknown>;
        };
    };
    scopedCollection<TSchema = unknown>(name: string, options?: { database?: string; }): Collection<TSchema>;
    scopedModel(name: string): Record<string, unknown>;
    model(name: string): Record<string, unknown>;
    startSession(): Promise<{ session: null; }>;
    withTransaction<T>(callback: (transaction: { session: null; }) => Promise<T>): Promise<T>;
    on(event: string, handler: (payload: unknown) => void): void;
    once(event: string, handler: (payload: unknown) => void): void;
    off(event: string, handler: (payload: unknown) => void): void;
    emit(event: string, payload: unknown): void;

    static Logger: typeof Logger;
    static MemoryCache: typeof MemoryCache;
    static TransactionManager: typeof TransactionManager;
    static CacheLockManager: typeof CacheLockManager;
    static DistributedCacheInvalidator: typeof DistributedCacheInvalidator;
    static ConnectionPoolManager: typeof ConnectionPoolManager;
    static Model: typeof Model;
    static expr: typeof expr;
    static createExpression: typeof createExpression;
    static createRedisCacheAdapter: typeof createRedisCacheAdapter;
    static withCache: typeof withCache;
    static FunctionCache: typeof FunctionCache;
}

export { MonSQLize };

