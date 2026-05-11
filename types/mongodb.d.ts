import type { Db, MongoClient, MongoClientOptions } from 'mongodb';

export interface MongoConnectConfig {
    uri?: string;
    options?: MongoClientOptions;
}

export interface MongoConnectionState {
    client: MongoClient;
    db: Db;
}

