import type { LoggerLike } from './base';

/**
 * SSH tunnel configuration for connecting through a bastion host.
 * @since v1.3.0
 */
export interface SSHConfig {
    /** SSH server hostname or IP. */
    host: string;
    /** SSH server port (default: 22). */
    port?: number;
    /** SSH login username. */
    username: string;
    /** SSH password (mutually exclusive with privateKey). */
    password?: string;
    /** SSH private key string or Buffer (mutually exclusive with password). */
    privateKey?: string | Buffer;
    /** Passphrase for an encrypted private key. */
    passphrase?: string;
    /** Connection ready timeout in milliseconds (default: 30000). */
    readyTimeout?: number;
    /** Keep-alive interval in milliseconds (default: 10000). */
    keepaliveInterval?: number;
    /** Target database host as seen from the SSH server (default: 'localhost'). */
    dstHost?: string;
    /** Target database port as seen from the SSH server. */
    dstPort?: number;
}

import type { Collection, DbAccessor, HealthView } from './collection';
import type { Lock, LockOptions, LockStats } from './lock';
import type { ModelInstance } from './model';
import type { MongoConnectConfig } from './mongodb';
import type { ConnectionPoolManagerOptions, PoolConfig, PoolHealthStatus, PoolStats, PoolStrategy } from './pool';
import type { CacheLike, MemoryCache, MultiLevelCacheOptions } from './runtime';
import type { SagaDefinition, SagaOrchestrator, SagaResult, SagaStats } from './saga';
import type { SlowQueryLogConfigInput, SlowQueryLogEntry, SlowQueryLogFilter, SlowQueryLogManager, SlowQueryLogQueryOptions, SlowQueryLogRecord } from './slow-query-log';
import type { ChangeStreamSyncManager, SyncConfig, SyncStats } from './sync';
import type { Transaction, TransactionOptions } from './transaction';

export interface MonSQLizeOptions {
    type?: 'mongodb';
    databaseName?: string;
    /** @alias databaseName — v1 compatibility */
    database?: string;
    config?: MongoConnectConfig;
    /**
     * Cache configuration. Accepts:
     * - A `MemoryCache` instance (direct injection)
     * - A `CacheLike` instance (v1 compat: custom cache implementation)
     * - A `MultiLevelCacheOptions` object (multi-level cache setup)
     * - A plain config object. Recognised fields:
     *     `maxEntries` / `maxSize` (v1 alias), `maxMemory`, `defaultTtl` / `ttl` (v1 alias),
     *     `enableStats`, `enableTags`, `cleanupInterval`, `enabled`,
     *     `autoInvalidate` (v1 alias for `cacheAutoInvalidate`)
     */
    cache?: CacheLike | MemoryCache | MultiLevelCacheOptions | {
        /** Maximum number of entries; v2 name. Alias: maxSize (v1). */
        maxEntries?: number;
        /** @deprecated Use `maxEntries`. v1 alias for `maxEntries`. */
        maxSize?: number;
        /** Maximum memory in bytes (0 = unlimited). */
        maxMemory?: number;
        /** Default TTL in milliseconds; v2 name. Alias: ttl (v1). */
        defaultTtl?: number;
        /** @deprecated Use `defaultTtl`. v1 alias for `defaultTtl`. */
        ttl?: number;
        /** Enable cache hit/miss statistics. Default: true. */
        enableStats?: boolean;
        /** Enable tag-based invalidation. Default: false. */
        enableTags?: boolean;
        /** Periodic TTL cleanup interval in milliseconds. */
        cleanupInterval?: number;
        /** Disable cache entirely when false. Default: true. */
        enabled?: boolean;
        /** @deprecated Use top-level `cacheAutoInvalidate`. v1 alias: auto-invalidate on writes. */
        autoInvalidate?: boolean;
        [key: string]: unknown;
    };
    logger?: LoggerLike | null;
    pools?: PoolConfig[];
    poolStrategy?: PoolStrategy;
    poolFallback?: ConnectionPoolManagerOptions['poolFallback'];
    maxPoolsCount?: number;
    sync?: SyncConfig;
    slowQueryLog?: SlowQueryLogConfigInput;
    /** Global query timeout in milliseconds applied to all find/aggregate operations. Default: undefined (no timeout). @since v1.3.0 */
    maxTimeMS?: number;
    /** Default limit for find() when caller does not specify one. Default: undefined (no limit). @since v1.3.0 */
    findLimit?: number;
    /** Slow query threshold in milliseconds; populates slowQueryLog.filter.minExecutionTimeMs when slowQueryLog is enabled. Default: 500. @since v1.3.0 */
    slowQueryMs?: number;
    /** Maximum allowed limit for findPage() operations. Requests exceeding this cap are silently clamped. Default: 500. @since v1.3.0 */
    findPageMaxLimit?: number;
    /** Namespace scope for cursor isolation between multiple MonSQLize instances sharing a cache. @since v1.3.0 */
    namespace?: { scope?: 'database' | 'connection'; instanceId?: string; };
    /** HMAC-SHA256 secret used to sign and verify cursor tokens returned by findPage(). @since v1.3.0 */
    cursorSecret?: string;
    /** Logging tag configuration applied to slow-query event payloads. @since v1.3.0 */
    log?: { slowQueryTag?: { event?: string; code?: string; }; };
    /** Auto-convert 24-character hex strings to ObjectId in query filters. Pass a field map to selectively enable per field. Default: true for mongodb type (pass `false` to disable). @since v1.3.0 */
    autoConvertObjectId?: boolean | Record<string, boolean>;
    /** Batch count operations to reduce server round-trips. @since v1.3.0 */
    countQueue?: { enabled: boolean; concurrency?: number; maxQueueSize?: number; timeout?: number; };
    /** Model definitions to auto-register on connect. Accepts a file path (string) or an object with { path, pattern?, recursive? }. @since v1.3.0 */
    models?: string | { path: string; pattern?: string; recursive?: boolean; };
    /** Auto-invalidate cache on write operations. @since v1.3.0 */
    cacheAutoInvalidate?: boolean;
}

export interface MonSQLize {
    /**
     * Establish the database connection and return the top-level accessor bundle.
     * @returns Object containing `collection`, `db`, `use` shortcuts and the current instance reference.
     */
    connect(): Promise<{
        collection: <TSchema = unknown>(name: string) => Collection<TSchema>;
        db: (name?: string) => DbAccessor;
        use: (name: string) => {
            collection: <TSchema = unknown>(collectionName: string) => Collection<TSchema>;
            model: <TDocument = Record<string, unknown>>(modelName: string) => ModelInstance<TDocument>;
        };
        instance: MonSQLize;
    }>;
    /**
     * Return the active cache instance (MemoryCache, MultiLevelCache, or a custom CacheLike).
     * Can be used to manually read, write, or invalidate cache entries.
     */
    getCache(): CacheLike;
    /** Return a frozen snapshot of the merged runtime defaults. */
    getDefaults(): Record<string, unknown>;
    /** Close all database connections and release associated resources. */
    close(): Promise<void>;
    /** Return the current connection health status view. */
    health(): Promise<HealthView>;
    /**
     * Return a collection accessor for the given collection name.
     * @param name Collection name.
     */
    collection<TSchema = unknown>(name: string): Collection<TSchema>;
    /**
     * Return a database accessor, optionally scoped to a specific database.
     * @param name Target database name; omit to use the default database.
     */
    db(name?: string): DbAccessor;
    /**
     * Switch to the given database and return its `collection` and `model` accessors.
     * @param name Target database name.
     */
    use(name: string): {
        collection: <TSchema = unknown>(collectionName: string) => Collection<TSchema>;
        model: <TDocument = Record<string, unknown>>(modelName: string) => ModelInstance<TDocument>;
    };
    /**
     * Return collection and model accessors for the named connection pool.
     * @param poolName Connection pool name.
     */
    pool(poolName: string): {
        collection: <TSchema = unknown>(name: string) => Collection<TSchema>;
        model: <TDocument = Record<string, unknown>>(name: string) => ModelInstance<TDocument>;
        use: (dbName: string) => {
            collection: <TSchema = unknown>(name: string) => Collection<TSchema>;
            model: <TDocument = Record<string, unknown>>(name: string) => ModelInstance<TDocument>;
        };
    };
    /**
     * Return a collection accessor scoped to the given database.
     * @param name Collection name.
     * @param options Optional database scope options.
     */
    scopedCollection<TSchema = unknown>(name: string, options?: { database?: string; }): Collection<TSchema>;
    /**
     * Return a model instance scoped to the given database or connection pool.
     * @param name Model name.
     * @param options Optional database or pool scope options.
     */
    scopedModel<TDocument = Record<string, unknown>>(name: string, options?: { database?: string; pool?: string; }): ModelInstance<TDocument>;
    /**
     * Return the registered model instance for the given model name.
     * @param name Model name used during registration.
     */
    model<TDocument = Record<string, unknown>>(name: string): ModelInstance<TDocument>;
    /**
     * Start a MongoDB transaction session.
     * @param options Optional transaction options.
     * @returns The transaction session object.
     */
    startSession(options?: TransactionOptions): Promise<Transaction>;
    /**
     * Execute a callback inside a transaction; commits on success, auto-rolls back on failure.
     * @param callback Async callback that receives the transaction session.
     * @param options Optional transaction options.
     */
    withTransaction<T>(callback: (transaction: Transaction) => Promise<T>, options?: TransactionOptions): Promise<T>;
    /**
     * Execute a callback while holding a distributed lock; the lock is released automatically on completion.
     * @param key Unique lock identifier key.
     * @param callback Async callback executed while the lock is held.
     * @param options Optional lock options.
     */
    withLock<T>(key: string, callback: () => Promise<T>, options?: LockOptions): Promise<T>;
    /**
     * Acquire a distributed lock, blocking until it is available or the timeout is reached.
     * @param key Unique lock identifier key.
     * @param options Optional lock options.
     * @returns The acquired lock instance.
     */
    acquireLock(key: string, options?: LockOptions): Promise<Lock>;
    /**
     * Try to acquire a distributed lock without blocking; returns `null` if the lock is already held.
     * @param key Unique lock identifier key.
     * @param options Optional lock options (`retryTimes` is not supported).
     * @returns The acquired lock instance, or `null` if unavailable.
     */
    tryAcquireLock(key: string, options?: Omit<LockOptions, 'retryTimes'>): Promise<Lock | null>;
    /** Return the ChangeStream sync manager; `null` when sync is not enabled. */
    getSyncManager(): ChangeStreamSyncManager | null;
    /** Return the slow-query log manager; `null` when slow-query logging is not enabled. */
    getSlowQueryLogManager(): SlowQueryLogManager | null;
    /** Return the Saga orchestrator instance. */
    getSagaOrchestrator(): SagaOrchestrator;
    /** Shorthand alias for `getSagaOrchestrator()`. */
    saga(): SagaOrchestrator;
    /**
     * Register a Saga definition.
     * @param definition Saga definition object containing steps and compensation logic.
     */
    defineSaga(definition: SagaDefinition): void;
    /**
     * Execute the named registered Saga.
     * @param name Saga name.
     * @param data Initial data passed into the Saga.
     * @returns The Saga execution result.
     */
    executeSaga(name: string, data: unknown): Promise<SagaResult>;
    /** List all registered Saga names. */
    listSagas(): Promise<string[]>;
    /** Return Saga execution statistics (success / failure / compensation counts, etc.). */
    getSagaStats(): SagaStats;
    /** Start ChangeStream data synchronisation. */
    startSync(): Promise<void>;
    /** Stop ChangeStream data synchronisation. */
    stopSync(): Promise<void>;
    /** Return current data sync statistics; `null` when sync is not enabled. */
    getSyncStats(): SyncStats | null;
    /**
     * Manually record a slow-query log entry.
     * @param log The slow-query log entry object.
     */
    recordSlowQuery(log: SlowQueryLogEntry): Promise<void>;
    /**
     * Query slow-query log records.
     * @param filter Optional filter criteria.
     * @param options Optional pagination and sort options.
     * @returns Array of matching slow-query log records.
     */
    getSlowQueryLogs(filter?: SlowQueryLogFilter, options?: SlowQueryLogQueryOptions): Promise<SlowQueryLogRecord[]>;
    /**
     * Subscribe to an event.
     * @param event Event name.
     * @param handler Event handler callback.
     */
    on(event: string, handler: (payload: unknown) => void): void;
    /**
     * Subscribe to an event; automatically unsubscribes after the first invocation.
     * @param event Event name.
     * @param handler Event handler callback.
     */
    once(event: string, handler: (payload: unknown) => void): void;
    /**
     * Unsubscribe from an event.
     * @param event Event name.
     * @param handler The handler to remove.
     */
    off(event: string, handler: (payload: unknown) => void): void;
    /**
     * Emit an event and dispatch the payload to all subscribers.
     * @param event Event name.
     * @param payload Event payload data.
     */
    emit(event: string, payload: unknown): void;
    /**
     * Dynamically add a connection pool.
     * @param config Pool configuration object.
     * @since v1.3.0 — v1 pool management parity
     */
    addPool(config: PoolConfig): Promise<void>;
    /**
     * Remove the named connection pool and close its connections.
     * @param name Connection pool name.
     */
    removePool(name: string): Promise<void>;
    /** Return the names of all registered connection pools. */
    getPoolNames(): string[];
    /** Return runtime statistics for all connection pools. */
    getPoolStats(): Record<string, PoolStats>;
    /** Return the health status of all connection pools. */
    getPoolHealth(): Record<string, PoolHealthStatus>;
    /** Return distributed lock usage statistics; `null` when locks are not enabled. */
    getLockStats(): LockStats | null;
    /**
     * List all databases accessible on the current connection.
     * @param options Pass `nameOnly: true` to return a plain string array of database names.
     * @since v1.3.0 — v1 database management parity
     */
    listDatabases(options?: { nameOnly?: boolean }): Promise<Array<{ name: string; sizeOnDisk: number; empty: boolean }> | string[]>;
    /**
     * Drop the current default database; requires explicit confirmation via `confirm: true`.
     * @param options Drop confirmation and safety options.
     * @returns Object containing the operation result, database name, and timestamp.
     */
    dropDatabase(options?: { confirm: boolean; allowProduction?: boolean; user?: string }): Promise<{ dropped: boolean; database: string; timestamp: Date }>;
    /**
     * List all collections in the current database.
     * @param filter Optional collection name filter.
     * @param options Optional driver-level options.
     * @returns Array of objects containing collection name and type.
     */
    listCollections(filter?: Record<string, unknown>, options?: Record<string, unknown>): Promise<Array<{ name: string; type: string }>>;
    /**
     * Execute a raw MongoDB command on the current database.
     * @param command Command document object.
     * @param options Optional driver-level options.
     * @returns The command result document.
     */
    runCommand(command: Record<string, unknown>, options?: Record<string, unknown>): Promise<Record<string, unknown>>;
}

import type { RedisCacheAdapter } from './runtime';

/**
 * MonSQLize static/namespace members (v1 compat + v2 additions).
 */
export declare namespace MonSQLize {
    /**
     * Create a Redis cache adapter wrapping an ioredis URL string or instance.
     * Returned adapter implements `CacheLike` and can be passed as `MonSQLizeOptions.cache`.
     *
     * @param redisUrlOrInstance - Redis URL string (e.g. `'redis://localhost:6379'`) or an existing ioredis instance.
     * @returns A `RedisCacheAdapter` implementing `CacheLike`.
     * @since v1 (static method) / v2 (module-level + static)
     */
    function createRedisCacheAdapter(redisUrlOrInstance: string | object): RedisCacheAdapter;
}
