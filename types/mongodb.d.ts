import type { Db, MongoClient, MongoClientOptions } from 'mongodb';

export interface MongoConnectConfig {
    uri?: string;
    options?: MongoClientOptions;
    /**
     * v1 兼容：为 true 时自动启动 mongodb-memory-server，无需提供 uri。
     * 仅用于测试。
     */
    useMemoryServer?: boolean;
    /** mongodb-memory-server 的实例/二进制配置选项 */
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

