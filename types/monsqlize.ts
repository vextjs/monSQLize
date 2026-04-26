/**
 * MonSQLize 主类类型定义
 * @module types/monsqlize
 */

import type { TransactionOptions } from './options';
import type { DbAccessor, HealthView, Collection } from './collection';
import type { CacheLike } from './cache';
import type { Transaction } from './transaction';
import type { Lock, LockOptions } from './lock';
import type { ExpressionFunction } from './base';
import type { MetaInfo } from './pagination';
import type { ModelInstance } from './model';

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

    /**
     * 获取 Model 实例（缓存复用）
     *
     * 同一 collectionName 多次调用返回同一实例。
     * Model.redefine() / Model.undefine() 后自动失效，close() 后全部清空。
     *
     * @param collectionName - 已注册的集合名称
     * @returns ModelInstance 实例
     * @throws 数据库未连接（NOT_CONNECTED）
     * @throws Model 未定义（MODEL_NOT_DEFINED）
     * @since 1.0.3
     */
    model(collectionName: string): ModelInstance;

    /**
     * 获取原始集合实例
     *
     * @param collectionName - 集合名称
     * @returns Collection 实例
     * @throws 数据库未连接（NOT_CONNECTED）
     */
    collection(collectionName: string): Collection;

    /**
     * 获取限定池/库的 collection（公开底层方法）
     *
     * opts.pool / opts.database 均为可选；均不填时退化为默认路由。
     *
     * @param collectionName - MongoDB 集合名
     * @param opts.pool      - 连接池名称（可选）
     * @param opts.database  - 数据库名称（可选）
     * @throws NOT_CONNECTED / NO_POOL_MANAGER / POOL_NOT_FOUND
     * @since 1.3.0
     */
    scopedCollection(
      collectionName: string,
      opts?: { pool?: string; database?: string }
    ): ReturnType<MonSQLize['collection']>;

    /**
     * 获取限定池/库的 Model 实例（不走 _modelInstances 缓存）
     *
     * connection 合并语义：opts 字段优先，definition.connection 作 fallback。
     *
     * @param key  - 已注册的 Model key（或 alias）
     * @param opts - 路由选项，字段优先于 definition.connection
     * @throws NOT_CONNECTED / MODEL_NOT_DEFINED / NO_POOL_MANAGER / POOL_NOT_FOUND
     * @since 1.3.0
     */
    scopedModel(
      key: string,
      opts?: { pool?: string; database?: string }
    ): ReturnType<MonSQLize['model']>;

    /**
     * 获取指定连接池的链式访问器
     *
     * 立即校验：NOT_CONNECTED / NO_POOL_MANAGER / POOL_NOT_FOUND。
     *
     * @param poolName - 连接池名称
     * @throws NOT_CONNECTED / NO_POOL_MANAGER / POOL_NOT_FOUND
     * @since 1.3.0
     */
    pool(poolName: string): {
      collection: (name: string) => ReturnType<MonSQLize['collection']>;
      model: (key: string) => ReturnType<MonSQLize['model']>;
      use: (dbName: string) => {
        collection: (name: string) => ReturnType<MonSQLize['collection']>;
        model: (key: string) => ReturnType<MonSQLize['model']>;
      };
    };

    /**
     * 获取「默认池 + 指定库」访问器
     *
     * 适用于单连接多库场景（无需配置多连接池）。
     *
     * @param dbName - 数据库名称
     * @throws NOT_CONNECTED
     * @since 1.3.0
     */
    use(dbName: string): {
      collection: (name: string) => ReturnType<MonSQLize['collection']>;
      model: (key: string) => ReturnType<MonSQLize['model']>;
    };


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

