/**
 * P2-A 基础错误系统。
 *
 * 说明：
 * - 先恢复统一错误码与错误工厂，供 connect/common/accessor 路径使用。
 * - 更细的写操作、分页、锁等错误码在后续阶段继续补齐。
 */

export const ErrorCodes = {
    INVALID_ARGUMENT: 'INVALID_ARGUMENT',
    INVALID_COLLECTION_NAME: 'INVALID_COLLECTION_NAME',
    INVALID_DATABASE_NAME: 'INVALID_DATABASE_NAME',
    INVALID_EXPRESSION: 'INVALID_EXPRESSION',
    INVALID_PAGINATION: 'INVALID_PAGINATION',
    CACHE_UNAVAILABLE: 'CACHE_UNAVAILABLE',
    MANAGEMENT_OPERATION_FAILED: 'MANAGEMENT_OPERATION_FAILED',
    NOT_CONNECTED: 'NOT_CONNECTED',
    CONNECTION_FAILED: 'CONNECTION_FAILED',
    CONNECTION_CLOSED: 'CONNECTION_CLOSED',
    INVALID_CONFIG: 'INVALID_CONFIG',
    UNSUPPORTED_DATABASE: 'UNSUPPORTED_DATABASE',
} as const;

export type ErrorCode = (typeof ErrorCodes)[keyof typeof ErrorCodes];

export interface MonSQLizeError extends Error {
    code: ErrorCode | string;
    details?: unknown[];
    cause?: Error;
}

/**
 * 创建标准错误对象。
 * @since v1.3.0
 */
export function createError(
    code: ErrorCode | string,
    message: string,
    details?: unknown[],
    cause?: Error,
): MonSQLizeError {
    const error = new Error(message) as MonSQLizeError;
    error.code = code;
    if (details !== undefined) {
        error.details = details;
    }
    if (cause !== undefined) {
        error.cause = cause;
    }
    return error;
}

/**
 * 创建连接错误。
 * @since v1.3.0
 */
export function createConnectionError(message: string, cause?: Error): MonSQLizeError {
    return createError(ErrorCodes.CONNECTION_FAILED, message, undefined, cause);
}

