/**
 * P4-A transaction / cache-lock 能力。
 *
 * 说明：
 * - 当前模块负责事务生命周期、重试策略与最小缓存锁联动。
 * - 公开与共享类型统一由 `types/transaction.d.ts` 承接；此处只保留运行时实现与内部状态类型。
 */

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

export class CacheLockManager {
    private readonly locks = new Map<string, CacheLockRecord>();
    private readonly logger: LoggerLike | null;
    private readonly maxDuration: number;
    private readonly cleanupInterval: number;
    private readonly cleanupTimer: NodeJS.Timeout;

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
     * 添加缓存锁。
     * @since v1.4.0
     */
    addLock(key: string, owner: { id?: unknown; } | string): void {
        const ownerId = typeof owner === 'string' ? owner : String(owner.id ?? 'unknown');
        this.locks.set(key, {
            ownerId,
            expiresAt: Date.now() + this.maxDuration,
        });
    }

    /**
     * 检查缓存键是否被锁定。
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
     * 释放 owner 的所有缓存锁。
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
     * 获取缓存锁统计。
     * @since v1.4.0
     */
    getStats(): { totalLocks: number; activeLocks: number; maxDuration: number; } {
        this.cleanupExpiredLocks();
        return {
            totalLocks: this.locks.size,
            activeLocks: this.locks.size,
            maxDuration: this.maxDuration,
        };
    }

    /**
     * 清空缓存锁。
     * @since v1.4.0
     */
    clear(): void {
        this.locks.clear();
    }

    /**
     * 停止缓存锁管理器。
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

export class Transaction {
    readonly id = `tx_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    state: 'pending' | 'started' | 'committed' | 'aborted' = 'pending';
    private startedAt: number | null = null;
    private timeoutTimer: NodeJS.Timeout | null = null;
    private readonly pendingInvalidations = new Set<string>();

    constructor(
        readonly session: MongoSession,
        private readonly options: {
            cache?: CacheLike | null;
            logger?: LoggerLike | null;
            lockManager?: CacheLockManager | null;
            timeout?: number;
        } = {},
    ) {}

    /**
     * 启动事务。
     * @since v1.4.0
     */
    async start(): Promise<void> {
        if (this.state !== 'pending') {
            throw new Error(`Cannot start transaction in state: ${this.state}`);
        }
        this.session.startTransaction();
        this.state = 'started';
        this.startedAt = Date.now();
        const timeout = this.options.timeout ?? 30000;
        if (timeout > 0) {
            this.timeoutTimer = setTimeout(() => {
                if (this.state === 'started') {
                    this.options.logger?.warn?.(`[Transaction] auto-abort on timeout: ${this.id}`);
                    void this.abort();
                }
            }, timeout);
            this.timeoutTimer.unref?.();
        }
    }

    /**
     * 提交事务。
     * @since v1.4.0
     */
    async commit(): Promise<void> {
        if (this.state !== 'started') {
            throw new Error(`Cannot commit transaction in state: ${this.state}`);
        }
        await this.session.commitTransaction();
        this.state = 'committed';
        this.options.lockManager?.releaseLocks(this.id);
        this.pendingInvalidations.clear();
        this.clearTimeout();
    }

    /**
     * 回滚事务。
     * @since v1.4.0
     */
    async abort(): Promise<void> {
        if (this.state !== 'pending' && this.state !== 'started') {
            return;
        }
        if (this.state === 'started') {
            await this.session.abortTransaction();
        }
        this.state = 'aborted';
        this.options.lockManager?.releaseLocks(this.id);
        this.pendingInvalidations.clear();
        this.clearTimeout();
    }

    /**
     * 结束事务会话。
     * @since v1.4.0
     */
    async end(): Promise<void> {
        this.clearTimeout();
        this.options.lockManager?.releaseLocks(this.id);
        await this.session.endSession();
    }

    /**
     * 记录缓存失效意图。
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
     * 获取事务持续时间。
     * @since v1.4.0
     */
    getDuration(): number {
        if (!this.startedAt) {
            return 0;
        }
        return Date.now() - this.startedAt;
    }

    /**
     * 获取事务信息。
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

    private clearTimeout(): void {
        if (this.timeoutTimer) {
            clearTimeout(this.timeoutTimer);
            this.timeoutTimer = null;
        }
    }
}

export class TransactionManager {
    private readonly logger: LoggerLike | null;
    private readonly cache: CacheLike | null;
    private readonly lockManager: CacheLockManager | null;
    private readonly defaultOptions: Required<Pick<TransactionOptions, 'maxDuration' | 'enableRetry' | 'maxRetries' | 'retryDelay' | 'retryBackoff'>>;
    private readonly activeTransactions = new Map<string, Transaction>();
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
    }) {
        this.client = options.client;
        this.cache = options.cache ?? null;
        this.logger = options.logger ?? null;
        this.lockManager = options.lockManager ?? null;
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
     * 创建手动事务会话。
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
            timeout: options.maxDuration ?? this.defaultOptions.maxDuration,
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
     * 自动管理事务生命周期。
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
     * 获取活跃事务。
     * @since v1.4.0
     */
    getActiveTransactions(): Transaction[] {
        return [...this.activeTransactions.values()];
    }

    /**
     * 中止所有活跃事务。
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
     * 获取事务统计。
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

