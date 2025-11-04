/**
 * 统一错误码定义
 * 集中管理所有错误类型，确保错误处理的一致性
 */

const ErrorCodes = {
    // 验证相关错误
    VALIDATION_ERROR: 'VALIDATION_ERROR',
    INVALID_COLLECTION_NAME: 'INVALID_COLLECTION_NAME',
    INVALID_DATABASE_NAME: 'INVALID_DATABASE_NAME',

    // 游标相关错误
    INVALID_CURSOR: 'INVALID_CURSOR',
    CURSOR_SORT_MISMATCH: 'CURSOR_SORT_MISMATCH',

    // 分页相关错误
    JUMP_TOO_FAR: 'JUMP_TOO_FAR',
    STREAM_NO_JUMP: 'STREAM_NO_JUMP',
    STREAM_NO_TOTALS: 'STREAM_NO_TOTALS',
    STREAM_NO_EXPLAIN: 'STREAM_NO_EXPLAIN',

    // 连接相关错误
    CONNECTION_TIMEOUT: 'CONNECTION_TIMEOUT',
    CONNECTION_FAILED: 'CONNECTION_FAILED',
    CONNECTION_CLOSED: 'CONNECTION_CLOSED',

    // 数据库相关错误
    DATABASE_ERROR: 'DATABASE_ERROR',
    QUERY_TIMEOUT: 'QUERY_TIMEOUT',

    // 缓存相关错误
    CACHE_ERROR: 'CACHE_ERROR',
    CACHE_TIMEOUT: 'CACHE_TIMEOUT',

    // 配置相关错误
    INVALID_CONFIG: 'INVALID_CONFIG',
    UNSUPPORTED_DATABASE: 'UNSUPPORTED_DATABASE',
};

/**
 * 创建标准错误对象
 * @param {string} code - 错误码
 * @param {string} message - 错误消息
 * @param {Array} [details] - 详细错误信息
 * @param {Error} [cause] - 原始错误
 * @returns {Error} 标准错误对象
 */
function createError(code, message, details, cause) {
    const error = new Error(message);
    error.code = code;
    if (details !== undefined) error.details = details;
    if (cause !== undefined) error.cause = cause;
    return error;
}

/**
 * 创建验证错误
 * @param {Array} details - 验证错误详情
 * @returns {Error}
 */
function createValidationError(details) {
    return createError(
        ErrorCodes.VALIDATION_ERROR,
        '参数校验失败',
        details
    );
}

/**
 * 创建游标错误
 * @param {string} message - 错误消息
 * @param {Array} [details] - 详细信息
 * @returns {Error}
 */
function createCursorError(message, details = null) {
    return createError(
        ErrorCodes.INVALID_CURSOR,
        message || '游标无效',
        details
    );
}

/**
 * 创建连接错误
 * @param {string} message - 错误消息
 * @param {Error} [cause] - 原始错误
 * @returns {Error}
 */
function createConnectionError(message, cause = null) {
    return createError(
        ErrorCodes.CONNECTION_FAILED,
        message || '数据库连接失败',
        null,
        cause
    );
}

/**
 * 创建查询超时错误
 * @param {number} timeoutMs - 超时时间（毫秒）
 * @param {Error} [cause] - 原始错误
 * @returns {Error}
 */
function createQueryTimeoutError(timeoutMs, cause = null) {
    return createError(
        ErrorCodes.QUERY_TIMEOUT,
        `查询超时 (${timeoutMs}ms)`,
        null,
        cause
    );
}

module.exports = {
    ErrorCodes,
    createError,
    createValidationError,
    createCursorError,
    createConnectionError,
    createQueryTimeoutError,
};

