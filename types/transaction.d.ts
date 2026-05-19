import type { CacheLike } from './runtime';
import type { LoggerLike } from './base';

/** Minimal MongoDB session contract used by the transaction layer. */
export interface MongoSession {
    id: unknown;
    inTransaction(): boolean;
    startTransaction(options?: Record<string, unknown>): void;
    commitTransaction(): Promise<void>;
    abortTransaction(): Promise<void>;
    endSession(): Promise<void>;
}

/** Options forwarded to the MongoDB driver when starting a transaction session. */
export interface TransactionOptions {
    readConcern?: {
        level: 'local' | 'majority' | 'snapshot' | 'linearizable' | 'available';
    };
    readPreference?: 'primary' | 'primaryPreferred' | 'secondary' | 'secondaryPreferred' | 'nearest';
    causalConsistency?: boolean;
    /** Maximum transaction duration in milliseconds before an automatic abort. */
    maxDuration?: number;
    /** @alias maxDuration — v1 compat field */
    timeout?: number;
    enableRetry?: boolean;
    maxRetries?: number;
    retryDelay?: number;
    retryBackoff?: number;
    enableCacheLock?: boolean;
    lockCleanupInterval?: number;
    writeConcern?: Record<string, unknown>;
}

/** Snapshot of a transaction's current state. */
export interface TransactionInfo {
    id: string;
    status: 'pending' | 'active' | 'committed' | 'aborted';
    duration: number;
    sessionId: string;
}

/** Aggregate statistics for all transactions managed by a `TransactionManager`. */
export interface TransactionStats {
    totalTransactions: number;
    successfulTransactions: number;
    failedTransactions: number;
    activeTransactions: number;
    averageDuration: number;
}

/**
 * In-memory lock tracker used to serialise cache invalidation across transaction boundaries.
 * Attached to `TransactionManager`; locks are auto-released when a transaction commits or aborts.
 */
export declare class CacheLockManager {
    constructor(options?: { logger?: LoggerLike | null; maxDuration?: number; cleanupInterval?: number; });
    /** Register a lock for `key` owned by `owner`. */
    addLock(key: string, owner: { id?: unknown; } | string): void;
    /** Return `true` if `key` is currently locked. */
    isLocked(key: string): boolean;
    /** Release all locks held by `owner`. */
    releaseLocks(owner: { id?: unknown; } | string): void;
    /** Return lock usage statistics. */
    getStats(): { totalLocks: number; activeLocks: number; maxDuration: number; };
    /** Release all locks immediately. */
    clear(): void;
    /** Stop the background cleanup timer. */
    stop(): void;
}

/** Represents a single MongoDB transaction session with optional cache-lock integration. */
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
    /** Begin the transaction (starts the MongoDB session transaction). */
    start(): Promise<void>;
    /** Commit the transaction; replays recorded cache invalidations on success. */
    commit(): Promise<void>;
    /** Abort the transaction and discard pending cache invalidations. */
    abort(): Promise<void>;
    /** Alias for `commit()` — v1 compat shorthand. */
    end(): Promise<void>;
    /** Record a cache-invalidation pattern to be replayed on commit. */
    recordInvalidation(pattern: string): Promise<void>;
    /** Return the elapsed duration in milliseconds since the transaction started. */
    getDuration(): number;
    /** Return a snapshot of the transaction's current state and metadata. */
    getInfo(): TransactionInfo;
}

/** Manages the lifecycle of MongoDB transactions, including retry and session pooling. */
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
    /** Open a new transaction session. */
    startSession(options?: TransactionOptions): Promise<Transaction>;
    /** Execute `callback` inside a transaction; commits on success, aborts on failure. */
    withTransaction<T>(callback: (transaction: Transaction) => Promise<T>, options?: TransactionOptions): Promise<T>;
    /** Return all currently active (uncommitted) transactions. */
    getActiveTransactions(): Transaction[];
    /** Abort all active transactions immediately. */
    abortAll(): Promise<void>;
    /** Return aggregate transaction statistics. */
    getStats(): TransactionStats;
}
