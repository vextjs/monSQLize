/**
 * insertBatch 操作实现（改进版 - 支持重试机制）
 * 分批批量插入大量文档到集合
 */

const { createError, ErrorCodes } = require('../../errors');
const CacheFactory = require('../../cache');
const { isInTransaction, getTransactionFromSession } = require('../common/transaction-aware');
const { convertObjectIdStrings } = require('../../utils/objectid-converter');

/**
 * 创建 insertBatch 操作
 * @param {Object} context - 模块上下文
 * @param {Object} context.insertMany - insertMany 方法实例
 * @param {Object} context.cache - 缓存实例
 * @param {Object} context.logger - 日志实例
 * @param {Object} context.defaults - 默认配置
 * @param {string} context.collectionName - 集合名称
 * @param {string} context.effectiveDbName - 数据库名称
 * @param {string} context.instanceId - 实例ID
 * @returns {Object} 包含 insertBatch 方法的对象
 */
function createInsertBatchOps(context) {
    const { insertMany, cache, logger, defaults, collectionName, effectiveDbName: databaseName, instanceId } = context;

    /**
     * 分批批量插入多个文档
     * @param {Array<Object>} documents - 要插入的文档数组（必需）
     * @param {Object} [options] - 操作选项
     * @param {number} [options.batchSize=1000] - 每批插入的文档数量
     * @param {number} [options.concurrency=1] - 并发批次数（1=串行，>1=并行）
     * @param {boolean} [options.ordered=false] - 批次内是否按顺序插入
     * @param {Function} [options.onProgress] - 进度回调函数 (progress) => {}
     * @param {string} [options.onError='stop'] - 错误处理策略: 'stop'/'skip'/'collect'/'retry'
     * @param {number} [options.retryAttempts=3] - 失败批次最大重试次数（onError='retry'时有效）
     * @param {number} [options.retryDelay=1000] - 重试延迟时间（毫秒）
     * @param {Function} [options.onRetry] - 重试回调函数 (retryInfo) => {}
     * @param {Object} [options.writeConcern] - 写关注选项
     * @param {boolean} [options.bypassDocumentValidation] - 是否绕过文档验证
     * @param {string} [options.comment] - 操作注释（用于日志追踪）
     * @returns {Promise<Object>} 插入结果 { acknowledged, totalCount, insertedCount, batchCount, errors, retries, insertedIds }
     */
    const insertBatch = async function insertBatch(documents, options = {}) {
        const startTime = Date.now();

        // 1. 参数验证
        if (!Array.isArray(documents)) {
            throw createError(
                ErrorCodes.DOCUMENTS_REQUIRED,
                'documents 必须是数组类型',
                [{ field: 'documents', type: 'array.required', message: 'documents 是必需参数且必须是数组' }]
            );
        }

        if (documents.length === 0) {
            throw createError(
                ErrorCodes.DOCUMENTS_REQUIRED,
                'documents 数组不能为空',
                [{ field: 'documents', type: 'array.min', message: 'documents 至少需要包含一个文档' }]
            );
        }

        // ✅ v1.3.0: 自动转换 ObjectId 字符串
        const convertedDocuments = documents.map(doc => convertObjectIdStrings(doc, 'document', 0, new WeakSet(), {
            logger: context.logger,
            excludeFields: context.autoConvertConfig?.excludeFields,
            customFieldPatterns: context.autoConvertConfig?.customFieldPatterns,
            maxDepth: context.autoConvertConfig?.maxDepth
        }));

        // 2. 提取选项
        const {
            batchSize = 1000,
            concurrency = 1,
            ordered = false,
            onProgress,
            onError = 'stop',
            retryAttempts = 3,
            retryDelay = 1000,
            onRetry,
            ...insertOptions
        } = options;

        // 验证参数
        if (typeof batchSize !== 'number' || batchSize < 1) {
            throw createError(
                ErrorCodes.INVALID_PARAMETER,
                'batchSize 必须是大于 0 的数字',
                [{ field: 'batchSize', type: 'number.min', message: 'batchSize 必须大于 0' }]
            );
        }

        if (typeof concurrency !== 'number' || concurrency < 1) {
            throw createError(
                ErrorCodes.INVALID_PARAMETER,
                'concurrency 必须是大于 0 的数字',
                [{ field: 'concurrency', type: 'number.min', message: 'concurrency 必须大于 0' }]
            );
        }

        const validErrorStrategies = ['stop', 'skip', 'collect', 'retry'];
        if (!validErrorStrategies.includes(onError)) {
            throw createError(
                ErrorCodes.INVALID_PARAMETER,
                `onError 必须是以下值之一: ${validErrorStrategies.join(', ')}`,
                [{ field: 'onError', type: 'enum', message: `有效值: ${validErrorStrategies.join(', ')}` }]
            );
        }

        if (typeof retryAttempts !== 'number' || retryAttempts < 0) {
            throw createError(
                ErrorCodes.INVALID_PARAMETER,
                'retryAttempts 必须是非负数',
                [{ field: 'retryAttempts', type: 'number.min', message: 'retryAttempts 必须 >= 0' }]
            );
        }

        if (typeof retryDelay !== 'number' || retryDelay < 0) {
            throw createError(
                ErrorCodes.INVALID_PARAMETER,
                'retryDelay 必须是非负数',
                [{ field: 'retryDelay', type: 'number.min', message: 'retryDelay 必须 >= 0' }]
            );
        }

        // 3. 构建操作上下文
        const operation = 'insertBatch';
        const ns = `${databaseName}.${collectionName}`;
        const totalCount = convertedDocuments.length;
        const totalBatches = Math.ceil(totalCount / batchSize);

        // 结果统计
        const result = {
            acknowledged: true,
            totalCount,
            insertedCount: 0,
            batchCount: totalBatches,
            errors: [],
            retries: [],  // 新增：重试记录
            insertedIds: {}
        };

        logger.debug(`[${operation}] 开始分批插入`, {
            ns,
            totalCount,
            batchSize,
            totalBatches,
            concurrency,
            onError,
            retryAttempts: onError === 'retry' ? retryAttempts : 0
        });

        try {
            // 4. 分割文档为批次
            const batches = [];
            for (let i = 0; i < convertedDocuments.length; i += batchSize) {
                batches.push({
                    index: batches.length,
                    documents: convertedDocuments.slice(i, Math.min(i + batchSize, convertedDocuments.length)),
                    startIndex: i
                });
            }

            // 5. 执行批次插入
            if (concurrency === 1) {
                await executeSequential(batches, result, insertOptions, onProgress, {
                    onError,
                    retryAttempts,
                    retryDelay,
                    onRetry,
                    logger,
                    insertMany
                });
            } else {
                await executeConcurrent(batches, result, insertOptions, onProgress, concurrency, {
                    onError,
                    retryAttempts,
                    retryDelay,
                    onRetry,
                    logger,
                    insertMany
                });
            }

            // 6. 最终缓存失效
            if (result.insertedCount > 0 && cache) {
                try {
                    const nsObj = {
                        iid: instanceId,
                        type: 'mongodb',
                        db: databaseName,
                        collection: collectionName
                    };
                    const pattern = CacheFactory.buildNamespacePattern(nsObj);
                    const deleted = await cache.delPattern(pattern);

                    if (deleted > 0) {
                        logger.debug(`[${operation}] 自动失效缓存: ${nsObj.db}.${nsObj.collection}, 删除 ${deleted} 个缓存键`);
                    }
                } catch (cacheErr) {
                    logger.warn(`[${operation}] 缓存失效失败: ${cacheErr.message}`, { ns, error: cacheErr });
                }
            }

            // 7. 记录完成日志
            const duration = Date.now() - startTime;
            const slowThreshold = defaults.slowThreshold || 5000;

            if (duration > slowThreshold) {
                logger.warn(`[${operation}] 慢操作警告`, {
                    ns,
                    duration,
                    threshold: slowThreshold,
                    totalCount,
                    insertedCount: result.insertedCount,
                    batchCount: result.batchCount,
                    errorCount: result.errors.length,
                    retryCount: result.retries.length,
                    comment: insertOptions.comment
                });
            } else {
                logger.debug(`[${operation}] 操作完成`, {
                    ns,
                    duration,
                    totalCount,
                    insertedCount: result.insertedCount,
                    batchCount: result.batchCount,
                    errorCount: result.errors.length,
                    retryCount: result.retries.length
                });
            }

            // 8. 如果有错误且策略是 stop，抛出错误
            if (result.errors.length > 0 && onError === 'stop') {
                throw createError(
                    ErrorCodes.WRITE_ERROR,
                    `insertBatch 操作失败: 在批次 ${result.errors[0].batchIndex + 1}/${totalBatches} 遇到错误`,
                    result.errors,
                    result.errors[0].error
                );
            }

            return result;

        } catch (error) {
            const duration = Date.now() - startTime;

            logger.error(`[${operation}] 操作失败`, {
                ns,
                duration,
                error: error.message,
                code: error.code,
                totalCount,
                insertedCount: result.insertedCount,
                errorCount: result.errors.length,
                retryCount: result.retries.length
            });

            if (error.code === ErrorCodes.WRITE_ERROR && result.errors.length > 0) {
                throw error;
            }

            throw createError(
                ErrorCodes.WRITE_ERROR,
                `insertBatch 操作失败: ${error.message}`,
                null,
                error
            );
        }
    };

    /**
     * 执行单个批次插入（带重试）
     */
    async function executeBatchWithRetry(batch, insertOptions, retryContext) {
        const { onError, retryAttempts, retryDelay, onRetry, logger, insertMany } = retryContext;

        let lastError = null;
        let attempts = 0;
        const maxAttempts = onError === 'retry' ? retryAttempts + 1 : 1;

        while (attempts < maxAttempts) {
            try {
                const batchResult = await insertMany(batch.documents, {
                    ...insertOptions,
                    ordered: insertOptions.ordered !== undefined ? insertOptions.ordered : false
                });

                // 成功
                return {
                    success: true,
                    batch,
                    result: batchResult,
                    attempts
                };

            } catch (error) {
                lastError = error;
                attempts++;

                // 如果还可以重试
                if (attempts < maxAttempts) {
                    logger.warn(`[insertBatch] 批次 ${batch.index + 1} 失败，准备重试 (${attempts}/${retryAttempts})`, {
                        error: error.message,
                        batchIndex: batch.index
                    });

                    // 触发重试回调
                    if (onRetry) {
                        onRetry({
                            batchIndex: batch.index,
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
                } else {
                    // 重试次数用尽
                    logger.error(`[insertBatch] 批次 ${batch.index + 1} 重试失败，已达最大重试次数`, {
                        error: error.message,
                        attempts,
                        batchIndex: batch.index
                    });
                }
            }
        }

        // 所有重试都失败
        return {
            success: false,
            batch,
            error: lastError,
            attempts
        };
    }

    /**
     * 串行执行批次插入
     */
    async function executeSequential(batches, result, insertOptions, onProgress, retryContext) {
        for (const batch of batches) {
            const batchResult = await executeBatchWithRetry(batch, insertOptions, retryContext);

            if (batchResult.success) {
                // 更新结果
                result.insertedCount += batchResult.result.insertedCount;

                // 合并 insertedIds
                if (batchResult.result.insertedIds) {
                    for (const [localIndex, id] of Object.entries(batchResult.result.insertedIds)) {
                        const globalIndex = batch.startIndex + parseInt(localIndex);
                        result.insertedIds[globalIndex] = id;
                    }
                }

                // 记录重试信息
                if (batchResult.attempts > 0) {
                    result.retries.push({
                        batchIndex: batch.index,
                        attempts: batchResult.attempts,
                        success: true
                    });
                }

            } else {
                const errorInfo = {
                    batchIndex: batch.index,
                    batchStartIndex: batch.startIndex,
                    batchSize: batch.documents.length,
                    error: batchResult.error,
                    code: batchResult.error.code,
                    message: batchResult.error.message,
                    attempts: batchResult.attempts
                };

                result.errors.push(errorInfo);

                // 记录重试信息
                if (batchResult.attempts > 1) {
                    result.retries.push({
                        batchIndex: batch.index,
                        attempts: batchResult.attempts,
                        success: false
                    });
                }

                // 根据错误策略处理
                if (retryContext.onError === 'stop') {
                    throw batchResult.error;
                } else if (retryContext.onError === 'skip' || retryContext.onError === 'retry') {
                    retryContext.logger.warn(`[insertBatch] 跳过失败批次 ${batch.index + 1}/${batches.length}`, errorInfo);
                } else if (retryContext.onError === 'collect') {
                    retryContext.logger.warn(`[insertBatch] 收集错误，继续执行 ${batch.index + 1}/${batches.length}`, errorInfo);
                }
            }

            // 触发进度回调
            if (onProgress) {
                onProgress({
                    currentBatch: batch.index + 1,
                    totalBatches: batches.length,
                    inserted: result.insertedCount,
                    total: result.totalCount,
                    percentage: Math.round((result.insertedCount / result.totalCount) * 100),
                    errors: result.errors.length,
                    retries: result.retries.length
                });
            }
        }
    }

    /**
     * 并发执行批次插入
     */
    async function executeConcurrent(batches, result, insertOptions, onProgress, concurrency, retryContext) {
        const executing = [];
        const results = [];

        for (let i = 0; i < batches.length; i++) {
            const batch = batches[i];

            const promise = executeBatchWithRetry(batch, insertOptions, retryContext);

            results.push(promise);
            executing.push(promise);

            // 控制并发数量
            if (executing.length >= concurrency) {
                await Promise.race(executing);
                executing.splice(0, executing.findIndex(p => p === promise) + 1);
            }

            // 等待当前批次
            const batchResult = await promise;

            // 更新结果
            if (batchResult.success) {
                result.insertedCount += batchResult.result.insertedCount;

                if (batchResult.result.insertedIds) {
                    for (const [localIndex, id] of Object.entries(batchResult.result.insertedIds)) {
                        const globalIndex = batch.startIndex + parseInt(localIndex);
                        result.insertedIds[globalIndex] = id;
                    }
                }

                if (batchResult.attempts > 0) {
                    result.retries.push({
                        batchIndex: batch.index,
                        attempts: batchResult.attempts,
                        success: true
                    });
                }
            } else {
                const errorInfo = {
                    batchIndex: batch.index,
                    batchStartIndex: batch.startIndex,
                    batchSize: batch.documents.length,
                    error: batchResult.error,
                    code: batchResult.error.code,
                    message: batchResult.error.message,
                    attempts: batchResult.attempts
                };

                result.errors.push(errorInfo);

                if (batchResult.attempts > 1) {
                    result.retries.push({
                        batchIndex: batch.index,
                        attempts: batchResult.attempts,
                        success: false
                    });
                }

                if (retryContext.onError === 'stop') {
                    throw batchResult.error;
                }
            }

            // 触发进度回调
            if (onProgress) {
                onProgress({
                    currentBatch: i + 1,
                    totalBatches: batches.length,
                    inserted: result.insertedCount,
                    total: result.totalCount,
                    percentage: Math.round((result.insertedCount / result.totalCount) * 100),
                    errors: result.errors.length,
                    retries: result.retries.length
                });
            }
        }

        await Promise.all(results);
    }

    return { insertBatch };
}

module.exports = { createInsertBatchOps };


