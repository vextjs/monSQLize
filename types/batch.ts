/**
 * 批量操作相关类型定义
 * @module types/batch
 * @since v1.0.0
 */

import type { WriteConcern } from './write';

/**
 * 批量操作进度信息
 */
export interface BatchProgress {
    /** 当前批次号（从1开始） */
    currentBatch: number;
    /** 总批次数 */
    totalBatches: number;
    /** 已处理数量 */
    inserted?: number;
    modified?: number;
    deleted?: number;
    /** 总数量 */
    total: number | null;
    /** 完成百分比（0-100） */
    percentage: number | null;
    /** 错误数量 */
    errors: number;
    /** 重试数量 */
    retries: number;
}

/**
 * 重试信息
 */
export interface RetryInfo {
    /** 批次索引（从0开始） */
    batchIndex: number;
    /** 当前重试次数 */
    attempt: number;
    /** 最大重试次数 */
    maxAttempts: number;
    /** 错误信息 */
    error: Error;
}

/**
 * insertBatch 选项
 * @since v1.0.0
 */
export interface InsertBatchOptions {
    /** 每批插入的文档数量（默认 1000） */
    batchSize?: number;
    /** 并发批次数（1=串行，>1=并行，默认 1） */
    concurrency?: number;
    /** 批次内是否按顺序插入（默认 false） */
    ordered?: boolean;
    /** 进度回调函数 */
    onProgress?: (progress: BatchProgress) => void;
    /** 错误处理策略: 'stop'|'skip'|'collect'|'retry'（默认 'stop'） */
    onError?: 'stop' | 'skip' | 'collect' | 'retry';
    /** 失败批次最大重试次数（onError='retry'时有效，默认 3） */
    retryAttempts?: number;
    /** 重试延迟时间（毫秒，默认 1000） */
    retryDelay?: number;
    /** 重试回调函数 */
    onRetry?: (retryInfo: RetryInfo) => void;
    /** 写确认级别 */
    writeConcern?: WriteConcern;
    /** 是否绕过文档验证（默认 false） */
    bypassDocumentValidation?: boolean;
    /** 操作注释（用于日志追踪） */
    comment?: string;
}

/**
 * updateBatch 选项
 * @since v1.0.0
 */
export interface UpdateBatchOptions {
    /** 每批更新的文档数量（默认 1000） */
    batchSize?: number;
    /** 是否预先 count 总数（用于进度百分比，默认 true） */
    estimateProgress?: boolean;
    /** 进度回调函数 */
    onProgress?: (progress: BatchProgress) => void;
    /** 错误处理策略: 'stop'|'skip'|'collect'|'retry'（默认 'stop'） */
    onError?: 'stop' | 'skip' | 'collect' | 'retry';
    /** 失败批次最大重试次数（onError='retry'时有效，默认 3） */
    retryAttempts?: number;
    /** 重试延迟时间（毫秒，默认 1000） */
    retryDelay?: number;
    /** 重试回调函数 */
    onRetry?: (retryInfo: RetryInfo) => void;
    /** 写确认级别 */
    writeConcern?: WriteConcern;
    /** 未匹配时是否插入（默认 false） */
    upsert?: boolean;
    /** 数组过滤器 */
    arrayFilters?: any[];
    /** 操作注释（用于日志追踪） */
    comment?: string;
}

/**
 * deleteBatch 选项
 * @since v1.0.0
 */
export interface DeleteBatchOptions {
    /** 每批删除的文档数量（默认 1000） */
    batchSize?: number;
    /** 是否预先 count 总数（用于进度百分比，默认 true） */
    estimateProgress?: boolean;
    /** 进度回调函数 */
    onProgress?: (progress: BatchProgress) => void;
    /** 错误处理策略: 'stop'|'skip'|'collect'|'retry'（默认 'stop'） */
    onError?: 'stop' | 'skip' | 'collect' | 'retry';
    /** 失败批次最大重试次数（onError='retry'时有效，默认 3） */
    retryAttempts?: number;
    /** 重试延迟时间（毫秒，默认 1000） */
    retryDelay?: number;
    /** 重试回调函数 */
    onRetry?: (retryInfo: RetryInfo) => void;
    /** 写确认级别 */
    writeConcern?: WriteConcern;
    /** 操作注释（用于日志追踪） */
    comment?: string;
}

/**
 * insertBatch 返回结果
 */
export interface InsertBatchResult {
    /** 是否被确认 */
    acknowledged: boolean;
    /** 总文档数 */
    totalCount: number;
    /** 成功插入数 */
    insertedCount: number;
    /** 总批次数 */
    batchCount: number;
    /** 错误列表 */
    errors: Array<{ batchIndex: number; message: string; details?: any }>;
    /** 重试记录列表 */
    retries: Array<{ batchIndex: number; attempts: number; success: boolean }>;
    /** 插入的文档 _id 映射表 */
    insertedIds: Record<number, any>;
}

/**
 * updateBatch 返回结果
 */
export interface UpdateBatchResult {
    /** 是否被确认 */
    acknowledged: boolean;
    /** 总文档数（estimateProgress=true时有值） */
    totalCount: number | null;
    /** 匹配文档数 */
    matchedCount: number;
    /** 成功更新数 */
    modifiedCount: number;
    /** 插入数（upsert=true时） */
    upsertedCount: number;
    /** 总批次数 */
    batchCount: number;
    /** 错误列表 */
    errors: Array<{ batchIndex: number; message: string; details?: any }>;
    /** 重试记录列表 */
    retries: Array<{ batchIndex: number; attempts: number; success: boolean }>;
}

/**
 * deleteBatch 返回结果
 */
export interface DeleteBatchResult {
    /** 是否被确认 */
    acknowledged: boolean;
    /** 总文档数（estimateProgress=true时有值） */
    totalCount: number | null;
    /** 成功删除数 */
    deletedCount: number;
    /** 总批次数 */
    batchCount: number;
    /** 错误列表 */
    errors: Array<{ batchIndex: number; message: string; details?: any }>;
    /** 重试记录列表 */
    retries: Array<{ batchIndex: number; attempts: number; success: boolean }>;
}

