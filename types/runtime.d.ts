import type { DeleteResult, IndexCreateResult, UpdateResult } from './collection';
import type { LoggerLike, ExpressionFunction, ExpressionObject } from './base';
import type { ModelDefinition, ModelInstance as ModelInstanceContract, RegisteredModel, RelationConfig } from './model';
import type { LockOptions, LockStats } from './lock';
import type { ConnectionPoolManagerOptions, FallbackStrategy, PoolConfig, PoolHealthStatus, PoolRole, PoolStats, PoolStrategy } from './pool';
import type { SagaDefinition, SagaOrchestratorOptions, SagaResult, SagaStats, SagaStep } from './saga';
import type { SlowQueryLogConfig, SlowQueryLogConfigInput, SlowQueryLogEntry, SlowQueryLogFilter, SlowQueryLogQueryOptions, SlowQueryLogRecord, SlowQueryLogStorageConfig } from './slow-query-log';
import type { ResumeTokenConfig, SyncChangeEvent, SyncConfig, SyncStats, SyncTargetConfig, SyncTargetHealthCheckConfig } from './sync';
import type { MongoSession, TransactionOptions, TransactionStats } from './transaction';
import type {
    CacheLike as HubCacheLike,
    CacheStats as HubCacheStats,
    LockManager as HubCacheLockLike,
    MemoryCacheOptions as HubMemoryCacheOptions,
} from 'cache-hub';
import type { RedisCacheAdapter as HubRedisCacheAdapter } from 'cache-hub/redis';
import type {
    DistributedInvalidatorOptions as HubDistributedInvalidatorOptions,
    InvalidatorStats as HubInvalidatorStats,
} from 'cache-hub/distributed';
import type {
    FunctionCacheOptions as HubFunctionCacheOptions,
    FunctionCacheStats as HubFunctionCacheStats,
    WithCacheOptions as HubWithCacheOptions,
    WithCacheStats as HubWithCacheStats,
    WrappedFunction as HubWrappedFunction,
} from 'cache-hub/function-cache';

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

export type CacheLockLike = HubCacheLockLike;
export type CacheLike = HubCacheLike;
export type MemoryCacheOptions = HubMemoryCacheOptions;

/**
 * Multi-level cache write policy.
 * - `both`: write to both local and remote simultaneously (waits for remote to complete)
 * - `local-first-async-remote`: return after local write; remote write is asynchronous (reduces tail latency)
 * @since v1.1.0
 */
export type WritePolicy = 'both' | 'local-first-async-remote';

/**
 * Multi-level cache policy configuration.
 * @since v1.1.0
 */
export interface MultiLevelCachePolicy {
    /** Write policy; defaults to `both`. */
    writePolicy?: WritePolicy;
    /** Whether to backfill the local cache on a remote hit; defaults to true. */
    backfillLocalOnRemoteHit?: boolean;
}

/**
 * Multi-level cache configuration object (declarative two-tier cache setup).
 *
 * When passed to `MonSQLizeOptions.cache`, the framework automatically creates a MultiLevelCache:
 * - `local`: always uses the built-in memory cache (accepts MemoryCacheOptions only)
 * - `remote`: accepts a CacheLike instance (recommended for production) or a config object
 *             that degrades to an in-memory placeholder
 * - `policy`: write policy and backfill policy configuration
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
    setLockManager(lockManager: CacheLockLike): void;
    get<T = unknown>(key: string): T | undefined;
    set(key: string, value: unknown, ttl?: number): void;
    del(key: string): boolean;
    exists(key: string): boolean;
    has(key: string): boolean;
    getMany(keys: string[]): Record<string, unknown>;
    setMany(values: Record<string, unknown>, ttl?: number): boolean;
    delMany(keys: string[]): number;
    clear(): void;
    keys(pattern?: string): string[];
    delPattern(pattern: string): number;
    getStats(): CacheStats;
    resetStats(): void;
    invalidateByTag(tag: string): void;
    destroy(): void;
}

export declare class MultiLevelCache {
    constructor(options: {
        local: CacheLike;
        remote?: CacheLike;
        writePolicy?: 'both' | 'local-first-async-remote';
        backfillOnRemoteHit?: boolean;
        remoteTimeoutMs?: number;
        publish?: (msg: { type: string; pattern: string; ts: number }) => void;
    });
    get<T = unknown>(key: string): Promise<T | undefined>;
    set(key: string, value: unknown, ttl?: number): Promise<void>;
    del(key: string): Promise<boolean>;
    exists(key: string): Promise<boolean>;
    has(key: string): Promise<boolean>;
    clear(): Promise<void>;
    getMany(keys: string[]): Promise<Record<string, unknown>>;
    setMany(values: Record<string, unknown>, ttl?: number): Promise<boolean>;
    delMany(keys: string[]): Promise<number>;
    delPattern(pattern: string): Promise<number>;
    keys(pattern?: string): Promise<string[]>;
    invalidateByTag(tag: string): void | Promise<void>;
    getStats(): CacheStats;
    resetStats(): void;
    destroy(): void;
}

export type RedisCacheAdapterOptions = never;
export type RedisLike = object;

/**
 * Adapts a v1-style CacheLike object to the v2 CacheLike interface.
 *
 * v2 requires a `has()` method that was absent in v1. This helper adds it
 * by delegating to the existing `exists()`. All other methods are forwarded as-is.
 *
 * @param v1Cache - A v1 custom cache implementation missing `has()`.
 * @returns A fully v2-compatible `CacheLike` instance.
 * @example
 * ```ts
 * const v2Cache = adaptLegacyCacheLike(myV1Cache);
 * const msq = new MonSQLize({ cache: v2Cache });
 * ```
 */
export declare function adaptLegacyCacheLike(v1Cache: Omit<CacheLike, 'has'>): CacheLike;

/** Re-exported alias so consumers can type the return value of `createRedisCacheAdapter`. */
export type RedisCacheAdapter = HubRedisCacheAdapter;

export declare function createRedisCacheAdapter(
    redisUrlOrInstance: string | object,
): HubRedisCacheAdapter;

export type { LockOptions, LockStats, MongoSession, TransactionOptions, TransactionStats };

export type DistributedCacheInvalidatorOptions = HubDistributedInvalidatorOptions;

export declare class DistributedCacheInvalidator {
    constructor(options: DistributedCacheInvalidatorOptions);
    invalidate(pattern: string): Promise<void>;
    getStats(): HubInvalidatorStats;
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

export type WithCacheOptions<
    T extends (...args: any[]) => Promise<any> = (...args: unknown[]) => Promise<unknown>,
> = HubWithCacheOptions<T>;

export type CacheStats = HubCacheStats;

export interface WithCacheStats extends HubWithCacheStats {
    calls: number;
    totalTime: number;
    avgTime: number;
}

export interface FunctionCacheStats extends HubFunctionCacheStats {
    calls: number;
    totalTime: number;
    avgTime: number;
}

export type CachedFunction<TArgs extends unknown[] = unknown[], TResult = unknown> = HubWrappedFunction<(...args: TArgs) => Promise<TResult>> & {
    /** @deprecated Use `stats()`. v1 backward-compat alias. */
    getCacheStats(): WithCacheStats;
    stats(): WithCacheStats;
};

export interface FunctionCacheOptions extends HubFunctionCacheOptions {
    /** @deprecated v1 alias for `ttl`. Use `ttl` instead. */
    defaultTTL?: number;
}

export declare function withCache<TArgs extends unknown[], TResult>(
    fn: (...args: TArgs) => Promise<TResult>,
    options?: WithCacheOptions<(...args: TArgs) => Promise<TResult>>,
): CachedFunction<TArgs, TResult>;

export declare class FunctionCache {
    constructor(cacheOrDb?: CacheLike | { getCache(): CacheLike; }, options?: FunctionCacheOptions);
    register(name: string, fn: (...args: unknown[]) => Promise<unknown>, options?: {
        ttl?: number;
        keyBuilder?: (...args: unknown[]) => string;
        namespace?: string;
        condition?: (result: unknown) => boolean;
    }): void | Promise<void>;
    execute(name: string, ...args: unknown[]): Promise<unknown>;
    invalidate(name: string, ...args: unknown[]): Promise<void>;
    invalidatePattern(pattern: string): Promise<number>;
    getStats(name?: string): FunctionCacheStats | Record<string, FunctionCacheStats> | null;
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
    getRelations(): Record<string, RelationConfig>;
    getEnums(): Record<string, string[]>;
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
    findOneOnlyDeleted(query?: unknown, options?: unknown): import('./model').PopulateProxy<import('./model').ModelDocument<TDocument> | null>;
    countWithDeleted(query?: unknown, options?: unknown): Promise<number>;
    countOnlyDeleted(query?: unknown, options?: unknown): Promise<number>;
    insertBatch(docs: unknown[], options?: unknown): Promise<unknown>;
    updateBatch(filter?: unknown, update?: unknown, options?: unknown): Promise<unknown>;
}

export declare const expr: ExpressionFunction;
export declare const createExpression: ExpressionFunction;
export declare function isExpressionObject(value: unknown): value is ExpressionObject;
export declare function hasExpressionInObject(value: unknown): boolean;
export declare function hasExpressionInPipeline(pipeline: unknown): boolean;
/** Compile expression objects in a MongoDB pipeline into real operators. */
export declare function compilePipelineExpressions<TPipeline>(pipeline: TPipeline): TPipeline;

