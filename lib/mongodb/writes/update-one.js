/**
 * updateOne 操作实现
 * 更新单个匹配的文档
 */

const { createError, ErrorCodes } = require('../../errors');
const CacheFactory = require('../../cache');
const { isInTransaction, getTransactionFromSession } = require('../common/transaction-aware');

/**
 * 创建 updateOne 操作
 * @param {Object} context - 模块上下文
 * @param {Object} context.db - MongoDB 数据库实例
 * @param {Object} context.cache - 缓存实例
 * @param {Object} context.logger - 日志实例
 * @param {Object} context.defaults - 默认配置
 * @param {string} context.collection - 集合名称
 * @param {string} context.effectiveDbName - 数据库名称
 * @param {string} context.instanceId - 实例ID
 * @returns {Object} 包含 updateOne 方法的对象
 */
function createUpdateOneOps(context) {
    const { db, cache, logger, defaults, collection, effectiveDbName: databaseName, instanceId } = context;

    // 提取集合名称和原生 collection 对象
    const collectionName = collection.collectionName;
    const nativeCollection = collection;

    /**
     * 更新单个文档
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
     * const result = await collection("users").updateOne(
     *     { userId: "user123" },
     *     { $set: { status: "active", updatedAt: new Date() } }
     * );
     * console.log("Modified:", result.modifiedCount);
     *
     * @example
     * // 使用 upsert 选项
     * const result = await collection("users").updateOne(
     *     { userId: "user123" },
     *     { $set: { name: "Alice", age: 25 } },
     *     { upsert: true }
     * );
     */
    const updateOne = async function updateOne(filter, update, options = {}) {
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

        // 验证 update 包含更新操作符（防止整体替换）
        const updateKeys = Object.keys(update);
        if (updateKeys.length > 0 && !updateKeys.some(key => key.startsWith('$'))) {
            throw createError(
                ErrorCodes.INVALID_ARGUMENT,
                'update 必须使用更新操作符（如 $set, $inc 等）',
                [{ field: 'update', type: 'object.invalid', message: '请使用 $set, $inc, $push 等更新操作符，或使用 replaceOne 进行整体替换' }]
            );
        }

        // 2. 构建操作上下文
        const operation = 'updateOne';
        const ns = `${databaseName}.${collectionName}`;

        try {
            // 3. 执行更新操作
            const result = await nativeCollection.updateOne(filter, update, options);

            // 4. 自动失效缓存
            if (cache && result.modifiedCount > 0) {
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
                        // 这会立即失效缓存 + 添加缓存锁
                        const tx = getTransactionFromSession(options.session);
                        if (tx && typeof tx.recordInvalidation === 'function') {
                            // 🚀 传递 metadata 支持文档级别锁和只读优化
                            await tx.recordInvalidation(pattern, {
                                operation: 'write',
                                query: filter,
                                collection: collectionName
                            });
                            logger.debug(`[${operation}] 事务中失效缓存: ${ns.db}.${ns.collection}`);
                        } else {
                            // 降级处理：直接失效缓存
                            const deleted = await cache.delPattern(pattern);
                            if (deleted > 0) {
                                logger.debug(`[${operation}] 自动失效缓存: ${ns.db}.${ns.collection}, 删除 ${deleted} 个缓存键`);
                            }
                        }
                    } else {
                        // 非事务：直接失效缓存
                        const deleted = await cache.delPattern(pattern);
                        if (deleted > 0) {
                            logger.debug(`[${operation}] 自动失效缓存: ${ns.db}.${ns.collection}, 删除 ${deleted} 个缓存键`);
                        }
                    }
                } catch (cacheErr) {
                    // 缓存失效失败不影响写操作
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
                    updateKeys: Object.keys(update),
                    matchedCount: result.matchedCount,
                    modifiedCount: result.modifiedCount,
                    upserted: result.upsertedId ? true : false,
                    comment: options.comment
                });
            } else {
                logger.debug(`[${operation}] 操作完成`, {
                    ns,
                    duration,
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
                updateKeys: Object.keys(update)
            });

            // 识别特定错误类型
            if (error.code === 11000) {
                // MongoDB 重复键错误（可能在 upsert 时发生）
                throw createError(
                    ErrorCodes.DUPLICATE_KEY,
                    '更新失败：违反唯一性约束',
                    [{ field: '_id', message: error.message }],
                    error
                );
            }

            // 其他错误
            throw createError(
                ErrorCodes.WRITE_ERROR,
                `updateOne 操作失败: ${error.message}`,
                null,
                error
            );
        }
    };

    return { updateOne };
}

module.exports = { createUpdateOneOps };

