import type { LoggerLike } from './base';
import type { Collection, DbAccessor, HealthView } from './collection';
import type { MemoryCache } from './runtime';

export interface MonSQLizeOptions {
    type?: 'mongodb';
    databaseName?: string;
    config?: Record<string, unknown>;
    cache?: Record<string, unknown> | MemoryCache;
    logger?: LoggerLike | null;
}

export interface MonSQLize {
    connect(): Promise<{
        collection: <TSchema = unknown>(name: string) => Collection<TSchema>;
        db: (name?: string) => DbAccessor;
        use: (name: string) => {
            collection: <TSchema = unknown>(collectionName: string) => Collection<TSchema>;
            model: (modelName: string) => Record<string, unknown>;
        };
        instance: MonSQLize;
    }>;
    getCache(): MemoryCache;
    getDefaults(): Record<string, unknown>;
    close(): Promise<void>;
    health(): Promise<HealthView>;
    collection<TSchema = unknown>(name: string): Collection<TSchema>;
    db(name?: string): DbAccessor;
    use(name: string): {
        collection: <TSchema = unknown>(collectionName: string) => Collection<TSchema>;
        model: (modelName: string) => Record<string, unknown>;
    };
    pool(poolName: string): {
        collection: <TSchema = unknown>(name: string) => Collection<TSchema>;
        model: (name: string) => Record<string, unknown>;
        use: (dbName: string) => {
            collection: <TSchema = unknown>(name: string) => Collection<TSchema>;
            model: (name: string) => Record<string, unknown>;
        };
    };
    scopedCollection<TSchema = unknown>(name: string, options?: { database?: string; }): Collection<TSchema>;
    scopedModel(name: string): Record<string, unknown>;
    model(name: string): Record<string, unknown>;
    startSession(): Promise<{ session: null; }>;
    withTransaction<T>(callback: (transaction: { session: null; }) => Promise<T>): Promise<T>;
    on(event: string, handler: (payload: unknown) => void): void;
    once(event: string, handler: (payload: unknown) => void): void;
    off(event: string, handler: (payload: unknown) => void): void;
    emit(event: string, payload: unknown): void;
}

