/** Options for acquiring or configuring a distributed lock. */
export interface LockOptions {
    /** Lock TTL in milliseconds; the lock auto-releases after this duration. */
    ttl?: number;
    /** Number of retry attempts on acquire failure. */
    retryTimes?: number;
    /** Base delay between retries in milliseconds. */
    retryDelay?: number;
    /** Backoff multiplier applied to `retryDelay` on each successive retry. */
    retryBackoff?: number;
    /** When `true`, the callback is executed without a lock if acquisition fails (no-lock fallback). */
    fallbackToNoLock?: boolean;
}

/** Aggregate statistics for a `LockManager` instance. */
export interface LockStats {
    locksAcquired: number;
    locksReleased: number;
    lockChecks: number;
    errors: number;
    lockKeyPrefix: string;
    maxDuration: number;
    activeLocks: number;
}

/** Thrown when a lock cannot be acquired after all retry attempts are exhausted. */
export declare class LockAcquireError extends Error {
    readonly code: 'LOCK_ACQUIRE_FAILED';
}

/** Thrown when a lock acquisition attempt times out. */
export declare class LockTimeoutError extends Error {
    readonly code: 'LOCK_TIMEOUT';
}

/** Represents an acquired distributed lock; call `release()` to free it. */
export declare class Lock {
    readonly key: string;
    readonly lockId: string;
    readonly ttl: number;
    /** `true` after the lock has been released. v1 compat — exposed as readonly to prevent external mutation. */
    readonly released: boolean;
    /** Release the lock; returns `true` on success. */
    release(): Promise<boolean>;
    /** Extend the lock's TTL; returns `true` on success. */
    renew(ttl?: number): Promise<boolean>;
    /** Return `true` if the lock is still held (not yet released or expired). */
    isHeld(): boolean;
    /** Return the elapsed hold time in milliseconds since the lock was acquired. */
    getHoldTime(): number;
}

/**
 * Manages legacy monSQLize locks backed by the in-memory cache or a Redis store.
 * @deprecated Business locks are retained for compatibility. Prefer application/framework-level locking.
 */
export declare class LockManager {
    constructor(options?: { logger?: unknown; lockKeyPrefix?: string; maxDuration?: number; });
    /** @deprecated Business locks are retained for compatibility. Prefer application/framework-level locking. */
    withLock<T>(key: string, callback: () => Promise<T>, options?: LockOptions): Promise<T>;
    /** @deprecated Business locks are retained for compatibility. Prefer application/framework-level locking. */
    acquireLock(key: string, options?: LockOptions): Promise<Lock>;
    /** @deprecated Business locks are retained for compatibility. Prefer application/framework-level locking. */
    tryAcquireLock(key: string, options?: Omit<LockOptions, 'retryTimes'>): Promise<Lock | null>;
    /** Return `true` if `key` is currently locked. */
    isLocked(key: string): boolean;
    /** Release the lock identified by `key` + `lockId`. */
    releaseLock(key: string, lockId: string): Promise<boolean>;
    /** Extend the TTL for the lock identified by `key` + `lockId`. */
    renewLock(key: string, lockId: string, ttl: number): Promise<boolean>;
    /** Return aggregate lock statistics. */
    getStats(): LockStats;
    /** Clear all active locks immediately. */
    clear(): void;
    /** Shut down the lock manager and release internal resources. */
    close(): void;
}
