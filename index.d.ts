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
import type {
    Lock as LockContract,
    LockOptions,
    LockStats,
} from './types/lock';
import type {
    ConnectionPoolManagerOptions,
    FallbackStrategy,
    PoolConfig,
    PoolHealthStatus,
    PoolRole,
    PoolStats,
    PoolStrategy,
} from './types/pool';
import type {
    SagaDefinition,
    SagaOrchestratorOptions,
    SagaResult,
    SagaStats,
    SagaStep,
} from './types/saga';
import type {
    SlowQueryLogConfig,
    SlowQueryLogConfigInput,
    SlowQueryLogEntry,
    SlowQueryLogFilter,
    SlowQueryLogQueryOptions,
    SlowQueryLogRecord,
    SlowQueryLogStorageConfig,
} from './types/slow-query-log';
import type {
    ResumeTokenConfig,
    SyncChangeEvent,
    SyncConfig,
    SyncStats,
    SyncTargetConfig,
} from './types/sync';
import type {
    MongoSession,
    Transaction as TransactionContract,
    TransactionOptions,
    TransactionStats,
} from './types/transaction';
import type {
    HookContext,
    ModelConnection,
    ModelDefinition,
    ModelDocument,
    ModelInstance as ModelAccessor,
    PopulateConfig,
    PopulateProxy,
    RegisteredModel,
    RelationConfig,
    ValidationResult,
    VirtualConfig,
} from './types/model';
import type { MonSQLize as MonSQLizeInstance, MonSQLizeOptions } from './types/monsqlize';
import {
    CacheLike,
    CacheLockLike,
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
    BatchQueue,
    ChangeStreamSyncManager,
    generateQueryHash,
    Lock,
    LockAcquireError,
    LockManager,
    LockTimeoutError,
    ResumeTokenStore,
    SagaOrchestrator,
    SlowQueryLogConfigManager,
    SlowQueryLogManager,
    Transaction,
    RedisCacheAdapterOptions,
    validateSyncConfig,
    withCache,
} from './types/runtime';

export type {
    DbType,
    ExpressionObject,
    ExpressionFunction,
    LoggerLike,
    MonSQLizeError,
    ConnectionPoolManagerOptions,
    FallbackStrategy,
    LockContract,
    LockOptions,
    LockStats,
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
    HookContext,
    MonSQLizeOptions,
    CacheLike,
    CacheLockLike,
    ModelConnection,
    ModelDefinition,
    ModelDocument,
    ModelAccessor,
    MongoSession,
    PoolConfig,
    PoolHealthStatus,
    PoolRole,
    PoolStats,
    PoolStrategy,
    PopulateConfig,
    PopulateProxy,
    ResumeTokenConfig,
    RedisCacheAdapterOptions,
    RegisteredModel,
    RelationConfig,
    SagaDefinition,
    SagaOrchestratorOptions,
    SagaResult,
    SagaStats,
    SagaStep,
    SlowQueryLogConfig,
    SlowQueryLogConfigInput,
    SlowQueryLogEntry,
    SlowQueryLogFilter,
    SlowQueryLogQueryOptions,
    SlowQueryLogRecord,
    SlowQueryLogStorageConfig,
    SyncChangeEvent,
    SyncConfig,
    SyncStats,
    SyncTargetConfig,
    ValidationResult,
    VirtualConfig,
    TransactionContract,
    TransactionOptions,
    TransactionStats,
    WithCacheOptions,
    CacheStats,
    CachedFunction,
};

export { ErrorCodes };

export {
    Logger,
    MemoryCache,
    Transaction,
    TransactionManager,
    CacheLockManager,
    Lock,
    LockManager,
    LockAcquireError,
    LockTimeoutError,
    DistributedCacheInvalidator,
    ConnectionPoolManager,
    Model,
    expr,
    createExpression,
    createRedisCacheAdapter,
    withCache,
    FunctionCache,
    ChangeStreamSyncManager,
    ResumeTokenStore,
    validateSyncConfig,
    SlowQueryLogManager,
    SlowQueryLogConfigManager,
    BatchQueue,
    generateQueryHash,
    SagaOrchestrator,
};

export default class MonSQLize implements MonSQLizeInstance {
    constructor(options?: MonSQLizeOptions);
    connect(): Promise<{
        collection: <TSchema = unknown>(name: string) => Collection<TSchema>;
        db: (name?: string) => DbAccessor;
        use: (name: string) => {
            collection: <TSchema = unknown>(collectionName: string) => Collection<TSchema>;
            model: <TDocument = Record<string, unknown>>(modelName: string) => ModelAccessor<TDocument>;
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
        model: <TDocument = Record<string, unknown>>(modelName: string) => ModelAccessor<TDocument>;
    };
    pool(poolName: string): {
        collection: <TSchema = unknown>(name: string) => Collection<TSchema>;
        model: <TDocument = Record<string, unknown>>(name: string) => ModelAccessor<TDocument>;
        use: (dbName: string) => {
            collection: <TSchema = unknown>(name: string) => Collection<TSchema>;
            model: <TDocument = Record<string, unknown>>(name: string) => ModelAccessor<TDocument>;
        };
    };
    scopedCollection<TSchema = unknown>(name: string, options?: { database?: string; }): Collection<TSchema>;
    scopedModel<TDocument = Record<string, unknown>>(name: string, options?: { database?: string; pool?: string; }): ModelAccessor<TDocument>;
    model<TDocument = Record<string, unknown>>(name: string): ModelAccessor<TDocument>;
    startSession(options?: TransactionOptions): Promise<TransactionContract>;
    withTransaction<T>(callback: (transaction: TransactionContract) => Promise<T>, options?: TransactionOptions): Promise<T>;
    withLock<T>(key: string, callback: () => Promise<T>, options?: LockOptions): Promise<T>;
    acquireLock(key: string, options?: LockOptions): Promise<LockContract>;
    tryAcquireLock(key: string, options?: Omit<LockOptions, 'retryTimes'>): Promise<LockContract | null>;
    getSyncManager(): ChangeStreamSyncManager | null;
    getSlowQueryLogManager(): SlowQueryLogManager | null;
    getSagaOrchestrator(): SagaOrchestrator;
    saga(): SagaOrchestrator;
    defineSaga(definition: SagaDefinition): void;
    executeSaga(name: string, data: unknown): Promise<SagaResult>;
    listSagas(): string[];
    getSagaStats(): SagaStats;
    startSync(): Promise<void>;
    stopSync(): Promise<void>;
    getSyncStats(): SyncStats | null;
    recordSlowQuery(log: SlowQueryLogEntry): Promise<void>;
    getSlowQueryLogs(filter?: SlowQueryLogFilter, options?: SlowQueryLogQueryOptions): Promise<SlowQueryLogRecord[]>;
    on(event: string, handler: (payload: unknown) => void): void;
    once(event: string, handler: (payload: unknown) => void): void;
    off(event: string, handler: (payload: unknown) => void): void;
    emit(event: string, payload: unknown): void;

    static Logger: typeof Logger;
    static MemoryCache: typeof MemoryCache;
    static Transaction: typeof Transaction;
    static TransactionManager: typeof TransactionManager;
    static CacheLockManager: typeof CacheLockManager;
    static Lock: typeof Lock;
    static LockManager: typeof LockManager;
    static LockAcquireError: typeof LockAcquireError;
    static LockTimeoutError: typeof LockTimeoutError;
    static DistributedCacheInvalidator: typeof DistributedCacheInvalidator;
    static ConnectionPoolManager: typeof ConnectionPoolManager;
    static Model: typeof Model;
    static expr: typeof expr;
    static createExpression: typeof createExpression;
    static createRedisCacheAdapter: typeof createRedisCacheAdapter;
    static withCache: typeof withCache;
    static FunctionCache: typeof FunctionCache;
    static ChangeStreamSyncManager: typeof ChangeStreamSyncManager;
    static ResumeTokenStore: typeof ResumeTokenStore;
    static validateSyncConfig: typeof validateSyncConfig;
    static SlowQueryLogManager: typeof SlowQueryLogManager;
    static SlowQueryLogConfigManager: typeof SlowQueryLogConfigManager;
    static BatchQueue: typeof BatchQueue;
    static generateQueryHash: typeof generateQueryHash;
    static SagaOrchestrator: typeof SagaOrchestrator;
}

export { MonSQLize };

