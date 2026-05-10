import type { LoggerLike } from './base';
import type { Collection, DbAccessor, HealthView } from './collection';
import type { Lock, LockOptions } from './lock';
import type { ModelInstance } from './model';
import type { ConnectionPoolManagerOptions, PoolConfig, PoolStrategy } from './pool';
import type { MemoryCache } from './runtime';
import type { SagaDefinition, SagaOrchestrator, SagaResult, SagaStats } from './saga';
import type { SlowQueryLogConfigInput, SlowQueryLogEntry, SlowQueryLogFilter, SlowQueryLogManager, SlowQueryLogQueryOptions, SlowQueryLogRecord } from './slow-query-log';
import type { ChangeStreamSyncManager, SyncConfig, SyncStats } from './sync';
import type { Transaction, TransactionOptions } from './transaction';

export interface MonSQLizeOptions {
    type?: 'mongodb';
    databaseName?: string;
    config?: Record<string, unknown>;
    cache?: Record<string, unknown> | MemoryCache;
    logger?: LoggerLike | null;
    pools?: PoolConfig[];
    poolStrategy?: PoolStrategy;
    poolFallback?: ConnectionPoolManagerOptions['poolFallback'];
    maxPoolsCount?: number;
    sync?: SyncConfig;
    slowQueryLog?: SlowQueryLogConfigInput;
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
    startSession(options?: TransactionOptions): Promise<Transaction>;
    withTransaction<T>(callback: (transaction: Transaction) => Promise<T>, options?: TransactionOptions): Promise<T>;
    withLock<T>(key: string, callback: () => Promise<T>, options?: LockOptions): Promise<T>;
    acquireLock(key: string, options?: LockOptions): Promise<Lock>;
    tryAcquireLock(key: string, options?: Omit<LockOptions, 'retryTimes'>): Promise<Lock | null>;
    getSyncManager(): ChangeStreamSyncManager | null;
    getSlowQueryLogManager(): SlowQueryLogManager | null;
    getSagaOrchestrator(): SagaOrchestrator;
    saga(): SagaOrchestrator;
    defineSaga(definition: SagaDefinition): void;
    executeSaga(name: string, data: unknown): Promise<SagaResult>;
    listSagas(): string[];
    getSagaStats(): SagaStats;
    startSync(): Promise<void>;
    stopSync(): Promise<void>;
    getSyncStats(): SyncStats | null;
    recordSlowQuery(log: SlowQueryLogEntry): Promise<void>;
    getSlowQueryLogs(filter?: SlowQueryLogFilter, options?: SlowQueryLogQueryOptions): Promise<SlowQueryLogRecord[]>;
    on(event: string, handler: (payload: unknown) => void): void;
    once(event: string, handler: (payload: unknown) => void): void;
    off(event: string, handler: (payload: unknown) => void): void;
    emit(event: string, payload: unknown): void;
}

