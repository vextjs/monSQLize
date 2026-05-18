/**
 * runtime 适配器桥接层（AdapterBridge）。
 *
 * 负责将 MonSQLize runtime 的内部状态（MongoClient / Db / MemoryCache / SlowQueryLogManager）
 * 包装为符合 `LegacyAdapterBridgeLike` 合约的对象，供 v1 兼容层和 adapter 扩展使用。
 *
 * 设计说明：
 * - 使用 `Object.defineProperties` 而非类，使 getter 与 setter 直接委托给宿主状态，
 *   避免桥接对象持有过期快照
 * - 慢查询检测嵌入 `createLegacyCollectionBridge` 的 `withSlowQuery` 包装器，
 *   对 v1 兼容层的 collection 操作透明启用慢日志
 */

import { performance } from 'node:perf_hooks';
import type { Db, MongoClient } from 'mongodb';
import type { MemoryCache } from '../capabilities/cache';
import {
    SlowQueryLogManager,
    type SlowQueryLogEntry,
} from '../capabilities/slow-query-log';
import { ErrorCodes, createError } from '../core/errors';
import type { AdminBuildInfoView, DbStatsView, ServerStatusView } from '../../types/collection';
import type { RuntimeDefaults } from '../types/internal/query';
import type { AdapterBridgeLike, LegacyAdapterBridgeLike } from '../types/internal/runtime';
import type { MonSQLizeOptions } from '../../types/monsqlize';
import type { MongoDbAccessor as DbFacade } from '../adapters/mongodb/common/accessors';

/**
 * `createAdapterBridge` 的内部配置参数。
 *
 * 所有字段均为函数，而非直接持有引用，确保通过 getter/setter 始终反映宿主的最新状态。
 * `initializeSlowQueryLogManager` 与 `getSlowQueryLogManager` 区分初始化路径和读取路径。
 */
type AdapterBridgeConfig = {
    /** 获取当前默认 Db（未连接时返回 null）。 */
    getDb: () => Db | null;
    /** 获取当前 MongoClient（未连接时返回 null）。 */
    getClient: () => MongoClient | null;
    /** 获取当前 MemoryCache 实例（可能为 null）。 */
    getCache: () => MemoryCache | null;
    /** 替换当前 MemoryCache 实例。 */
    setCache: (value: MemoryCache | null) => void;
    /** 获取当前实例 ID（来自 namespace.instanceId 配置）。 */
    getInstanceId: () => string | undefined;
    /** 测试 MongoDB 连接可达性。 */
    ping: () => Promise<boolean>;
    /** 获取 MongoDB 服务端 buildInfo 报告。 */
    buildInfo: () => Promise<AdminBuildInfoView | Record<string, unknown>>;
    /** 获取 MongoDB 服务端 serverStatus 报告。 */
    serverStatus: (options?: { scale?: number }) => Promise<ServerStatusView | Record<string, unknown>>;
    /** 获取 MongoDB 服务端 stats 信息。 */
    stats: (options?: { scale?: number }) => Promise<DbStatsView | Record<string, unknown>>;
    /** 列出所有数据库。 */
    listDatabases: (options?: { nameOnly?: boolean }) => Promise<unknown[]>;
    /** 删除指定数据库（需显式确认，生产环境需额外参数）。 */
    dropDatabase: (
        name: string,
        options?: { confirm?: boolean; allowProduction?: boolean; user?: string },
    ) => Promise<{ dropped: boolean; database: string; timestamp: Date }>;
    /** 列出当前数据库的集合。 */
    listCollections: (options?: Record<string, unknown>) => Promise<unknown>;
    /** 向 MongoDB 发送任意管理命令。 */
    runCommand: (command: Record<string, unknown>, options?: Record<string, unknown>) => Promise<Record<string, unknown>>;
    /** 读取内部实例 ID 缓存。 */
    getIidCache: () => MemoryCache | null;
    /** 写入内部实例 ID 缓存。 */
    setIidCache: (value: MemoryCache | null) => void;
    /** 按需初始化慢查询日志管理器（若未启用则返回 null）。 */
    initializeSlowQueryLogManager: () => SlowQueryLogManager | null;
    /** 读取当前慢查询日志管理器实例（已初始化时返回实例，否则返回 null）。 */
    getSlowQueryLogManager: () => SlowQueryLogManager | null;
    /** 向宿主 EventEmitter 发送事件（如 `slow-query` / `query`）。 */
    emit: (event: string, payload: unknown) => void;
    /** 慢查询判定阈值（毫秒），默认 500ms。 */
    slowQueryMs?: number;
};

/**
 * 为 v1 兼容层创建集合操作代理。
 *
 * 代理的每个方法都由 `withSlowQuery` 包裹，支持透明的慢查询检测与日志记录。
 * 返回的对象形状与 v1 直接调用 `mongoClient.db(...).collection(...)` 兼容。
 */
function createLegacyCollectionBridge(config: AdapterBridgeConfig) {
    return (dbName: string, collName: string) => {
        const client = config.getClient();
        if (!client) {
            throw createError(ErrorCodes.NOT_CONNECTED, 'MonSQLize is not connected yet.');
        }
        const nativeCollection = client.db(dbName).collection(collName);

        const withSlowQuery = async <T>(operation: string, execute: () => Promise<T>, query?: unknown): Promise<T> => {
            const startedAt = performance.now();
            const result = await execute();
            const durationMs = Math.max(1, Math.ceil(performance.now() - startedAt));
            const threshold = config.slowQueryMs ?? 500;
            const manager = config.initializeSlowQueryLogManager();
            if (manager && durationMs >= threshold) {
                const entry: SlowQueryLogEntry = {
                    database: dbName,
                    collection: collName,
                    operation,
                    durationMs,
                    query: query as never,
                    timestamp: new Date(),
                };
                await manager.save(entry);
                config.emit('slow-query', entry);
                config.emit('query', entry);
            }
            return result;
        };

        return {
            find: async (query?: object, options?: object) =>
                withSlowQuery('find', () => nativeCollection.find((query ?? {}) as never, options as never).toArray(), query),
            findOne: async (query: object, options?: object) =>
                withSlowQuery('findOne', () => nativeCollection.findOne(query as never, options as never) as Promise<unknown>, query),
            insertOne: async (document: object, options?: object) =>
                withSlowQuery('insertOne', () => nativeCollection.insertOne(document as never, options as never)),
            insertMany: async (documents: object[], options?: object) =>
                withSlowQuery('insertMany', () => nativeCollection.insertMany(documents as never[], options as never)),
            updateOne: async (filter: object, update: object, options?: object) =>
                withSlowQuery('updateOne', () => nativeCollection.updateOne(filter as never, update as never, options as never)),
            updateMany: async (filter: object, update: object, options?: object) =>
                withSlowQuery('updateMany', () => nativeCollection.updateMany(filter as never, update as never, options as never)),
            deleteOne: async (filter: object, options?: object) =>
                withSlowQuery('deleteOne', () => nativeCollection.deleteOne(filter as never, options as never)),
            deleteMany: async (filter: object, options?: object) =>
                withSlowQuery('deleteMany', () => nativeCollection.deleteMany(filter as never, options as never)),
            aggregate: async (pipeline: object[], options?: object) =>
                withSlowQuery('aggregate', () => nativeCollection.aggregate(pipeline as never[], options as never).toArray()),
            countDocuments: async (filter?: object, options?: object) =>
                withSlowQuery('countDocuments', () => nativeCollection.countDocuments((filter ?? {}) as never, options as never)),
            drop: async () => nativeCollection.drop(),
        };
    };
}

/**
 * 根据配置创建完整的 `LegacyAdapterBridgeLike` 实例。
 *
 * 使用 `Object.defineProperties` 将所有属性定义为 getter/setter，
 * 确保 `bridge.db` / `bridge.client` / `bridge.cache` 等字段始终反映宿主的实时状态，
 * 而非在桥接构建时被快照。
 */
function createAdapterBridge(config: AdapterBridgeConfig): LegacyAdapterBridgeLike {
    const bridge = {} as LegacyAdapterBridgeLike;

    Object.defineProperties(bridge, {
        db: {
            enumerable: true,
            get: config.getDb,
        },
        client: {
            enumerable: true,
            get: config.getClient,
        },
        cache: {
            enumerable: true,
            get: config.getCache,
            set: config.setCache,
        },
        instanceId: {
            enumerable: true,
            get: config.getInstanceId,
        },
        ping: {
            enumerable: true,
            value: config.ping,
        },
        buildInfo: {
            enumerable: true,
            value: config.buildInfo,
        },
        serverStatus: {
            enumerable: true,
            value: config.serverStatus,
        },
        stats: {
            enumerable: true,
            value: config.stats,
        },
        listDatabases: {
            enumerable: true,
            value: config.listDatabases,
        },
        dropDatabase: {
            enumerable: true,
            value: config.dropDatabase,
        },
        listCollections: {
            enumerable: true,
            value: config.listCollections,
        },
        runCommand: {
            enumerable: true,
            value: config.runCommand,
        },
        collection: {
            enumerable: true,
            value: createLegacyCollectionBridge(config),
        },
        slowQueryLogManager: {
            enumerable: true,
            configurable: true,
            get: config.getSlowQueryLogManager,
        },
        _iidCache: {
            enumerable: true,
            get: config.getIidCache,
            set: config.setIidCache,
        },
    });

    return bridge;
}

/**
 * `createRuntimeAdapterBridge` 所需的宿主契约。
 *
 * 由 `MonSQLizeRuntime` 实现，向 bridge 层提供内部状态的访问点和操作入口。
 * 宿主须保证 `db()` / `resolveAdapterCache()` 等方法在每次调用时均反映最新状态。
 */
export type RuntimeAdapterBridgeHost = {
    options: MonSQLizeOptions;
    _defaultDb: DbFacade | null;
    _client: MongoClient | null;
    _iidCache: MemoryCache | null;
    _runtimeDefaults: RuntimeDefaults;
    _slowQueryLogManager: SlowQueryLogManager | null;
    resolveAdapterCache(): MemoryCache | null;
    setAdapterCache(value: MemoryCache | null): void;
    initializeSlowQueryLogManager(): SlowQueryLogManager | null;
    ensureConnected(): void;
    db(name?: string): DbFacade;
    emit(event: string, payload: unknown): void;
};

/**
 * 创建并返回与 `MonSQLizeRuntime` 绑定的适配器桥接对象。
 *
 * 返回的对象实现 `LegacyAdapterBridgeLike` 合约，所有属性均动态委托至宿主（host），
 * 避免因持有快照导致的状态不一致问题。
 *
 * @param host - 宿主对象，由 `MonSQLizeRuntime` 实现
 * @returns 完全初始化的 `LegacyAdapterBridgeLike` 实例
 */
export function createRuntimeAdapterBridge(host: RuntimeAdapterBridgeHost): LegacyAdapterBridgeLike {
    return createAdapterBridge({
        getDb: () => host._defaultDb?.raw() ?? null,
        getClient: () => host._client,
        getCache: () => host.resolveAdapterCache(),
        setCache: (value) => host.setAdapterCache(value),
        getInstanceId: () => host._runtimeDefaults.namespace?.instanceId,
        ping: async () => {
            host.ensureConnected();
            return host.db().admin().ping();
        },
        buildInfo: async () => {
            host.ensureConnected();
            return host.db().admin().buildInfo();
        },
        serverStatus: async (adminOptions) => {
            host.ensureConnected();
            return host.db().admin().serverStatus(adminOptions ?? {});
        },
        stats: async (adminOptions) => {
            host.ensureConnected();
            return host.db().admin().stats(adminOptions ?? {});
        },
        listDatabases: async (adminOptions) => {
            host.ensureConnected();
            return host.db().listDatabases(adminOptions ?? {});
        },
        dropDatabase: async (name, adminOptions) => {
            host.ensureConnected();
            if (!name || typeof name !== 'string') {
                throw new Error('Database name is required and must be a non-empty string');
            }
            if (!adminOptions?.confirm) {
                const error = new Error(
                    'dropDatabase requires explicit confirmation. Pass { confirm: true } to proceed.\n\n' +
                    '⚠️  WARNING: This will DELETE ALL DATA in the database!\n' +
                    '⚠️  This operation CANNOT BE UNDONE!',
                ) as Error & { code: string };
                error.code = 'CONFIRMATION_REQUIRED';
                throw error;
            }
            const isProduction = process.env['NODE_ENV'] === 'production';
            if (isProduction && !adminOptions.allowProduction) {
                const error = new Error('dropDatabase is blocked in production. Pass { allowProduction: true } to override.') as Error & { code: string };
                error.code = 'PRODUCTION_BLOCKED';
                throw error;
            }
            if (!host._client) {
                throw createError(ErrorCodes.NOT_CONNECTED, 'MonSQLize is not connected yet.');
            }
            await host._client.db(name).dropDatabase();
            return { dropped: true, database: name, timestamp: new Date() };
        },
        listCollections: async (adminOptions) => {
            host.ensureConnected();
            const optionsRecord = adminOptions ?? {};
            const nameOnly = optionsRecord['nameOnly'] === true;
            const filter: Record<string, unknown> = { ...optionsRecord };
            delete filter['nameOnly'];
            const results = await host.db().listCollections(filter);
            if (nameOnly) {
                return (results as Array<{ name: string }>).map((collection) => collection.name);
            }
            return results;
        },
        runCommand: async (command, adminOptions) => {
            host.ensureConnected();
            if (command === null || typeof command !== 'object') {
                throw new Error('Command must be a non-null object');
            }
            return host.db().runCommand(command, adminOptions ?? {});
        },
        getIidCache: () => host._iidCache,
        setIidCache: (value) => {
            host._iidCache = value;
        },
        initializeSlowQueryLogManager: () => host.initializeSlowQueryLogManager(),
        getSlowQueryLogManager: () => host._slowQueryLogManager,
        emit: (event, payload) => host.emit(event, payload),
        slowQueryMs: host.options.slowQueryMs,
    });
}
