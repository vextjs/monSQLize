/**
 * 批量操作重试机制
 * 供 insertBatch、deleteBatch、updateBatch 复用
 */

/**
 * 执行批次操作（带重试）
 * @param {Function} fn - 要执行的批次操作函数
 * @param {Object} retryContext - 重试上下文
 * @param {string} retryContext.onError - 错误策略: 'stop'/'skip'/'collect'/'retry'
 * @param {number} retryContext.retryAttempts - 最大重试次数
 * @param {number} retryContext.retryDelay - 重试延迟（毫秒）
 * @param {Function} retryContext.onRetry - 重试回调
 * @param {number} retryContext.batchIndex - 当前批次索引
 * @returns {Promise<Object>} { success, result, attempts }
 */
async function executeBatchWithRetry(fn, retryContext) {
    const {
        onError = 'stop',
        retryAttempts = 3,
        retryDelay = 1000,
        onRetry,
        batchIndex = 0
    } = retryContext;

    let lastError = null;
    let attempts = 0;
    const maxAttempts = onError === 'retry' ? retryAttempts + 1 : 1;

    while (attempts < maxAttempts) {
        try {
            const result = await fn();
            return { success: true, result, attempts };
        } catch (error) {
            lastError = error;
            attempts++;

            // 还有重试机会
            if (attempts < maxAttempts) {
                // 触发重试回调
                if (onRetry) {
                    onRetry({
                        batchIndex,
                        attempt: attempts,
                        maxAttempts: retryAttempts,
                        error,
                        nextRetryDelay: retryDelay
                    });
                }

                // 延迟后重试
                if (retryDelay > 0) {
                    await new Promise(resolve => setTimeout(resolve, retryDelay));
                }
            }
        }
    }

    // 所有重试都失败
    throw lastError;
}

module.exports = { executeBatchWithRetry };


