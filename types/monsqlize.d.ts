import type { LoggerLike } from './base';
import type { Collection, DbAccessor, HealthView } from './collection';
import type { ModelInstance } from './model';
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
            model: <TDocument = Record<string, unknown>>(modelName: string) => ModelInstance<TDocument>;
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
        model: <TDocument = Record<string, unknown>>(modelName: string) => ModelInstance<TDocument>;
    };
    pool(poolName: string): {
        collection: <TSchema = unknown>(name: string) => Collection<TSchema>;
        model: <TDocument = Record<string, unknown>>(name: string) => ModelInstance<TDocument>;
        use: (dbName: string) => {
            collection: <TSchema = unknown>(name: string) => Collection<TSchema>;
            model: <TDocument = Record<string, unknown>>(name: string) => ModelInstance<TDocument>;
        };
    };
    scopedCollection<TSchema = unknown>(name: string, options?: { database?: string; }): Collection<TSchema>;
    scopedModel<TDocument = Record<string, unknown>>(name: string, options?: { database?: string; pool?: string; }): ModelInstance<TDocument>;
    model<TDocument = Record<string, unknown>>(name: string): ModelInstance<TDocument>;
    startSession(): Promise<{ session: null; }>;
    withTransaction<T>(callback: (transaction: { session: null; }) => Promise<T>): Promise<T>;
    on(event: string, handler: (payload: unknown) => void): void;
    once(event: string, handler: (payload: unknown) => void): void;
    off(event: string, handler: (payload: unknown) => void): void;
    emit(event: string, payload: unknown): void;
}

