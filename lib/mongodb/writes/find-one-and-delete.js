/**
 * findOneAndDelete 操作实现
 * 原子地查找并删除单个文档
 */

const { createError, ErrorCodes } = require("../../errors");
const CacheFactory = require("../../cache");

/**
 * 创建 findOneAndDelete 操作
 * @param {Object} context - 模块上下文
 * @param {Object} context.db - MongoDB 数据库实例
 * @param {Object} context.cache - 缓存实例
 * @param {Object} context.logger - 日志实例
 * @param {Object} context.defaults - 默认配置
 * @param {string} context.collection - 集合名称
 * @param {string} context.effectiveDbName - 数据库名称
 * @param {string} context.instanceId - 实例ID
 * @returns {Object} 包含 findOneAndDelete 方法的对象
 */
function createFindOneAndDeleteOps(context) {
    const { db, cache, logger, defaults, collection, effectiveDbName: databaseName, instanceId } = context;

    // 提取集合名称和原生 collection 对象
    const collectionName = collection.collectionName;
    const nativeCollection = collection;

    /**
     * 查找并删除单个文档（原子操作）
     * @param {Object} filter - 筛选条件（必需）
     * @param {Object} [options] - 操作选项
     * @param {Object} [options.projection] - 字段投影
     * @param {Object} [options.sort] - 排序条件
     * @param {number} [options.maxTimeMS] - 最大执行时间
     * @param {Object} [options.writeConcern] - 写关注选项
     * @param {string} [options.comment] - 操作注释（用于日志追踪）
     * @param {Object} [options.collation] - 排序规则
     * @param {Object} [options.hint] - 索引提示
     * @param {boolean} [options.includeResultMetadata=false] - 是否包含完整结果元数据
     * @returns {Promise<Object|null>} 返回被删除的文档或 null（未找到）；includeResultMetadata=true 时返回 { value, ok, lastErrorObject }
     * @throws {Error} 当参数无效时
     *
     * @example
     * // 删除单个文档并返回
     * const deletedDoc = await collection("tasks").findOneAndDelete({
     *     taskId: "task123"
     * });
     * if (deletedDoc) {
     *     console.log("已删除任务:", deletedDoc.taskId);
     * }
     *
     * @example
     * // 删除最旧的待处理任务
     * const oldestTask = await collection("queue").findOneAndDelete(
     *     { status: "pending" },
     *     { sort: { createdAt: 1 } }
     * );
     *
     * @example
     * // 使用 projection 仅返回需要的字段
     * const deletedUser = await collection("users").findOneAndDelete(
     *     { userId: "user123" },
     *     { projection: { userId: 1, name: 1 } }
     * );
     *
     * @example
     * // 获取完整元数据
     * const result = await collection("sessions").findOneAndDelete(
     *     { sessionId: "session123" },
     *     { includeResultMetadata: true }
     * );
     * console.log("删除成功:", result.ok);
     * console.log("已删除的文档:", result.value);
     */
    const findOneAndDelete = async function findOneAndDelete(filter, options = {}) {
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
        const operation = "findOneAndDelete";
        const ns = `${databaseName}.${collectionName}`;

        try {
            // 3. 执行查找并删除操作
            const result = await nativeCollection.findOneAndDelete(filter, options);

            // 4. 自动失效缓存（如果有文档被删除）
            if (cache && result && result.value) {
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
            const found = !!(result && result.value !== null && result.value !== undefined);

            if (duration > slowQueryMs) {
                logger.warn(`[${operation}] 慢操作警告`, {
                    ns,
                    duration,
                    threshold: slowQueryMs,
                    filterKeys: Object.keys(filter),
                    found,
                    comment: options.comment
                });
            } else {
                logger.debug(`[${operation}] 操作完成`, {
                    ns,
                    duration,
                    found
                });
            }

            // 6. 返回结果
            if (options.includeResultMetadata) {
                return result; // 返回完整元数据
            } else {
                return result ? result.value : null; // 仅返回文档
            }

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
                `findOneAndDelete 操作失败: ${error.message}`,
                null,
                error
            );
        }
    };

    return { findOneAndDelete };
}

module.exports = { createFindOneAndDeleteOps };

