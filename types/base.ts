/**
 * 基础类型定义
 * 包含核心类型、错误码、日志接口等
 * @module types/base
 */

/**
 * 数据库类型
 */
export type DbType = 'mongodb';

/**
 * 表达式对象
 * 由 expr() 函数创建，包含原始表达式字符串和编译标记
 * @since v1.0.9
 */
export interface ExpressionObject {
    /** 原始表达式字符串 */
    __expr__: string;
    /** 是否已编译（内部使用） */
    __compiled__: boolean;
}

/**
 * 表达式编译上下文
 * @since v1.0.9
 */
export type ExpressionContext = '$match' | '$project' | '$group' | 'unknown';

/**
 * 统一表达式创建函数
 * @since v1.0.9
 */
export type ExpressionFunction = (expr: string) => ExpressionObject;

/**
 * 日志记录器接口
 * v2.0 新增：支持 traceId 和结构化日志
 */
export interface LoggerLike {
    debug?: (...args: any[]) => void;
    info?: (...args: any[]) => void;
    warn?: (...args: any[]) => void;
    error?: (...args: any[]) => void;
    withTraceId?: (fn: Function, traceId?: string) => any;
    getTraceId?: () => string | null;
}

/**
 * 日志选项
 */
export interface LoggerOptions {
    /** 是否使用结构化日志（JSON 格式） */
    structured?: boolean;
    /** 是否启用 traceId（分布式追踪） */
    enableTraceId?: boolean;
}

/**
 * 统一错误码
 */
export const enum ErrorCodes {
    VALIDATION_ERROR = 'VALIDATION_ERROR',
    INVALID_COLLECTION_NAME = 'INVALID_COLLECTION_NAME',
    INVALID_DATABASE_NAME = 'INVALID_DATABASE_NAME',
    INVALID_CURSOR = 'INVALID_CURSOR',
    CURSOR_SORT_MISMATCH = 'CURSOR_SORT_MISMATCH',
    JUMP_TOO_FAR = 'JUMP_TOO_FAR',
    STREAM_NO_JUMP = 'STREAM_NO_JUMP',
    STREAM_NO_TOTALS = 'STREAM_NO_TOTALS',
    CONNECTION_TIMEOUT = 'CONNECTION_TIMEOUT',
    CONNECTION_FAILED = 'CONNECTION_FAILED',
    CONNECTION_CLOSED = 'CONNECTION_CLOSED',
    DATABASE_ERROR = 'DATABASE_ERROR',
    QUERY_TIMEOUT = 'QUERY_TIMEOUT',
    CACHE_ERROR = 'CACHE_ERROR',
    CACHE_TIMEOUT = 'CACHE_TIMEOUT',
    INVALID_CONFIG = 'INVALID_CONFIG',
    UNSUPPORTED_DATABASE = 'UNSUPPORTED_DATABASE',
}

/**
 * 标准错误接口
 */
export interface MonSQLizeError extends Error {
    code: string;
    details?: any[];
    cause?: Error;
}

