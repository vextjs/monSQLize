/**
 * updateBatch 操作实现
 * 分批更新大量匹配的文档（基于流式查询）
 */

const { createError, ErrorCodes } = require('../../errors');
const CacheFactory = require('../../cache');
const { isInTransaction, getTransactionFromSession } = require('../common/transaction-aware');
const { convertObjectIdStrings, convertUpdateDocument } = require('../../utils/objectid-converter');
const { executeBatchWithRetry } = require('./common/batch-retry');

/**
 * 创建 updateBatch 操作
 * @param {Object} context - 模块上下文
 * @returns {Object} 包含 updateBatch 方法的对象
 */
function createUpdateBatchOps(context) {
    const { db, cache, logger, defaults, collection, effectiveDbName: databaseName, instanceId } = context;

    const collectionName = collection.collectionName;
    const nativeCollection = collection;

    /**
     * 分批更新大量匹配的文档
     * @param {Object} filter - 筛选条件（必需）
     * @param {Object} update - 更新操作（必需，使用更新操作符如 $set）
     * @param {Object} [options] - 操作选项
     * @param {number} [options.batchSize=1000] - 每批更新的文档数量
     * @param {boolean} [options.estimateProgress=true] - 是否预先 count 获取总数
     * @param {Function} [options.onProgress] - 进度回调函数 (progress) => {}
     * @param {string} [options.onError='stop'] - 错误处理策略: 'stop'/'skip'/'collect'/'retry'
     * @param {number} [options.retryAttempts=3] - 失败批次最大重试次数
     * @param {number} [options.retryDelay=1000] - 重试延迟时间（毫秒）
     * @param {Function} [options.onRetry] - 重试回调函数 (retryInfo) => {}
     * @param {Object} [options.writeConcern] - 写关注选项
     * @param {string} [options.comment] - 操作注释（用于日志追踪）
     * @returns {Promise<Object>} 更新结果
     *
     * @example
     * const result = await collection('orders').updateBatch(
     *     { status: 'pending', createdAt: { $lt: expiredDate } },
     *     { $set: { status: 'expired' } },
     *     {
     *         batchSize: 500,
     *         estimateProgress: true,
     *         onProgress: (p) => console.log(`进度: ${p.percentage}%`)
     *     }
     * );
     */
    const updateBatch = async function updateBatch(filter, update, options = {}) {
        const startTime = Date.now();

        // 1. 参数验证
        if (!filter || typeof filter !== 'object' || Array.isArray(filter)) {
            throw createError(
                ErrorCodes.INVALID_ARGUMENT,
                'filter 必须是对象类型',
                [{ field: 'filter', type: 'object.required', message: 'filter 是必需参数且必须是对象' }]
            );
        }

        if (!update || typeof update !== 'object' || Array.isArray(update)) {
            throw createError(
                ErrorCodes.INVALID_ARGUMENT,
                'update 必须是对象类型',
                [{ field: 'update', type: 'object.required', message: 'update 是必需参数且必须是对象' }]
            );
        }

        // 验证 update 包含更新操作符
        const updateKeys = Object.keys(update);
        if (updateKeys.length > 0 && !updateKeys.some(key => key.startsWith('$'))) {
            throw createError(
                ErrorCodes.INVALID_ARGUMENT,
                'update 必须使用更新操作符（如 $set, $inc 等）',
                [{ field: 'update', type: 'object.invalid', message: '请使用 $set, $inc, $push 等更新操作符' }]
            );
        }

        // 自动转换 ObjectId 字符串
        const convertedFilter = convertObjectIdStrings(filter, 'filter', 0, new WeakSet(), {
            logger: context.logger,
            excludeFields: context.autoConvertConfig?.excludeFields,
            customFieldPatterns: context.autoConvertConfig?.customFieldPatterns,
            maxDepth: context.autoConvertConfig?.maxDepth
        });

        const convertedUpdate = convertUpdateDocument(update, {
            logger: context.logger,
            excludeFields: context.autoConvertConfig?.excludeFields,
            customFieldPatterns: context.autoConvertConfig?.customFieldPatterns,
            maxDepth: context.autoConvertConfig?.maxDepth
        });

        // 解构选项
        const {
            batchSize = 1000,
            estimateProgress = true,
            onProgress,
            onError = 'stop',
            retryAttempts = 3,
            retryDelay = 1000,
            onRetry,
            writeConcern,
            comment
        } = options;

        // 2. 预先 count（可选）
        const totalCount = estimateProgress
            ? await nativeCollection.countDocuments(convertedFilter)
            : null;

        // 3. 初始化结果
        const result = {
            acknowledged: true,
            totalCount,
            matchedCount: 0,
            modifiedCount: 0,
            batchCount: 0,
            errors: [],
            retries: []
        };

        // 4. 🔴 关键：直接调用 context 的 find 流式方法
        const stream = await context.find(convertedFilter, {
            stream: true,
            batchSize,
            limit: 0,  // 🔴 重要：禁用默认的 limit，否则只会查询默认的 10 条
            comment: comment ? `${comment}:updateBatch` : 'updateBatch'
        });

        let batch = [];

        return new Promise((resolve, reject) => {
            // 5. 监听数据事件
            stream.on('data', async (doc) => {
                batch.push(doc._id);

                // 达到批次大小，执行更新
                if (batch.length >= batchSize) {
                    stream.pause();

                    try {
                        // 🔴 带重试的批量更新
                        const batchResult = await executeBatchWithRetry(
                            () => nativeCollection.updateMany(
                                { _id: { $in: batch } },
                                convertedUpdate,
                                { writeConcern }
                            ),
                            { onError, retryAttempts, retryDelay, onRetry, batchIndex: result.batchCount }
                        );

                        result.matchedCount += batchResult.result.matchedCount;
                        result.modifiedCount += batchResult.result.modifiedCount;
                        result.batchCount++;

                        // 记录重试信息
                        if (batchResult.attempts > 0) {
                            result.retries.push({
                                batchIndex: result.batchCount - 1,
                                attempts: batchResult.attempts,
                                success: true
                            });
                        }

                        batch = [];

                        // 🔴 进度回调
                        if (onProgress) {
                            onProgress({
                                currentBatch: result.batchCount,
                                totalBatches: totalCount ? Math.ceil(totalCount / batchSize) : null,
                                matched: result.matchedCount,
                                modified: result.modifiedCount,
                                total: totalCount,
                                percentage: totalCount ? Math.round((result.matchedCount / totalCount) * 100) : null,
                                errors: result.errors.length,
                                retries: result.retries.length
                            });
                        }

                        stream.resume();

                    } catch (error) {
                        // 🔴 错误处理
                        result.errors.push({
                            batchIndex: result.batchCount,
                            batchSize: batch.length,
                            error: error,
                            message: error.message
                        });

                        if (onError === 'stop') {
                            stream.destroy();
                            reject(createError(
                                ErrorCodes.WRITE_ERROR,
                                `updateBatch 操作失败: ${error.message}`,
                                null,
                                error
                            ));
                            return;
                        }

                        // skip 或 collect：清空批次，继续
                        batch = [];
                        result.batchCount++;
                        stream.resume();
                    }
                }
            });

            // 6. 监听流结束事件
            stream.on('end', async () => {
                // 处理剩余的批次
                if (batch.length > 0) {
                    try {
                        const batchResult = await executeBatchWithRetry(
                            () => nativeCollection.updateMany(
                                { _id: { $in: batch } },
                                convertedUpdate,
                                { writeConcern }
                            ),
                            { onError, retryAttempts, retryDelay, onRetry, batchIndex: result.batchCount }
                        );

                        result.matchedCount += batchResult.result.matchedCount;
                        result.modifiedCount += batchResult.result.modifiedCount;
                        result.batchCount++;

                        if (batchResult.attempts > 0) {
                            result.retries.push({
                                batchIndex: result.batchCount - 1,
                                attempts: batchResult.attempts,
                                success: true
                            });
                        }

                        // 最后一批的进度回调
                        if (onProgress) {
                            onProgress({
                                currentBatch: result.batchCount,
                                matched: result.matchedCount,
                                modified: result.modifiedCount,
                                total: totalCount,
                                percentage: totalCount ? 100 : null,
                                errors: result.errors.length,
                                retries: result.retries.length
                            });
                        }

                    } catch (error) {
                        result.errors.push({
                            batchIndex: result.batchCount,
                            batchSize: batch.length,
                            error: error,
                            message: error.message
                        });
                    }
                }

                // 7. 最终缓存失效
                if (cache && result.modifiedCount > 0) {
                    try {
                        const ns = {
                            iid: instanceId,
                            type: 'mongodb',
                            db: databaseName,
                            collection: collectionName
                        };
                        const pattern = CacheFactory.buildNamespacePattern(ns);

                        // 检查是否在事务中
                        if (isInTransaction(options)) {
                            const tx = getTransactionFromSession(options.session);
                            if (tx && typeof tx.recordInvalidation === 'function') {
                                await tx.recordInvalidation(pattern, {
                                    operation: 'write',
                                    query: filter || {},
                                    collection: collectionName
                                });
                                logger.debug(`[updateBatch] 事务中失效缓存: ${ns.db}.${ns.collection}`);
                            } else {
                                const deleted = await cache.delPattern(pattern);
                                if (deleted > 0) {
                                    logger.debug(`[updateBatch] 自动失效缓存: ${ns.db}.${ns.collection}, 删除 ${deleted} 个缓存键`);
                                }
                            }
                        } else {
                            const deleted = await cache.delPattern(pattern);
                            if (deleted > 0) {
                                logger.debug(`[updateBatch] 自动失效缓存: ${ns.db}.${ns.collection}, 删除 ${deleted} 个缓存键`);
                            }
                        }
                    } catch (cacheErr) {
                        logger.warn(`[updateBatch] 缓存失效失败: ${cacheErr.message}`);
                    }
                }

                // 8. 慢查询日志
                const duration = Date.now() - startTime;
                const slowQueryMs = defaults.slowQueryMs || 1000;

                if (duration > slowQueryMs) {
                    logger.warn(`[updateBatch] 慢操作警告`, {
                        ns: `${databaseName}.${collectionName}`,
                        duration,
                        threshold: slowQueryMs,
                        totalCount,
                        matchedCount: result.matchedCount,
                        modifiedCount: result.modifiedCount,
                        batchCount: result.batchCount,
                        errorCount: result.errors.length,
                        retryCount: result.retries.length,
                        comment
                    });
                } else {
                    logger.debug(`[updateBatch] 操作完成`, {
                        ns: `${databaseName}.${collectionName}`,
                        duration,
                        matchedCount: result.matchedCount,
                        modifiedCount: result.modifiedCount,
                        batchCount: result.batchCount
                    });
                }

                resolve(result);
            });

            // 9. 监听流错误事件
            stream.on('error', (error) => {
                logger.error(`[updateBatch] 流式查询错误`, {
                    ns: `${databaseName}.${collectionName}`,
                    error: error.message,
                    code: error.code
                });

                result.errors.push({
                    batchIndex: result.batchCount,
                    error: error,
                    message: `流式查询错误: ${error.message}`
                });

                reject(createError(
                    ErrorCodes.WRITE_ERROR,
                    `updateBatch 流式查询失败: ${error.message}`,
                    null,
                    error
                ));
            });
        });
    };

    return { updateBatch };
}

module.exports = { createUpdateBatchOps };

