/**
 * 连接池管理相关类型定义
 * @module types/pool
 * @since v1.0.8
 */

import type { LoggerLike } from './base';

/**
 * 连接池角色
 * @since v1.0.8
 */
export type PoolRole = 'primary' | 'secondary' | 'analytics' | 'custom';

/**
 * 连接池选择策略
 * @since v1.0.8
 */
export type PoolStrategy = 'auto' | 'roundRobin' | 'weighted' | 'leastConnections' | 'manual';

/**
 * 故障转移策略
 * @since v1.0.8
 */
export type FallbackStrategy = 'error' | 'readonly' | 'primary';

/**
 * 连接池配置
 * @since v1.0.8
 */
export interface PoolConfig {
    /** 连接池名称（唯一标识） */
    name: string;
    /** MongoDB URI */
    uri: string;
    /** 连接池角色 */
    role?: PoolRole;
    /** 权重（用于加权选择策略，默认 1） */
    weight?: number;
    /** 标签（用于筛选） */
    tags?: string[];
    /** MongoDB 连接选项 */
    options?: {
        maxPoolSize?: number;
        minPoolSize?: number;
        maxIdleTimeMS?: number;
        waitQueueTimeoutMS?: number;
        connectTimeoutMS?: number;
        serverSelectionTimeoutMS?: number;
    };
    /** 健康检查配置 */
    healthCheck?: {
        enabled?: boolean;
        interval?: number;
        timeout?: number;
        retries?: number;
    };
}

/**
 * 连接池管理器选项
 * @since v1.0.8
 */
export interface ConnectionPoolManagerOptions {
    /** 连接池配置数组 */
    pools?: PoolConfig[];
    /** 最大连接池数量（默认 10） */
    maxPoolsCount?: number;
    /** 选择策略（默认 'auto'） */
    poolStrategy?: PoolStrategy;
    /** 故障转移配置 */
    poolFallback?: {
        enabled?: boolean;
        fallbackStrategy?: FallbackStrategy;
        retryDelay?: number;
        maxRetries?: number;
    };
    /** 日志记录器 */
    logger?: LoggerLike;
}

/**
 * 连接池健康状态
 * @since v1.0.8
 */
export interface PoolHealthStatus {
    status: 'up' | 'down' | 'degraded';
    consecutiveFailures: number;
    lastCheckTime: Date | null;
    lastError: Error | null;
    uptime: number;
}

/**
 * 连接池统计信息
 * @since v1.0.8
 */
export interface PoolStats {
    name: string;
    totalRequests: number;
    successCount: number;
    errorCount: number;
    avgResponseTime: number;
    minResponseTime: number;
    maxResponseTime: number;
    errorRate: number;
    lastRequestTime: Date | null;
}

/**
 * 连接池管理器类
 * @since v1.0.8
 */
export interface ConnectionPoolManager {
    addPool(config: PoolConfig): Promise<void>;
    removePool(name: string): Promise<void>;
    getPool(name: string): any;
    selectPool(operation: string, options?: { tags?: string[] }): any;
    startHealthCheck(): void;
    stopHealthCheck(): void;
    getHealthStatus(): Record<string, PoolHealthStatus>;
    getPoolStats(): Record<string, PoolStats>;
    close(): Promise<void>;
}

