/**
 * incrementOne 写操作模块
 * @description 便利方法：原子递增/递减字段值
 */

const { ObjectId } = require('mongodb');
const { createError, ErrorCodes } = require('../../errors');
const { isInTransaction, getTransactionFromSession } = require("../common/transaction-aware");
const { handleFindOneAndResult, wasDocumentModified } = require("./result-handler");

/**
 * 创建 incrementOne 操作
 * @param {Object} context - 上下文对象
 * @returns {Function} incrementOne 方法
 */
function createIncrementOneOps(context) {
    const {
        collection,
        defaults,
        instanceId,
        effectiveDbName,
        logger,
        emit,
        mongoSlowLogShaper,
        cache,
        type
    } = context;

    /**
     * 原子递增/递减单个字段
     * @param {Object} filter - 查询条件
     * @param {string|Object} field - 字段名或字段-增量对象
     * @param {number} [increment=1] - 增量（正数递增，负数递减）
     * @param {Object} [options={}] - 操作选项
     * @param {number} [options.maxTimeMS] - 操作超时（毫秒）
     * @param {string} [options.comment] - 查询注释
     * @param {boolean} [options.returnDocument='after'] - 返回文档时机（'before' | 'after'）
     * @param {Object} [options.projection] - 字段投影
     * @returns {Promise<Object>} 操作结果
     *
     * @example
     * // 基础用法（递增 1）
     * const result = await collection('users').incrementOne(
     *   { userId: 'user123' },
     *   'loginCount'
     * );
     *
     * @example
     * // 指定增量
     * const result = await collection('users').incrementOne(
     *   { userId: 'user123' },
     *   'points',
     *   10
     * );
     *
     * @example
     * // 递减（负数）
     * const result = await collection('users').incrementOne(
     *   { userId: 'user123' },
     *   'credits',
     *   -5
     * );
     *
     * @example
     * // 多字段递增
     * const result = await collection('users').incrementOne(
     *   { userId: 'user123' },
     *   { loginCount: 1, points: 10, credits: -5 }
     * );
     */
    const incrementOne = async function incrementOne(filter, field, increment, options) {
        const startTime = Date.now();

        // 1. 参数解析和验证
        let actualIncrement = increment;
        let actualOptions = options;

        // 支持 incrementOne(filter, field, options) 形式（省略 increment，默认 1）
        if (typeof increment === 'object' && increment !== null && !Array.isArray(increment) && actualOptions === undefined) {
            actualOptions = increment;
            actualIncrement = 1;
        }

        actualOptions = actualOptions || {};

        if (!filter || typeof filter !== 'object' || Array.isArray(filter)) {
            throw createError(
                ErrorCodes.INVALID_ARGUMENT,
                'filter 必须是非空对象',
                [{ field: 'filter', type: 'type', message: 'filter 必须是对象', received: typeof filter }]
            );
        }

        // 2. 构建 $inc 更新对象
        let incUpdate;

        if (typeof field === 'string') {
            // 单字段递增
            if (actualIncrement === undefined) {
                actualIncrement = 1;
            }

            if (typeof actualIncrement !== 'number' || isNaN(actualIncrement)) {
                throw createError(
                    ErrorCodes.INVALID_ARGUMENT,
                    'increment 必须是数字',
                    [{ field: 'increment', type: 'type', message: 'increment 必须是数字', received: typeof actualIncrement }]
                );
            }

            incUpdate = { $inc: { [field]: actualIncrement } };
        } else if (typeof field === 'object' && field !== null && !Array.isArray(field)) {
            // 多字段递增
            const incFields = {};
            for (const [key, value] of Object.entries(field)) {
                if (typeof value !== 'number' || isNaN(value)) {
                    throw createError(
                        ErrorCodes.INVALID_ARGUMENT,
                        `字段 ${key} 的增量必须是数字`,
                        [{ field: key, type: 'type', message: '增量必须是数字', received: typeof value }]
                    );
                }
                incFields[key] = value;
            }
            incUpdate = { $inc: incFields };
        } else {
            throw createError(
                ErrorCodes.INVALID_ARGUMENT,
                'field 必须是字符串或对象',
                [{ field: 'field', type: 'type', message: 'field 必须是字符串或对象', received: typeof field }]
            );
        }

        // 3. 构建选项
        const maxTimeMS = actualOptions.maxTimeMS !== undefined ? actualOptions.maxTimeMS : defaults.maxTimeMS;
        const comment = actualOptions.comment;
        const returnDocument = actualOptions.returnDocument || 'after';
        const projection = actualOptions.projection;

        const updateOptions = {
            returnDocument: returnDocument,
            includeResultMetadata: true,
            maxTimeMS
        };
        if (projection) updateOptions.projection = projection;
        if (comment) updateOptions.comment = comment;

        // 4. 执行 findOneAndUpdate 操作
        let result;
        try {
            result = await collection.findOneAndUpdate(filter, incUpdate, updateOptions);
        } catch (error) {
            throw error;
        }

        // 5. 自动失效缓存
        const wasModified = result.lastErrorObject && result.lastErrorObject.n > 0;

        if (cache && wasModified) {
            try {
                const namespace = `${instanceId}:${type}:${effectiveDbName}:${collection.collectionName}`;
                const pattern = `${namespace}:*`;

                // 检查是否在事务中
                if (isInTransaction(actualOptions)) {
                    // 事务中：调用 Transaction 的 recordInvalidation 方法
                    const tx = getTransactionFromSession(actualOptions.session);
                    if (tx && typeof tx.recordInvalidation === 'function') {
                        // 🚀 传递 metadata 支持文档级别锁
                        await tx.recordInvalidation(pattern, {
                            operation: 'write',
                            query: filter,
                            collection: collection.collectionName
                        });
                        logger?.debug?.(`[incrementOne] 事务中失效缓存: ${collection.collectionName}`);
                    } else {
                        const deleted = await cache.delPattern(pattern);
                        if (deleted > 0) {
                            logger?.debug?.(`[incrementOne] 自动失效缓存: ${collection.collectionName}, 删除 ${deleted} 个缓存键`);
                        }
                    }
                } else {
                    // 非事务：直接失效缓存
                    const deleted = await cache.delPattern(pattern);
                    if (deleted > 0) {
                        logger?.debug?.(`[incrementOne] 自动失效缓存: ${collection.collectionName}, 删除 ${deleted} 个缓存键`);
                    }
                }
            } catch (cacheError) {
                logger?.warn?.('[incrementOne] 缓存失效失败', { error: cacheError.message });
            }
        }

        // 6. 慢查询日志
        const duration = Date.now() - startTime;
        const slowQueryMs = defaults?.slowQueryMs || 1000;

        if (duration >= slowQueryMs) {
            try {
                const meta = {
                    operation: 'incrementOne',
                    durationMs: duration,
                    iid: instanceId,
                    type: type,
                    db: effectiveDbName,
                    collection: collection.collectionName,
                    found: result.value !== null,
                    filter: mongoSlowLogShaper?.sanitize ? mongoSlowLogShaper.sanitize(filter) : filter,
                    update: mongoSlowLogShaper?.sanitize ? mongoSlowLogShaper.sanitize(incUpdate) : incUpdate,
                    comment: comment
                };
                logger?.warn?.('🐌 Slow query: incrementOne', meta);
                emit?.('slow-query', meta);
            } catch (_) {
                // 忽略日志错误
            }
        }

        // 7. 日志记录
        logger?.debug?.('[incrementOne] 操作完成', {
            ns: `${effectiveDbName}.${collection.collectionName}`,
            duration: duration,
            found: result && result.value !== null,
            modified: wasDocumentModified(result)
        });

        // 8. 返回结果 - 使用标准的返回值处理函数（兼容不同 MongoDB 驱动版本）
        // 默认返回完整元数据格式（包含 value, acknowledged, matchedCount 等）
        const processedResult = handleFindOneAndResult(result, { includeResultMetadata: true }, logger);

        return {
            acknowledged: true,
            matchedCount: processedResult.lastErrorObject?.n || 0,
            modifiedCount: wasDocumentModified(processedResult) ? 1 : 0,
            value: processedResult.value
        };
    };

    return { incrementOne };
}

module.exports = { createIncrementOneOps };

