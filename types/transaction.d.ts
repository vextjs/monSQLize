import type { CacheLike } from './runtime';
import type { LoggerLike } from './base';

export interface MongoSession {
    id: unknown;
    inTransaction(): boolean;
    startTransaction(options?: Record<string, unknown>): void;
    commitTransaction(): Promise<void>;
    abortTransaction(): Promise<void>;
    endSession(): Promise<void>;
}

export interface TransactionOptions {
    readConcern?: {
        level: 'local' | 'majority' | 'snapshot' | 'linearizable' | 'available';
    };
    readPreference?: 'primary' | 'primaryPreferred' | 'secondary' | 'secondaryPreferred' | 'nearest';
    causalConsistency?: boolean;
    maxDuration?: number;
    /** @alias maxDuration — v1 兼容字段 */
    timeout?: number;
    enableRetry?: boolean;
    maxRetries?: number;
    retryDelay?: number;
    retryBackoff?: number;
    enableCacheLock?: boolean;
    lockCleanupInterval?: number;
    writeConcern?: Record<string, unknown>;
}

export interface TransactionInfo {
    id: string;
    status: 'pending' | 'active' | 'committed' | 'aborted';
    duration: number;
    sessionId: string;
}

export interface TransactionStats {
    totalTransactions: number;
    successfulTransactions: number;
    failedTransactions: number;
    activeTransactions: number;
    averageDuration: number;
}

export declare class CacheLockManager {
    constructor(options?: { logger?: LoggerLike | null; maxDuration?: number; cleanupInterval?: number; });
    addLock(key: string, owner: { id?: unknown; } | string): void;
    isLocked(key: string): boolean;
    releaseLocks(owner: { id?: unknown; } | string): void;
    getStats(): { totalLocks: number; activeLocks: number; maxDuration: number; };
    clear(): void;
    stop(): void;
}

export declare class Transaction {
    readonly id: string;
    readonly session: MongoSession;
    readonly state: 'pending' | 'active' | 'committed' | 'aborted';
    constructor(session: MongoSession, options?: {
        cache?: CacheLike | null;
        logger?: LoggerLike | null;
        lockManager?: CacheLockManager | null;
        timeout?: number;
    });
    start(): Promise<void>;
    commit(): Promise<void>;
    abort(): Promise<void>;
    end(): Promise<void>;
    recordInvalidation(pattern: string): Promise<void>;
    getDuration(): number;
    getInfo(): TransactionInfo;
}

export declare class TransactionManager {
    constructor(options: {
        client: unknown;
        cache?: CacheLike | null;
        logger?: LoggerLike | null;
        lockManager?: CacheLockManager | null;
        maxDuration?: number;
        enableRetry?: boolean;
        maxRetries?: number;
        retryDelay?: number;
        retryBackoff?: number;
    });
    startSession(options?: TransactionOptions): Promise<Transaction>;
    withTransaction<T>(callback: (transaction: Transaction) => Promise<T>, options?: TransactionOptions): Promise<T>;
    getActiveTransactions(): Transaction[];
    abortAll(): Promise<void>;
    getStats(): TransactionStats;
}

