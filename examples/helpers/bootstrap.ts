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
import { MongoMemoryReplSet, MongoMemoryServer } from 'mongodb-memory-server';
import MonSQLize from 'monsqlize';

interface StoppableMemoryServer {
    stop(): Promise<unknown>;
}

export interface ExampleContext<TServer extends StoppableMemoryServer = MongoMemoryServer> {
    msq: MonSQLize;
    server: TServer;
    uri: string;
}

/**
 * Start an in-memory MongoDB server and connect a MonSQLize instance.
 * @param dbName - Database name to use (default: 'monsqlize-example')
 */
export async function setupExample(dbName = 'monsqlize-example'): Promise<ExampleContext<MongoMemoryServer>> {
    const server = await MongoMemoryServer.create({
        instance: { dbName },
    });
    const uri = server.getUri();
    const msq = new MonSQLize({
        type: 'mongodb',
        databaseName: dbName,
        config: { uri },
    });
    await msq.connect();
    return { msq, server, uri };
}

/**
 * Start an in-memory MongoDB replica set and connect a MonSQLize instance.
 * Useful for change streams and transactions.
 */
export async function setupReplicaSetExample(dbName = 'monsqlize-example-rs'): Promise<ExampleContext<MongoMemoryReplSet>> {
    const server = await MongoMemoryReplSet.create({
        replSet: { count: 1, storageEngine: 'wiredTiger' },
        binary: { version: '6.0.12' },
    });
    const uri = server.getUri();
    const msq = new MonSQLize({
        type: 'mongodb',
        databaseName: dbName,
        config: { uri },
    });
    await msq.connect();
    return { msq, server, uri };
}

/**
 * Gracefully stop the MonSQLize instance and the in-memory server.
 */
export async function teardownExample(msq: MonSQLize, server: StoppableMemoryServer): Promise<void> {
    await msq.close();
    await server.stop();
}
