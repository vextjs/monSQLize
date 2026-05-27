/**
 * MongoDB connection adapter layer.
 *
 * Description:
 * - Supports config.uri (production) and config.useMemoryServer (test environment, v1 compatible).
 * - When useMemoryServer is true, mongodb-memory-server starts automatically; no URI is required.
 */

import { MongoClient, type MongoClientOptions } from 'mongodb';

import { createConnectionError, createError, ErrorCodes, type MonSQLizeError } from '../../../core/errors';
import type { Logger } from '../../../core/logger';
import type { MongoConnectConfig, MongoConnectionState } from '../../../../types/mongodb';

export type { MongoConnectConfig, MongoConnectionState } from '../../../../types/mongodb';

// Singleton memory server (v1 compatible: reuses an already-started instance)
let _memoryServerInstance: { getUri(): string; stop(): Promise<void> } | null = null;

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

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { MongoMemoryReplSet } = require('mongodb-memory-server') as {
        MongoMemoryReplSet: {
            create(opts?: unknown): Promise<{ getUri(): string; stop(): Promise<void> }>;
        };
    };

    logger?.info?.('🚀 Starting MongoDB Memory ReplSet (transactions supported)...');

    // Single-node replica set — required for MongoDB transactions; storageEngine uses wiredTiger
    const defaultConfig = {
        replSet: { count: 1, storageEngine: 'wiredTiger' },
        binary: { version: '6.0.12' },
        instanceOpts: [{ ...(memoryServerOptions?.instance ?? {}) }],
    };

    const resolvedConfig = {
        ...defaultConfig,
        binary: { ...defaultConfig.binary, ...(memoryServerOptions?.binary ?? {}) },
    };

    try {
        _memoryServerInstance = await MongoMemoryReplSet.create(resolvedConfig);
        const uri = _memoryServerInstance!.getUri();
        logger?.info?.('✅ MongoDB Memory ReplSet started', { uri });
        return uri;
    } catch (err) {
        logger?.error?.('❌ Failed to start MongoDB Memory ReplSet', err);
        throw new Error(`Failed to start MongoDB Memory ReplSet: ${(err as Error).message}`);
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

    // v1 compat: useMemoryServer code path
    if (!effectiveUri && params.config?.useMemoryServer === true) {
        // If MONSQLIZE_USE_SYSTEM_MONGO=true, connect to the system MongoDB directly (skip mongodb-memory-server)
        if (process.env['MONSQLIZE_USE_SYSTEM_MONGO'] === 'true') {
            const systemUri = process.env['MONSQLIZE_SYSTEM_MONGO_URI'] ?? 'mongodb://127.0.0.1:27017';
            params.logger?.info?.('🔧 Using system MongoDB instead of memory server', { uri: systemUri });
            effectiveUri = systemUri;
        } else {
            effectiveUri = await startMemoryServer(params.logger, params.config.memoryServerOptions);
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
        params.logger?.info?.('MongoDB connected', { databaseName });
        return { client, db };
    } catch (cause) {
        try {
            await client.close();
        } catch {
            // ignore close failure after connect error
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

    try {
        await client.close();
        logger?.info?.('MongoDB connection closed');
    } catch (cause) {
        const error = createError(
            ErrorCodes.CONNECTION_CLOSED,
            'Failed to close MongoDB connection cleanly.',
            undefined,
            cause instanceof Error ? cause : undefined,
        ) as MonSQLizeError;
        logger?.warn?.(error.message, error.cause);
    }
}

