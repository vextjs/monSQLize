export interface LockOptions {
    ttl?: number;
    retryTimes?: number;
    retryDelay?: number;
    retryBackoff?: number;
    fallbackToNoLock?: boolean;
}

export interface LockStats {
    locksAcquired: number;
    locksReleased: number;
    lockChecks: number;
    errors: number;
    lockKeyPrefix: string;
    maxDuration: number;
    activeLocks: number;
}

export declare class LockAcquireError extends Error {
    readonly code: 'LOCK_ACQUIRE_FAILED';
}

export declare class LockTimeoutError extends Error {
    readonly code: 'LOCK_TIMEOUT';
}

export declare class Lock {
    readonly key: string;
    readonly lockId: string;
    readonly ttl: number;
    readonly released: boolean;
    release(): Promise<boolean>;
    renew(ttl?: number): Promise<boolean>;
    isHeld(): boolean;
    getHoldTime(): number;
}

export declare class LockManager {
    constructor(options?: { logger?: unknown; lockKeyPrefix?: string; maxDuration?: number; });
    withLock<T>(key: string, callback: () => Promise<T>, options?: LockOptions): Promise<T>;
    acquireLock(key: string, options?: LockOptions): Promise<Lock>;
    tryAcquireLock(key: string, options?: Omit<LockOptions, 'retryTimes'>): Promise<Lock | null>;
    isLocked(key: string): boolean;
    releaseLock(key: string, lockId: string): Promise<boolean>;
    renewLock(key: string, lockId: string, ttl: number): Promise<boolean>;
    getStats(): LockStats;
    clear(): void;
    close(): void;
}

