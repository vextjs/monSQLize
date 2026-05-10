/**
 * P2-A 运行时核心骨架。
 *
 * 说明：
 * - 本阶段恢复真实 MongoDB connect/db/collection 访问链路。
 * - 更完整的 query/write/model 等运行时语义仍在后续 P2-B~P4 逐批补齐。
 */

import {
    MongoCollectionAccessor as CollectionFacade,
    MongoDbAccessor as DbFacade,
} from '../adapters/mongodb/common/accessors';
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
    SlowQueryLogConfigManager,
    SlowQueryLogManager,
    generateQueryHash,
    type SlowQueryLogConfig,
    type SlowQueryLogConfigInput,
    type SlowQueryLogEntry,
    type SlowQueryLogFilter,
    type SlowQueryLogQueryOptions,
    type SlowQueryLogRecord,
} from '../capabilities/slow-query-log';
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
import { closeMongo, connectMongo, type MongoConnectConfig } from '../adapters/mongodb/common/connect';
import { createExpression, expr, type ExpressionObject } from '../core/expression';
import { ErrorCodes, createError } from '../core/errors';
import { Logger, type LoggerLike } from '../core/logger';

export { CollectionFacade, DbFacade, Logger, MemoryCache, createRedisCacheAdapter, DistributedCacheInvalidator };
export { FunctionCache, withCache };
export { Model };
export { createExpression, expr };
export { ConnectionPoolManager };
export { ChangeStreamSyncManager, ResumeTokenStore, validateSyncConfig };
export { BatchQueue, SlowQueryLogConfigManager, SlowQueryLogManager, generateQueryHash };
export { SagaOrchestrator };
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
    TransactionOptions,
    TransactionStats,
    ValidationResult,
    VirtualConfig,
    WithCacheOptions,
};

export { Transaction, TransactionManager, CacheLockManager, Lock, LockAcquireError, LockTimeoutError, LockManager };

export interface MonSQLizeOptions {
    type?: 'mongodb';
    databaseName?: string;
    config?: MongoConnectConfig;
    cache?: Record<string, unknown> | MemoryCache;
    logger?: LoggerLike | null;
    pools?: PoolConfig[];
    poolStrategy?: PoolStrategy;
    poolFallback?: ConnectionPoolManagerOptions['poolFallback'];
    maxPoolsCount?: number;
    sync?: SyncConfig;
    slowQueryLog?: SlowQueryLogConfigInput;
}


export interface HealthView {
    status: 'up' | 'down';
    connected: boolean;
    defaults?: Record<string, unknown>;
    cache?: Record<string, unknown>;
}

export class MonSQLizeRuntime {
    private _connected = false;
    private readonly _cache: MemoryCache;
    private readonly _logger: Logger;
    private readonly _events = new EventEmitter();
    private readonly _cacheLockManager: CacheLockManager;
    private _client: Awaited<ReturnType<typeof connectMongo>>['client'] | null = null;
    private _defaultDb: DbFacade | null = null;
    private _poolManager: ConnectionPoolManager | null = null;
    private _syncManager: ChangeStreamSyncManager | null = null;
    private _slowQueryLogManager: SlowQueryLogManager | null = null;
    private _sagaOrchestrator: SagaOrchestrator | null = null;
    private _transactionManager: TransactionManager | null = null;
    private _lockManager: LockManager | null = null;
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

    constructor(public readonly options: MonSQLizeOptions = {}) {
        const type = options.type ?? 'mongodb';
        if (type !== 'mongodb') {
            throw createError(ErrorCodes.UNSUPPORTED_DATABASE, 'Invalid database type. Supported types are: mongodb');
        }
        this.options = {
            ...options,
            type,
        };
        this._cache = MemoryCache.getOrCreateCache(options.cache);
        this._logger = Logger.create(options.logger ?? null);
        this._cacheLockManager = new CacheLockManager({ logger: options.logger ?? null });
        this._cache.setLockManager(this._cacheLockManager);
    }

    /**
     * 连接数据库并建立访问器。
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
                cache: this._cache,
                logger: this._logger,
            });
            await this.ensurePoolManager();
            this.initializeSagaOrchestrator();
            this.initializeSlowQueryLogManager();
            await this.initializeSyncManager();
            this._connected = true;
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
     * 获取缓存实例。
     * @since v1.3.0
     */
    getCache(): MemoryCache {
        return this._cache;
    }

    /**
     * 获取默认配置。
     * @since v1.3.0
     */
    getDefaults(): Record<string, unknown> {
        return {
            type: this.options.type,
            databaseName: this.options.databaseName,
            sync: this.options.sync,
            slowQueryLog: this.options.slowQueryLog ?? false,
        };
    }

    /**
     * 关闭连接。
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
        this._modelInstances.clear();
        this.emit('closed', {
            type: this.options.type,
            db: this.resolveDatabaseName(),
        });
    }

    /**
     * 健康检查。
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
     * 获取 Collection 访问器。
     * @since v1.3.0
     */
    collection(name: string): CollectionFacade {
        this.ensureConnected();
        return this.db().collection(name);
    }

    /**
     * 获取 Db 访问器。
     * @since v1.3.0
     */
    db(name?: string): DbFacade {
        this.ensureConnected();
        if (!this._client) {
            throw createError(ErrorCodes.NOT_CONNECTED, 'MonSQLize is not connected yet.');
        }
        const databaseName = name ?? this.resolveDatabaseName();
        if (databaseName === this.resolveDatabaseName() && this._defaultDb) {
            return this._defaultDb;
        }
        return new DbFacade(databaseName, this._client.db(databaseName), {
            cache: this._cache,
            logger: this._logger,
        });
    }

    /**
     * 获取指定数据库访问器。
     * @since v1.3.0
     */
    use(name: string): { collection: (collectionName: string) => CollectionFacade; model: <TDocument = Record<string, unknown>>(modelName: string) => ModelInstance<TDocument>; } {
        this.ensureConnected();
        const db = this.db(name);
        return {
            collection: (collectionName: string) => db.collection(collectionName),
            model: <TDocument = Record<string, unknown>>(modelName: string) => this.scopedModel<TDocument>(modelName, { database: name }),
        };
    }

    /**
     * 获取连接池访问器。
     * @since v1.3.0
     */
    pool(poolName: string): {
        collection: (name: string) => CollectionFacade;
        model: <TDocument = Record<string, unknown>>(name: string) => ModelInstance<TDocument>;
        use: (dbName: string) => { collection: (name: string) => CollectionFacade; model: <TDocument = Record<string, unknown>>(name: string) => ModelInstance<TDocument>; };
    } {
        this.ensureConnected();
        const databaseName = this.resolveDatabaseName();
        this.requirePoolManager().getPool(poolName);
        return {
            collection: (name: string) => this.scopedCollection(name, { database: databaseName, pool: poolName }),
            model: <TDocument = Record<string, unknown>>(name: string) => this.scopedModel<TDocument>(name, { database: databaseName, pool: poolName }),
            use: (dbName: string) => ({
                collection: (name: string) => this.scopedCollection(name, { database: dbName, pool: poolName }),
                model: <TDocument = Record<string, unknown>>(name: string) => this.scopedModel<TDocument>(name, { database: dbName, pool: poolName }),
            }),
        };
    }

    /**
     * 获取限定数据库的 Collection 访问器。
     * @since v1.3.0
     */
    scopedCollection(name: string, options: { database?: string; pool?: string; } = {}): CollectionFacade {
        this.ensureConnected();
        if (options.pool) {
            const databaseName = options.database ?? this.resolveDatabaseName();
            const selected = this.requirePoolManager().selectPool('read', {
                pool: options.pool,
                databaseName,
            });
            return new CollectionFacade(
                databaseName,
                name,
                selected.collection(databaseName, name),
                {
                    cache: this._cache,
                    logger: this._logger,
                },
            );
        }
        return this.db(options.database ?? this.resolveDatabaseName()).collection(name);
    }

    /**
     * 获取限定数据库的 Model 访问器（P1 占位实现）。
     * @since v1.3.0
     */
    scopedModel<TDocument = Record<string, unknown>>(name: string, options: { database?: string; pool?: string; } = {}): ModelInstance<TDocument> {
        this.ensureConnected();
        return this.createModelInstance<TDocument>(name, {
            database: options.database ?? this.resolveDatabaseName(),
            pool: options.pool,
        });
    }

    /**
     * 获取 Model 访问器（P1 占位实现）。
     * @since v1.3.0
     */
    model<TDocument = Record<string, unknown>>(name: string): ModelInstance<TDocument> {
        this.ensureConnected();
        return this.createModelInstance<TDocument>(name, {
            database: this.resolveDatabaseName(),
        });
    }

    /**
     * 手动事务入口（P1 占位实现）。
     * @since v1.3.0
     */
    async startSession(options: TransactionOptions = {}): Promise<Transaction> {
        this.ensureConnected();
        return this.getTransactionManager().startSession(options);
    }

    /**
     * 自动事务入口（P1 占位实现）。
     * @since v1.3.0
     */
    async withTransaction<T>(callback: (transaction: Transaction) => Promise<T>, options: TransactionOptions = {}): Promise<T> {
        this.ensureConnected();
        return this.getTransactionManager().withTransaction(callback, options);
    }

    /**
     * 自动管理业务锁生命周期。
     * @since v1.4.0
     */
    async withLock<T>(key: string, callback: () => Promise<T>, options: LockOptions = {}): Promise<T> {
        this.ensureConnected();
        return this.getLockManager().withLock(key, callback, options);
    }

    /**
     * 获取业务锁（阻塞重试）。
     * @since v1.4.0
     */
    async acquireLock(key: string, options: LockOptions = {}): Promise<Lock> {
        this.ensureConnected();
        return this.getLockManager().acquireLock(key, options);
    }

    /**
     * 尝试获取业务锁（不阻塞）。
     * @since v1.4.0
     */
    async tryAcquireLock(key: string, options: Omit<LockOptions, 'retryTimes'> = {}): Promise<Lock | null> {
        this.ensureConnected();
        return this.getLockManager().tryAcquireLock(key, options);
    }

    /**
     * 获取 Change Stream 同步管理器。
     * @since v1.0.9
     */
    getSyncManager(): ChangeStreamSyncManager | null {
        return this._syncManager;
    }

    /**
     * 获取慢查询日志管理器。
     * @since v1.3.1
     */
    getSlowQueryLogManager(): SlowQueryLogManager | null {
        return this._slowQueryLogManager;
    }

    /**
     * 获取 Saga 协调器。
     * @since v1.1.0
     */
    getSagaOrchestrator(): SagaOrchestrator {
        return this.initializeSagaOrchestrator();
    }

    /**
     * 获取 Saga façade。
     * @since v1.1.0
     */
    saga(): SagaOrchestrator {
        return this.getSagaOrchestrator();
    }

    /**
     * 记录慢查询日志。
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
     * 查询慢查询日志。
     * @since v1.3.1
     */
    async getSlowQueryLogs(filter: SlowQueryLogFilter = {}, options: SlowQueryLogQueryOptions = {}): Promise<SlowQueryLogRecord[]> {
        this.ensureConnected();
        const manager = this.ensureSlowQueryLogManager();
        return manager.query(filter, options);
    }

    /**
     * 注册 Saga 定义。
     * @since v1.1.0
     */
    defineSaga(definition: SagaDefinition): void {
        this.initializeSagaOrchestrator().define(definition);
    }

    /**
     * 执行已注册的 Saga。
     * @since v1.1.0
     */
    async executeSaga(name: string, data: unknown): Promise<SagaResult> {
        return this.initializeSagaOrchestrator().execute(name, data);
    }

    /**
     * 列出已注册的 Saga。
     * @since v1.1.0
     */
    listSagas(): string[] {
        return this.initializeSagaOrchestrator().listSagas();
    }

    /**
     * 获取 Saga 统计。
     * @since v1.1.0
     */
    getSagaStats(): SagaStats {
        return this.initializeSagaOrchestrator().getStats();
    }

    /**
     * 手动启动同步。
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
     * 手动停止同步。
     * @since v1.0.9
     */
    async stopSync(): Promise<void> {
        await this._syncManager?.stop();
    }

    /**
     * 获取同步统计。
     * @since v1.0.9
     */
    getSyncStats(): SyncStats | null {
        return this._syncManager?.getStats() ?? null;
    }

    /**
     * 事件订阅。
     * @since v1.3.0
     */
    on(event: string, handler: (payload: unknown) => void): void {
        this._events.on(event, handler);
    }

    /**
     * 一次性事件订阅。
     * @since v1.3.0
     */
    once(event: string, handler: (payload: unknown) => void): void {
        this._events.once(event, handler);
    }

    /**
     * 取消事件订阅。
     * @since v1.3.0
     */
    off(event: string, handler: (payload: unknown) => void): void {
        this._events.off(event, handler);
    }

    /**
     * 触发事件。
     * @since v1.3.0
     */
    emit(event: string, payload: unknown): void {
        if (event === 'error' && this._events.listenerCount('error') === 0) {
            this._logger.error('[MonSQLizeRuntime] error event', payload);
            return;
        }
        this._events.emit(event, payload);
    }

    private ensureConnected(): void {
        if (!this._connected) {
            throw createError(ErrorCodes.NOT_CONNECTED, 'MonSQLize is not connected yet.');
        }
    }

    private createRuntimeAccessors(): {
        collection: (name: string) => CollectionFacade;
        db: (name?: string) => DbFacade;
        use: (name: string) => { collection: (collectionName: string) => CollectionFacade; model: <TDocument = Record<string, unknown>>(modelName: string) => ModelInstance<TDocument>; };
        instance: MonSQLizeRuntime;
    } {
        return {
            collection: (name: string) => this.collection(name),
            db: (name?: string) => this.db(name),
            use: (name: string) => this.use(name),
            instance: this,
        };
    }

    private resolveDatabaseName(): string {
        return this.options.databaseName ?? 'default';
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
        this._slowQueryLogManager = new SlowQueryLogManager(
            this.options.slowQueryLog,
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
            throw createError(ErrorCodes.INVALID_ARGUMENT, `Model '${name}' is not defined.`);
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


