import type { LoggerLike } from './base';

/**
 * SSH tunnel configuration for connecting through a bastion host.
 * @since v1.3.0
 */
export interface SSHConfig {
    /** SSH server hostname or IP. */
    host: string;
    /** SSH server port (default: 22). */
    port?: number;
    /** SSH login username. */
    username: string;
    /** SSH password (mutually exclusive with privateKey). */
    password?: string;
    /** SSH private key string or Buffer (mutually exclusive with password). */
    privateKey?: string | Buffer;
    /** Passphrase for an encrypted private key. */
    passphrase?: string;
    /** Connection ready timeout in milliseconds (default: 30000). */
    readyTimeout?: number;
    /** Keep-alive interval in milliseconds (default: 10000). */
    keepaliveInterval?: number;
    /** Target database host as seen from the SSH server (default: 'localhost'). */
    dstHost?: string;
    /** Target database port as seen from the SSH server. */
    dstPort?: number;
}

import type { Collection, DbAccessor, HealthView } from './collection';
import type { Lock, LockOptions, LockStats } from './lock';
import type { ModelInstance } from './model';
import type { MongoConnectConfig } from './mongodb';
import type { ConnectionPoolManagerOptions, PoolConfig, PoolHealthStatus, PoolStats, PoolStrategy } from './pool';
import type { MemoryCache, MultiLevelCacheOptions } from './runtime';
import type { SagaDefinition, SagaOrchestrator, SagaResult, SagaStats } from './saga';
import type { SlowQueryLogConfigInput, SlowQueryLogEntry, SlowQueryLogFilter, SlowQueryLogManager, SlowQueryLogQueryOptions, SlowQueryLogRecord } from './slow-query-log';
import type { ChangeStreamSyncManager, SyncConfig, SyncStats } from './sync';
import type { Transaction, TransactionOptions } from './transaction';

export interface MonSQLizeOptions {
    type?: 'mongodb';
    databaseName?: string;
    /** @alias databaseName — v1 compatibility */
    database?: string;
    config?: MongoConnectConfig;
    cache?: Record<string, unknown> | MemoryCache | MultiLevelCacheOptions;
    logger?: LoggerLike | null;
    pools?: PoolConfig[];
    poolStrategy?: PoolStrategy;
    poolFallback?: ConnectionPoolManagerOptions['poolFallback'];
    maxPoolsCount?: number;
    sync?: SyncConfig;
    slowQueryLog?: SlowQueryLogConfigInput;
    /** Global query timeout in milliseconds applied to all find/aggregate operations. Default: undefined (no timeout). @since v1.3.0 */
    maxTimeMS?: number;
    /** Default limit for find() when caller does not specify one. Default: undefined (no limit). @since v1.3.0 */
    findLimit?: number;
    /** Slow query threshold in milliseconds; populates slowQueryLog.filter.minExecutionTimeMs when slowQueryLog is enabled. Default: 500. @since v1.3.0 */
    slowQueryMs?: number;
    /** Maximum allowed limit for findPage() operations. Requests exceeding this cap are silently clamped. Default: 500. @since v1.3.0 */
    findPageMaxLimit?: number;
    /** Namespace scope for cursor isolation between multiple MonSQLize instances sharing a cache. @since v1.3.0 */
    namespace?: { scope?: 'database' | 'connection'; instanceId?: string; };
    /** HMAC-SHA256 secret used to sign and verify cursor tokens returned by findPage(). @since v1.3.0 */
    cursorSecret?: string;
    /** Logging tag configuration applied to slow-query event payloads. @since v1.3.0 */
    log?: { slowQueryTag?: { event?: string; code?: string; }; };
    /** Auto-convert 24-character hex strings to ObjectId in query filters. Pass a field map to selectively enable per field. Default: true for mongodb type (pass `false` to disable). @since v1.3.0 */
    autoConvertObjectId?: boolean | Record<string, boolean>;
    /** Batch count operations to reduce server round-trips. @since v1.3.0 */
    countQueue?: { enabled: boolean; concurrency?: number; maxQueueSize?: number; timeout?: number; };
    /** Model definitions to auto-register on connect. Accepts a file path (string) or an object with { path, pattern?, recursive? }. @since v1.3.0 */
    models?: string | { path: string; pattern?: string; recursive?: boolean; };
    /** Auto-invalidate cache on write operations. @since v1.3.0 */
    cacheAutoInvalidate?: boolean;
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
    listSagas(): Promise<string[]>;
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
    /** @since v1.3.0 — v1 pool management parity */
    addPool(config: PoolConfig): Promise<void>;
    removePool(name: string): Promise<void>;
    getPoolNames(): string[];
    getPoolStats(): Record<string, PoolStats>;
    getPoolHealth(): Record<string, PoolHealthStatus>;
    getLockStats(): LockStats | null;
    /** @since v1.3.0 — v1 database management parity */
    listDatabases(options?: { nameOnly?: boolean }): Promise<Array<{ name: string; sizeOnDisk: number; empty: boolean }> | string[]>;
    dropDatabase(options?: { confirm: boolean; allowProduction?: boolean; user?: string }): Promise<{ dropped: boolean; database: string; timestamp: Date }>;
    listCollections(filter?: Record<string, unknown>, options?: Record<string, unknown>): Promise<Array<{ name: string; type: string }>>;
    runCommand(command: Record<string, unknown>, options?: Record<string, unknown>): Promise<Record<string, unknown>>;
}

