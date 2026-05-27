import type { Db, MongoClient, MongoClientOptions } from 'mongodb';
import type { SSHConfig } from './monsqlize';

export interface MongoConnectConfig {
    uri?: string;
    options?: MongoClientOptions;
    /** v1 compat: read preference shortcut merged into MongoClient options. */
    readPreference?: MongoClientOptions['readPreference'];
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
    /**
     * SSH tunnel configuration. When provided, monSQLize establishes an SSH port-forward
     * through the specified bastion host before connecting to MongoDB.
     * The remote host/port are auto-parsed from `uri` unless overridden by `remoteHost`/`remotePort`.
     * @since v1.3.0
     */
    ssh?: SSHConfig;
    /**
     * Explicit remote MongoDB host visible from the SSH server.
     * Overrides the host auto-parsed from `uri` when `ssh` is set.
     * @since v1.3.0
     */
    remoteHost?: string;
    /**
     * Explicit remote MongoDB port visible from the SSH server.
     * Overrides the port auto-parsed from `uri` when `ssh` is set.
     * @since v1.3.0
     */
    remotePort?: number;
    /** @alias remoteHost — v1 SSH config field */
    mongoHost?: string;
    /** @alias remotePort — v1 SSH config field */
    mongoPort?: number;
}

export interface MongoConnectionState {
    client: MongoClient;
    db: Db;
}

