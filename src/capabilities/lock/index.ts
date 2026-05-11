/**
 * P4-A 业务锁能力。
 *
 * 说明：
 * - 当前模块负责 lock manager、lock handle 与 fallbackToNoLock 最小闭环。
 * - 公开与共享类型统一由 `types/lock.d.ts` 承接；此处只保留运行时实现与内部状态类型。
 */

import { randomUUID } from 'node:crypto';
import type { LoggerLike } from '../../core/logger';
import type { LockOptions, LockStats } from '../../../types/lock';

export type { LockOptions, LockStats } from '../../../types/lock';

interface LockRecord {
    lockId: string;
    expiresAt: number;
}

interface LockManagerOptions {
    logger?: LoggerLike | null;
    lockKeyPrefix?: string;
    maxDuration?: number;
}

export class LockAcquireError extends Error {
    readonly code = 'LOCK_ACQUIRE_FAILED';

    constructor(message: string) {
        super(message);
        this.name = 'LockAcquireError';
    }
}

export class LockTimeoutError extends Error {
    readonly code = 'LOCK_TIMEOUT';

    constructor(message: string) {
        super(message);
        this.name = 'LockTimeoutError';
    }
}

class NoopLockManager {
    async releaseLock(): Promise<boolean> {
        return true;
    }

    async renewLock(): Promise<boolean> {
        return true;
    }
}

const globalStore = new Map<string, LockRecord>();

export class Lock {
    readonly acquiredAt = Date.now();
    released = false;

    constructor(
        readonly key: string,
        readonly lockId: string,
        private readonly manager: {
            releaseLock: (key: string, lockId: string) => Promise<boolean>;
            renewLock: (key: string, lockId: string, ttl: number) => Promise<boolean>;
        },
        readonly ttl: number,
    ) {}

    /**
     * 释放锁。
     * @since v1.4.0
     */
    async release(): Promise<boolean> {
        if (this.released) {
            return false;
        }
        const released = await this.manager.releaseLock(this.key, this.lockId);
        this.released = released || this.released;
        return released;
    }

    /**
     * 续期锁。
     * @since v1.4.0
     */
    async renew(ttl = this.ttl): Promise<boolean> {
        if (this.released) {
            return false;
        }
        return this.manager.renewLock(this.key, this.lockId, ttl);
    }

    /**
     * 检查锁是否仍持有。
     * @since v1.4.0
     */
    isHeld(): boolean {
        return !this.released;
    }

    /**
     * 获取持锁时长。
     * @since v1.4.0
     */
    getHoldTime(): number {
        return Date.now() - this.acquiredAt;
    }
}

export class LockManager {
    private readonly logger: LoggerLike | null;
    private readonly lockKeyPrefix: string;
    private readonly maxDuration: number;
    private readonly stats = {
        locksAcquired: 0,
        locksReleased: 0,
        lockChecks: 0,
        errors: 0,
    };

    constructor(options: LockManagerOptions = {}) {
        this.logger = options.logger ?? null;
        this.lockKeyPrefix = options.lockKeyPrefix ?? 'monsqlize:lock:';
        this.maxDuration = options.maxDuration ?? 300000;
    }

    /**
     * 自动管理业务锁生命周期。
     * @since v1.4.0
     */
    async withLock<T>(key: string, callback: () => Promise<T>, options: LockOptions = {}): Promise<T> {
        const lock = await this.acquireLock(key, options);
        try {
            return await callback();
        } finally {
            await lock.release();
        }
    }

    /**
     * 获取锁（阻塞重试）。
     * @since v1.4.0
     */
    async acquireLock(key: string, options: LockOptions = {}): Promise<Lock> {
        const retryTimes = options.retryTimes ?? 3;
        const retryDelay = options.retryDelay ?? 100;
        const retryBackoff = options.retryBackoff ?? 1;

        for (let attempt = 0; attempt <= retryTimes; attempt += 1) {
            const lock = await this.tryAcquireLock(key, options);
            if (lock) {
                return lock;
            }
            if (attempt === retryTimes) {
                break;
            }
            const delay = retryDelay * Math.pow(retryBackoff, attempt);
            await sleep(delay);
        }

        this.stats.errors += 1;
        if (options.fallbackToNoLock) {
            this.logger?.warn?.(`[LockManager] fallback to no-lock execution for ${key}`);
            return new Lock(this.normalizeKey(key), `noop:${randomUUID()}`, new NoopLockManager(), options.ttl ?? 10000);
        }

        throw new LockTimeoutError(`Failed to acquire lock for key '${key}' within retry budget.`);
    }

    /**
     * 尝试获取锁（不阻塞）。
     * @since v1.4.0
     */
    async tryAcquireLock(key: string, options: Omit<LockOptions, 'retryTimes'> = {}): Promise<Lock | null> {
        const normalizedKey = this.normalizeKey(key);
        const ttl = Math.min(options.ttl ?? 10000, this.maxDuration);
        this.cleanupExpiredLocks();
        this.stats.lockChecks += 1;

        if (globalStore.has(normalizedKey)) {
            return null;
        }

        const lockId = randomUUID();
        globalStore.set(normalizedKey, {
            lockId,
            expiresAt: Date.now() + ttl,
        });
        this.stats.locksAcquired += 1;
        this.logger?.debug?.(`[LockManager] acquired ${normalizedKey}`);

        return new Lock(normalizedKey, lockId, this, ttl);
    }

    /**
     * 检查锁是否存在。
     * @since v1.4.0
     */
    isLocked(key: string): boolean {
        this.cleanupExpiredLocks();
        this.stats.lockChecks += 1;
        return globalStore.has(this.normalizeKey(key));
    }

    /**
     * 释放锁。
     * @since v1.4.0
     */
    async releaseLock(key: string, lockId: string): Promise<boolean> {
        const normalizedKey = this.normalizeKey(key);
        this.cleanupExpiredLocks();
        const current = globalStore.get(normalizedKey);
        if (!current || current.lockId !== lockId) {
            return false;
        }
        globalStore.delete(normalizedKey);
        this.stats.locksReleased += 1;
        this.logger?.debug?.(`[LockManager] released ${normalizedKey}`);
        return true;
    }

    /**
     * 续期锁。
     * @since v1.4.0
     */
    async renewLock(key: string, lockId: string, ttl: number): Promise<boolean> {
        const normalizedKey = this.normalizeKey(key);
        this.cleanupExpiredLocks();
        const current = globalStore.get(normalizedKey);
        if (!current || current.lockId !== lockId) {
            return false;
        }
        current.expiresAt = Date.now() + Math.min(ttl, this.maxDuration);
        return true;
    }

    /**
     * 获取锁统计。
     * @since v1.4.0
     */
    getStats(): LockStats {
        this.cleanupExpiredLocks();
        return {
            ...this.stats,
            lockKeyPrefix: this.lockKeyPrefix,
            maxDuration: this.maxDuration,
            activeLocks: globalStore.size,
        };
    }

    /**
     * 清空锁（主要用于测试）。
     * @since v1.4.0
     */
    clear(): void {
        for (const key of [...globalStore.keys()]) {
            if (key.startsWith(this.lockKeyPrefix)) {
                globalStore.delete(key);
            }
        }
    }

    /**
     * 关闭锁管理器。
     * @since v1.4.0
     */
    close(): void {
        this.cleanupExpiredLocks();
    }

    private normalizeKey(key: string): string {
        return key.startsWith(this.lockKeyPrefix) ? key : `${this.lockKeyPrefix}${key}`;
    }

    private cleanupExpiredLocks(): void {
        const now = Date.now();
        for (const [key, value] of globalStore.entries()) {
            if (value.expiresAt <= now) {
                globalStore.delete(key);
            }
        }
    }
}

async function sleep(ms: number): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, ms));
}

