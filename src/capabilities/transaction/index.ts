/**
 * Transaction / cache-lock capability.
 *
 * Description:
 * - Responsible for transaction lifecycle, retry strategy, and cache-lock coordination.
 * - Public and shared types are managed by `types/transaction.d.ts`; only runtime implementation and internal state types are kept here.
 */

import { randomBytes } from 'node:crypto';
import type { MongoClient, ClientSession } from 'mongodb';
import type { CacheLike } from '../cache';
import type { LoggerLike } from '../../core/logger';
import type {
    MongoSession,
    TransactionInfo,
    TransactionOptions,
    TransactionStats,
} from '../../../types/transaction';

export type {
    MongoSession,
    TransactionInfo,
    TransactionOptions,
    TransactionStats,
} from '../../../types/transaction';

interface CacheLockRecord {
    ownerId: string;
    expiresAt: number;
}

/**
 * Manages distributed cache-based locks to guard critical sections.
 * @since v1.3.0
 */
export class CacheLockManager {
    private readonly locks = new Map<string, CacheLockRecord>();
    private readonly logger: LoggerLike | null;
    private readonly maxDuration: number;
    private readonly cleanupInterval: number;
    private readonly cleanupTimer: NodeJS.Timeout;
    private _totalLocksAdded = 0;

    constructor(options: { logger?: LoggerLike | null; maxDuration?: number; cleanupInterval?: number; } = {}) {
        this.logger = options.logger ?? null;
        this.maxDuration = options.maxDuration ?? 300000;
        this.cleanupInterval = options.cleanupInterval ?? 10000;
        this.cleanupTimer = setInterval(() => {
            this.cleanupExpiredLocks();
        }, this.cleanupInterval);
        this.cleanupTimer.unref?.();
    }

    /**
     * Add a cache lock.
     * @since v1.4.0
     */
    addLock(key: string, owner: { id?: unknown; } | string): void {
        const ownerId = typeof owner === 'string' ? owner : String(owner.id ?? 'unknown');
        this.locks.set(key, {
            ownerId,
            expiresAt: Date.now() + this.maxDuration,
        });
        this._totalLocksAdded += 1;
    }

    /**
     * Check whether a cache key is locked.
     * @since v1.4.0
     */
    isLocked(key: string): boolean {
        this.cleanupExpiredLocks();
        if (this.locks.has(key)) {
            return true;
        }
        for (const pattern of this.locks.keys()) {
            if (!pattern.includes('*')) {
                continue;
            }
            const regex = new RegExp(`^${escapeRegExp(pattern).replace(/\\\*/g, '.*')}$`);
            if (regex.test(key)) {
                return true;
            }
        }
        return false;
    }

    /**
     * Release all cache locks held by the given owner.
     * @since v1.4.0
     */
    releaseLocks(owner: { id?: unknown; } | string): void {
        const ownerId = typeof owner === 'string' ? owner : String(owner.id ?? 'unknown');
        for (const [key, record] of this.locks.entries()) {
            if (record.ownerId === ownerId) {
                this.locks.delete(key);
            }
        }
    }

    /**
     * Get cache lock statistics.
     * @since v1.4.0
     */
    getStats(): { totalLocks: number; activeLocks: number; maxDuration: number; } {
        this.cleanupExpiredLocks();
        return {
            totalLocks: this._totalLocksAdded,
            activeLocks: this.locks.size,
            maxDuration: this.maxDuration,
        };
    }

    /**
     * Clear all cache locks.
     * @since v1.4.0
     */
    clear(): void {
        this.locks.clear();
    }

    /**
     * Stop the cache lock manager.
     * @since v1.4.0
     */
    stop(): void {
        clearInterval(this.cleanupTimer);
    }

    private cleanupExpiredLocks(): void {
        const now = Date.now();
        for (const [key, value] of this.locks.entries()) {
            if (value.expiresAt <= now) {
                this.locks.delete(key);
            }
        }
    }
}

/**
 * Represents a single database transaction lifecycle (pending → active → committed/aborted).
 * @since v1.3.0
 */
export class Transaction {
    readonly id = `tx_${randomBytes(8).toString('hex')}`;
    state: 'pending' | 'active' | 'committed' | 'aborted' = 'pending';
    private startedAt: number | null = null;
    private timeoutTimer: NodeJS.Timeout | null = null;
    readonly pendingInvalidations = new Set<string>();

    constructor(
        readonly session: MongoSession,
        private readonly options: {
            cache?: CacheLike | null;
            logger?: LoggerLike | null;
            lockManager?: CacheLockManager | null;
            timeout?: number;
        } = {},
    ) {
        (this.session as MongoSession & { __monSQLizeTransaction?: Transaction; }).__monSQLizeTransaction = this;
    }

    /**
     * Start the transaction.
     * @since v1.4.0
     */
    async start(): Promise<void> {
        if (this.state !== 'pending') {
            throw new Error(`Cannot start transaction in state: ${this.state}`);
        }
        this.session.startTransaction();
        this.state = 'active';
        this.startedAt = Date.now();
        const timeout = this.options.timeout ?? 30000;
        if (timeout > 0) {
            this.timeoutTimer = setTimeout(() => {
                if (this.state === 'active') {
                    this.options.logger?.warn?.(`[Transaction] auto-abort on timeout: ${this.id}`);
                    void this.abort();
                }
            }, timeout);
            this.timeoutTimer.unref?.();
        }
    }

    /**
     * Commit the transaction.
     * @since v1.4.0
     */
    async commit(): Promise<void> {
        if (this.state !== 'active') {
            throw new Error(`Cannot commit transaction in state: ${this.state}`);
        }
        if (typeof (this.session as unknown as Record<string, unknown>).commitTransaction === 'function') {
            await this.session.commitTransaction();
        }
        this.state = 'committed';
        this.options.lockManager?.releaseLocks(this.id);
        this.pendingInvalidations.clear();
        this.clearTimeout();
    }

    /**
     * Roll back the transaction.
     * @since v1.4.0
     */
    async abort(): Promise<void> {
        if (this.state !== 'pending' && this.state !== 'active') {
            return;
        }
        if (this.state === 'active') {
            if (typeof (this.session as unknown as Record<string, unknown>).abortTransaction === 'function') {
                await this.session.abortTransaction();
            }
        }
        this.state = 'aborted';
        this.options.lockManager?.releaseLocks(this.id);
        this.pendingInvalidations.clear();
        this.clearTimeout();
    }

    /**
     * End the transaction session.
     * @since v1.4.0
     */
    async end(): Promise<void> {
        this.clearTimeout();
        this.options.lockManager?.releaseLocks(this.id);
        await this.session.endSession();
    }

    /**
     * Record a cache invalidation intent.
     * @since v1.4.0
     */
    async recordInvalidation(pattern: string): Promise<void> {
        this.pendingInvalidations.add(pattern);
        this.options.lockManager?.addLock(pattern, this.id);
        if (this.options.cache?.delPattern) {
            await this.options.cache.delPattern(pattern);
        }
    }

    /**
     * Get the transaction duration.
     * @since v1.4.0
     */
    getDuration(): number {
        if (!this.startedAt) {
            return 0;
        }
        return Date.now() - this.startedAt;
    }

    /**
     * Get transaction info.
     * @since v1.4.0
     */
    getInfo(): TransactionInfo {
        return {
            id: this.id,
            status: this.state,
            duration: this.getDuration(),
            sessionId: stringifySessionId(this.session.id),
        };
    }

    /**
     * Get v1-compatible transaction statistics for this transaction instance.
     * @since v1.4.0
     */
    getStats(): {
        id: string;
        state: Transaction['state'];
        duration: number;
        hasWriteOperation: boolean;
        operationCount: number;
        lockedKeysCount: number;
    } {
        return {
            id: this.id,
            state: this.state,
            duration: this.getDuration(),
            hasWriteOperation: this.pendingInvalidations.size > 0,
            operationCount: this.pendingInvalidations.size,
            lockedKeysCount: this.pendingInvalidations.size,
        };
    }

    private clearTimeout(): void {
        if (this.timeoutTimer) {
            clearTimeout(this.timeoutTimer);
            this.timeoutTimer = null;
        }
    }
}

/**
 * Coordinates transaction creation, commit, abort, and retry logic.
 * @since v1.3.0
 */
export class TransactionManager {
    private readonly logger: LoggerLike | null;
    private readonly cache: CacheLike | null;
    private readonly lockManager: CacheLockManager | null;
    private readonly defaultOptions: Required<Pick<TransactionOptions, 'maxDuration' | 'enableRetry' | 'maxRetries' | 'retryDelay' | 'retryBackoff'>>;
    readonly activeTransactions = new Map<string, Transaction>();
    private readonly durations: number[] = [];
    private readonly stats = {
        totalTransactions: 0,
        successfulTransactions: 0,
        failedTransactions: 0,
    };

    constructor(options: {
        client: MongoClient;
        cache?: CacheLike | null;
        logger?: LoggerLike | null;
        lockManager?: CacheLockManager | null;
        maxDuration?: number;
        enableRetry?: boolean;
        maxRetries?: number;
        retryDelay?: number;
        retryBackoff?: number;
    });
    constructor(
        client: MongoClient,
        cache?: CacheLike | null,
        options?: {
            logger?: LoggerLike | null;
            lockManager?: CacheLockManager | null;
            maxDuration?: number;
            enableRetry?: boolean;
            maxRetries?: number;
            retryDelay?: number;
            retryBackoff?: number;
        },
    );
    constructor(
        input: {
            client: MongoClient;
            cache?: CacheLike | null;
            logger?: LoggerLike | null;
            lockManager?: CacheLockManager | null;
            maxDuration?: number;
            enableRetry?: boolean;
            maxRetries?: number;
            retryDelay?: number;
            retryBackoff?: number;
        } | MongoClient,
        legacyCache?: CacheLike | null,
        legacyOptions: {
            logger?: LoggerLike | null;
            lockManager?: CacheLockManager | null;
            maxDuration?: number;
            enableRetry?: boolean;
            maxRetries?: number;
            retryDelay?: number;
            retryBackoff?: number;
        } = {},
    ) {
        const options = ('client' in (input as object))
            ? input as unknown as { client: MongoClient; cache?: unknown; logger?: unknown; lockManager?: unknown; maxDuration?: number; enableRetry?: boolean; maxRetries?: number; retryDelay?: number; retryBackoff?: number }
            : {
                client: input as MongoClient,
                cache: legacyCache,
                ...legacyOptions,
            } as { client: MongoClient; cache?: unknown; logger?: unknown; lockManager?: unknown; maxDuration?: number; enableRetry?: boolean; maxRetries?: number; retryDelay?: number; retryBackoff?: number };
        this.client = options.client;
        this.cache = (options.cache ?? null) as CacheLike | null;
        this.logger = options.logger ?? null;
        this.lockManager = (options.lockManager ?? null) as CacheLockManager | null;
        this.defaultOptions = {
            maxDuration: options.maxDuration ?? 30000,
            enableRetry: options.enableRetry ?? true,
            maxRetries: options.maxRetries ?? 3,
            retryDelay: options.retryDelay ?? 100,
            retryBackoff: options.retryBackoff ?? 2,
        };
    }

    private readonly client: MongoClient;

    /**
     * Create a manual transaction session.
     * @since v1.4.0
     */
    async startSession(options: TransactionOptions = {}): Promise<Transaction> {
        const session = this.client.startSession({
            causalConsistency: options.causalConsistency !== false,
        }) as ClientSession as unknown as MongoSession;
        const transaction = new Transaction(session, {
            cache: this.cache,
            logger: this.logger,
            lockManager: options.enableCacheLock === false ? null : this.lockManager,
            timeout: options.timeout ?? options.maxDuration ?? this.defaultOptions.maxDuration,
        });
        const originalEnd = transaction.end.bind(transaction);
        transaction.end = async () => {
            await originalEnd();
            this.activeTransactions.delete(transaction.id);
        };
        this.activeTransactions.set(transaction.id, transaction);
        return transaction;
    }

    /**
     * Automatically manage the transaction lifecycle.
     * @since v1.4.0
     */
    async withTransaction<T>(callback: (transaction: Transaction) => Promise<T>, options: TransactionOptions = {}): Promise<T> {
        const maxRetries = options.maxRetries ?? this.defaultOptions.maxRetries;
        const retryDelay = options.retryDelay ?? this.defaultOptions.retryDelay;
        const retryBackoff = options.retryBackoff ?? this.defaultOptions.retryBackoff;
        const enableRetry = options.enableRetry ?? this.defaultOptions.enableRetry;

        let lastError: unknown;
        for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
            const transaction = await this.startSession(options);
            const startedAt = Date.now();
            try {
                await transaction.start();
                const result = await callback(transaction);
                await transaction.commit();
                this.recordStats(Date.now() - startedAt, true);
                return result;
            } catch (error) {
                lastError = error;
                await transaction.abort();
                this.recordStats(Date.now() - startedAt, false);
                if (!enableRetry || attempt === maxRetries || !isTransientTransactionError(error)) {
                    throw error;
                }
                await sleep(retryDelay * Math.pow(retryBackoff, attempt));
            } finally {
                await transaction.end();
            }
        }
        throw lastError instanceof Error ? lastError : new Error('Transaction failed.');
    }

    /**
     * Get all active transactions.
     * @since v1.4.0
     */
    getActiveTransactions(): Transaction[] {
        return [...this.activeTransactions.values()];
    }

    /**
     * Abort all active transactions.
     * @since v1.4.0
     */
    async abortAll(): Promise<void> {
        const transactions = this.getActiveTransactions();
        for (const transaction of transactions) {
            await transaction.abort();
            await transaction.end();
            this.activeTransactions.delete(transaction.id);
        }
    }

    /**
     * Get transaction statistics.
     * @since v1.4.0
     */
    getStats(): TransactionStats {
        const averageDuration = this.durations.length === 0
            ? 0
            : this.durations.reduce((sum, item) => sum + item, 0) / this.durations.length;
        return {
            totalTransactions: this.stats.totalTransactions,
            successfulTransactions: this.stats.successfulTransactions,
            failedTransactions: this.stats.failedTransactions,
            activeTransactions: this.activeTransactions.size,
            averageDuration,
        };
    }

    private recordStats(duration: number, success: boolean): void {
        this.stats.totalTransactions += 1;
        if (success) {
            this.stats.successfulTransactions += 1;
        } else {
            this.stats.failedTransactions += 1;
        }
        this.durations.push(duration);
        if (this.durations.length > 100) {
            this.durations.shift();
        }
    }
}

function stringifySessionId(id: unknown): string {
    if (typeof id === 'string') {
        return id;
    }
    if (typeof id === 'object' && id !== null) {
        const candidate = id as { toHexString?: () => string; toString?: () => string; id?: { buffer?: Uint8Array; }; };
        if (typeof candidate.toHexString === 'function') {
            return candidate.toHexString();
        }
        if (candidate.id?.buffer) {
            return Buffer.from(candidate.id.buffer).toString('hex');
        }
        if (typeof candidate.toString === 'function') {
            return candidate.toString();
        }
    }
    return String(id);
}

function isTransientTransactionError(error: unknown): boolean {
    if (!error || typeof error !== 'object') {
        return false;
    }
    const candidate = error as { code?: number; hasErrorLabel?: (label: string) => boolean; };
    if (typeof candidate.hasErrorLabel === 'function' && candidate.hasErrorLabel('TransientTransactionError')) {
        return true;
    }
    return candidate.code === 112 || candidate.code === 117;
}

function escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function sleep(ms: number): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, ms));
}

