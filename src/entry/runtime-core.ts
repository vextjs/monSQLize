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
import { closeMongo, connectMongo, type MongoConnectConfig } from '../adapters/mongodb/common/connect';
import { createExpression, expr, type ExpressionObject } from '../core/expression';
import { ErrorCodes, createError } from '../core/errors';
import { Logger, type LoggerLike } from '../core/logger';

export { CollectionFacade, DbFacade, Logger, MemoryCache, createRedisCacheAdapter, DistributedCacheInvalidator };
export { FunctionCache, withCache };
export { createExpression, expr };
export type { CacheStats, CachedFunction, ExpressionObject, LoggerLike, WithCacheOptions };

export interface MonSQLizeOptions {
    type?: 'mongodb';
    databaseName?: string;
    config?: MongoConnectConfig;
    cache?: Record<string, unknown> | MemoryCache;
    logger?: LoggerLike | null;
}

export class TransactionManager {
    /**
     * 创建事务管理器。
     * @since v1.3.0
     */
    constructor(public readonly options: Record<string, unknown> = {}) {}
}

export class CacheLockManager {
    /**
     * 创建缓存锁管理器。
     * @since v1.3.0
     */
    constructor(public readonly options: Record<string, unknown> = {}) {}
}

export class ConnectionPoolManager {
    /**
     * 创建连接池管理器。
     * @since v1.3.0
     */
    constructor(public readonly options: Record<string, unknown> = {}) {}
}


export class Model {
    private static definitions: Map<string, Record<string, unknown>>;

    /**
     * 注册模型定义。
     * @since v1.3.0
     */
    static define(name: string, definition: Record<string, unknown>): void {
        this.definitions.set(name, definition);
    }

    /**
     * 注销模型定义。
     * @since v1.3.0
     */
    static undefine(name: string): boolean {
        return this.definitions.delete(name);
    }

    /**
     * 重新定义模型。
     * @since v1.3.0
     */
    static redefine(name: string, definition: Record<string, unknown>): void {
        this.definitions.set(name, definition);
    }
}

Model['definitions'] = new Map<string, Record<string, unknown>>();

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
    private _client: Awaited<ReturnType<typeof connectMongo>>['client'] | null = null;
    private _defaultDb: DbFacade | null = null;
    private _connectionPromise: Promise<{
        collection: (name: string) => CollectionFacade;
        db: (name?: string) => DbFacade;
        use: (name: string) => { collection: (collectionName: string) => CollectionFacade; model: (modelName: string) => Record<string, unknown>; };
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
    }

    /**
     * 连接数据库并建立访问器。
     * @since v1.3.0
     */
    async connect(): Promise<{
        collection: (name: string) => CollectionFacade;
        db: (name?: string) => DbFacade;
        use: (name: string) => { collection: (collectionName: string) => CollectionFacade; model: (modelName: string) => Record<string, unknown>; };
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
            this._connected = true;
            return this.createRuntimeAccessors();
        })();

        try {
            return await this._connectionPromise;
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
        };
    }

    /**
     * 关闭连接。
     * @since v1.3.0
     */
    async close(): Promise<void> {
        await closeMongo(this._client, this._logger);
        this._client = null;
        this._defaultDb = null;
        this._connected = false;
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
            cache: { enabled: true },
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
    use(name: string): { collection: (collectionName: string) => CollectionFacade; model: (modelName: string) => Record<string, unknown>; } {
        this.ensureConnected();
        const db = this.db(name);
        return {
            collection: (collectionName: string) => db.collection(collectionName),
            model: (modelName: string) => this.model(modelName),
        };
    }

    /**
     * 获取连接池访问器（P1 占位实现）。
     * @since v1.3.0
     */
    pool(poolName: string): {
        collection: (name: string) => CollectionFacade;
        model: (name: string) => Record<string, unknown>;
        use: (dbName: string) => { collection: (name: string) => CollectionFacade; model: (name: string) => Record<string, unknown>; };
    } {
        this.ensureConnected();
        const databaseName = this.resolveDatabaseName();
        void poolName;
        return {
            collection: (name: string) => this.db(databaseName).collection(name),
            model: (name: string) => this.model(name),
            use: (dbName: string) => ({
                collection: (name: string) => this.db(dbName).collection(name),
                model: (name: string) => this.model(name),
            }),
        };
    }

    /**
     * 获取限定数据库的 Collection 访问器。
     * @since v1.3.0
     */
    scopedCollection(name: string, options: { database?: string; } = {}): CollectionFacade {
        this.ensureConnected();
        return this.db(options.database ?? this.resolveDatabaseName()).collection(name);
    }

    /**
     * 获取限定数据库的 Model 访问器（P1 占位实现）。
     * @since v1.3.0
     */
    scopedModel(name: string): Record<string, unknown> {
        this.ensureConnected();
        return this.model(name);
    }

    /**
     * 获取 Model 访问器（P1 占位实现）。
     * @since v1.3.0
     */
    model(name: string): Record<string, unknown> {
        this.ensureConnected();
        return {
            name,
            type: 'model-skeleton',
        };
    }

    /**
     * 手动事务入口（P1 占位实现）。
     * @since v1.3.0
     */
    async startSession(): Promise<{ session: null; }> {
        this.ensureConnected();
        return { session: null };
    }

    /**
     * 自动事务入口（P1 占位实现）。
     * @since v1.3.0
     */
    async withTransaction<T>(callback: (transaction: { session: null; }) => Promise<T>): Promise<T> {
        this.ensureConnected();
        return callback({ session: null });
    }

    /**
     * 事件订阅占位实现。
     * @since v1.3.0
     */
    on(_event: string, _handler: (payload: unknown) => void): void {
        this._logger.debug('[P1 skeleton] on() registered');
    }

    /**
     * 一次性事件订阅占位实现。
     * @since v1.3.0
     */
    once(_event: string, _handler: (payload: unknown) => void): void {
        this._logger.debug('[P1 skeleton] once() registered');
    }

    /**
     * 取消事件订阅占位实现。
     * @since v1.3.0
     */
    off(_event: string, _handler: (payload: unknown) => void): void {
        this._logger.debug('[P1 skeleton] off() called');
    }

    /**
     * 触发事件占位实现。
     * @since v1.3.0
     */
    emit(_event: string, _payload: unknown): void {
        this._logger.debug('[P1 skeleton] emit() called');
    }

    private ensureConnected(): void {
        if (!this._connected) {
            throw createError(ErrorCodes.NOT_CONNECTED, 'MonSQLize is not connected yet.');
        }
    }

    private createRuntimeAccessors(): {
        collection: (name: string) => CollectionFacade;
        db: (name?: string) => DbFacade;
        use: (name: string) => { collection: (collectionName: string) => CollectionFacade; model: (modelName: string) => Record<string, unknown>; };
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
}


