/**
 * Shared bootstrap helper for standalone examples.
 * Uses mongodb-memory-server to spin up an in-memory MongoDB instance
 * so that each example can run independently without an external server.
 *
 * @example
 * ```ts
 * import { setupExample, teardownExample } from '../helpers/bootstrap.js';
 * const { msq, server } = await setupExample('my-example');
 * // ... run example ...
 * await teardownExample(msq, server);
 * ```
 */
import type { MongoMemoryReplSet, MongoMemoryServer } from 'mongodb-memory-server';
import MonSQLize, { type MonSQLizeOptions } from 'monsqlize';

import {
    configureMemoryServerEnv,
    createMemoryServerDbPath,
    memoryServerCleanupOptions,
    resolveMemoryServerBinaryVersion,
    resolveMemoryServerLaunchTimeoutMs,
    resolveReplSetBinaryVersion,
    seedMemoryServerBinaryCache,
} from '../../test/bootstrap/memory-server-policy.js';

interface StoppableMemoryServer {
    getUri(): string;
    stop(cleanupOptions?: unknown): Promise<unknown>;
}

export interface ExampleContext<TServer extends StoppableMemoryServer = MongoMemoryServer> {
    msq: MonSQLize;
    server: TServer;
    uri: string;
}

type ExampleRuntimeOptions = Omit<MonSQLizeOptions, 'type' | 'databaseName' | 'database' | 'config'> & {
    config?: MonSQLizeOptions['config'];
};

function createExternalServer(uri: string): StoppableMemoryServer {
    return {
        getUri() {
            return uri;
        },
        async stop() {
            return true;
        },
    };
}

function createMonSQLize(dbName: string, uri: string, runtimeOptions: ExampleRuntimeOptions = {}): MonSQLize {
    const { config, ...rest } = runtimeOptions;
    return new MonSQLize({
        ...rest,
        type: 'mongodb',
        databaseName: dbName,
        config: { ...(config ?? {}), uri },
    });
}

/**
 * Start an in-memory MongoDB server and connect a MonSQLize instance.
 * @param dbName - Database name to use (default: 'monsqlize-example')
 */
export async function setupExample(dbName = 'monsqlize-example', runtimeOptions: ExampleRuntimeOptions = {}): Promise<ExampleContext<MongoMemoryServer>> {
    const externalUri = process.env.MONSQLIZE_EXAMPLES_MONGO_URI || process.env.MONSQLIZE_MEMORY_MONGO_URI;
    if (externalUri) {
        const msq = createMonSQLize(dbName, externalUri, runtimeOptions);
        await msq.connect();
        return { msq, server: createExternalServer(externalUri) as MongoMemoryServer, uri: externalUri };
    }

    const binaryVersion = resolveMemoryServerBinaryVersion();
    configureMemoryServerEnv(binaryVersion);
    await seedMemoryServerBinaryCache(binaryVersion);
    const { MongoMemoryServer } = await import('mongodb-memory-server');
    const launchTimeout = resolveMemoryServerLaunchTimeoutMs();
    const server = await MongoMemoryServer.create({
        binary: { version: binaryVersion },
        instance: {
            dbName,
            dbPath: createMemoryServerDbPath('examples-single', dbName),
            ...(launchTimeout ? { launchTimeout } : {}),
        },
    });
    const uri = server.getUri();
    const msq = createMonSQLize(dbName, uri, runtimeOptions);
    await msq.connect();
    return { msq, server, uri };
}

/**
 * Start an in-memory MongoDB replica set and connect a MonSQLize instance.
 * Useful for change streams and transactions.
 */
export async function setupReplicaSetExample(dbName = 'monsqlize-example-rs', runtimeOptions: ExampleRuntimeOptions = {}): Promise<ExampleContext<MongoMemoryReplSet>> {
    const externalUri = process.env.MONSQLIZE_EXAMPLES_REPLSET_URI || process.env.MONSQLIZE_REPLSET_URI;
    if (externalUri) {
        const msq = createMonSQLize(dbName, externalUri, runtimeOptions);
        await msq.connect();
        return { msq, server: createExternalServer(externalUri) as MongoMemoryReplSet, uri: externalUri };
    }

    const binaryVersion = resolveReplSetBinaryVersion();
    configureMemoryServerEnv(binaryVersion);
    await seedMemoryServerBinaryCache(binaryVersion);
    const { MongoMemoryReplSet } = await import('mongodb-memory-server');
    const launchTimeout = resolveMemoryServerLaunchTimeoutMs();
    const server = await MongoMemoryReplSet.create({
        replSet: { count: 1, dbName, storageEngine: 'wiredTiger' },
        binary: { version: binaryVersion },
        instanceOpts: [
            {
                dbPath: createMemoryServerDbPath('examples-replset', dbName),
                ...(launchTimeout ? { launchTimeout } : {}),
            },
        ],
    });
    const uri = server.getUri();
    const msq = createMonSQLize(dbName, uri, runtimeOptions);
    await msq.connect();
    return { msq, server, uri };
}

/**
 * Gracefully stop the MonSQLize instance and the in-memory server.
 */
export async function teardownExample(msq: MonSQLize, server: StoppableMemoryServer): Promise<void> {
    try {
        await msq.close();
    } finally {
        await server.stop(memoryServerCleanupOptions());
    }
}
