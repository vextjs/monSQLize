/**
 * deleteMany 操作实现
 * 删除所有匹配的文档
 */

const { createError, ErrorCodes } = require('../../errors');
const CacheFactory = require('../../cache');
const { isInTransaction, getTransactionFromSession } = require('../common/transaction-aware');
const { convertObjectIdStrings } = require('../../utils/objectid-converter');

/**
 * 创建 deleteMany 操作
 * @param {Object} context - 模块上下文
 * @param {Object} context.db - MongoDB 数据库实例
 * @param {Object} context.cache - 缓存实例
 * @param {Object} context.logger - 日志实例
 * @param {Object} context.defaults - 默认配置
 * @param {string} context.collection - 集合名称
 * @param {string} context.effectiveDbName - 数据库名称
 * @param {string} context.instanceId - 实例ID
 * @returns {Object} 包含 deleteMany 方法的对象
 */
function createDeleteManyOps(context) {
    const { db, cache, logger, defaults, collection, effectiveDbName: databaseName, instanceId } = context;

    // 提取集合名称和原生 collection 对象
    const collectionName = collection.collectionName;
    const nativeCollection = collection;

    /**
     * 删除所有匹配的文档
     * @param {Object} filter - 筛选条件（必需）
     * @param {Object} [options] - 操作选项
     * @param {Object} [options.collation] - 排序规则
     * @param {Object} [options.hint] - 索引提示
     * @param {number} [options.maxTimeMS] - 最大执行时间（毫秒）
     * @param {Object} [options.writeConcern] - 写关注选项
     * @param {string} [options.comment] - 操作注释（用于日志追踪）
     * @returns {Promise<Object>} 返回删除结果 { deletedCount, acknowledged }
     * @throws {Error} 当参数无效时
     *
     * @example
     * // 删除所有匹配的文档
     * const result = await collection("logs").deleteMany({
     *     createdAt: { $lt: new Date("2024-01-01") }
     * });
     * console.log("已删除:", result.deletedCount);
     *
     * @example
     * // 删除所有文档（危险操作！）
     * const result = await collection("temp_data").deleteMany({});
     * console.log("已清空集合，删除:", result.deletedCount);
     *
     * @example
     * // 使用索引提示优化删除性能
     * const result = await collection("events").deleteMany(
     *     { status: "archived", createdAt: { $lt: someDate } },
     *     { hint: { status: 1, createdAt: 1 } }
     * );
     */
    const deleteMany = async function deleteMany(filter, options = {}) {
        const startTime = Date.now();

        // 1. 参数验证
        if (!filter || typeof filter !== 'object' || Array.isArray(filter)) {
            throw createError(
                ErrorCodes.INVALID_ARGUMENT,
                'filter 必须是对象类型',
                [{ field: 'filter', type: 'object.required', message: 'filter 是必需参数且必须是对象' }]
            );
        }

        // ✅ v1.3.0: 自动转换 ObjectId 字符串
        const convertedFilter = convertObjectIdStrings(filter, 'filter', 0, new WeakSet(), {
            logger: context.logger,
            excludeFields: context.autoConvertConfig?.excludeFields,
            customFieldPatterns: context.autoConvertConfig?.customFieldPatterns,
            maxDepth: context.autoConvertConfig?.maxDepth
        });

        // 2. 警告：空 filter 会删除所有文档
        if (Object.keys(convertedFilter).length === 0) {
            logger.warn('[deleteMany] 警告: 空 filter 将删除集合中的所有文档', {
                ns: `${databaseName}.${collectionName}`,
                comment: options.comment
            });
        }

        // 3. 构建操作上下文
        const operation = 'deleteMany';
        const ns = `${databaseName}.${collectionName}`;

        try {
            // 4. 执行删除操作
            const result = await nativeCollection.deleteMany(convertedFilter, options);

            // 5. 自动失效缓存（如果有文档被删除）
            if (cache && result.deletedCount > 0) {
                try {
                    // 🆕 v1.1.6: 解析精准失效配置
                    const instanceAuto = context.cacheAutoInvalidate || false;
                    const queryAuto = options.autoInvalidate;
                    const shouldAuto = queryAuto !== undefined ? queryAuto : instanceAuto;

                    if (shouldAuto) {
                        // 精准失效：deleteMany 使用 filter 作为文档
                        const CacheInvalidationEngine = require('../../cache-invalidation');
                        const deleted = await CacheInvalidationEngine.invalidatePrecise(cache, {
                            instanceId,
                            type: 'mongodb',
                            db: databaseName,
                            collection: collectionName,
                            document: convertedFilter,
                            operation: 'deleteMany'
                        });

                        if (deleted > 0) {
                            logger.debug(`[${operation}] 精准失效缓存: ${databaseName}.${collectionName}, 删除 ${deleted} 个缓存键`);
                        }
                    } else {
                        logger.debug(`[${operation}] 跳过自动失效（autoInvalidate=false）`);
                    }
                } catch (cacheErr) {
                    logger.warn(`[${operation}] 缓存失效失败: ${cacheErr.message}`, { ns: `${databaseName}.${collectionName}`, error: cacheErr });
                }
            }

            // 6. 记录慢操作日志
            const duration = Date.now() - startTime;
            const slowQueryMs = defaults.slowQueryMs || 1000;
            if (duration > slowQueryMs) {
                logger.warn(`[${operation}] 慢操作警告`, {
                    ns,
                    duration,
                    threshold: slowQueryMs,
                    filterKeys: Object.keys(filter),
                    deletedCount: result.deletedCount,
                    comment: options.comment
                });
            } else {
                logger.debug(`[${operation}] 操作完成`, {
                    ns,
                    duration,
                    deletedCount: result.deletedCount
                });
            }

            // 7. 返回结果
            return {
                deletedCount: result.deletedCount,
                acknowledged: result.acknowledged
            };

        } catch (error) {
            // 8. 错误处理
            const duration = Date.now() - startTime;

            logger.error(`[${operation}] 操作失败`, {
                ns,
                duration,
                error: error.message,
                code: error.code,
                filterKeys: Object.keys(filter)
            });

            // 其他错误
            throw createError(
                ErrorCodes.WRITE_ERROR,
                `deleteMany 操作失败: ${error.message}`,
                null,
                error
            );
        }
    };

    return { deleteMany };
}

module.exports = { createDeleteManyOps };


