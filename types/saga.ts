/**
 * Saga分布式事务相关类型定义
 * @module types/saga
 * @since v1.0.8
 */

import type { CacheLike } from './cache';
import type { LoggerLike } from './base';

/**
 * Saga 步骤定义
 * @since v1.0.8
 */
export interface SagaStep {
    /** 步骤名称 */
    name: string;
    /** 执行函数 */
    execute: (context: SagaContext) => Promise<any>;
    /** 补偿函数（失败时执行） */
    compensate: (context: SagaContext) => Promise<void>;
    /** 步骤超时时间（毫秒） */
    timeout?: number;
    /** 重试次数（默认 0） */
    retries?: number;
}

/**
 * Saga 定义
 * @since v1.0.8
 */
export interface SagaDefinition {
    /** Saga 名称 */
    name: string;
    /** 步骤数组 */
    steps: SagaStep[];
    /** 超时时间（毫秒，默认 60000） */
    timeout?: number;
    /** 是否启用日志（默认 true） */
    logging?: boolean;
}

/**
 * Saga 上下文
 * @since v1.0.8
 */
export interface SagaContext {
    /** Saga 执行 ID */
    readonly executionId: string;
    /** 输入数据 */
    readonly data: any;

    /**
     * 设置上下文变量
     * @param key 键
     * @param value 值
     */
    set(key: string, value: any): void;

    /**
     * 获取上下文变量
     * @param key 键
     */
    get(key: string): any;

    /**
     * 检查变量是否存在
     * @param key 键
     */
    has(key: string): boolean;

    /**
     * 获取所有上下文变量
     */
    getAll(): Record<string, any>;
}

/**
 * Saga 执行结果
 * @since v1.0.8
 */
export interface SagaResult {
    /** 执行 ID */
    executionId: string;
    /** 是否成功 */
    success: boolean;
    /** 执行结果 */
    result?: any;
    /** 错误信息 */
    error?: Error;
    /** 已完成的步骤 */
    completedSteps: string[];
    /** 已补偿的步骤 */
    compensatedSteps: string[];
    /** 执行时长（毫秒） */
    duration: number;
}

/**
 * Saga 协调器选项
 * @since v1.0.8
 */
export interface SagaOrchestratorOptions {
    /** 缓存实例（用于分布式状态存储） */
    cache?: CacheLike;
    /** 日志记录器 */
    logger?: LoggerLike;
}

/**
 * Saga 协调器类
 * @since v1.0.8
 */
export interface SagaOrchestrator {
    define(definition: SagaDefinition): void;
    execute(name: string, data: any): Promise<SagaResult>;
    getSaga(name: string): SagaDefinition | undefined;
    listSagas(): string[];
    getStats(): {
        totalExecutions: number;
        successCount: number;
        failureCount: number;
        compensationCount: number;
    };
}

