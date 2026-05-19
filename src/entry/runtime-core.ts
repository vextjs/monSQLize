/**
 * MongoDB runtime 核心装配层。
 *
 * 说明：
 * - 这里负责 runtime 主类、能力装配、公共导出与默认配置收口。
 * - 查询 / 写入 / model / cache / transaction / pool 等具体语义由各自子模块实现，
 *   本文件只负责“装起来”和“对外暴露”，尽量不要继续堆具体业务逻辑。
 * - 维护边界：新增能力优先落在 capability / adapter 层，只有公共装配与主类 API
 *   才应该进入这里。
 */

import {
    MongoCollectionAccessor as CollectionFacade,
    MongoDbAccessor as DbFacade,
} from '../adapters/mongodb/common/accessors';
import type { RuntimeDefaults } from '../types/internal/query';
import type {
    AdapterBridgeLike,
    AutoConvertConfigPublic,
    ConnectResult,
    LegacyAdapterBridgeLike,
    ScopedUseResult,
} from '../types/internal/runtime';
import { EventEmitter } from 'node:events';
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
import {
    createExpression,
    compilePipelineExpressions,
    expr,
    hasExpressionInObject,
    hasExpressionInPipeline,
    isExpressionObject,
    type ExpressionObject,
} from '../core/expression';
import { ErrorCodes, createError, createConnectionError, createValidationError, createCursorError, createQueryTimeoutError } from '../core/errors';
import { validateRange } from '../utils/validation';
import { Logger, type LoggerLike } from '../core/logger';
import { encodeCursor, decodeCursor } from '../utils/cursor';
import type { HealthView } from '../../types/collection';
import type { MonSQLizeOptions } from '../../types/monsqlize';
import type { MultiLevelCacheOptions, MultiLevelCachePolicy, WritePolicy } from '../../types/runtime';
import type { SyncTargetHealthCheckConfig } from '../../types/sync';
import {
    buildRuntimeDefaults,
    createAndStartPoolManager,
    initAutoConvertConfig,
    loadModelFiles,
} from './capability-wiring';
import {
    buildPublicDefaults,
    createRuntimeDbFacade,
    createRuntimeModelHost,
    createRuntimeModelInstance,
    createRuntimeAccessors,
    resolveDatabaseName,
    type RuntimeDbFacadeHost,
    type RuntimeModelHost,
} from './runtime-helpers';
import {
    asRuntimeCompatRecord,
    assertCompatPoolExists,
    createCompatModelInstance,
    createPoolScope,
    getCompatModelInstanceCache,
    getRegisteredModelMetadata,
    getRuntimeDatabaseName,
    requireCompatDbInstance,
    requireCompatPoolManagerRecord,
    type RuntimeCompatRecord,
    type RuntimeDbInstanceLike,
    type RuntimePoolScopeHost,
} from './runtime-compat-accessors';
import { createRuntimeAdapterBridge, type RuntimeAdapterBridgeHost } from './runtime-admin-bridge';
import {
    ensureRuntimeSlowQueryLogManager,
    getOrCreateLockManager,
    getOrCreateSagaOrchestrator,
    getOrCreateTransactionManager,
    initializeRuntimeSlowQueryLogManager,
    initializeRuntimeSyncManager,
    requireRuntimePoolManager,
} from './runtime-capability-factories';
import { resolveScopedCollection } from './runtime-scoped-collection';

// 所有公共符号统一从桶形导出文件重新导出，保持公开 API 不变
export * from './runtime-exports';

type RuntimeAdapterSurface = LegacyAdapterBridgeLike;

/**
 * monSQLize TypeScript runtime 的核心入口。
 *
 * 职责：
 * - 管理 MongoDB 连接生命周期
 * - 对外暴露 `collection()` / `db()` / `use()` / `pool()` 等运行时访问入口
 * - 装配 cache、function-cache、model、transaction、lock、pool、sync、slow-query-log、saga 等能力
 * - 作为包根导出与 `connect()` 返回的 runtime host
 *
 * @since v1.3.0
 */
export class MonSQLizeRuntime {
    private _connected = false;
    private readonly _cache: MemoryCache;
    private _adapterCacheOverride: MemoryCache | null | undefined;
    private readonly _adapterBridge: RuntimeAdapterSurface;
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
    private _iidCache: MemoryCache | null = null;
    private readonly _modelInstances = new MemoryCache({
        maxEntries: 100_000,
        enableStats: false,
    });
    private _connectionPromise: Promise<ConnectResult<MonSQLizeRuntime>> | null = null;

    /** v1 兼容：以公开属性形式暴露 defaults（冻结对象）。 */
    readonly defaults: Readonly<Record<string, unknown>>;

    /** v1 兼容：以公开属性形式暴露 autoConvertConfig。 */
    readonly autoConvertConfig: AutoConvertConfigPublic;

    /** v1 兼容：公开 logger 访问入口（测试可能会 monkey-patch `.warn/.info`）。 */
    get logger(): Logger {
        return this._logger;
    }

    constructor(public readonly options: MonSQLizeOptions = {}) {
        const type = options.type;
        if (type !== 'mongodb') {
            throw createError(ErrorCodes.UNSUPPORTED_DATABASE, 'Invalid database type. Supported types are: mongodb');
        }
        this.options = {
            ...options,
            type,
        };
        // v1 兼容：在构造阶段就校验关键参数。
        if (options.maxTimeMS !== undefined && options.maxTimeMS !== null) {
            validateRange(options.maxTimeMS, 1, 300000, 'maxTimeMS');
        }
        if (options.findLimit !== undefined && options.findLimit !== null) {
            validateRange(options.findLimit, 1, 10000, 'findLimit');
        }
        if (options.findPageMaxLimit !== undefined && options.findPageMaxLimit !== null) {
            validateRange(options.findPageMaxLimit, 1, 10000, 'findPageMaxLimit');
        }
        this._cache = normalizeRuntimeCache(options.cache as Record<string, unknown> | MemoryCache | undefined);
        this._logger = Logger.create(options.logger ?? null);
        this._cacheLockManager = new CacheLockManager({ logger: options.logger ?? null });
        this._cache.setLockManager(this._cacheLockManager);
        this._runtimeDefaults = buildRuntimeDefaults(options);
        this._adapterCacheOverride = undefined;
        this._adapterBridge = createRuntimeAdapterBridge(this.createAdapterBridgeHost());
        this.defaults = buildPublicDefaults(options);
        // v1 兼容：初始化 autoConvertConfig（委托给 capability-wiring 纯函数）。
        this.autoConvertConfig = initAutoConvertConfig(options.autoConvertObjectId, options.type);
    }

    async connect(): Promise<ConnectResult<MonSQLizeRuntime>> {
        if (this._connected) {
            return this.createAccessors();
        }

        if (this._connectionPromise) {
            return this._connectionPromise;
        }

        this._connectionPromise = (async () => {
            const databaseName = resolveDatabaseName(this.options);
            const { client } = await connectMongo({
                databaseName,
                config: this.options.config,
                logger: this._logger,
            });
            this._client = client;
            this._defaultDb = this.createDbFacade(databaseName);
            if (!this._poolManager) {
                this._poolManager = await createAndStartPoolManager(this.options);
            }
            this.initializeSagaOrchestrator();
            this.initializeSlowQueryLogManager();
            await this.initializeSyncManager();
            this._connected = true;
            await this._loadModels();
            this.emit('connected', {
                type: this.options.type,
                db: databaseName,
            });
            return this.createAccessors();
        })();

        try {
            return await this._connectionPromise;
        } catch (error) {
            // Clean up partially initialized resources so a retry starts fresh.
            // Only runs when _connected is still false (i.e., failure before the
            // point-of-no-return assignment), which means client/pool may have
            // been created but never handed off to callers.
            if (!this._connected) {
                const clientToClose = this._client;
                const poolToClose = this._poolManager;
                this._client = null;
                this._defaultDb = null;
                this._poolManager = null;
                clientToClose?.close().catch(() => {});
                poolToClose?.close().catch(() => {});
            }
            this.emit('error', {
                type: this.options.type,
                db: resolveDatabaseName(this.options),
                error: error instanceof Error ? error.message : String(error),
            });
            throw error;
        } finally {
            this._connectionPromise = null;
        }
    }

    getCache(): MemoryCache { return this._cache; }

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

    async close(): Promise<void> {
        // Run async cleanup concurrently; a single failure must not skip remaining steps.
        const results = await Promise.allSettled([
            this._syncManager?.stop(),
            this._slowQueryLogManager?.close(),
            this._transactionManager?.abortAll(),
            this._poolManager?.close(),
        ]);
        for (const result of results) {
            if (result.status === 'rejected') {
                this._logger.warn('[MonSQLizeRuntime] cleanup error during close', result.reason);
            }
        }
        // Synchronous cleanup — order matters: locks before mongo client.
        this._cacheLockManager.stop();
        this._lockManager?.close();
        await closeMongo(this._client, this._logger);
        // Reset all state references.
        this._client = null;
        this._defaultDb = null;
        this._connected = false;
        this._poolManager = null;
        this._syncManager = null;
        this._slowQueryLogManager = null;
        this._transactionManager = null;
        this._lockManager = null;
        this._sagaOrchestrator = null;
        this._iidCache = null;
        this._modelInstances.clear();
        this.emit('closed', {
            type: this.options.type,
            db: resolveDatabaseName(this.options),
        });
    }

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

    // v1 直接暴露 cache / _adapter / dbInstance / _connecting，这里保持同名桥接。
    get cache(): MemoryCache { return this._cache; }

    get _adapter(): RuntimeAdapterSurface | null {
        if (this._client === null) return null;
        return this._adapterBridge;
    }

    get dbInstance(): { collection: (name: string) => unknown; db: (name?: string) => unknown } | null {
        if (this._client === null) return null;
        return {
            collection: (name: string) => this.collection(name),
            db: (name?: string) => this.db(name),
        };
    }

    get _connecting(): Promise<unknown> | null { return this._connectionPromise; }

    // 根访问器 ----------------------------------------------------------
    collection(name: string): CollectionFacade {
        if (!name || typeof name !== 'string' || !name.trim()) {
            const err = new Error('Collection name must be a non-empty string') as Error & { code: string };
            err.code = 'INVALID_COLLECTION_NAME';
            throw err;
        }
        const dbInstance = requireCompatDbInstance(this);
        // v2 path: delegate to db().collection() via MongoClient
        if (this._client) {
            return this.db().collection(name);
        }
        // v1 compat path: delegate via dbInstance
        return dbInstance.collection(name) as CollectionFacade;
    }

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
        const databaseName = name ?? resolveDatabaseName(this.options);
        if (databaseName === resolveDatabaseName(this.options) && this._defaultDb) {
            return this._defaultDb;
        }
        return this.createDbFacade(databaseName);
    }

    private resolveAdapterCache(): MemoryCache | null {
        return this._adapterCacheOverride === undefined ? this._cache : this._adapterCacheOverride;
    }

    private setAdapterCache(value: MemoryCache | null): void {
        this._adapterCacheOverride = value;
    }

    use(name: string): ScopedUseResult {
        requireCompatDbInstance(this);
        return {
            collection: (collectionName: string) => this.scopedCollection(collectionName, { database: name }),
            model: <TDocument = Record<string, unknown>>(modelName: string) => this.scopedModel<TDocument>(modelName, { database: name }),
        };
    }

    pool(poolName: string): {
        collection: (name: string) => CollectionFacade;
        model: <TDocument = Record<string, unknown>>(name: string) => ModelInstance<TDocument>;
        use: (dbName: string) => { collection: (name: string) => CollectionFacade; model: <TDocument = Record<string, unknown>>(name: string) => ModelInstance<TDocument>; };
    } {
        requireCompatDbInstance(this);
        const poolManager = requireCompatPoolManagerRecord(this);
        assertCompatPoolExists(poolManager, poolName);
        return createPoolScope(this, poolName);
    }

    scopedCollection(name: string, options: { database?: string; pool?: string; } = {}): CollectionFacade {
        requireCompatDbInstance(this);
        const { pool, database } = options;
        if (!pool && !database) {
            return this.collection(name);
        }
        return this._resolveModelCollection(name, { pool, database }) as CollectionFacade;
    }

    _resolveModelCollection(collectionName: string, connection: { pool?: string; database?: string }): unknown {
        return resolveScopedCollection({
            collectionName,
            connection,
            options: this.options,
            self: asRuntimeCompatRecord(this),
            client: this._client,
            poolManager: this._poolManager,
            cache: this._cache,
            logger: this._logger,
            runtimeDefaults: this._runtimeDefaults,
            db: (name?: string) => this.db(name),
        });
    }

    // Model 访问器 ---------------------------------------------------------
    scopedModel<TDocument = Record<string, unknown>>(name: string, options: { database?: string; pool?: string; } = {}): ModelInstance<TDocument> {
        const dbInstance = requireCompatDbInstance(this);
        // v2 路径：使用 createModelInstance（处理连接与缓存）
        if (this._client) {
            return this.createModelInstance<TDocument>(name, options);
        }
        // v1 兼容路径：v1 风格的实现（带连接合并）
        const registered = Model.get<TDocument>(name);
        if (!registered) {
            throw createError(ErrorCodes.MODEL_NOT_DEFINED, `Model '${name}' is not defined. Call Model.define() first.`);
        }
        const { actualCollectionName, connection } = getRegisteredModelMetadata(registered);
        // v1 连接合并：definition.connection 作为兜底，opts 优先级更高
        const merged: Record<string, unknown> = { ...(connection ?? {}), ...options };
        const { pool, database } = merged as { pool?: string; database?: string };
        const collection = (pool || database)
            ? this._resolveModelCollection(actualCollectionName, { pool, database })
            : dbInstance.collection(actualCollectionName);
        return createCompatModelInstance<TDocument>({
            collection,
            runtime: this,
            collectionName: actualCollectionName,
            dbName: database ?? getRuntimeDatabaseName(this),
            poolName: pool,
            definition: registered.definition,
        });
    }

    model<TDocument = Record<string, unknown>>(name: string): ModelInstance<TDocument> {
        // v2 路径
        if (this._client) {
            this.ensureConnected();
            return this.createModelInstance<TDocument>(name, {
                database: resolveDatabaseName(this.options),
            });
        }
        // v1 兼容路径：镜像 v1 model() — 检查 dbInstance，延迟初始化 _modelInstances 缓存
        const dbInstance = requireCompatDbInstance(this);

        // 缓存命中 + _redefinedNames 失效检查
        const cache = getCompatModelInstanceCache(this);
        if (cache.has(name)) {
            if (!Model._redefinedNames.has(name)) {
                return cache.get(name) as ModelInstance<TDocument>;
            }
            cache.del(name);
            Model._redefinedNames.delete(name);
        }

        const registered = Model.get<TDocument>(name);
        if (!registered) {
            throw createError(ErrorCodes.MODEL_NOT_DEFINED, `Model '${name}' is not defined.`);
        }
        const { actualCollectionName, connection } = getRegisteredModelMetadata(registered);
        const collection = (connection && (connection.pool || connection.database))
            ? this._resolveModelCollection(actualCollectionName, connection)
            : dbInstance.collection(actualCollectionName);
        const instance = createCompatModelInstance<TDocument>({
            collection,
            runtime: this,
            collectionName: actualCollectionName,
            dbName: getRuntimeDatabaseName(this),
            definition: registered.definition,
        });
        cache.set(name, instance as ModelInstance<Record<string, unknown>>);
        return instance;
    }

    // 能力委托 ----------------------------------------------------
    async startSession(options: TransactionOptions = {}): Promise<Transaction> {
        this.ensureConnected();
        return this.getTransactionManager().startSession(options);
    }

    async withTransaction<T>(callback: (transaction: Transaction) => Promise<T>, options: TransactionOptions = {}): Promise<T> {
        this.ensureConnected();
        return this.getTransactionManager().withTransaction(callback, options);
    }

    async withLock<T>(key: string, callback: () => Promise<T>, options: LockOptions = {}): Promise<T> {
        this.ensureConnected();
        return this.getLockManager().withLock(key, callback, options);
    }

    async acquireLock(key: string, options: LockOptions = {}): Promise<Lock> {
        this.ensureConnected();
        return this.getLockManager().acquireLock(key, options);
    }

    async tryAcquireLock(key: string, options: Omit<LockOptions, 'retryTimes'> = {}): Promise<Lock | null> {
        this.ensureConnected();
        return this.getLockManager().tryAcquireLock(key, options);
    }

    getSyncManager(): ChangeStreamSyncManager | null { return this._syncManager; }
    getSlowQueryLogManager(): SlowQueryLogManager | null { return this._slowQueryLogManager; }
    getSagaOrchestrator(): SagaOrchestrator { return this.initializeSagaOrchestrator(); }
    saga(): SagaOrchestrator { return this.getSagaOrchestrator(); }
    async recordSlowQuery(log: SlowQueryLogEntry): Promise<void> {
        this.ensureConnected();
        const manager = this.ensureSlowQueryLogManager();
        await manager.save(log);
        this.emit('slow-query', log);
        this.emit('query', log);
    }

    async getSlowQueryLogs(filter: SlowQueryLogFilter = {}, options: SlowQueryLogQueryOptions = {}): Promise<SlowQueryLogRecord[]> {
        this.ensureConnected();
        const manager = this.ensureSlowQueryLogManager();
        return manager.query(filter, options);
    }

    defineSaga(definition: SagaDefinition): void { this.initializeSagaOrchestrator().define(definition); }
    async executeSaga(name: string, data: unknown): Promise<SagaResult> { return this.initializeSagaOrchestrator().execute(name, data); }
    async listSagas(): Promise<string[]> { return this.initializeSagaOrchestrator().listSagas(); }
    getSagaStats(): SagaStats { return this.initializeSagaOrchestrator().getStats(); }
    async startSync(): Promise<void> {
        this.ensureConnected();
        const manager = await this.initializeSyncManager();
        if (!manager) {
            throw createError(ErrorCodes.INVALID_CONFIG, 'MonSQLize sync is not enabled for this runtime.');
        }
        await manager.start();
    }

    async stopSync(): Promise<void> { await this._syncManager?.stop(); }
    getSyncStats(): SyncStats | null { return this._syncManager?.getStats() ?? null; }
    on(event: string, handler: (payload: unknown) => void): void { this._events.on(event, handler); }
    once(event: string, handler: (payload: unknown) => void): void { this._events.once(event, handler); }
    off(event: string, handler: (payload: unknown) => void): void { this._events.off(event, handler); }
    emit(event: string, payload: unknown): void {
        if (event === 'error' && this._events.listenerCount('error') === 0) {
            this._logger.error('[MonSQLizeRuntime] error event', payload);
            return;
        }
        this._events.emit(event, payload);
    }

    async addPool(config: PoolConfig): Promise<void> { await this.requirePoolManager().addPool(config); }
    async removePool(name: string): Promise<void> { await this.requirePoolManager().removePool(name); }
    getPoolNames(): string[] { return this.requirePoolManager().getPoolNames(); }
    getPoolStats(): PoolStats[] { return Object.values(this.requirePoolManager().getPoolStats()) as PoolStats[]; }
    getPoolHealth(): PoolHealthStatus[] { return Object.values(this.requirePoolManager().getHealthStatus()) as PoolHealthStatus[]; }
    getLockStats(): LockStats | null { return this._lockManager?.getStats() ?? null; }
    async listDatabases(options: { nameOnly?: boolean } = {}): Promise<Array<{ name: string; sizeOnDisk: number; empty: boolean }> | string[]> { this.ensureConnected(); return this.db().listDatabases(options); }
    async dropDatabase(options: { confirm: boolean; allowProduction?: boolean; user?: string } = { confirm: false }): Promise<{ dropped: boolean; database: string; timestamp: Date }> { this.ensureConnected(); return this.db().dropDatabase(options); }
    async listCollections(filter: Record<string, unknown> = {}, options: Record<string, unknown> = {}): Promise<Array<{ name: string; type: string }>> { this.ensureConnected(); return this.db().listCollections(filter, options); }
    async runCommand(command: Record<string, unknown>, options: Record<string, unknown> = {}): Promise<Record<string, unknown>> { this.ensureConnected(); return this.db().runCommand(command, options); }

    private ensureConnected(): void {
        if (!this._connected) {
            throw createError(ErrorCodes.NOT_CONNECTED, 'Database is not connected. Please call connect() first.');
        }
    }

    private createAccessors(): ConnectResult<MonSQLizeRuntime> {
        return createRuntimeAccessors({
            defaultDb: this._defaultDb!,
            runtime: this,
            db: (name?: string) => this.db(name),
            use: (name: string) => this.use(name),
            getIidCache: () => this._iidCache,
            setIidCache: (value) => {
                this._iidCache = value;
            },
        });
    }

    private createDbFacade(databaseName: string): DbFacade {
        return createRuntimeDbFacade(this.createDbFacadeHost(), databaseName);
    }

    private getTransactionManager(): TransactionManager {
        this._transactionManager = getOrCreateTransactionManager({
            current: this._transactionManager,
            client: this._client,
            cache: this._cache,
            logger: this.options.logger ?? null,
            lockManager: this._cacheLockManager,
        });
        return this._transactionManager;
    }

    private getLockManager(): LockManager {
        this._lockManager = getOrCreateLockManager(this._lockManager, this.options.logger ?? null);
        return this._lockManager;
    }

    async _loadModels(opts: { reload?: boolean } = {}): Promise<void> {
        await loadModelFiles(this.options, this._logger, opts);
    }

    private async initializeSyncManager(): Promise<ChangeStreamSyncManager | null> {
        this._syncManager = await initializeRuntimeSyncManager({
            enabled: !!this.options.sync?.enabled,
            defaultDb: this._defaultDb,
            current: this._syncManager,
            poolManager: this._poolManager,
            sync: this.options.sync!,
            logger: this.options.logger ?? null,
            onStartFailure: (error) => {
                this._logger.warn('[Sync] failed to start automatically', error);
                this.emit('error', {
                    type: this.options.type,
                    db: resolveDatabaseName(this.options),
                    error: error instanceof Error ? error.message : String(error),
                });
            },
        });
        return this._syncManager;
    }

    private initializeSlowQueryLogManager(): SlowQueryLogManager | null {
        this._slowQueryLogManager = initializeRuntimeSlowQueryLogManager({
            current: this._slowQueryLogManager,
            slowQueryLog: this.options.slowQueryLog,
            slowQueryMs: this.options.slowQueryMs,
            client: this._client,
            logger: this.options.logger ?? null,
        });
        return this._slowQueryLogManager;
    }

    private ensureSlowQueryLogManager(): SlowQueryLogManager {
        return ensureRuntimeSlowQueryLogManager(this.initializeSlowQueryLogManager());
    }

    private initializeSagaOrchestrator(): SagaOrchestrator {
        this._sagaOrchestrator = getOrCreateSagaOrchestrator(this._sagaOrchestrator, this.options.logger ?? null);
        return this._sagaOrchestrator;
    }

    private requirePoolManager(): ConnectionPoolManager {
        return requireRuntimePoolManager(this._poolManager);
    }

    private createModelInstance<TDocument = Record<string, unknown>>(
        name: string,
        scope: { database?: string; pool?: string; },
    ): ModelInstance<TDocument> {
        return createRuntimeModelInstance(this.createModelHost(), name, scope);
    }

    private createAdapterBridgeHost(): RuntimeAdapterBridgeHost {
        const self = this;
        return {
            options: self.options,
            get _defaultDb() { return self._defaultDb; },
            get _client() { return self._client; },
            get _iidCache() { return self._iidCache; },
            _runtimeDefaults: self._runtimeDefaults,
            get _slowQueryLogManager() { return self._slowQueryLogManager; },
            resolveAdapterCache: () => self.resolveAdapterCache(),
            setAdapterCache: (value) => self.setAdapterCache(value),
            initializeSlowQueryLogManager: () => self.initializeSlowQueryLogManager(),
            ensureConnected: () => self.ensureConnected(),
            db: (name?: string) => self.db(name),
            emit: (event: string, payload: unknown) => self.emit(event, payload),
        };
    }

    private createDbFacadeHost(): RuntimeDbFacadeHost {
        if (!this._client) {
            throw createError(ErrorCodes.NOT_CONNECTED, 'MonSQLize is not connected yet.');
        }
        return {
            options: this.options,
            _client: this._client,
            _logger: this._logger,
            _runtimeDefaults: this._runtimeDefaults,
            resolveAdapterCache: () => this.resolveAdapterCache(),
        };
    }

    private createModelHost(): RuntimeModelHost {
        return createRuntimeModelHost({
            options: this.options,
            modelInstances: this._modelInstances,
            runtime: this,
            scopedCollection: <TDocument = Record<string, unknown>>(name: string, options?: { database?: string; pool?: string }) =>
                this.scopedCollection(name, options),
        });
    }
}

function normalizeRuntimeCache(
    cache?: Record<string, unknown> | MemoryCache,
): MemoryCache {
    if (cache instanceof MemoryCache) {
        return cache;
    }

    const input = (cache ?? {}) as Record<string, unknown>;

    return new MemoryCache({
        maxEntries: toOptionalNumber(input.maxEntries ?? input.maxSize),
        maxMemory: toOptionalNumber(input.maxMemory),
        defaultTtl: toOptionalNumber(input.defaultTtl ?? input.ttl),
        enableStats: toOptionalBoolean(input.enableStats),
        enableTags: toOptionalBoolean(input.enableTags),
        cleanupInterval: toOptionalNumber(input.cleanupInterval),
        enabled: toOptionalBoolean(input.enabled),
    });
}

function toOptionalNumber(value: unknown): number | undefined {
    return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function toOptionalBoolean(value: unknown): boolean | undefined {
    return typeof value === 'boolean' ? value : undefined;
}


