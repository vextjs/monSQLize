/**
 * Runtime adapter bridge layer (AdapterBridge).
 *
 * Wraps MonSQLize runtime internal state (MongoClient / Db / MemoryCache / SlowQueryLogManager)
 * into an object satisfying the `LegacyAdapterBridgeLike` contract, used by the v1 compat
 * layer and adapter extensions.
 *
 * Design notes:
 * - Uses `Object.defineProperties` instead of a class so that getters and setters delegate
 *   directly to host state, avoiding stale snapshots in the bridge object
 * - Slow-query detection is embedded via the `withSlowQuery` wrapper inside
 *   `createLegacyCollectionBridge`, transparently enabling slow-query logging for all
 *   collection operations in the v1 compat layer
 */

import { performance } from 'node:perf_hooks';
import type { Db, Document, MongoClient } from 'mongodb';
import type { CacheLike, MemoryCache } from '../capabilities/cache';
import {
    SlowQueryLogManager,
    type SlowQueryLogEntry,
} from '../capabilities/slow-query-log';
import { ErrorCodes, createError } from '../core/errors';
import { assertWritePathAllowed, type WritePathOperationCategory } from '../capabilities/write-path-policy';
import type { AdminBuildInfoView, DbStatsView, ServerStatusView } from '../../types/collection';
import type { RuntimeDefaults } from '../types/internal/query';
import type { AdapterBridgeLike, LegacyAdapterBridgeLike } from '../types/internal/runtime';
import type { MonSQLizeOptions } from '../../types/monsqlize';
import type { MongoDbAccessor as DbFacade } from '../adapters/mongodb/common/accessors';
import { isProductionEnvironment } from '../adapters/mongodb/common/drop-database-safety';
import { resolveAggregateWriteTarget } from '../adapters/mongodb/common/collection-accessor-cache-helpers';

/**
 * Internal configuration for `createAdapterBridge`.
 *
 * All fields are functions rather than direct references so that getters/setters
 * always reflect the latest host state.
 * `initializeSlowQueryLogManager` and `getSlowQueryLogManager` separate the
 * initialisation path from the read path.
 */
type AdapterBridgeConfig = {
    /** Returns the current default Db (null when not connected). */
    getDb: () => Db | null;
    /** Returns the current MongoClient (null when not connected). */
    getClient: () => MongoClient | null;
    /** Returns the current cache instance (may be null). */
    getCache: () => CacheLike | null;
    /** Replaces the current cache instance. */
    setCache: (value: CacheLike | null) => void;
    /** Returns the current instance ID (from namespace.instanceId config). */
    getInstanceId: () => string | undefined;
    /** Tests MongoDB connection reachability. */
    ping: () => Promise<boolean>;
    /** Returns the MongoDB server buildInfo report. */
    buildInfo: () => Promise<AdminBuildInfoView | Record<string, unknown>>;
    /** Returns the MongoDB server serverStatus report. */
    serverStatus: (options?: { scale?: number }) => Promise<ServerStatusView | Record<string, unknown>>;
    /** Returns MongoDB server stats. */
    stats: (options?: { scale?: number }) => Promise<DbStatsView | Record<string, unknown>>;
    /** Lists all databases. */
    listDatabases: (options?: { nameOnly?: boolean }) => Promise<unknown[]>;
    /** Drops the specified database (requires explicit confirmation; production requires extra params). */
    dropDatabase: (
        name: string,
        options?: { confirm?: boolean; allowProduction?: boolean; user?: string },
    ) => Promise<{ dropped: boolean; database: string; timestamp: Date }>;
    /** Lists collections in the current database. */
    listCollections: (options?: Record<string, unknown>) => Promise<unknown>;
    /** Sends an arbitrary admin command to MongoDB. */
    runCommand: (command: Record<string, unknown>, options?: Record<string, unknown>) => Promise<Record<string, unknown>>;
    /** Reads the internal instance-ID cache. */
    getIidCache: () => MemoryCache | null;
    /** Writes the internal instance-ID cache. */
    setIidCache: (value: MemoryCache | null) => void;
    /** Lazily initialises the slow-query log manager (returns null when not enabled). */
    initializeSlowQueryLogManager: () => SlowQueryLogManager | null;
    /** Returns the current slow-query log manager instance, or null if not yet initialised. */
    getSlowQueryLogManager: () => SlowQueryLogManager | null;
    /** Emits an event on the host EventEmitter (e.g. `slow-query` / `query`). */
    emit: (event: string, payload: unknown) => void;
    /** Slow-query threshold in milliseconds (default 500ms). */
    slowQueryMs?: number;
    /** Runtime defaults carrying the normalized write path policy. */
    runtimeDefaults: RuntimeDefaults;
};

/**
 * Create a collection operations proxy for the v1 compat layer.
 *
 * Each method is wrapped by `withSlowQuery` for transparent slow-query detection and logging.
 * The returned object shape is compatible with v1's direct `mongoClient.db(...).collection(...)` calls.
 */
function createLegacyCollectionBridge(config: AdapterBridgeConfig) {
    return (dbName: string, collName: string) => {
        const client = config.getClient();
        if (!client) {
            throw createError(ErrorCodes.NOT_CONNECTED, 'MonSQLize is not connected yet.');
        }
        const nativeCollection = client.db(dbName).collection(collName);

        const assertLegacyWrite = (
            operation: string,
            category: WritePathOperationCategory = 'write',
            target?: { dbName?: string; collectionName?: string },
        ): void => {
            const instanceId = config.getInstanceId();
            const targetDb = target?.dbName ?? dbName;
            const targetCollection = target?.collectionName ?? collName;
            assertWritePathAllowed({
                policy: config.runtimeDefaults.writePathPolicy,
                namespace: {
                    iid: instanceId ? `${instanceId}:${targetDb}:${targetCollection}` : `${targetDb}:${targetCollection}`,
                    db: targetDb,
                    collection: targetCollection,
                },
                source: 'legacy',
                operation,
                category,
            });
        };

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
            insertOne: async (document: object, options?: object) => {
                assertLegacyWrite('insertOne');
                return withSlowQuery('insertOne', () => nativeCollection.insertOne(document as never, options as never));
            },
            insertMany: async (documents: object[], options?: object) => {
                assertLegacyWrite('insertMany');
                return withSlowQuery('insertMany', () => nativeCollection.insertMany(documents as never[], options as never));
            },
            updateOne: async (filter: object, update: object, options?: object) => {
                assertLegacyWrite('updateOne');
                return withSlowQuery('updateOne', () => nativeCollection.updateOne(filter as never, update as never, options as never));
            },
            updateMany: async (filter: object, update: object, options?: object) => {
                assertLegacyWrite('updateMany');
                return withSlowQuery('updateMany', () => nativeCollection.updateMany(filter as never, update as never, options as never));
            },
            deleteOne: async (filter: object, options?: object) => {
                assertLegacyWrite('deleteOne');
                return withSlowQuery('deleteOne', () => nativeCollection.deleteOne(filter as never, options as never));
            },
            deleteMany: async (filter: object, options?: object) => {
                assertLegacyWrite('deleteMany');
                return withSlowQuery('deleteMany', () => nativeCollection.deleteMany(filter as never, options as never));
            },
            aggregate: async (pipeline: object[], options?: object) => {
                const writeTarget = resolveAggregateWriteTarget((pipeline ?? []) as Document[]);
                if (writeTarget) {
                    assertLegacyWrite('aggregate', 'write', writeTarget);
                }
                return withSlowQuery('aggregate', () => nativeCollection.aggregate(pipeline as never[], options as never).toArray());
            },
            countDocuments: async (filter?: object, options?: object) =>
                withSlowQuery('countDocuments', () => nativeCollection.countDocuments((filter ?? {}) as never, options as never)),
            drop: async () => {
                assertLegacyWrite('drop', 'management');
                return nativeCollection.drop();
            },
        };
    };
}

/**
 * Create a complete `LegacyAdapterBridgeLike` instance from the given config.
 *
 * Uses `Object.defineProperties` to define all properties as getters/setters,
 * ensuring `bridge.db` / `bridge.client` / `bridge.cache` always reflect the
 * live host state rather than a snapshot taken at bridge creation time.
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
 * Host contract required by `createRuntimeAdapterBridge`.
 *
 * Implemented by `MonSQLizeRuntime` to expose internal state access points and operation
 * entry points to the bridge layer.
 * The host must ensure that methods such as `db()` and `resolveAdapterCache()` reflect
 * the latest state on every call.
 */
export type RuntimeAdapterBridgeHost = {
    options: MonSQLizeOptions;
    _defaultDb: DbFacade | null;
    _client: MongoClient | null;
    _iidCache: MemoryCache | null;
    _runtimeDefaults: RuntimeDefaults;
    _slowQueryLogManager: SlowQueryLogManager | null;
    resolveAdapterCache(): CacheLike | null;
    setAdapterCache(value: CacheLike | null): void;
    initializeSlowQueryLogManager(): SlowQueryLogManager | null;
    ensureConnected(): void;
    db(name?: string): DbFacade;
    emit(event: string, payload: unknown): void;
};

/**
 * Create and return an adapter bridge object bound to `MonSQLizeRuntime`.
 *
 * The returned object implements the `LegacyAdapterBridgeLike` contract; all properties
 * are dynamically delegated to the host to prevent stale-snapshot state inconsistencies.
 *
 * @param host - The host object, implemented by `MonSQLizeRuntime`
 * @returns A fully initialised `LegacyAdapterBridgeLike` instance
 */
export function createRuntimeAdapterBridge(host: RuntimeAdapterBridgeHost): LegacyAdapterBridgeLike {
    return createAdapterBridge({
        getDb: () => host._defaultDb?.raw() ?? null,
        getClient: () => host._client,
        getCache: () => host.resolveAdapterCache(),
        setCache: (value) => host.setAdapterCache(value),
        getInstanceId: () => host._runtimeDefaults.namespace?.instanceId,
        runtimeDefaults: host._runtimeDefaults,
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
                throw createError(ErrorCodes.INVALID_DATABASE_NAME, 'Database name is required and must be a non-empty string');
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
            const isProduction = isProductionEnvironment();
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
                throw createError(ErrorCodes.INVALID_ARGUMENT, 'Command must be a non-null object');
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
