/**
 * updateMany 操作实现
 * 更新所有匹配的文档
 */

const { createError, ErrorCodes } = require('../../errors');
const CacheFactory = require('../../cache');
const { isInTransaction, getTransactionFromSession } = require('../common/transaction-aware');
const { convertObjectIdStrings, convertUpdateDocument } = require('../../utils/objectid-converter');
const { validateAggregationPipeline, isAggregationPipeline } = require('../common/aggregation-validator');

/**
 * 创建 updateMany 操作
 * @param {Object} context - 模块上下文
 * @param {Object} context.db - MongoDB 数据库实例
 * @param {Object} context.cache - 缓存实例
 * @param {Object} context.logger - 日志实例
 * @param {Object} context.defaults - 默认配置
 * @param {string} context.collection - 集合名称
 * @param {string} context.effectiveDbName - 数据库名称
 * @param {string} context.instanceId - 实例ID
 * @returns {Object} 包含 updateMany 方法的对象
 */
function createUpdateManyOps(context) {
    const { db, cache, logger, defaults, collection, effectiveDbName: databaseName, instanceId } = context;

    // 提取集合名称和原生 collection 对象
    const collectionName = collection.collectionName;
    const nativeCollection = collection;

    /**
     * 更新多个文档
     * @param {Object} filter - 筛选条件（必需）
     * @param {Object} update - 更新操作（必需，使用更新操作符如 $set）
     * @param {Object} [options] - 操作选项
     * @param {boolean} [options.upsert=false] - 不存在时是否插入
     * @param {Object} [options.writeConcern] - 写关注选项
     * @param {boolean} [options.bypassDocumentValidation] - 是否绕过文档验证
     * @param {string} [options.comment] - 操作注释（用于日志追踪）
     * @param {Object} [options.collation] - 排序规则
     * @param {Array|Object} [options.arrayFilters] - 数组过滤器
     * @param {Object} [options.hint] - 索引提示
     * @returns {Promise<Object>} 更新结果 { acknowledged, matchedCount, modifiedCount, upsertedId?, upsertedCount? }
     * @throws {Error} 当参数无效时
     *
     * @example
     * const result = await collection("users").updateMany(
     *     { status: "inactive" },
     *     { $set: { status: "archived", archivedAt: new Date() } }
     * );
     * console.log("Modified:", result.modifiedCount, "documents");
     *
     * @example
     * // 使用数组过滤器
     * const result = await collection("users").updateMany(
     *     { "tags.name": "premium" },
     *     { $set: { "tags.$[elem].verified": true } },
     *     { arrayFilters: [{ "elem.name": "premium" }] }
     * );
     */
    const updateMany = async function updateMany(filter, update, options = {}) {
        const startTime = Date.now();

        // 1. 参数验证
        if (!filter || typeof filter !== 'object' || Array.isArray(filter)) {
            throw createError(
                ErrorCodes.INVALID_ARGUMENT,
                'filter 必须是对象类型',
                [{ field: 'filter', type: 'object.required', message: 'filter 是必需参数且必须是对象' }]
            );
        }

        if (!update || (typeof update !== 'object' && !Array.isArray(update))) {
            throw createError(
                ErrorCodes.INVALID_ARGUMENT,
                'update 必须是对象（更新操作符）或数组（聚合管道）',
                [{ field: 'update', type: 'object|array.required', message: 'update 必须是更新操作符对象或聚合管道数组' }]
            );
        }

        // 检测聚合管道模式
        const isAggregation = isAggregationPipeline(update);

        if (isAggregation) {
            // 验证聚合管道格式
            validateAggregationPipeline(update);

            if (logger && logger.debug) {
                logger.debug(`[updateMany] 使用聚合管道模式`, {
                    collection: collectionName,
                    stagesCount: update.length,
                    operators: update.map(stage => Object.keys(stage)[0])
                });
            }
        } else {
            // 验证 update 包含更新操作符（防止整体替换）
            const updateKeys = Object.keys(update);

            // 检查空对象
            if (updateKeys.length === 0) {
                throw createError(
                    ErrorCodes.INVALID_ARGUMENT,
                    'update 不能为空对象',
                    [{ field: 'update', type: 'object.empty', message: 'update 必须包含至少一个更新操作符，如 $set、$inc、$push 等' }]
                );
            }

            // 检查是否包含操作符
            if (!updateKeys.some(key => key.startsWith('$'))) {
                throw createError(
                    ErrorCodes.INVALID_ARGUMENT,
                    'update 必须使用更新操作符（如 $set, $inc 等）',
                    [{ field: 'update', type: 'object.invalid', message: '请使用 $set, $inc, $push 等更新操作符' }]
                );
            }
        }

        // ✅ v1.3.0: 自动转换 ObjectId 字符串
        const convertedFilter = convertObjectIdStrings(filter, 'filter', 0, new WeakSet(), {
            logger: context.logger,
            excludeFields: context.autoConvertConfig?.excludeFields,
            customFieldPatterns: context.autoConvertConfig?.customFieldPatterns,
            maxDepth: context.autoConvertConfig?.maxDepth
        });

        // ✅ v1.0.8: 聚合管道不转换 ObjectId（保持原样）
        const convertedUpdate = isAggregation
            ? update  // 聚合管道保持原样
            : convertUpdateDocument(update, {
                  logger: context.logger,
                  excludeFields: context.autoConvertConfig?.excludeFields,
                  customFieldPatterns: context.autoConvertConfig?.customFieldPatterns,
                  maxDepth: context.autoConvertConfig?.maxDepth
              });

        // 2. 构建操作上下文
        const operation = 'updateMany';
        const ns = `${databaseName}.${collectionName}`;

        try {
            // 3. 执行批量更新操作
            const result = await nativeCollection.updateMany(convertedFilter, convertedUpdate, options);

            // 4. 自动失效缓存（只要有匹配或 upsert 插入，就失效缓存）
            // ✅ v1.1.5: 修复 upsert 场景的缓存失效问题 - 检查 matchedCount 或 upsertedId
            if (cache && (result.matchedCount > 0 || result.upsertedId)) {
                try {
                    // 使用标准命名空间模式删除该集合的所有缓存
                    const ns = {
                        iid: instanceId,
                        type: 'mongodb',
                        db: databaseName,
                        collection: collectionName
                    };
                    const pattern = CacheFactory.buildNamespacePattern(ns);

                    // 检查是否在事务中
                    if (isInTransaction(options)) {
                        // 事务中：调用 Transaction 的 recordInvalidation 方法
                        const tx = getTransactionFromSession(options.session);
                        if (tx && typeof tx.recordInvalidation === 'function') {
                            // 🚀 传递 metadata 支持文档级别锁
                            await tx.recordInvalidation(pattern, {
                                operation: 'write',
                                query: filter,
                                collection: collectionName,
                                upserted: !!result.upsertedId
                            });
                            logger.debug(`[${operation}] 事务中失效缓存: ${ns.db}.${ns.collection}${result.upsertedId ? ' (upsert)' : ''}`);
                        } else {
                            const deleted = await cache.delPattern(pattern);
                            if (deleted > 0) {
                                logger.debug(`[${operation}] 自动失效缓存: ${ns.db}.${ns.collection}, 删除 ${deleted} 个缓存键${result.upsertedId ? ' (upsert)' : ''}`);
                            }
                        }
                    } else {
                        // 非事务：直接失效缓存
                        const deleted = await cache.delPattern(pattern);
                        if (deleted > 0) {
                            logger.debug(`[${operation}] 自动失效缓存: ${ns.db}.${ns.collection}, 删除 ${deleted} 个缓存键${result.upsertedId ? ' (upsert)' : ''}`);
                        }
                    }
                } catch (cacheErr) {
                    // 缓存失效失败不影响写操作
                    logger.warn(`[${operation}] 缓存失效失败: ${cacheErr.message}`, {
                        ns: `${databaseName}.${collectionName}`,
                        error: cacheErr,
                        upserted: !!result.upsertedId
                    });
                }
            }

            // 5. 记录慢操作日志
            const duration = Date.now() - startTime;
            const slowQueryMs = defaults.slowQueryMs || 1000;
            if (duration > slowQueryMs) {
                logger.warn(`[${operation}] 慢操作警告`, {
                    ns,
                    duration,
                    threshold: slowQueryMs,
                    filterKeys: Object.keys(filter),
                    updateType: isAggregation ? 'aggregation-pipeline' : 'update-operators',
                    updateKeys: isAggregation ? ['[pipeline]'] : Object.keys(update),
                    pipelineStages: isAggregation ? update.length : undefined,
                    matchedCount: result.matchedCount,
                    modifiedCount: result.modifiedCount,
                    upserted: result.upsertedId ? true : false,
                    comment: options.comment
                });
            } else {
                logger.debug(`[${operation}] 操作完成`, {
                    ns,
                    duration,
                    updateType: isAggregation ? 'aggregation-pipeline' : 'update-operators',
                    matchedCount: result.matchedCount,
                    modifiedCount: result.modifiedCount,
                    upserted: result.upsertedId ? true : false
                });
            }

            return result;

        } catch (error) {
            // 6. 错误处理
            const duration = Date.now() - startTime;

            logger.error(`[${operation}] 操作失败`, {
                ns,
                duration,
                error: error.message,
                code: error.code,
                filterKeys: Object.keys(filter),
                updateType: isAggregation ? 'aggregation-pipeline' : 'update-operators',
                updateKeys: isAggregation ? ['[pipeline]'] : Object.keys(update)
            });

            // ✨ v1.0.8: 检测聚合管道不支持的错误（MongoDB 4.2+ 才支持）
            if (isAggregation &&
                (error.message.includes('pipeline') ||
                 error.message.includes('Unrecognized pipeline stage') ||
                 error.message.includes('The dollar ($) prefixed field') ||
                 error.code === 40324 ||  // MongoDB 错误码：不支持的操作
                 error.code === 9)) {     // MongoDB 错误码：解析错误
                throw createError(
                    ErrorCodes.UNSUPPORTED_OPERATION,
                    'MongoDB 4.2+ 才支持聚合管道更新。请升级 MongoDB 版本或使用传统更新操作符',
                    [{
                        field: 'update',
                        message: error.message,
                        requirement: 'MongoDB 4.2+',
                        currentError: error.code,
                        documentation: 'https://www.mongodb.com/docs/manual/tutorial/update-documents-with-aggregation-pipeline/'
                    }],
                    error
                );
            }

            // 识别特定错误类型
            if (error.code === 11000) {
                // MongoDB 重复键错误（可能在 upsert 时发生）
                throw createError(
                    ErrorCodes.DUPLICATE_KEY,
                    '批量更新失败：违反唯一性约束',
                    [{ field: '_id', message: error.message }],
                    error
                );
            }

            // 其他错误
            throw createError(
                ErrorCodes.WRITE_ERROR,
                `updateMany 操作失败: ${error.message}`,
                null,
                error
            );
        }
    };

    return { updateMany };
}

module.exports = { createUpdateManyOps };

