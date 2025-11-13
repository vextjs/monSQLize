/**
 * deleteOne 操作实现
 * 删除单个匹配的文档
 */

const { createError, ErrorCodes } = require("../../errors");
const CacheFactory = require("../../cache");

/**
 * 创建 deleteOne 操作
 * @param {Object} context - 模块上下文
 * @param {Object} context.db - MongoDB 数据库实例
 * @param {Object} context.cache - 缓存实例
 * @param {Object} context.logger - 日志实例
 * @param {Object} context.defaults - 默认配置
 * @param {string} context.collection - 集合名称
 * @param {string} context.effectiveDbName - 数据库名称
 * @param {string} context.instanceId - 实例ID
 * @returns {Object} 包含 deleteOne 方法的对象
 */
function createDeleteOneOps(context) {
    const { db, cache, logger, defaults, collection, effectiveDbName: databaseName, instanceId } = context;

    // 提取集合名称和原生 collection 对象
    const collectionName = collection.collectionName;
    const nativeCollection = collection;

    /**
     * 删除单个匹配的文档
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
     * // 删除单个文档
     * const result = await collection("users").deleteOne({ userId: "user123" });
     * console.log("已删除:", result.deletedCount); // 0 或 1
     *
     * @example
     * // 使用 collation（不区分大小写）
     * const result = await collection("users").deleteOne(
     *     { name: "alice" },
     *     { collation: { locale: "en", strength: 2 } }
     * );
     *
     * @example
     * // 使用索引提示
     * const result = await collection("orders").deleteOne(
     *     { orderId: "order123" },
     *     { hint: { orderId: 1 } }
     * );
     */
    const deleteOne = async function deleteOne(filter, options = {}) {
        const startTime = Date.now();

        // 1. 参数验证
        if (!filter || typeof filter !== "object" || Array.isArray(filter)) {
            throw createError(
                ErrorCodes.INVALID_ARGUMENT,
                "filter 必须是对象类型",
                [{ field: "filter", type: "object.required", message: "filter 是必需参数且必须是对象" }]
            );
        }

        // 2. 构建操作上下文
        const operation = "deleteOne";
        const ns = `${databaseName}.${collectionName}`;

        try {
            // 3. 执行删除操作
            const result = await nativeCollection.deleteOne(filter, options);

            // 4. 自动失效缓存（如果有文档被删除）
            if (cache && result.deletedCount > 0) {
                try {
                    const ns = {
                        iid: instanceId,
                        type: "mongodb",
                        db: databaseName,
                        collection: collectionName
                    };
                    const pattern = CacheFactory.buildNamespacePattern(ns);
                    const deleted = await cache.delPattern(pattern);

                    if (deleted > 0) {
                        logger.debug(`[${operation}] 自动失效缓存: ${ns.db}.${ns.collection}, 删除 ${deleted} 个缓存键`);
                    }
                } catch (cacheErr) {
                    logger.warn(`[${operation}] 缓存失效失败: ${cacheErr.message}`, { ns: `${databaseName}.${collectionName}`, error: cacheErr });
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

            // 6. 返回结果
            return {
                deletedCount: result.deletedCount,
                acknowledged: result.acknowledged
            };

        } catch (error) {
            // 7. 错误处理
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
                `deleteOne 操作失败: ${error.message}`,
                null,
                error
            );
        }
    };

    return { deleteOne };
}

module.exports = { createDeleteOneOps };

