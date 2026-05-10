import type { DeleteResult, IndexCreateResult, UpdateResult } from './collection';
import type { LoggerLike, ExpressionFunction } from './base';
import type { ModelDefinition, ModelInstance as ModelInstanceContract, RegisteredModel } from './model';
import type { LockOptions, LockStats } from './lock';
import type { MongoSession, TransactionOptions, TransactionStats } from './transaction';

export { Lock, LockAcquireError, LockTimeoutError, LockManager } from './lock';
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
    client?: unknown;
    prefix?: string;
}

export declare function createRedisCacheAdapter(
    redisUrlOrInstance: string | unknown | RedisCacheAdapterOptions,
    adapterOptions?: Record<string, unknown>,
): CacheLike & { getRedisInstance(): unknown; };

export type { LockOptions, LockStats, MongoSession, TransactionOptions, TransactionStats };

export declare class DistributedCacheInvalidator {
    constructor(options?: {
        cache?: CacheLike | { local?: CacheLike; remote?: CacheLike; };
        channel?: string;
        instanceId?: string;
        logger?: LoggerLike | null;
        pub?: unknown;
        sub?: unknown;
    });
    invalidate(pattern: string): Promise<void>;
    handleMessage(channel: string, message: string): Promise<void>;
    getStats(): Record<string, unknown>;
    close(): Promise<void>;
}

export declare class ConnectionPoolManager {
    constructor(options?: Record<string, unknown>);
}

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

export declare function withCache<TArgs extends unknown[], TResult>(
    fn: (...args: TArgs) => Promise<TResult>,
    options?: WithCacheOptions,
): CachedFunction<TArgs, TResult>;

export declare class FunctionCache {
    constructor(cacheOrDb: unknown, options?: {
        namespace?: string;
        defaultTTL?: number;
        enableStats?: boolean;
    });
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
    findById(id: unknown, options?: unknown): import('./model').PopulateProxy<import('./model').ModelDocument<TDocument> | null>;
    findByIds(ids: unknown[], options?: unknown): import('./model').PopulateProxy<Array<import('./model').ModelDocument<TDocument>>>;
    findPage(options?: unknown): import('./model').PopulateProxy<{ data: Array<import('./model').ModelDocument<TDocument>>; page: { page: number; limit: number; }; totals: { total: number; totalPages: number; }; }>;
    findAndCount(query?: unknown, options?: unknown): import('./model').PopulateProxy<{ rows: Array<import('./model').ModelDocument<TDocument>>; count: number; }>;
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
    watch(pipeline?: unknown[], options?: unknown): unknown;
    validate(document?: unknown): Promise<import('./model').ValidationResult>;
}

export declare const expr: ExpressionFunction;
export declare const createExpression: ExpressionFunction;

