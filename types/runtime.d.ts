import type { DeleteResult, IndexCreateResult, UpdateResult } from './collection';
import type { LoggerLike, ExpressionFunction } from './base';
import type { ModelDefinition, ModelInstance as ModelInstanceContract, RegisteredModel } from './model';
import type { LockOptions, LockStats } from './lock';
import type { ConnectionPoolManagerOptions, FallbackStrategy, PoolConfig, PoolHealthStatus, PoolRole, PoolStats, PoolStrategy } from './pool';
import type { SagaDefinition, SagaOrchestratorOptions, SagaResult, SagaStats, SagaStep } from './saga';
import type { SlowQueryLogConfig, SlowQueryLogConfigInput, SlowQueryLogEntry, SlowQueryLogFilter, SlowQueryLogQueryOptions, SlowQueryLogRecord, SlowQueryLogStorageConfig } from './slow-query-log';
import type { ResumeTokenConfig, SyncChangeEvent, SyncConfig, SyncStats, SyncTargetConfig, SyncTargetHealthCheckConfig } from './sync';
import type { MongoSession, TransactionOptions, TransactionStats } from './transaction';

export { Lock, LockAcquireError, LockTimeoutError, LockManager } from './lock';
export { ConnectionPoolManager } from './pool';
export { SagaOrchestrator } from './saga';
export { BatchQueue, SlowQueryLogConfigManager, SlowQueryLogManager, SlowQueryLogMemoryStorage, MongoDBSlowQueryLogStorage } from './slow-query-log';
export { ChangeStreamSyncManager, ResumeTokenStore } from './sync';
export { CacheLockManager, Transaction, TransactionManager } from './transaction';

export declare class Logger {
    constructor(logger?: LoggerLike | null);
    debug(...args: unknown[]): void;
    info(...args: unknown[]): void;
    warn(...args: unknown[]): void;
    error(...args: unknown[]): void;
    static create(logger?: LoggerLike | null): Logger;
}

export interface CacheLockLike {
    isLocked(key: string): boolean;
}

export interface CacheLike {
    get(key: string): unknown | Promise<unknown>;
    set(key: string, value: unknown, ttl?: number): unknown | Promise<unknown>;
    del?(key: string): unknown | Promise<unknown>;
    delete?(key: string): unknown | Promise<unknown>;
    exists?(key: string): boolean | Promise<boolean>;
    getMany?(keys: string[]): Record<string, unknown> | Promise<Record<string, unknown>>;
    setMany?(values: Record<string, unknown>, ttl?: number): unknown | Promise<unknown>;
    delMany?(keys: string[]): number | Promise<number>;
    delPattern?(pattern: string): number | Promise<number>;
    clear?(): unknown | Promise<unknown>;
    keys?(pattern?: string): string[] | Promise<string[]>;
    close?(): unknown | Promise<unknown>;
}

export interface MemoryCacheOptions {
    maxSize?: number;
    maxMemory?: number;
    enableStats?: boolean;
    /** 是否启用精准缓存失效（默认 false）@since v1.1.5 */
    autoInvalidate?: boolean;
    [k: string]: unknown;
}

/**
 * 多层缓存写策略
 * - `both`：本地 + 远端双写（等待远端完成）
 * - `local-first-async-remote`：本地先返回，远端异步写（降低尾延迟）
 * @since v1.1.0
 */
export type WritePolicy = 'both' | 'local-first-async-remote';

/**
 * 多层缓存策略配置
 * @since v1.1.0
 */
export interface MultiLevelCachePolicy {
    /** 写策略，默认 `both` */
    writePolicy?: WritePolicy;
    /** 远端命中后是否回填本地，默认 true */
    backfillLocalOnRemoteHit?: boolean;
}

/**
 * 多层缓存配置对象（配置式启用双层缓存）。
 *
 * 传给 `MonSQLizeOptions.cache` 时，框架会自动创建 MultiLevelCache：
 * - `local`：始终使用内置内存缓存（仅接受 MemoryCacheOptions）
 * - `remote`：可传 CacheLike 实例（推荐生产），或配置对象以退化为内存占位
 * - `policy`：写策略与回填策略配置
 * @since v1.1.0
 */
export interface MultiLevelCacheOptions {
    multiLevel: true;
    local?: MemoryCacheOptions;
    remote?: CacheLike | (MemoryCacheOptions & { timeoutMs?: number });
    policy?: MultiLevelCachePolicy;
    publish?: (msg: unknown) => void;
}

export declare class MemoryCache {
    constructor(options?: MemoryCacheOptions);
    setLockManager(lockManager: CacheLockLike | null): void;
    getLockManager(): CacheLockLike | null;
    get(key: string): unknown;
    set(key: string, value: unknown, ttl?: number): boolean;
    delete(key: string): boolean;
    del(key: string): boolean;
    exists(key: string): boolean;
    getMany(keys: string[]): Record<string, unknown>;
    setMany(values: Record<string, unknown>, ttl?: number): boolean;
    delMany(keys: string[]): number;
    clear(): void;
    keys(pattern?: string): string[];
    delPattern(pattern?: string): number;
    getStats(): CacheStats;
    resetStats(): void;
    static getOrCreateCache(cache?: Record<string, unknown> | MemoryCache): MemoryCache;
}

export interface RedisCacheAdapterOptions {
    client?: RedisLike;
    prefix?: string;
}

export interface RedisLike {
    get(key: string): Promise<string | null> | string | null;
    pttl?(key: string): Promise<number> | number;
    set(key: string, value: string): Promise<unknown> | unknown;
    psetex?(key: string, ttl: number, value: string): Promise<unknown> | unknown;
    del(...keys: string[]): Promise<number> | number;
    exists(key: string): Promise<number | boolean> | number | boolean;
    mget?(...keys: string[]): Promise<Array<string | null>> | Array<string | null>;
    scan?(cursor: string, ...args: Array<string | number>): Promise<[string, string[]]> | [string, string[]];
    flushdb?(): Promise<unknown> | unknown;
    quit?(): Promise<unknown> | unknown;
    on?(event: string, handler: (...args: unknown[]) => void): void;
    publish?(channel: string, message: string): Promise<unknown> | unknown;
    subscribe?(channel: string, handler?: (error?: Error | null) => void): Promise<unknown> | unknown;
    unsubscribe?(channel: string): Promise<unknown> | unknown;
    pipeline?(): {
        set(key: string, value: string, ...args: Array<string | number>): unknown;
        del(...keys: string[]): unknown;
        exec(): Promise<Array<unknown>> | Array<unknown>;
    };
}

export declare function createRedisCacheAdapter(
    redisUrlOrInstance: string | RedisLike | RedisCacheAdapterOptions,
    adapterOptions?: Record<string, unknown>,
): CacheLike & { getRedisInstance(): RedisLike; };

export type { LockOptions, LockStats, MongoSession, TransactionOptions, TransactionStats };

export interface DistributedCacheInvalidatorOptions {
    cache?: CacheLike | { local?: CacheLike; remote?: CacheLike; };
    channel?: string;
    instanceId?: string;
    logger?: LoggerLike | null;
    redis?: RedisLike;
    redisUrl?: string;
    pub?: RedisLike;
    sub?: RedisLike;
}

export declare class DistributedCacheInvalidator {
    constructor(options?: DistributedCacheInvalidatorOptions);
    invalidate(pattern: string): Promise<void>;
    handleMessage(channel: string, message: string): Promise<void>;
    getStats(): Record<string, unknown>;
    close(): Promise<void>;
}

export type {
    ConnectionPoolManagerOptions,
    FallbackStrategy,
    PoolConfig,
    PoolHealthStatus,
    PoolRole,
    PoolStats,
    PoolStrategy,
    ResumeTokenConfig,
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
    SyncTargetHealthCheckConfig,
};

export declare function validateSyncConfig(config: SyncConfig): void;
export declare function generateQueryHash(input: unknown): string;

export interface WithCacheOptions {
    ttl?: number;
    namespace?: string;
    cache?: CacheLike;
    keyBuilder?: (...args: unknown[]) => string;
    condition?: (result: unknown) => boolean;
    enableStats?: boolean;
}

export interface CacheStats {
    hits: number;
    misses: number;
    calls: number;
    hitRate: number;
    sets?: number;
    deletes?: number;
    evictions?: number;
    size?: number;
    memoryUsage?: number;
    memoryUsageMB?: number;
}

export type CachedFunction<TArgs extends unknown[] = unknown[], TResult = unknown> = ((...args: TArgs) => Promise<TResult>) & {
    invalidate: (...args: TArgs) => Promise<boolean>;
    getCacheStats: () => CacheStats & { errors: number; avgTime: number; };
};

export interface FunctionCacheOptions {
    namespace?: string;
    defaultTTL?: number;
    enableStats?: boolean;
}

export declare function withCache<TArgs extends unknown[], TResult>(
    fn: (...args: TArgs) => Promise<TResult>,
    options?: WithCacheOptions,
): CachedFunction<TArgs, TResult>;

export declare class FunctionCache {
    constructor(cacheOrDb: unknown, options?: FunctionCacheOptions);
    register(name: string, fn: (...args: unknown[]) => Promise<unknown>, options?: WithCacheOptions): void;
    execute(name: string, ...args: unknown[]): Promise<unknown>;
    invalidate(name: string, ...args: unknown[]): Promise<boolean>;
    invalidatePattern(pattern: string): Promise<number>;
    getStats(name?: string): Record<string, unknown>;
    list(): string[];
    resetStats(name?: string): void;
    clear(): void;
}

export declare class Model {
    static define<TDocument = Record<string, unknown>>(name: string, definition: ModelDefinition<TDocument>): void;
    static get<TDocument = Record<string, unknown>>(name: string): RegisteredModel<TDocument> | undefined;
    static has(name: string): boolean;
    static list(): string[];
    static undefine(name: string): boolean;
    static redefine<TDocument = Record<string, unknown>>(name: string, definition: ModelDefinition<TDocument>): void;
    static _clear(): void;
}

export declare class ModelInstance<TDocument = Record<string, unknown>> implements ModelInstanceContract<TDocument> {
    private constructor(...args: unknown[]);
    readonly collectionName: string;
    readonly dbName: string;
    readonly poolName?: string;
    readonly definition: ModelDefinition<TDocument>;
    getNamespace(): { iid: string; type: 'mongodb'; db: string; collection: string; };
    raw(): unknown;
    find(query?: unknown, options?: unknown): import('./model').PopulateProxy<Array<import('./model').ModelDocument<TDocument>>>;
    findOne(query?: unknown, options?: unknown): import('./model').PopulateProxy<import('./model').ModelDocument<TDocument> | null>;
    findOneById(id: unknown, options?: unknown): import('./model').PopulateProxy<import('./model').ModelDocument<TDocument> | null>;
    findById(id: unknown, options?: unknown): import('./model').PopulateProxy<import('./model').ModelDocument<TDocument> | null>;
    findByIds(ids: unknown[], options?: unknown): import('./model').PopulateProxy<Array<import('./model').ModelDocument<TDocument>>>;
    findPage(options?: unknown): import('./model').PopulateProxy<{
        items: Array<import('./model').ModelDocument<TDocument>>;
        pageInfo: {
            hasNext: boolean;
            hasPrev: boolean;
            startCursor: string | null;
            endCursor: string | null;
            currentPage?: number;
        };
        totals?: Record<string, unknown>;
        meta?: import('./collection').MetaInfo;
    }>;
    findAndCount(query?: unknown, options?: unknown): import('./model').PopulateProxy<{ data: Array<import('./model').ModelDocument<TDocument>>; total: number; }>;
    count(query?: unknown, options?: unknown): Promise<number>;
    insertOne(document?: unknown, options?: unknown): Promise<{ acknowledged: boolean; insertedId: unknown; }>;
    insertMany(documents?: unknown[], options?: unknown): Promise<unknown>;
    updateOne(filter?: unknown, update?: unknown, options?: unknown): Promise<unknown>;
    updateMany(filter?: unknown, update?: unknown, options?: unknown): Promise<unknown>;
    replaceOne(filter?: unknown, replacement?: unknown, options?: unknown): Promise<unknown>;
    findOneAndUpdate(filter?: unknown, update?: unknown, options?: unknown): Promise<TDocument | null>;
    findOneAndDelete(filter?: unknown, options?: unknown): Promise<TDocument | null>;
    upsertOne(filter?: unknown, update?: unknown, options?: unknown): Promise<UpdateResult>;
    deleteOne(filter?: unknown, options?: unknown): Promise<DeleteResult>;
    deleteMany(filter?: unknown, options?: unknown): Promise<DeleteResult>;
    createIndex(keys: unknown, options?: unknown): Promise<IndexCreateResult>;
    createIndexes(specs: Array<{ key: unknown; } & Record<string, unknown>>): Promise<string[]>;
    listIndexes(): Promise<Record<string, unknown>[]>;
    dropIndex(name: string): Promise<unknown>;
    dropIndexes(): Promise<unknown>;
    distinct(key: string, query?: unknown, options?: unknown): Promise<unknown[]>;
    aggregate(pipeline?: unknown[], options?: unknown): Promise<unknown[]>;
    watch(pipeline?: unknown[], options?: unknown): import('mongodb').ChangeStream;
    validate(document?: unknown): import('./model').ValidationResult;
    findOneAndReplace(filter?: unknown, replacement?: unknown, options?: unknown): Promise<TDocument | null>;
    incrementOne(filter?: unknown, field?: string | Record<string, number>, increment?: number, options?: unknown): Promise<import('./collection').IncrementOneResult<TDocument>>;
    findWithDeleted(query?: unknown, options?: unknown): import('./model').PopulateProxy<Array<import('./model').ModelDocument<TDocument>>>;
    findOnlyDeleted(query?: unknown, options?: unknown): import('./model').PopulateProxy<Array<import('./model').ModelDocument<TDocument>>>;
    findOneWithDeleted(query?: unknown, options?: unknown): import('./model').PopulateProxy<import('./model').ModelDocument<TDocument> | null>;
    restore(filter?: unknown, options?: unknown): Promise<unknown>;
    restoreMany(filter?: unknown, options?: unknown): Promise<unknown>;
    forceDelete(filter?: unknown, options?: unknown): Promise<DeleteResult>;
    forceDeleteMany(filter?: unknown, options?: unknown): Promise<DeleteResult>;
}

export declare const expr: ExpressionFunction;
export declare const createExpression: ExpressionFunction;
/** Compile expression objects in a MongoDB pipeline into real operators. */
export declare function compilePipelineExpressions<TPipeline>(pipeline: TPipeline): TPipeline;

