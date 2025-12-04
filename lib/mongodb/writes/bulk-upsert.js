/**
 * bulkUpsert 扩展方法模块
 * @description 批量 upsert 操作（高性能）
 */

const { ObjectId } = require('mongodb');
const { createError, ErrorCodes } = require('../../errors');

/**
 * 创建 bulkUpsert 操作
 * @param {Object} context - 上下文对象
 * @returns {Function} bulkUpsert 方法
 */
function createBulkUpsertOps(context) {
    const {
        collection,
        defaults,
        instanceId,
        effectiveDbName,
        logger,
        emit,
        mongoSlowLogShaper,
        type
    } = context;

    /**
     * 批量 upsert 操作（高性能）
     * @param {Array<Object>} items - 要 upsert 的项目列表
     * @param {Object} [options={}] - 选项
     * @param {Function} options.matchOn - 匹配函数，返回查询条件
     * @param {number} [options.batchSize=1000] - 批次大小
     * @param {Function} [options.onProgress] - 进度回调
     * @param {number} [options.maxTimeMS] - 查询超时时间
     * @param {string} [options.comment] - 查询注释
     * @param {Object} [options.session] - MongoDB 会话（事务支持）
     * @returns {Promise<Object>} 结果对象
     * @returns {number} result.upsertedCount - 插入的文档数量
     * @returns {number} result.modifiedCount - 修改的文档数量
     * @returns {number} result.totalCount - 总处理数量
     * @returns {Array} result.errors - 错误列表
     *
     * @example
     * // 批量同步用户数据
     * const users = [
     *   { email: 'user1@example.com', name: 'User 1', age: 30 },
     *   { email: 'user2@example.com', name: 'User 2', age: 25 },
     *   // ... 10000 个用户
     * ];
     *
     * const result = await User.bulkUpsert(users, {
     *   matchOn: (item) => ({ email: item.email }),
     *   batchSize: 500,
     *   onProgress: (processed, total) => {
     *     console.log(`进度: ${processed}/${total}`);
     *   }
     * });
     *
     * console.log(`插入: ${result.upsertedCount}, 更新: ${result.modifiedCount}`);
     */
    const bulkUpsert = async function bulkUpsert(items, options = {}) {
        const startTime = Date.now();

        // 1. 参数验证
        if (!Array.isArray(items)) {
            throw createError(
                ErrorCodes.INVALID_ARGUMENT,
                'items 必须是数组',
                [{ field: 'items', type: 'type', message: 'items 必须是数组', received: typeof items }]
            );
        }

        if (items.length === 0) {
            return {
                upsertedCount: 0,
                modifiedCount: 0,
                totalCount: 0,
                errors: []
            };
        }

        if (!options.matchOn || typeof options.matchOn !== 'function') {
            throw createError(
                ErrorCodes.INVALID_ARGUMENT,
                'options.matchOn 必须是函数',
                [{ field: 'matchOn', type: 'required', message: 'matchOn 是必需的' }]
            );
        }

        // 2. 提取选项
        const matchOn = options.matchOn;
        const batchSize = options.batchSize || 1000;
        const onProgress = options.onProgress;
        const maxTimeMS = options.maxTimeMS !== undefined ? options.maxTimeMS : defaults.maxTimeMS;
        const comment = options.comment;
        const session = options.session;

        // 3. 分批处理
        let totalUpsertedCount = 0;
        let totalModifiedCount = 0;
        const errors = [];

        const totalBatches = Math.ceil(items.length / batchSize);

        for (let i = 0; i < items.length; i += batchSize) {
            const batch = items.slice(i, i + batchSize);
            const batchIndex = Math.floor(i / batchSize) + 1;

            try {
                // 构建批量操作
                const bulkOps = batch.map(item => {
                    const filter = matchOn(item);
                    return {
                        updateOne: {
                            filter,
                            update: { $set: item },
                            upsert: true
                        }
                    };
                });

                // 执行批量操作
                const bulkResult = await collection.bulkWrite(bulkOps, {
                    ordered: false,  // 不按顺序，提高性能
                    maxTimeMS,
                    comment,
                    session
                });

                totalUpsertedCount += bulkResult.upsertedCount || 0;
                totalModifiedCount += bulkResult.modifiedCount || 0;

                logger?.debug?.('[bulkUpsert] 批次完成', {
                    ns: `${effectiveDbName}.${collection.collectionName}`,
                    batch: batchIndex,
                    totalBatches,
                    batchSize: batch.length,
                    upserted: bulkResult.upsertedCount,
                    modified: bulkResult.modifiedCount
                });

                // 进度回调
                if (onProgress) {
                    const processed = Math.min(i + batchSize, items.length);
                    onProgress(processed, items.length, batchIndex, totalBatches);
                }

            } catch (error) {
                logger?.error?.('[bulkUpsert] 批次失败', {
                    ns: `${effectiveDbName}.${collection.collectionName}`,
                    batch: batchIndex,
                    error: error.message
                });

                errors.push({
                    batch: batchIndex,
                    startIndex: i,
                    endIndex: Math.min(i + batchSize, items.length),
                    error: error.message
                });

                // 如果在事务中，立即抛出错误
                if (session) {
                    throw error;
                }
            }
        }

        const duration = Date.now() - startTime;

        // 4. 慢查询日志
        const slowQueryMs = defaults?.slowQueryMs || 1000;
        if (duration >= slowQueryMs) {
            try {
                const meta = {
                    operation: 'bulkUpsert',
                    durationMs: duration,
                    iid: instanceId,
                    type,
                    db: effectiveDbName,
                    collection: collection.collectionName,
                    totalCount: items.length,
                    batchSize,
                    totalBatches,
                    upsertedCount: totalUpsertedCount,
                    modifiedCount: totalModifiedCount,
                    errorCount: errors.length,
                    comment
                };
                logger?.warn?.('🐌 Slow query: bulkUpsert', meta);
                emit?.('slow-query', meta);
            } catch (_) {
                // 忽略日志错误
            }
        }

        logger?.debug?.('[bulkUpsert] 全部完成', {
            ns: `${effectiveDbName}.${collection.collectionName}`,
            duration,
            totalCount: items.length,
            upsertedCount: totalUpsertedCount,
            modifiedCount: totalModifiedCount,
            errorCount: errors.length
        });

        return {
            upsertedCount: totalUpsertedCount,
            modifiedCount: totalModifiedCount,
            totalCount: items.length,
            errors
        };
    };

    return { bulkUpsert };
}

module.exports = { createBulkUpsertOps };

