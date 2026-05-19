import type { Db, MongoClient, MongoClientOptions } from 'mongodb';

export interface MongoConnectConfig {
    uri?: string;
    options?: MongoClientOptions;
    /**
     * v1 compat: when true, automatically starts mongodb-memory-server without requiring a uri.
     * For testing only.
     */
    useMemoryServer?: boolean;
    /** Instance/binary configuration options for mongodb-memory-server. */
    memoryServerOptions?: {
        instance?: { port?: number; dbName?: string; storageEngine?: string; replSet?: string };
        binary?: { version?: string };
        [key: string]: unknown;
    };
}

export interface MongoConnectionState {
    client: MongoClient;
    db: Db;
}

