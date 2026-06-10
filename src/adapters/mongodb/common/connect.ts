/**
 * MongoDB connection adapter layer.
 *
 * Description:
 * - Supports config.uri (production) and config.useMemoryServer (test environment, v1 compatible).
 * - When useMemoryServer is true, mongodb-memory-server starts automatically; no URI is required.
 */

import { copyFileSync, existsSync, mkdirSync, mkdtempSync } from 'node:fs';
import path from 'node:path';
import { MongoClient, type MongoClientOptions } from 'mongodb';

import { createConnectionError, createError, ErrorCodes, type MonSQLizeError } from '../../../core/errors';
import type { Logger } from '../../../core/logger';
import type { MongoConnectConfig, MongoConnectionState } from '../../../../types/mongodb';

export type { MongoConnectConfig, MongoConnectionState } from '../../../../types/mongodb';

const DEFAULT_MEMORY_SERVER_VERSION = '7.0.14';

// Singleton memory server (v1 compatible: reuses an already-started instance)
let _memoryServerInstance: { getUri(): string; stop(cleanupOptions?: { doCleanup?: boolean; force?: boolean }): Promise<boolean | void> } | null = null;
let _memoryServerCleanupOptions: { doCleanup: true; force: boolean } = { doCleanup: true, force: true };
const _memoryServerClients = new Set<MongoClient>();

function setDefaultEnv(name: string, value: string): void {
    if (!process.env[name]) {
        process.env[name] = value;
    }
}

function sanitizePathSegment(input: string): string {
    return input.replace(/[^a-zA-Z0-9_.-]+/g, '-').replace(/^-+|-+$/g, '') || 'default';
}

function resolveMemoryServerBinaryVersion(memoryServerOptions: MongoConnectConfig['memoryServerOptions'] = {}): string {
    return (
        memoryServerOptions?.binary?.version ||
        process.env.MONSQLIZE_REPLSET_BINARY_VERSION ||
        process.env.MONSQLIZE_MEMORY_MONGO_BINARY_VERSION ||
        process.env.MONGOMS_VERSION ||
        DEFAULT_MEMORY_SERVER_VERSION
    );
}

function resolveMemoryServerPolicy(binaryVersion: string): { downloadDir: string; dbRoot: string } {
    const cacheRoot = path.resolve(process.env.MONSQLIZE_MEMORY_SERVER_CACHE_DIR || path.join(process.cwd(), '.cache', 'mongodb-memory-server'));
    const downloadDir = path.resolve(process.env.MONGOMS_DOWNLOAD_DIR || path.join(cacheRoot, 'binaries'));
    const dbRoot = path.resolve(process.env.MONSQLIZE_MEMORY_SERVER_DB_DIR || path.join(cacheRoot, 'db'));

    mkdirSync(downloadDir, { recursive: true });
    mkdirSync(dbRoot, { recursive: true });

    setDefaultEnv('MONGOMS_DOWNLOAD_DIR', downloadDir);
    setDefaultEnv('MONGOMS_PREFER_GLOBAL_PATH', 'false');
    setDefaultEnv('MONGOMS_RUNTIME_DOWNLOAD', 'true');
    setDefaultEnv('MONGOMS_VERSION', binaryVersion);

    return { downloadDir, dbRoot };
}

function createManagedDbPath(dbRoot: string, dbName: string): string {
    return mkdtempSync(path.join(dbRoot, `replset-${sanitizePathSegment(dbName)}-${process.pid}-`));
}

function resolveLaunchTimeout(): number | undefined {
    const raw = process.env.MONSQLIZE_MEMORY_MONGO_LAUNCH_TIMEOUT_MS;
    if (!raw) {
        return undefined;
    }

    const value = Number.parseInt(raw, 10);
    return Number.isFinite(value) && value > 0 ? value : undefined;
}

async function seedMemoryServerBinaryCache(binaryVersion: string, downloadDir: string): Promise<void> {
    try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const { DryMongoBinary } = require('mongodb-memory-server-core/lib/util/DryMongoBinary') as {
            DryMongoBinary: {
                generateOptions(opts: Record<string, unknown>): Promise<Record<string, unknown>>;
                generatePaths(opts: Record<string, unknown>): Promise<{ resolveConfig?: string; homeCache?: string }>;
            };
        };
        const options = await DryMongoBinary.generateOptions({ version: binaryVersion, downloadDir });
        options.downloadDir = downloadDir;
        const paths = await DryMongoBinary.generatePaths(options);
        if (
            paths.resolveConfig &&
            paths.homeCache &&
            path.resolve(paths.resolveConfig) !== path.resolve(paths.homeCache) &&
            existsSync(paths.homeCache) &&
            !existsSync(paths.resolveConfig)
        ) {
            mkdirSync(path.dirname(paths.resolveConfig), { recursive: true });
            copyFileSync(paths.homeCache, paths.resolveConfig);
        }
    } catch {
        // Best-effort seeding only; mongodb-memory-server can still download into the configured cache.
    }
}

/**
 * Starts or reuses the mongodb-memory-server singleton, returning the connection URI.
 * Uses MongoMemoryReplSet (single-node replica set) to support MongoDB transactions.
 * @internal Only used by the useMemoryServer code path.
 */
async function startMemoryServer(
    logger: Logger | undefined,
    memoryServerOptions: MongoConnectConfig['memoryServerOptions'] = {},
): Promise<string> {
    if (_memoryServerInstance) {
        return _memoryServerInstance.getUri();
    }

    const binaryVersion = resolveMemoryServerBinaryVersion(memoryServerOptions);
    const { dbRoot, downloadDir } = resolveMemoryServerPolicy(binaryVersion);
    await seedMemoryServerBinaryCache(binaryVersion, downloadDir);
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { MongoMemoryReplSet } = require('mongodb-memory-server') as {
        MongoMemoryReplSet: {
            create(opts?: unknown): Promise<{ getUri(): string; stop(cleanupOptions?: { doCleanup?: boolean; force?: boolean }): Promise<boolean | void> }>;
        };
    };

    logger?.info?.('Starting MongoDB Memory ReplSet', { binaryVersion });

    // Single-node replica set is required for MongoDB transactions; storageEngine uses wiredTiger.
    const dbName = memoryServerOptions?.instance?.dbName || 'monsqlize_memory';
    const instanceConfig = { ...(memoryServerOptions?.instance ?? {}) } as Record<string, unknown>;
    const hasUserDbPath = typeof instanceConfig.dbPath === 'string' && instanceConfig.dbPath.length > 0;
    if (!hasUserDbPath) {
        instanceConfig.dbPath = createManagedDbPath(dbRoot, dbName);
    }
    if (instanceConfig.launchTimeout === undefined) {
        const launchTimeout = resolveLaunchTimeout();
        if (launchTimeout) {
            instanceConfig.launchTimeout = launchTimeout;
        }
    }
    _memoryServerCleanupOptions = { doCleanup: true, force: !hasUserDbPath };

    const defaultConfig = {
        replSet: { count: 1, storageEngine: 'wiredTiger' },
        binary: { version: binaryVersion },
        instanceOpts: [instanceConfig],
    };

    const resolvedConfig = {
        ...defaultConfig,
        binary: { ...defaultConfig.binary, ...(memoryServerOptions?.binary ?? {}) },
    };

    try {
        _memoryServerInstance = await MongoMemoryReplSet.create(resolvedConfig);
        const uri = _memoryServerInstance!.getUri();
        logger?.info?.('MongoDB Memory ReplSet started', { uri });
        return uri;
    } catch (err) {
        logger?.error?.('Failed to start MongoDB Memory ReplSet', err);
        throw createConnectionError(
            `Failed to start MongoDB Memory ReplSet: ${(err as Error).message}`,
            err instanceof Error ? err : undefined,
        );
    }
}

async function stopMemoryServer(logger?: Logger): Promise<void> {
    if (!_memoryServerInstance) {
        return;
    }

    const instance = _memoryServerInstance;
    _memoryServerInstance = null;
    try {
        await instance.stop(_memoryServerCleanupOptions);
        logger?.info?.('MongoDB Memory ReplSet stopped');
    } catch (cause) {
        logger?.warn?.('Failed to stop MongoDB Memory ReplSet cleanly.', cause);
    } finally {
        _memoryServerCleanupOptions = { doCleanup: true, force: true };
    }
}

/**
 * Establishes a MongoDB connection.
 * @since v1.3.0
 */
export async function connectMongo(params: {
    databaseName: string;
    config?: MongoConnectConfig;
    logger?: Logger;
}): Promise<MongoConnectionState> {
    const databaseName = params.databaseName?.trim();
    if (!databaseName) {
        throw createError(ErrorCodes.INVALID_DATABASE_NAME, 'Database name must be a non-empty string.');
    }

    let effectiveUri = params.config?.uri?.trim();
    let usesManagedMemoryServer = false;

    // v1 compat: useMemoryServer code path
    if (!effectiveUri && params.config?.useMemoryServer === true) {
        // If MONSQLIZE_USE_SYSTEM_MONGO=true, connect to the system MongoDB directly (skip mongodb-memory-server)
        if (process.env['MONSQLIZE_USE_SYSTEM_MONGO'] === 'true') {
            const systemUri = process.env['MONSQLIZE_SYSTEM_MONGO_URI'] ?? 'mongodb://127.0.0.1:27017';
            params.logger?.info?.('Using system MongoDB instead of memory server', { uri: systemUri });
            effectiveUri = systemUri;
        } else {
            effectiveUri = await startMemoryServer(params.logger, params.config.memoryServerOptions);
            usesManagedMemoryServer = true;
        }
    }

    if (!effectiveUri) {
        throw createError(ErrorCodes.INVALID_CONFIG, 'MongoDB connect requires config.uri.');
    }

    const clientOptions: MongoClientOptions = { ...(params.config?.options ?? {}) };
    if (params.config?.readPreference !== undefined) {
        clientOptions.readPreference = params.config.readPreference;
    }
    const client = new MongoClient(effectiveUri, clientOptions);

    try {
        await client.connect();
        const db = client.db(databaseName);
        if (usesManagedMemoryServer) {
            _memoryServerClients.add(client);
        }
        params.logger?.info?.('MongoDB connected', { databaseName });
        return { client, db };
    } catch (cause) {
        try {
            await client.close();
        } catch {
            // ignore close failure after connect error
        }
        if (usesManagedMemoryServer && _memoryServerClients.size === 0) {
            await stopMemoryServer(params.logger);
        }
        throw createConnectionError(
            `Failed to connect to MongoDB database: ${databaseName}`,
            cause instanceof Error ? cause : undefined,
        );
    }
}

/**
 * Closes the MongoDB connection.
 * @since v1.3.0
 */
export async function closeMongo(client: MongoClient | null | undefined, logger?: Logger): Promise<void> {
    if (!client) {
        return;
    }

    const shouldReleaseMemoryServer = _memoryServerClients.delete(client);
    let closeError: MonSQLizeError | null = null;
    try {
        await client.close();
        logger?.info?.('MongoDB connection closed');
    } catch (cause) {
        closeError = createError(
            ErrorCodes.CONNECTION_CLOSED,
            'Failed to close MongoDB connection cleanly.',
            undefined,
            cause instanceof Error ? cause : undefined,
        ) as MonSQLizeError;
        logger?.warn?.(closeError.message, closeError.cause);
    } finally {
        if (shouldReleaseMemoryServer && _memoryServerClients.size === 0) {
            await stopMemoryServer(logger);
        }
    }

    if (closeError) {
        return;
    }
}

