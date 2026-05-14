/**
 * MongoDB runtime core.
 *
 * Description:
 * - Responsible for the runtime skeleton, capability assembly, and full public API exports.
 * - Connection config, query/write/model/capability semantics are implemented in respective
 *   sub-modules and unified here.
 */

import {
    MongoCollectionAccessor as CollectionFacade,
    MongoDbAccessor as DbFacade,
} from '../adapters/mongodb/common/accessors';
import { type RuntimeDefaults } from '../adapters/mongodb/queries';
import { EventEmitter } from 'node:events';
import { performance } from 'node:perf_hooks';
import {
    createRedisCacheAdapter,
    DistributedCacheInvalidator,
    MemoryCache,
    type CacheStats,
} from '../capabilities/cache';
import {
    CachedFunction,
    FunctionCache,
    withCache,
    type WithCacheOptions,
} from '../capabilities/function-cache';
import {
    Lock,
    LockManager,
    LockAcquireError,
    LockOptions,
    LockStats,
    LockTimeoutError,
    DistributedCacheLockManager,
} from '../capabilities/lock';
import {
    Model,
    ModelInstance,
    type ModelConnection,
    type ModelDefinition,
    type PopulateConfig,
    type PopulateProxy,
    type RelationConfig,
    type ValidationResult,
    type VirtualConfig,
} from '../capabilities/model';
import {
    ConnectionPoolManager,
    type ConnectionPoolManagerOptions,
    type FallbackStrategy,
    type PoolConfig,
    type PoolHealthStatus,
    type PoolRole,
    type PoolStats,
    type PoolStrategy,
} from '../capabilities/pool';
import {
    SagaOrchestrator,
    type SagaDefinition,
    type SagaOrchestratorOptions,
    type SagaResult,
    type SagaStats,
    type SagaStep,
} from '../capabilities/saga';
import {
    BatchQueue,
    DEFAULT_SLOW_QUERY_LOG_CONFIG,
    SlowQueryLogConfigManager,
    SlowQueryLogManager,
    generateQueryHash,
    getSlowQueryThreshold,
    withSlowQueryLog,
    type SlowQueryLogConfig,
    type SlowQueryLogConfigInput,
    type SlowQueryLogEntry,
    type SlowQueryLogFilter,
    type SlowQueryLogQueryOptions,
    type SlowQueryLogRecord,
} from '../capabilities/slow-query-log';
export { DEFAULT_SLOW_QUERY_LOG_CONFIG };
import {
    CountQueue,
    type CountQueueOptions,
    type CountQueueStats,
} from '../capabilities/count-queue';
import {
    ChangeStreamSyncManager,
    ResumeTokenStore,
    validateSyncConfig,
    type ResumeTokenConfig,
    type SyncChangeEvent,
    type SyncConfig,
    type SyncStats,
    type SyncTargetConfig,
} from '../capabilities/sync';
import {
    CacheLockManager,
    Transaction,
    TransactionManager,
    type TransactionOptions,
    type TransactionStats,
    type MongoSession,
} from '../capabilities/transaction';
import { closeMongo, connectMongo } from '../adapters/mongodb/common/connect';
import { createExpression, expr, type ExpressionObject } from '../core/expression';
import { ErrorCodes, createError, createConnectionError, createValidationError, createCursorError, createQueryTimeoutError } from '../core/errors';
import { validateRange } from '../utils/validation';
import { Logger, type LoggerLike } from '../core/logger';
import { encodeCursor, decodeCursor } from '../utils/cursor';
import type { HealthView } from '../../types/collection';
import type { MonSQLizeOptions } from '../../types/monsqlize';
import type { MultiLevelCacheOptions, MultiLevelCachePolicy, WritePolicy } from '../../types/runtime';
import type { SyncTargetHealthCheckConfig } from '../../types/sync';

export { CollectionFacade, DbFacade, Logger, MemoryCache, createRedisCacheAdapter, DistributedCacheInvalidator };
export { FunctionCache, withCache };
export { Model };
export { createExpression, expr };
export { ConnectionPoolManager };
export { ChangeStreamSyncManager, ResumeTokenStore, validateSyncConfig };
export { BatchQueue, SlowQueryLogConfigManager, SlowQueryLogManager, generateQueryHash };
export { SagaOrchestrator };
export { encodeCursor, decodeCursor };
export { ErrorCodes } from '../core/errors';
export { normalizeProjection, normalizeSort } from '../utils/normalize';
export { makePageResult } from '../utils/page-result';
export { validateRange, validatePositiveInteger } from '../utils/validation';
export { DistributedCacheLockManager };
export { withSlowQueryLog, getSlowQueryThreshold };
export { createError, createConnectionError, createValidationError, createCursorError, createQueryTimeoutError };
export type {
    CacheStats,
    CachedFunction,
    ConnectionPoolManagerOptions,
    ExpressionObject,
    FallbackStrategy,
    LockOptions,
    LockStats,
    LoggerLike,
    ModelConnection,
    ModelDefinition,
    MongoSession,
    MultiLevelCacheOptions,
    MultiLevelCachePolicy,
    PoolConfig,
    PoolHealthStatus,
    PoolRole,
    PoolStats,
    PoolStrategy,
    PopulateConfig,
    PopulateProxy,
    ResumeTokenConfig,
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
    SyncChangeEvent,
    SyncConfig,
    SyncStats,
    SyncTargetConfig,
    SyncTargetHealthCheckConfig,
    TransactionOptions,
    TransactionStats,
    ValidationResult,
    VirtualConfig,
    WithCacheOptions,
    WritePolicy,
};

export { Transaction, TransactionManager, CacheLockManager, Lock, LockAcquireError, LockTimeoutError, LockManager };
export { CountQueue };
export type { CountQueueOptions, CountQueueStats };
export type { HealthView } from '../../types/collection';
export type { MonSQLizeOptions } from '../../types/monsqlize';

/**
 * Core runtime entry for the monSQLize TypeScript runtime.
 *
 * Responsibilities:
 * - Manages the MongoDB connection lifecycle
 * - Exposes `collection()` / `db()` / `use()` / `pool()` and other accessors
 * - Wires together cache, function-cache, model, transaction, lock, pool, sync, slow-query-log, and saga capabilities
 * - Serves as the package root export and as the runtime host returned by `connect()`
 *
 * @since v1.3.0
 */
export class MonSQLizeRuntime {
    private _connected = false;
    private readonly _cache: MemoryCache;
    private _adapterCacheOverride: MemoryCache | null | undefined;
    private readonly _adapterBridge: {
        readonly db: import('mongodb').Db | null;
        readonly client: import('mongodb').MongoClient | null;
        cache: MemoryCache | null;
        readonly instanceId: string | undefined;
        ping(): Promise<boolean>;
        buildInfo(): Promise<Record<string, unknown>>;
        serverStatus(options?: { scale?: number }): Promise<Record<string, unknown>>;
        stats(options?: { scale?: number }): Promise<Record<string, unknown>>;
        listDatabases(options?: { nameOnly?: boolean }): Promise<unknown[]>;
        dropDatabase(name: string, options?: { confirm?: boolean; allowProduction?: boolean; user?: string }): Promise<{ dropped: boolean; database: string; timestamp: Date }>;
        listCollections(options?: Record<string, unknown>): Promise<unknown>;
        runCommand(command: Record<string, unknown>, options?: Record<string, unknown>): Promise<Record<string, unknown>>;
        collection(dbName: string, collName: string): import('mongodb').Collection;
    };
    private readonly _logger: Logger;
    private readonly _events = new EventEmitter();
    private readonly _cacheLockManager: CacheLockManager;
    private readonly _runtimeDefaults: RuntimeDefaults;
    private _client: Awaited<ReturnType<typeof connectMongo>>['client'] | null = null;
    private _defaultDb: DbFacade | null = null;
    private _poolManager: ConnectionPoolManager | null = null;
    private _syncManager: ChangeStreamSyncManager | null = null;
    private _slowQueryLogManager: SlowQueryLogManager | null = null;
    private _sagaOrchestrator: SagaOrchestrator | null = null;
    private _transactionManager: TransactionManager | null = null;
    private _lockManager: LockManager | null = null;
    private _iidCache: Map<string, string> | null = null;
    private readonly _modelInstances = new Map<string, {
        revision: number;
        instance: ModelInstance<Record<string, unknown>>;
    }>();
    private _connectionPromise: Promise<{
        collection: (name: string) => CollectionFacade;
        db: (name?: string) => DbFacade;
        use: (name: string) => { collection: (collectionName: string) => CollectionFacade; model: <TDocument = Record<string, unknown>>(modelName: string) => ModelInstance<TDocument>; };
        instance: MonSQLizeRuntime;
    }> | null = null;

    /** v1-compatible: defaults exposed as a public property (frozen object). */
    readonly defaults: Readonly<Record<string, unknown>>;

    /** v1-compatible: autoConvertConfig exposed as a public property. */
    readonly autoConvertConfig: { enabled: boolean; excludeFields?: string[]; customFieldPatterns?: string[]; maxDepth?: number; logLevel?: string; };

    /** v1-compatible: public logger access (tests may monkey-patch .warn/.info). */
    get logger(): Logger {
        return this._logger;
    }

    constructor(public readonly options: MonSQLizeOptions = {}) {
        const type = options.type;
        if (!type || !(['mongodb'] as string[]).includes(type)) {
            throw createError(ErrorCodes.UNSUPPORTED_DATABASE, 'Invalid database type. Supported types are: mongodb');
        }
        this.options = {
            ...options,
            type,
        };
        // v1-compatible: validate constructor parameters at construction time
        if (options.maxTimeMS !== undefined && options.maxTimeMS !== null) {
            validateRange(options.maxTimeMS, 1, 300000, 'maxTimeMS');
        }
        if (options.findLimit !== undefined && options.findLimit !== null) {
            validateRange(options.findLimit, 1, 10000, 'findLimit');
        }
        if (options.findPageMaxLimit !== undefined && options.findPageMaxLimit !== null) {
            validateRange(options.findPageMaxLimit, 1, 10000, 'findPageMaxLimit');
        }
        this._cache = MemoryCache.getOrCreateCache(options.cache as Record<string, unknown> | MemoryCache | undefined);
        this._logger = Logger.create(options.logger ?? null);
        this._cacheLockManager = new CacheLockManager({ logger: options.logger ?? null });
        this._cache.setLockManager(this._cacheLockManager);
        this._runtimeDefaults = this._buildRuntimeDefaults();
        this._adapterCacheOverride = undefined;
        this._adapterBridge = {} as typeof this._adapterBridge;
        Object.defineProperties(this._adapterBridge, {
            db: {
                enumerable: true,
                get: () => this._defaultDb?.raw() ?? null,
            },
            client: {
                enumerable: true,
                get: () => this._client,
            },
            cache: {
                enumerable: true,
                get: () => this.resolveAdapterCache(),
                set: (value: MemoryCache | null) => {
                    this._adapterCacheOverride = value;
                },
            },
            instanceId: {
                enumerable: true,
                get: () => this._runtimeDefaults.namespace?.instanceId,
            },
        });
        // v1-compatible: expose admin/database methods on _adapterBridge
        Object.defineProperties(this._adapterBridge, {
            ping: {
                enumerable: true,
                value: async () => {
                    this.ensureConnected();
                    return this.db().admin().ping();
                },
            },
            buildInfo: {
                enumerable: true,
                value: async () => {
                    this.ensureConnected();
                    return this.db().admin().buildInfo();
                },
            },
            serverStatus: {
                enumerable: true,
                value: async (options?: { scale?: number }) => {
                    this.ensureConnected();
                    return this.db().admin().serverStatus(options ?? {});
                },
            },
            stats: {
                enumerable: true,
                value: async (options?: { scale?: number }) => {
                    this.ensureConnected();
                    return this.db().admin().stats(options ?? {});
                },
            },
            listDatabases: {
                enumerable: true,
                value: async (options?: { nameOnly?: boolean }) => {
                    this.ensureConnected();
                    return this.db().listDatabases(options ?? {});
                },
            },
            dropDatabase: {
                enumerable: true,
                value: async (name: unknown, options?: { confirm?: boolean; allowProduction?: boolean; user?: string }) => {
                    this.ensureConnected();
                    if (!name || typeof name !== 'string') {
                        throw new Error('Database name is required and must be a non-empty string');
                    }
                    if (!options?.confirm) {
                        const err = new Error(
                            'dropDatabase requires explicit confirmation. Pass { confirm: true } to proceed.\n\n' +
                            '⚠️  WARNING: This will DELETE ALL DATA in the database!\n' +
                            '⚠️  This operation CANNOT BE UNDONE!',
                        ) as Error & { code: string };
                        err.code = 'CONFIRMATION_REQUIRED';
                        throw err;
                    }
                    const isProduction = process.env['NODE_ENV'] === 'production';
                    if (isProduction && !options?.allowProduction) {
                        const err = new Error('dropDatabase is blocked in production. Pass { allowProduction: true } to override.') as Error & { code: string };
                        err.code = 'PRODUCTION_BLOCKED';
                        throw err;
                    }
                    if (!this._client) {
                        throw createError(ErrorCodes.NOT_CONNECTED, 'MonSQLize is not connected yet.');
                    }
                    await this._client.db(name).dropDatabase();
                    return { dropped: true, database: name, timestamp: new Date() };
                },
            },
            listCollections: {
                enumerable: true,
                value: async (options?: Record<string, unknown>) => {
                    this.ensureConnected();
                    const opts = options ?? {};
                    const nameOnly = opts['nameOnly'] === true;
                    const filter: Record<string, unknown> = { ...opts };
                    delete filter['nameOnly'];
                    const results = await this.db().listCollections(filter);
                    if (nameOnly) {
                        return (results as Array<{ name: string }>).map((c) => c.name);
                    }
                    return results;
                },
            },
            runCommand: {
                enumerable: true,
                value: async (command: unknown, options?: Record<string, unknown>) => {
                    this.ensureConnected();
                    if (command === null || typeof command !== 'object') {
                        throw new Error('Command must be a non-null object');
                    }
                    return this.db().runCommand(command as Record<string, unknown>, options ?? {});
                },
            },
        });
        // v1-compat: expose _iidCache on _adapterBridge (mirrors v1 MongoDB adapter's _iidCache)
        Object.defineProperty(this._adapterBridge, '_iidCache', {
            enumerable: true,
            get: () => this._iidCache,
            set: (value: Map<string, string> | null) => {
                this._iidCache = value;
            },
        });
        // v1-compat: expose collection(dbName, collName) on _adapterBridge
        // Returns a wrapped accessor where .find() returns Promise<array> (matching v1 behavior)
        // Operations are instrumented with slow-query logging to mirror v1 behavior
        Object.defineProperty(this._adapterBridge, 'collection', {
            enumerable: true,
            value: (dbName: string, collName: string) => {
                if (!this._client) {
                    throw createError(ErrorCodes.NOT_CONNECTED, 'MonSQLize is not connected yet.');
                }
                const nativeColl = this._client.db(dbName).collection(collName);
                // Helper: wrap native operation with slow-query instrumentation
                const withSlowQuery = async <T>(op: string, exec: () => Promise<T>, query?: unknown): Promise<T> => {
                    const t0 = performance.now();
                    const result = await exec();
                    const durationMs = Math.max(1, Math.ceil(performance.now() - t0));
                    const threshold = (this.options as any).slowQueryMs ?? 500;
                    const manager = this.initializeSlowQueryLogManager();
                    if (manager && durationMs >= threshold) {
                        const entry: SlowQueryLogEntry = {
                            database: dbName,
                            collection: collName,
                            operation: op,
                            durationMs,
                            query: query as any,
                            timestamp: new Date(),
                        };
                        await manager.save(entry);
                        this.emit('slow-query', entry);
                        this.emit('query', entry);
                    }
                    return result;
                };
                return {
                    find: async (query?: object, options?: object) =>
                        withSlowQuery('find', () => nativeColl.find((query ?? {}) as any, options as any).toArray(), query),
                    findOne: async (query: object, options?: object) =>
                        withSlowQuery('findOne', () => nativeColl.findOne(query as any, options as any) as any, query),
                    insertOne: async (doc: object, options?: object) =>
                        withSlowQuery('insertOne', () => nativeColl.insertOne(doc as any, options as any)),
                    insertMany: async (docs: object[], options?: object) =>
                        withSlowQuery('insertMany', () => nativeColl.insertMany(docs as any[], options as any)),
                    updateOne: async (filter: object, update: object, options?: object) =>
                        withSlowQuery('updateOne', () => nativeColl.updateOne(filter as any, update as any, options as any)),
                    updateMany: async (filter: object, update: object, options?: object) =>
                        withSlowQuery('updateMany', () => nativeColl.updateMany(filter as any, update as any, options as any)),
                    deleteOne: async (filter: object, options?: object) =>
                        withSlowQuery('deleteOne', () => nativeColl.deleteOne(filter as any, options as any)),
                    deleteMany: async (filter: object, options?: object) =>
                        withSlowQuery('deleteMany', () => nativeColl.deleteMany(filter as any, options as any)),
                    aggregate: async (pipeline: object[], options?: object) =>
                        withSlowQuery('aggregate', () => nativeColl.aggregate(pipeline, options as any).toArray()),
                    countDocuments: async (filter?: object, options?: object) =>
                        withSlowQuery('countDocuments', () => nativeColl.countDocuments((filter ?? {}) as any, options as any)),
                    drop: async () => nativeColl.drop(),
                };
            },
        });
        // v1-compat: expose slowQueryLogManager on _adapterBridge
        Object.defineProperty(this._adapterBridge, 'slowQueryLogManager', {
            enumerable: true,
            configurable: true,
            get: () => this._slowQueryLogManager,
        });
        const _deepMerge = (base: Record<string, unknown>, patch: Record<string, unknown>): Record<string, unknown> => {
            const out: Record<string, unknown> = { ...base };
            for (const k of Object.keys(patch || {})) {
                const v = patch[k];
                if (v && typeof v === 'object' && !Array.isArray(v)) {
                    out[k] = _deepMerge((base[k] as Record<string, unknown>) || {}, v as Record<string, unknown>);
                } else if (v !== undefined) {
                    out[k] = v;
                }
            }
            return out;
        };
        const DEFAULTS: Record<string, unknown> = {
            maxTimeMS: 2000,
            findLimit: 10,
            slowQueryMs: 500,
            namespace: { scope: 'database' },
            findPageMaxLimit: 500,
            cursorSecret: undefined,
            log: { slowQueryTag: { event: 'slow_query', code: 'SLOW_QUERY' } },
        };
        this.defaults = Object.freeze(_deepMerge(DEFAULTS, {
            maxTimeMS: options.maxTimeMS,
            findLimit: options.findLimit,
            findPageMaxLimit: options.findPageMaxLimit,
            slowQueryMs: options.slowQueryMs,
            namespace: options.namespace,
            cursorSecret: options.cursorSecret,
            autoConvertObjectId: options.autoConvertObjectId,
            log: options.log as Record<string, unknown> | undefined,
            slowQueryLog: options.slowQueryLog,
            cacheAutoInvalidate: options.cacheAutoInvalidate,
        } as Record<string, unknown>));
        // v1-compatible: initialize autoConvertConfig
        this.autoConvertConfig = this._initAutoConvertConfig(options.autoConvertObjectId, options.type);
    }

    /** v1-compatible: initialize autoConvertConfig from constructor options. */
    private _initAutoConvertConfig(
        config: boolean | { enabled?: boolean; excludeFields?: string[]; customFieldPatterns?: string[]; maxDepth?: number; logLevel?: string; } | undefined,
        type: string | undefined,
    ): { enabled: boolean; excludeFields?: string[]; customFieldPatterns?: string[]; maxDepth?: number; logLevel?: string; } {
        if (type !== 'mongodb') {
            return { enabled: false };
        }
        if (config === false) {
            return { enabled: false };
        }
        const defaults = { enabled: true, excludeFields: [], customFieldPatterns: [], maxDepth: 10, logLevel: 'warn' };
        if (config === true || config === undefined) {
            return defaults;
        }
        if (typeof config === 'object' && config !== null) {
            if (config.enabled === false) {
                return { enabled: false };
            }
            return {
                ...defaults,
                ...config,
                enabled: true,
            };
        }
        return defaults;
    }

    private _buildRuntimeDefaults(): RuntimeDefaults {
        const o = this.options;
        const defaults: RuntimeDefaults = {};
        if (o.maxTimeMS !== undefined) defaults.maxTimeMS = o.maxTimeMS;
        if (o.findLimit !== undefined) defaults.findLimit = o.findLimit;
        if (o.findPageMaxLimit !== undefined) defaults.findPageMaxLimit = o.findPageMaxLimit;
        if (o.slowQueryMs !== undefined) defaults.slowQueryMs = o.slowQueryMs;
        // v1-compat: autoConvertObjectId defaults to true for MongoDB (mirrors v1 _initAutoConvertConfig behavior)
        defaults.autoConvertObjectId = o.autoConvertObjectId !== undefined
            ? o.autoConvertObjectId
            : (o.type === 'mongodb' || !o.type ? true : false);
        if (o.cursorSecret !== undefined) defaults.cursorSecret = o.cursorSecret;
        if (o.namespace !== undefined) defaults.namespace = o.namespace;
        if (o.countQueue?.enabled) {
            defaults.countQueue = new CountQueue({
                concurrency: o.countQueue.concurrency,
                maxQueueSize: o.countQueue.maxQueueSize,
                timeout: o.countQueue.timeout,
            });
        }
        return defaults;
    }

    /**
     * Establishes the database connection and returns the standard accessor set for the current runtime.
     *
     * Behavior:
     * - The first call actually connects to MongoDB and initializes all enabled capabilities
     * - Subsequent calls reuse the existing connection
     * - Concurrent calls share the same in-progress connection promise to avoid duplicate connections
     *
     * @returns {Promise<{ collection: (name: string) => CollectionFacade; db: (name?: string) => DbFacade; use: (name: string) => { collection: (collectionName: string) => CollectionFacade; model: <TDocument = Record<string, unknown>>(modelName: string) => ModelInstance<TDocument>; }; instance: MonSQLizeRuntime; }>} Returns an accessor object containing `collection`, `db`, `use`, and `instance`.
     * @throws {Error} Thrown when the connection configuration is invalid, the MongoDB connection fails, or initialization of a capability fails.
     * @since v1.3.0
     */
    async connect(): Promise<{
        collection: (name: string) => CollectionFacade;
        db: (name?: string) => DbFacade;
        use: (name: string) => { collection: (collectionName: string) => CollectionFacade; model: <TDocument = Record<string, unknown>>(modelName: string) => ModelInstance<TDocument>; };
        instance: MonSQLizeRuntime;
    }> {
        if (this._connected) {
            return this.createRuntimeAccessors();
        }

        if (this._connectionPromise) {
            return this._connectionPromise;
        }

        this._connectionPromise = (async () => {
            const databaseName = this.resolveDatabaseName();
            const { client, db } = await connectMongo({
                databaseName,
                config: this.options.config,
                logger: this._logger,
            });
            this._client = client;
            this._defaultDb = new DbFacade(databaseName, db, {
                cache: this.resolveAdapterCache(),
                queryCache: this.resolveAdapterCache(),
                getCache: () => this.resolveAdapterCache(),
                getQueryCache: () => this.resolveAdapterCache(),
                logger: this._logger,
                defaults: this._runtimeDefaults,
                cacheAutoInvalidate: !!(this.options.cache as Record<string, unknown> | undefined)?.autoInvalidate,
            });
            await this.ensurePoolManager();
            this.initializeSagaOrchestrator();
            this.initializeSlowQueryLogManager();
            await this.initializeSyncManager();
            this._connected = true;
            await this._loadModels();
            this.emit('connected', {
                type: this.options.type,
                db: databaseName,
            });
            return this.createRuntimeAccessors();
        })();

        try {
            return await this._connectionPromise;
        } catch (error) {
            this.emit('error', {
                type: this.options.type,
                db: this.resolveDatabaseName(),
                error: error instanceof Error ? error.message : String(error),
            });
            throw error;
        } finally {
            this._connectionPromise = null;
        }
    }

    /**
     * Returns the local cache instance bound to the current runtime.
     *
     * @returns {MemoryCache}
     * @since v1.3.0
     */
    getCache(): MemoryCache {
        return this._cache;
    }

    /**
     * Returns a snapshot of the current instance's default public configuration.
     *
     * This method exposes the lightweight default state of the current instance, rather than the full internal configuration object.
     *
     * @returns {Record<string, unknown>}
     * @since v1.3.0
     */
    getDefaults(): Record<string, unknown> {
        const d = this.defaults as Record<string, unknown>;
        return {
            type: this.options.type,
            databaseName: this.options.databaseName,
            sync: this.options.sync,
            slowQueryLog: d.slowQueryLog ?? this.options.slowQueryLog ?? false,
            maxTimeMS: d.maxTimeMS,
            findLimit: d.findLimit,
            findPageMaxLimit: d.findPageMaxLimit,
            autoConvertObjectId: d.autoConvertObjectId,
            cursorSecret: this.options.cursorSecret !== undefined ? '***' : undefined,
            namespace: d.namespace,
            log: d.log,
            countQueue: this.options.countQueue,
            models: this.options.models,
        };
    }

    /**
     * Closes the connection.
     * @since v1.3.0
     */
    async close(): Promise<void> {
        await this._syncManager?.stop();
        await this._slowQueryLogManager?.close();
        await this._transactionManager?.abortAll();
        this._cacheLockManager.stop();
        this._lockManager?.close();
        await this._poolManager?.close();
        await closeMongo(this._client, this._logger);
        this._client = null;
        this._defaultDb = null;
        this._connected = false;
        this._poolManager = null;
        this._syncManager = null;
        this._slowQueryLogManager = null;
        this._transactionManager = null;
        this._lockManager = null;
        this._iidCache = null;
        this._modelInstances.clear();
        this.emit('closed', {
            type: this.options.type,
            db: this.resolveDatabaseName(),
        });
    }

    /**
     * Health check.
     * @since v1.3.0
     */
    async health(): Promise<HealthView> {
        return {
            status: this._connected ? 'up' : 'down',
            connected: this._connected,
            defaults: this.getDefaults(),
            cache: {
                enabled: true,
                pools: this._poolManager?.getHealthStatus(),
            },
        };
    }

    /**
     * v1-compat: Exposes the cache property publicly.
     * In v1, `msq.cache` directly exposes the internal MemoryCache instance.
     * @since v1.3.0 (v1-compat)
     */
    get cache(): MemoryCache {
        return this._cache;
    }

    /**
     * v1-compat adapter accessor.
     *
     * In v1 tests, the native MongoDB Db object is accessed via `msq._adapter.db`.
     * @since v1.3.0 (v1-compat)
     */
    get _adapter(): {
        db: import('mongodb').Db | null;
        client: import('mongodb').MongoClient | null;
        cache: MemoryCache | null;
        instanceId: string | undefined;
        _iidCache: Map<string, string> | null;
        ping(): Promise<boolean>;
        buildInfo(): Promise<Record<string, unknown>>;
        serverStatus(options?: { scale?: number }): Promise<Record<string, unknown>>;
        stats(options?: { scale?: number }): Promise<Record<string, unknown>>;
        listDatabases(options?: { nameOnly?: boolean }): Promise<unknown[]>;
        dropDatabase(name: string, options?: { confirm?: boolean; allowProduction?: boolean; user?: string }): Promise<{ dropped: boolean; database: string; timestamp: Date }>;
        listCollections(options?: Record<string, unknown>): Promise<unknown>;
        runCommand(command: Record<string, unknown>, options?: Record<string, unknown>): Promise<Record<string, unknown>>;
    } | null {
        if (this._client === null) return null;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return this._adapterBridge as any;
    }

    /**
     * v1-compat: Connection instance; null when not connected or after close.
     * In v1, `dbInstance` is the { collection, db } object returned by connect().
     * @since v1.3.0 (v1-compat)
     */
    get dbInstance(): { collection: (name: string) => unknown; db: (name?: string) => unknown } | null {
        if (this._client === null) return null;
        return {
            collection: (name: string) => this.collection(name),
            db: (name?: string) => this.db(name),
        };
    }

    /**
     * v1-compat: Connection-lock Promise; set to null after the connection succeeds or fails.
     * In v1, `_connecting` is the in-progress connection Promise, set to null after completion.
     * @since v1.3.0 (v1-compat)
     */
    get _connecting(): Promise<unknown> | null {
        return this._connectionPromise;
    }

    /**
     * Returns the Collection accessor for the default database.
     *
     * @param {string} name - Collection name.
     * @returns {CollectionFacade}
     * @throws {Error} Throws `NOT_CONNECTED` when the runtime is not yet connected.
     * @since v1.3.0
     */
    collection(name: string): CollectionFacade {
        if (!name || typeof name !== 'string' || !name.trim()) {
            const err = new Error('Collection name must be a non-empty string') as Error & { code: string };
            err.code = 'INVALID_COLLECTION_NAME';
            throw err;
        }
        // v1-compat: use dbInstance check (supports mock objects in tests)
        const self = this as unknown as Record<string, unknown>;
        if (!(self['dbInstance'] as unknown)) {
            throw createError(ErrorCodes.NOT_CONNECTED, 'Database is not connected. Call connect() before accessing collections.');
        }
        // Real v2 path: use the proper _client-backed implementation
        if (this._client) {
            if (!this._iidCache) this._iidCache = new Map();
            return this.db().collection(name);
        }
        // Mock/v1-compat path: delegate to dbInstance.collection
        return (self['dbInstance'] as { collection: (n: string) => CollectionFacade }).collection(name);
    }

    /**
     * Returns the database accessor.
     *
     * @param {string} [name] - Optional database name; uses the default database when omitted.
     * @returns {DbFacade}
     * @throws {Error} Throws `NOT_CONNECTED` when the runtime is not yet connected.
     * @since v1.3.0
     */
    db(name?: string): DbFacade {
        if (name !== undefined) {
            if (!name || typeof name !== 'string' || !name.trim()) {
                const err = new Error('Database name must be a non-empty string') as Error & { code: string };
                err.code = 'INVALID_DATABASE_NAME';
                throw err;
            }
        }
        this.ensureConnected();
        if (!this._client) {
            throw createError(ErrorCodes.NOT_CONNECTED, 'MonSQLize is not connected yet.');
        }
        const databaseName = name ?? this.resolveDatabaseName();
        if (databaseName === this.resolveDatabaseName() && this._defaultDb) {
            return this._defaultDb;
        }
        return new DbFacade(databaseName, this._client.db(databaseName), {
            cache: this.resolveAdapterCache(),
            queryCache: this.resolveAdapterCache(),
            getCache: () => this.resolveAdapterCache(),
            getQueryCache: () => this.resolveAdapterCache(),
            logger: this._logger,
            defaults: this._runtimeDefaults,
            cacheAutoInvalidate: !!(this.options.cache as Record<string, unknown> | undefined)?.autoInvalidate,
        });
    }

    private resolveAdapterCache(): MemoryCache | null {
        return this._adapterCacheOverride === undefined ? this._cache : this._adapterCacheOverride;
    }

    /**
     * Returns the accessor set scoped to the specified database.
     *
     * @param {string} name - Target database name.
     * @returns {{ collection: (collectionName: string) => CollectionFacade; model: <TDocument = Record<string, unknown>>(modelName: string) => ModelInstance<TDocument>; }} Returns `collection()` and `model()` accessors bound to the given database.
     * @throws {Error} Throws `NOT_CONNECTED` when the runtime is not yet connected.
     * @since v1.3.0
     */
    use(name: string): { collection: (collectionName: string) => CollectionFacade; model: <TDocument = Record<string, unknown>>(modelName: string) => ModelInstance<TDocument>; } {
        // v1-compat: use dbInstance check (supports mock objects in tests)
        const self = this as unknown as Record<string, unknown>;
        if (!(self['dbInstance'] as unknown)) {
            throw createError(ErrorCodes.NOT_CONNECTED, 'Database is not connected. Call connect() first.');
        }
        return {
            collection: (collectionName: string) => this.scopedCollection(collectionName, { database: name }),
            model: <TDocument = Record<string, unknown>>(modelName: string) => this.scopedModel<TDocument>(modelName, { database: name }),
        };
    }

    /**
     * Returns the accessor set scoped to the specified connection pool.
     *
     * @param {string} poolName - Name of the connection pool.
     * @returns {{ collection: (name: string) => CollectionFacade; model: <TDocument = Record<string, unknown>>(name: string) => ModelInstance<TDocument>; use: (dbName: string) => { collection: (name: string) => CollectionFacade; model: <TDocument = Record<string, unknown>>(name: string) => ModelInstance<TDocument>; }; }} Returns collection/model/use accessors bound to the connection pool.
     * @throws {Error} Thrown when the runtime is not yet connected, `options.pools` is not configured, or the specified pool does not exist.
     * @since v1.3.0
     */
    pool(poolName: string): {
        collection: (name: string) => CollectionFacade;
        model: <TDocument = Record<string, unknown>>(name: string) => ModelInstance<TDocument>;
        use: (dbName: string) => { collection: (name: string) => CollectionFacade; model: <TDocument = Record<string, unknown>>(name: string) => ModelInstance<TDocument>; };
    } {
        // v1-compat: use dbInstance check (supports mock objects in tests)
        const self = this as unknown as Record<string, unknown>;
        if (!(self['dbInstance'] as unknown)) {
            throw createError(ErrorCodes.NOT_CONNECTED, 'Database is not connected. Call connect() first.');
        }
        const poolMgr = self['_poolManager'] as Record<string, unknown> | null;
        if (!poolMgr) {
            throw createError(ErrorCodes.NO_POOL_MANAGER, 'No pool manager configured. Add pools to MonSQLize constructor options.');
        }
        // Try v1-style _getPool first, then v2-style getPool
        const getPoolV1 = poolMgr['_getPool'] as ((name: string) => unknown) | undefined;
        const getPoolV2 = poolMgr['getPool'] as ((name: string) => unknown) | undefined;
        let client: unknown = null;
        if (typeof getPoolV1 === 'function') {
            client = getPoolV1.call(poolMgr, poolName);
        } else if (typeof getPoolV2 === 'function') {
            try { client = getPoolV2.call(poolMgr, poolName); } catch { client = null; }
        }
        if (!client) {
            const getNames = poolMgr['getPoolNames'] as (() => string[]) | undefined;
            const available = typeof getNames === 'function' ? getNames.call(poolMgr) : [];
            const err = createError(ErrorCodes.POOL_NOT_FOUND, `Pool '${poolName}' not found. Available pools: [${available.join(', ')}]`);
            (err as unknown as Record<string, unknown>)['available'] = available;
            throw err;
        }
        return {
            collection: (name: string) => this.scopedCollection(name, { pool: poolName }),
            model: <TDocument = Record<string, unknown>>(name: string) => this.scopedModel<TDocument>(name, { pool: poolName }),
            use: (dbName: string) => ({
                collection: (name: string) => this.scopedCollection(name, { pool: poolName, database: dbName }),
                model: <TDocument = Record<string, unknown>>(name: string) => this.scopedModel<TDocument>(name, { pool: poolName, database: dbName }),
            }),
        };
    }

    /**
     * Returns the Collection accessor under the optional database / connection pool scope.
     *
     * @param {string} name - Collection name.
     * @param {{ database?: string; pool?: string; }} [options={}] - Optional database name or connection pool name.
     * @returns {CollectionFacade}
     * @throws {Error} Thrown when the runtime is not yet connected or the specified pool does not exist.
     * @since v1.3.0
     */
    scopedCollection(name: string, options: { database?: string; pool?: string; } = {}): CollectionFacade {
        // v1-compat: use dbInstance check (supports mock objects in tests)
        const self = this as unknown as Record<string, unknown>;
        if (!(self['dbInstance'] as unknown)) {
            throw createError(ErrorCodes.NOT_CONNECTED, 'Database is not connected. Call connect() first.');
        }
        const { pool, database } = options;
        if (!pool && !database) {
            return this.collection(name);
        }
        return this._resolveModelCollection(name, { pool, database }) as CollectionFacade;
    }

    /**
     * v1-compat: Resolves the model/collection route, supporting pool and database switching.
     * In mock environments uses _adapter.collectionFromClient; in real v2 uses the pool manager's selectPool.
     * @since v1.3.0
     */
    _resolveModelCollection(collectionName: string, connection: { pool?: string; database?: string }): unknown {
        const poolName = connection.pool;
        const self = this as unknown as Record<string, unknown>;
        const optsRaw = self['options'] as Record<string, unknown> | undefined;
        const defaultDb = (self['databaseName'] as string | undefined)
            ?? (optsRaw?.['databaseName'] as string | undefined)
            ?? (optsRaw?.['database'] as string | undefined)
            ?? 'default';
        const dbName = connection.database || defaultDb;

        if (poolName) {
            const poolMgr = self['_poolManager'] as Record<string, unknown> | null;
            if (!poolMgr) {
                throw createError(ErrorCodes.NO_POOL_MANAGER, `Model '${collectionName}' requires pool '${poolName}' but no pools are configured. Add 'pools' to MonSQLize constructor options.`);
            }
            // Try v1-style _getPool first, then v2-style getPool
            let client: unknown = null;
            const getPoolV1 = poolMgr['_getPool'] as ((name: string) => unknown) | undefined;
            const getPoolV2 = poolMgr['getPool'] as ((name: string) => unknown) | undefined;
            if (typeof getPoolV1 === 'function') {
                client = getPoolV1.call(poolMgr, poolName);
            } else if (typeof getPoolV2 === 'function') {
                try { client = getPoolV2.call(poolMgr, poolName); } catch { client = null; }
            }
            if (!client) {
                const getNames = poolMgr['getPoolNames'] as (() => string[]) | undefined;
                const available = typeof getNames === 'function' ? getNames.call(poolMgr) : [];
                const err = createError(ErrorCodes.POOL_NOT_FOUND, `Pool '${poolName}' not found. Available pools: [${available.join(', ')}]`);
                (err as unknown as Record<string, unknown>)['available'] = available;
                throw err;
            }
            // Mock/v1-compat path: use adapter.collectionFromClient
            const adapter = self['_adapter'] as Record<string, unknown> | undefined;
            if (adapter && typeof adapter['collectionFromClient'] === 'function') {
                return (adapter['collectionFromClient'] as (c: unknown, db: string, col: string) => unknown)(client, dbName, collectionName);
            }
            // Real v2 path: use pool manager's selectPool
            if (this._poolManager) {
                const selected = this._poolManager.selectPool('read', { pool: poolName, databaseName: dbName });
                return new CollectionFacade(
                    dbName,
                    collectionName,
                    selected.collection(dbName, collectionName),
                    { cache: this._cache, logger: this._logger, defaults: this._runtimeDefaults },
                );
            }
            return null;
        }

        // No pool: switch database only
        if (this._client) {
            return this.db(dbName).collection(collectionName);
        }
        // Mock path
        const dbInst = self['dbInstance'] as { db: (n: string) => { collection: (n: string) => unknown } } | null;
        if (!dbInst) {
            throw createError(ErrorCodes.NOT_CONNECTED, 'Database is not connected. Call connect() first.');
        }
        return (dbInst.db as (n: string) => { collection: (n: string) => unknown })(dbName).collection(collectionName);
    }

    /**
     * Returns the Model accessor scoped to the specified database (v1-compat implementation).
     * @since v1.3.0
     */
    scopedModel<TDocument = Record<string, unknown>>(name: string, options: { database?: string; pool?: string; } = {}): ModelInstance<TDocument> {
        // v1-compat: use dbInstance check (supports mock objects in tests)
        const self = this as unknown as Record<string, unknown>;
        if (!(self['dbInstance'] as unknown)) {
            throw createError(ErrorCodes.NOT_CONNECTED, 'Database is not connected. Call connect() first.');
        }
        // Real v2 path: use createModelInstance (handles connection + caching)
        if (this._client) {
            return this.createModelInstance<TDocument>(name, options);
        }
        // Mock/v1-compat path: v1-style implementation with connection merge
        const registered = Model.get<TDocument>(name);
        if (!registered) {
            throw createError(ErrorCodes.MODEL_NOT_DEFINED, `Model '${name}' is not defined. Call Model.define() first.`);
        }
        const regDef = registered.definition as unknown as Record<string, unknown>;
        const actualCollectionName = (regDef.collection as string | undefined) || (regDef.name as string | undefined) || registered.collectionName;
        // v1 connection merge: definition.connection as fallback, opts take priority
        const merged: Record<string, unknown> = { ...((regDef.connection ?? {}) as Record<string, unknown>), ...options };
        const { pool, database } = merged as { pool?: string; database?: string };
        const collection = (pool || database)
            ? this._resolveModelCollection(actualCollectionName, { pool, database })
            : (self['dbInstance'] as { collection: (n: string) => unknown })!.collection(actualCollectionName);
        return new ModelInstance<TDocument>(
            collection as never,
            this as never,
            {
                collectionName: actualCollectionName,
                dbName: database ?? (self['databaseName'] as string | undefined) ?? 'default',
                poolName: pool,
                definition: registered.definition,
            },
        );
    }

    /**
     * Returns the Model accessor for the default database.
     *
     * @template TDocument
     * @param {string} name - Name of the registered model.
     * @returns {ModelInstance<TDocument>}
     * @throws {Error} Thrown when the runtime is not yet connected or the model is not registered.
     * @since v1.3.0
     */
    model<TDocument = Record<string, unknown>>(name: string): ModelInstance<TDocument> {
        // Real v2 path
        if (this._client) {
            this.ensureConnected();
            return this.createModelInstance<TDocument>(name, {
                database: this.resolveDatabaseName(),
            });
        }
        // v1-compat mock path: mirrors v1 model() — check dbInstance, lazy-init _modelInstances cache
        const self = this as unknown as Record<string, unknown>;
        if (!self['dbInstance']) {
            throw createError(ErrorCodes.NOT_CONNECTED, 'Database is not connected. Call connect() first.');
        }

        // Cache hit + _redefinedNames invalidation check
        if (self['_modelInstances'] != null) {
            const cache = self['_modelInstances'] as Map<string, ModelInstance<Record<string, unknown>>>;
            if (cache.has(name)) {
                if (!Model._redefinedNames.has(name)) {
                    return cache.get(name) as ModelInstance<TDocument>;
                }
                cache.delete(name);
                Model._redefinedNames.delete(name);
            }
        }

        const registered = Model.get<TDocument>(name);
        if (!registered) {
            throw createError(ErrorCodes.MODEL_NOT_DEFINED, `Model '${name}' is not defined.`);
        }
        const regDef2 = registered.definition as unknown as Record<string, unknown>;
        const actualCollectionName = (regDef2.collection as string | undefined)
            || (regDef2.name as string | undefined)
            || registered.collectionName;
        const connection = regDef2.connection as { pool?: string; database?: string } | undefined;
        const collection = (connection && (connection.pool || connection.database))
            ? this._resolveModelCollection(actualCollectionName, connection)
            : (self['dbInstance'] as { collection: (n: string) => unknown }).collection(actualCollectionName);
        const instance = new ModelInstance<TDocument>(
            collection as never,
            this as never,
            {
                collectionName: actualCollectionName,
                dbName: (self['databaseName'] as string | undefined) ?? 'default',
                definition: registered.definition,
            },
        );
        // Lazily initialize cache and store
        if (self['_modelInstances'] == null) {
            self['_modelInstances'] = new Map<string, ModelInstance<Record<string, unknown>>>();
        }
        (self['_modelInstances'] as Map<string, ModelInstance<Record<string, unknown>>>).set(name, instance as ModelInstance<Record<string, unknown>>);
        return instance;
    }

    /**
     * Manually starts a transaction session.
     *
     * @param {TransactionOptions} [options={}] - Transaction options.
     * @returns {Promise<Transaction>}
     * @throws {Error} Throws `NOT_CONNECTED` when the runtime is not yet connected.
     * @since v1.3.0
     */
    async startSession(options: TransactionOptions = {}): Promise<Transaction> {
        this.ensureConnected();
        return this.getTransactionManager().startSession(options);
    }

    /**
     * Executes a callback inside a transaction with automatic lifecycle management.
     *
     * @template T
     * @param {(transaction: Transaction) => Promise<T>} callback - Transaction body.
     * @param {TransactionOptions} [options={}] - Transaction options.
     * @returns {Promise<T>} Resolves with the callback's return value.
     * @throws {Error} Thrown when the runtime is not yet connected or the transaction fails.
     * @since v1.3.0
     */
    async withTransaction<T>(callback: (transaction: Transaction) => Promise<T>, options: TransactionOptions = {}): Promise<T> {
        this.ensureConnected();
        return this.getTransactionManager().withTransaction(callback, options);
    }

    /**
     * Executes an async callback under a distributed lock with automatic acquire/release lifecycle.
     *
     * @template T
     * @param {string} key - Lock key.
     * @param {() => Promise<T>} callback - The protected async logic.
     * @param {LockOptions} [options={}] - Lock options.
     * @returns {Promise<T>} Resolves with the callback's return value.
     * @throws {Error} Thrown when the runtime is not yet connected or the lock cannot be acquired.
     * @since v1.4.0
     */
    async withLock<T>(key: string, callback: () => Promise<T>, options: LockOptions = {}): Promise<T> {
        this.ensureConnected();
        return this.getLockManager().withLock(key, callback, options);
    }

    /**
     * Acquires a lock (blocking with retries).
     * @since v1.4.0
     */
    async acquireLock(key: string, options: LockOptions = {}): Promise<Lock> {
        this.ensureConnected();
        return this.getLockManager().acquireLock(key, options);
    }

    /**
     * Attempts to acquire a lock (non-blocking).
     * @since v1.4.0
     */
    async tryAcquireLock(key: string, options: Omit<LockOptions, 'retryTimes'> = {}): Promise<Lock | null> {
        this.ensureConnected();
        return this.getLockManager().tryAcquireLock(key, options);
    }

    /**
     * Returns the Change Stream sync manager.
     * @since v1.0.9
     */
    getSyncManager(): ChangeStreamSyncManager | null {
        return this._syncManager;
    }

    /**
     * Returns the slow query log manager.
     * @since v1.3.1
     */
    getSlowQueryLogManager(): SlowQueryLogManager | null {
        return this._slowQueryLogManager;
    }

    /**
     * Returns the Saga orchestrator.
     * @since v1.1.0
     */
    getSagaOrchestrator(): SagaOrchestrator {
        return this.initializeSagaOrchestrator();
    }

    /**
     * Returns the Saga façade.
     * @since v1.1.0
     */
    saga(): SagaOrchestrator {
        return this.getSagaOrchestrator();
    }

    /**
     * Records a slow query log entry.
     * @since v1.3.1
     */
    async recordSlowQuery(log: SlowQueryLogEntry): Promise<void> {
        this.ensureConnected();
        const manager = this.ensureSlowQueryLogManager();
        await manager.save(log);
        this.emit('slow-query', log);
        this.emit('query', log);
    }

    /**
     * Queries the slow query log.
     * @since v1.3.1
     */
    async getSlowQueryLogs(filter: SlowQueryLogFilter = {}, options: SlowQueryLogQueryOptions = {}): Promise<SlowQueryLogRecord[]> {
        this.ensureConnected();
        const manager = this.ensureSlowQueryLogManager();
        return manager.query(filter, options);
    }

    /**
     * Registers a Saga definition.
     * @since v1.1.0
     */
    defineSaga(definition: SagaDefinition): void {
        this.initializeSagaOrchestrator().define(definition);
    }

    /**
     * Executes a registered Saga.
     * @since v1.1.0
     */
    async executeSaga(name: string, data: unknown): Promise<SagaResult> {
        return this.initializeSagaOrchestrator().execute(name, data);
    }

    /**
     * Lists all registered Sagas.
     * @since v1.1.0
     */
    async listSagas(): Promise<string[]> {
        return this.initializeSagaOrchestrator().listSagas();
    }

    /**
     * Returns Saga statistics.
     * @since v1.1.0
     */
    getSagaStats(): SagaStats {
        return this.initializeSagaOrchestrator().getStats();
    }

    /**
     * Manually starts synchronization.
     * @since v1.0.9
     */
    async startSync(): Promise<void> {
        this.ensureConnected();
        const manager = await this.initializeSyncManager();
        if (!manager) {
            throw createError(ErrorCodes.INVALID_CONFIG, 'MonSQLize sync is not enabled for this runtime.');
        }
        await manager.start();
    }

    /**
     * Manually stops synchronization.
     * @since v1.0.9
     */
    async stopSync(): Promise<void> {
        await this._syncManager?.stop();
    }

    /**
     * Returns sync statistics.
     * @since v1.0.9
     */
    getSyncStats(): SyncStats | null {
        return this._syncManager?.getStats() ?? null;
    }

    /**
     * Subscribes to an event.
     * @since v1.3.0
     */
    on(event: string, handler: (payload: unknown) => void): void {
        this._events.on(event, handler);
    }

    /**
     * Subscribes to an event once.
     * @since v1.3.0
     */
    once(event: string, handler: (payload: unknown) => void): void {
        this._events.once(event, handler);
    }

    /**
     * Unsubscribes from an event.
     * @since v1.3.0
     */
    off(event: string, handler: (payload: unknown) => void): void {
        this._events.off(event, handler);
    }

    /**
     * Emits an event.
     * @since v1.3.0
     */
    emit(event: string, payload: unknown): void {
        if (event === 'error' && this._events.listenerCount('error') === 0) {
            this._logger.error('[MonSQLizeRuntime] error event', payload);
            return;
        }
        this._events.emit(event, payload);
    }

    /**
     * Adds a connection pool (v1-compat).
     * @since v1.3.0
     */
    async addPool(config: PoolConfig): Promise<void> {
        await this.requirePoolManager().addPool(config);
    }

    /**
     * Removes a connection pool (v1-compat).
     * @since v1.3.0
     */
    async removePool(name: string): Promise<void> {
        await this.requirePoolManager().removePool(name);
    }

    /**
     * Returns all connection pool names (v1-compat).
     * @since v1.3.0
     */
    getPoolNames(): string[] {
        return this.requirePoolManager().getPoolNames();
    }

    /**
     * Returns connection pool statistics (v1-compat).
     * @since v1.3.0
     */
    getPoolStats(): PoolStats[] {
        return Object.values(this.requirePoolManager().getPoolStats()) as PoolStats[];
    }

    /**
     * Returns connection pool health status (v1-compat).
     * @since v1.3.0
     */
    getPoolHealth(): PoolHealthStatus[] {
        return Object.values(this.requirePoolManager().getHealthStatus()) as PoolHealthStatus[];
    }

    /**
     * Returns lock statistics (v1-compat).
     * @since v1.3.0
     */
    getLockStats(): LockStats | null {
        return this._lockManager?.getStats() ?? null;
    }

    /**
     * Lists all databases (v1-compat; delegates to the default db accessor).
     * @since v1.3.0
     */
    async listDatabases(options: { nameOnly?: boolean } = {}): Promise<Array<{ name: string; sizeOnDisk: number; empty: boolean }> | string[]> {
        this.ensureConnected();
        const dbAccessor = this.db();
        return dbAccessor.listDatabases(options);
    }

    /**
     * Drops the specified database (v1-compat; delegates to the default db accessor).
     * @since v1.3.0
     */
    async dropDatabase(options: { confirm: boolean; allowProduction?: boolean; user?: string } = { confirm: false }): Promise<{ dropped: boolean; database: string; timestamp: Date }> {
        this.ensureConnected();
        const dbAccessor = this.db();
        return dbAccessor.dropDatabase(options);
    }

    /**
     * Lists all collections in the current database (v1-compat).
     * @since v1.3.0
     */
    async listCollections(filter: Record<string, unknown> = {}, options: Record<string, unknown> = {}): Promise<Array<{ name: string; type: string }>> {
        this.ensureConnected();
        const dbAccessor = this.db();
        return dbAccessor.listCollections(filter, options);
    }

    /**
     * Executes a raw database command (v1-compat).
     * @since v1.3.0
     */
    async runCommand(command: Record<string, unknown>, options: Record<string, unknown> = {}): Promise<Record<string, unknown>> {
        this.ensureConnected();
        const dbAccessor = this.db();
        return dbAccessor.runCommand(command, options);
    }

    private ensureConnected(): void {
        if (!this._connected) {
            throw createError(ErrorCodes.NOT_CONNECTED, 'Database is not connected. Please call connect() first.');
        }
    }

    private createRuntimeAccessors(): {
        collection: (name: string) => CollectionFacade;
        db: (name?: string) => DbFacade;
        use: (name: string) => { collection: (collectionName: string) => CollectionFacade; model: <TDocument = Record<string, unknown>>(modelName: string) => ModelInstance<TDocument>; };
        instance: MonSQLizeRuntime;
    } {
        // Capture defaultDb at connect-time to avoid circular reference when tests do:
        //   const { collection } = await msq.connect();
        //   msq.collection = collection;  // overwrites prototype method
        //   msq.collection('users')       // would recurse infinitely if we called this.collection(name)
        const defaultDb = this._defaultDb!;
        return {
            collection: (name: string) => {
                if (!name || typeof name !== 'string' || !name.trim()) {
                    const err = new Error('Collection name must be a non-empty string') as Error & { code: string };
                    err.code = 'INVALID_COLLECTION_NAME';
                    throw err;
                }
                if (!this._iidCache) this._iidCache = new Map();
                return defaultDb.collection(name);
            },
            db: (name?: string) => this.db(name),
            use: (name: string) => this.use(name),
            instance: this,
        };
    }

    private resolveDatabaseName(): string {
        return (this.options as Record<string, unknown>)['database'] as string | undefined
            ?? this.options.databaseName
            ?? 'default';
    }

    private getTransactionManager(): TransactionManager {
        if (!this._client) {
            throw createError(ErrorCodes.NOT_CONNECTED, 'MonSQLize is not connected yet.');
        }
        if (!this._transactionManager) {
            this._transactionManager = new TransactionManager({
                client: this._client,
                cache: this._cache,
                logger: this.options.logger ?? null,
                lockManager: this._cacheLockManager,
            });
        }
        return this._transactionManager;
    }

    private getLockManager(): LockManager {
        if (!this._lockManager) {
            this._lockManager = new LockManager({
                logger: this.options.logger ?? null,
            });
        }
        return this._lockManager;
    }

    private async ensurePoolManager(): Promise<ConnectionPoolManager | null> {
        if (!this.options.pools?.length) {
            return null;
        }
        if (this._poolManager) {
            return this._poolManager;
        }
        this._poolManager = new ConnectionPoolManager({
            pools: this.options.pools,
            poolStrategy: this.options.poolStrategy,
            poolFallback: this.options.poolFallback,
            maxPoolsCount: this.options.maxPoolsCount,
            logger: this.options.logger ?? null,
        });
        for (const pool of this.options.pools) {
            await this._poolManager.addPool(pool);
        }
        this._poolManager.startHealthCheck();
        return this._poolManager;
    }

    /**
     * Automatically loads Model definition files from the configured path (mirrors v1 behavior).
     *
     * Supports two configuration formats:
     * - String: `models: './models'` → scans for `*.model.{js,ts,mjs,cjs}`, non-recursive
     * - Object: `models: { path, pattern?, recursive? }` → full control
     *
     * Each file must export an object containing a `name` field (i.e. the argument to Model.define()).
     */
    async _loadModels(opts: { reload?: boolean } = {}): Promise<void> {
        const modelsConfig = this.options.models;
        if (!modelsConfig) return;
        if (typeof modelsConfig !== 'string' && typeof modelsConfig !== 'object') return;

        const { readdirSync } = await import('node:fs');
        const { resolve, join, isAbsolute } = await import('node:path');
        const { createRequire } = await import('node:module');

        let targetPath: string;
        let pattern: string;
        let recursive: boolean;

        if (typeof modelsConfig === 'string') {
            targetPath = isAbsolute(modelsConfig) ? modelsConfig : resolve(process.cwd(), modelsConfig);
            pattern = '*.model.{js,ts,mjs,cjs}';
            recursive = false;
        } else {
            const p = modelsConfig.path;
            targetPath = isAbsolute(p) ? p : resolve(process.cwd(), p);
            pattern = modelsConfig.pattern ?? '*.model.{js,ts,mjs,cjs}';
            recursive = modelsConfig.recursive ?? false;
        }

        // Convert glob pattern to RegExp (support {a,b} alternation and * wildcard)
        const globToRegex = (glob: string): RegExp => {
            const escaped = glob
                .replace(/\./g, '\\.')
                .replace(/\{([^}]+)\}/g, (_, inner) => `(?:${inner.split(',').join('|')})`)
                .replace(/\*/g, '[^/\\\\]*');
            return new RegExp(`^${escaped}$`);
        };
        const filePattern = globToRegex(pattern);

        const collectFiles = (dir: string): string[] => {
            let entries: Array<{ name: string | Buffer; isDirectory(): boolean; isFile(): boolean }>;
            try {
                entries = readdirSync(dir, { withFileTypes: true }) as unknown as Array<{ name: string | Buffer; isDirectory(): boolean; isFile(): boolean }>;
            } catch {
                this._logger.warn(`[Models] cannot read directory: ${dir}`);
                return [];
            }
            const files: string[] = [];
            for (const entry of entries) {
                const entryName = typeof entry.name === 'string' ? entry.name : entry.name.toString();
                if (entry.isDirectory() && recursive) {
                    files.push(...collectFiles(join(dir, entryName)));
                } else if (entry.isFile() && filePattern.test(entryName)) {
                    files.push(join(dir, entryName));
                }
            }
            return files;
        };

        const files = collectFiles(targetPath);
        if (files.length === 0) return;

        const req = createRequire(resolve(process.cwd(), 'package.json'));
        for (const file of files) {
            try {
                delete req.cache[req.resolve(file)];
                // eslint-disable-next-line @typescript-eslint/no-require-imports
                const mod = req(file) as Record<string, unknown>;
                const definition = (mod.default ?? mod) as { name?: string; [key: string]: unknown };
                if (!definition?.name) {
                    this._logger.warn(`[Models] ${file}: exported object must have a 'name' field`);
                    continue;
                }
                if (opts.reload && Model.has(definition.name as string)) {
                    Model.redefine(definition.name as string, definition as ModelDefinition<unknown>);
                } else {
                    Model.define(definition.name as string, definition as ModelDefinition<unknown>);
                }
            } catch (err) {
                this._logger.warn(`[Models] failed to load ${file}`, err);
            }
        }
    }

    private async initializeSyncManager(): Promise<ChangeStreamSyncManager | null> {
        if (!this.options.sync?.enabled || !this._defaultDb) {
            return null;
        }
        if (this._syncManager) {
            return this._syncManager;
        }
        this._syncManager = new ChangeStreamSyncManager({
            db: this._defaultDb.raw(),
            poolManager: this._poolManager,
            config: this.options.sync,
            logger: this.options.logger ?? null,
        });
        try {
            await this._syncManager.start();
        } catch (error) {
            this._logger.warn('[Sync] failed to start automatically', error);
            this.emit('error', {
                type: this.options.type,
                db: this.resolveDatabaseName(),
                error: error instanceof Error ? error.message : String(error),
            });
        }
        return this._syncManager;
    }

    private initializeSlowQueryLogManager(): SlowQueryLogManager | null {
        if (!this.options.slowQueryLog || !this._client) {
            return null;
        }
        if (this._slowQueryLogManager) {
            return this._slowQueryLogManager;
        }
        // Wire slowQueryMs → slowQueryLog.filter.minExecutionTimeMs when not already set
        let slowQueryLogConfig = this.options.slowQueryLog;
        if (
            this.options.slowQueryMs !== undefined &&
            typeof slowQueryLogConfig === 'object' &&
            slowQueryLogConfig !== null
        ) {
            const config = slowQueryLogConfig as Partial<SlowQueryLogConfig>;
            if (!config.filter?.minExecutionTimeMs) {
                slowQueryLogConfig = {
                    ...config,
                    filter: {
                        ...config.filter,
                        minExecutionTimeMs: this.options.slowQueryMs,
                    },
                } as unknown as typeof slowQueryLogConfig;
            }
        }
        this._slowQueryLogManager = new SlowQueryLogManager(
            slowQueryLogConfig,
            this._client,
            'mongodb',
            this.options.logger ?? null,
        );
        return this._slowQueryLogManager;
    }

    private ensureSlowQueryLogManager(): SlowQueryLogManager {
        const manager = this.initializeSlowQueryLogManager();
        if (!manager) {
            throw createError(ErrorCodes.INVALID_CONFIG, 'MonSQLize slow query log is not enabled for this runtime.');
        }
        return manager;
    }

    private initializeSagaOrchestrator(): SagaOrchestrator {
        if (!this._sagaOrchestrator) {
            this._sagaOrchestrator = new SagaOrchestrator({
                logger: this.options.logger ?? null,
            });
        }
        return this._sagaOrchestrator;
    }

    private requirePoolManager(): ConnectionPoolManager {
        if (!this._poolManager) {
            throw createError(ErrorCodes.INVALID_CONFIG, 'MonSQLize pool() requires options.pools configuration.');
        }
        return this._poolManager;
    }

    private createModelInstance<TDocument = Record<string, unknown>>(
        name: string,
        scope: { database?: string; pool?: string; },
    ): ModelInstance<TDocument> {
        const registered = Model.get<TDocument>(name);
        if (!registered) {
            throw createError(ErrorCodes.MODEL_NOT_DEFINED, `Model '${name}' is not defined.`);
        }

        const databaseName = registered.definition.connection?.database ?? scope.database ?? this.resolveDatabaseName();
        const poolName = registered.definition.connection?.pool ?? scope.pool;
        const cacheKey = `${poolName ?? 'default'}:${databaseName}:${registered.collectionName}`;
        const revision = Model.getRevision(registered.collectionName);
        const cached = this._modelInstances.get(cacheKey);
        if (cached && cached.revision === revision) {
            return cached.instance as ModelInstance<TDocument>;
        }

        const instance = new ModelInstance<TDocument>(
            this.scopedCollection(registered.collectionName, { database: databaseName }) as never,
            this as never,
            {
                collectionName: registered.collectionName,
                dbName: databaseName,
                poolName,
                definition: registered.definition,
            },
        );
        this._modelInstances.set(cacheKey, {
            revision,
            instance: instance as ModelInstance<Record<string, unknown>>,
        });
        return instance;
    }
}


