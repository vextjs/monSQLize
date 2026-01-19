/**
 * 业务锁相关类型定义
 * @module types/lock
 * @since v1.4.0
 */

/**
 * 业务锁配置选项
 * @since v1.4.0
 */
export interface LockOptions {
    /** 锁过期时间（毫秒），默认 10000 */
    ttl?: number;
    /** 获取锁失败时的重试次数，默认 3 */
    retryTimes?: number;
    /** 重试间隔（毫秒），默认 100 */
    retryDelay?: number;
    /** Redis 不可用时是否降级为无锁执行，默认 false */
    fallbackToNoLock?: boolean;
}

/**
 * 锁对象
 * 表示一个已获取的锁，提供释放和续期方法
 * @since v1.4.0
 */
export interface Lock {
    /** 锁的 Key */
    readonly key: string;
    /** 锁的唯一ID */
    readonly lockId: string;
    /** 是否已释放 */
    readonly released: boolean;

    /**
     * 释放锁
     * @returns Promise<boolean> 是否成功释放
     */
    release(): Promise<boolean>;

    /**
     * 续期（延长 TTL）
     * @param ttl - 新的过期时间（毫秒），默认使用原TTL
     * @returns Promise<boolean> 是否成功续期
     */
    renew(ttl?: number): Promise<boolean>;

    /**
     * 检查锁是否仍被持有
     * @returns boolean
     */
    isHeld(): boolean;

    /**
     * 获取锁持有时间（毫秒）
     * @returns number
     */
    getHoldTime(): number;
}

/**
 * 锁统计信息
 * @since v1.4.0
 */
export interface LockStats {
    /** 成功获取锁的次数 */
    locksAcquired: number;
    /** 成功释放锁的次数 */
    locksReleased: number;
    /** 锁检查次数 */
    lockChecks: number;
    /** 错误次数 */
    errors: number;
    /** 锁键前缀 */
    lockKeyPrefix: string;
    /** 锁最大持续时间 */
    maxDuration: number;
}

/**
 * 锁获取失败错误
 * @since v1.4.0
 */
export interface LockAcquireError extends Error {
    readonly code: 'LOCK_ACQUIRE_FAILED';
}

/**
 * 锁超时错误
 * @since v1.4.0
 */
export interface LockTimeoutError extends Error {
    readonly code: 'LOCK_TIMEOUT';
}

