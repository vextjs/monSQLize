/**
 * MonSQLize 主类类型定义
 * @module types/monsqlize
 */

import type { TransactionOptions } from './options';
import type { DbAccessor, HealthView } from './collection';
import type { CacheLike } from './cache';
import type { Transaction } from './transaction';
import type { Lock, LockOptions } from './lock';
import type { ExpressionFunction } from './base';
import type { MetaInfo } from './pagination';

/**
 * MonSQLize 主类
 */
export interface MonSQLize {

    /**
     * 连接数据库
     */
    connect(): Promise<DbAccessor>;

    /**
     * 获取缓存实例
     */
    getCache(): CacheLike;

    /**
     * 获取默认配置
     */
    getDefaults(): {
        maxTimeMS?: number;
        findLimit?: number;
        namespace?: { instanceId?: string; scope?: 'database' | 'connection' };
        slowQueryMs?: number;
    };

    /**
     * 关闭连接
     */
    close(): Promise<void>;

    /**
     * 健康检查
     */
    health(): Promise<HealthView>;


    // ============================================================================
    // 事件系统
    // ============================================================================

    /** 事件订阅 */
    on(event: 'connected', handler: (payload: { type: string; db: string; scope?: string; iid?: string }) => void): void;
    on(event: 'closed', handler: (payload: { type: string; db: string; iid?: string }) => void): void;
    on(event: 'error', handler: (payload: { type: string; db: string; error: string; iid?: string }) => void): void;
    on(event: 'slow-query', handler: (meta: MetaInfo) => void): void;
    on(event: 'query', handler: (meta: MetaInfo) => void): void;
    on(event: string, handler: (payload: any) => void): void;

    /** 一次性事件订阅 */
    once(event: string, handler: (payload: any) => void): void;

    /** 取消事件订阅 */
    off(event: string, handler: (payload: any) => void): void;

    /** 触发事件 */
    emit(event: string, payload: any): void;

    // ============================================================================
    // 事务管理
    // ============================================================================

    /**
     * 创建手动事务会话
     * @since v0.2.0
     */
    startSession(options?: TransactionOptions): Promise<Transaction>;

    /**
     * 自动管理事务生命周期（推荐）
     * @since v0.2.0
     */
    withTransaction<T = any>(
        callback: (transaction: Transaction) => Promise<T>,
        options?: TransactionOptions
    ): Promise<T>;

    // ============================================================================
    // 业务锁 API
    // ============================================================================

    /**
     * 业务锁：自动管理锁生命周期（推荐）
     * @since v1.4.0
     */
    withLock?<T = any>(
        key: string,
        callback: () => Promise<T>,
        options?: LockOptions
    ): Promise<T>;

    /**
     * 业务锁：手动获取锁（阻塞重试）
     * @since v1.4.0
     */
    acquireLock?(key: string, options?: LockOptions): Promise<Lock>;

    /**
     * 业务锁：尝试获取锁（不阻塞）
     * @since v1.4.0
     */
    tryAcquireLock?(key: string, options?: Omit<LockOptions, 'retryTimes'>): Promise<Lock | null>;

    /**
     * 获取慢查询日志
     * @since v1.3.1
     */
    getSlowQueryLogs(
        filter?: Record<string, any>,
        options?: {
            sort?: Record<string, 1 | -1>;
            limit?: number;
            skip?: number;
        }
    ): Promise<Array<{
        queryHash: string;
        database: string;
        collection: string;
        operation: string;
        count: number;
        totalTimeMs: number;
        avgTimeMs: number;
        maxTimeMs: number;
        minTimeMs: number;
        firstSeen: Date;
        lastSeen: Date;
    }>>;
}

/**
 * MonSQLize 命名空间（静态成员）
 */
export declare namespace MonSQLize {
    /**
     * 统一表达式创建函数（静态方法）
     * @since v1.0.9
     */
    const expr: ExpressionFunction;

    /**
     * 统一表达式创建函数（完整版别名）
     * @since v1.0.9
     */
    const createExpression: ExpressionFunction;
}

