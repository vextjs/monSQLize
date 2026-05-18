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

type AdapterBridgeConfig = {
    getDb: () => Db | null;
    getClient: () => MongoClient | null;
    getCache: () => MemoryCache | null;
    setCache: (value: MemoryCache | null) => void;
    getInstanceId: () => string | undefined;
    ping: () => Promise<boolean>;
    buildInfo: () => Promise<AdminBuildInfoView | Record<string, unknown>>;
    serverStatus: (options?: { scale?: number }) => Promise<ServerStatusView | Record<string, unknown>>;
    stats: (options?: { scale?: number }) => Promise<DbStatsView | Record<string, unknown>>;
    listDatabases: (options?: { nameOnly?: boolean }) => Promise<unknown[]>;
    dropDatabase: (
        name: string,
        options?: { confirm?: boolean; allowProduction?: boolean; user?: string },
    ) => Promise<{ dropped: boolean; database: string; timestamp: Date }>;
    listCollections: (options?: Record<string, unknown>) => Promise<unknown>;
    runCommand: (command: Record<string, unknown>, options?: Record<string, unknown>) => Promise<Record<string, unknown>>;
    getIidCache: () => Map<string, string> | null;
    setIidCache: (value: Map<string, string> | null) => void;
    initializeSlowQueryLogManager: () => SlowQueryLogManager | null;
    getSlowQueryLogManager: () => SlowQueryLogManager | null;
    emit: (event: string, payload: unknown) => void;
    slowQueryMs?: number;
};

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

export type RuntimeAdapterBridgeHost = {
    options: MonSQLizeOptions;
    _defaultDb: DbFacade | null;
    _client: MongoClient | null;
    _iidCache: Map<string, string> | null;
    _runtimeDefaults: RuntimeDefaults;
    _slowQueryLogManager: SlowQueryLogManager | null;
    resolveAdapterCache(): MemoryCache | null;
    setAdapterCache(value: MemoryCache | null): void;
    initializeSlowQueryLogManager(): SlowQueryLogManager | null;
    ensureConnected(): void;
    db(name?: string): DbFacade;
    emit(event: string, payload: unknown): void;
};

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
