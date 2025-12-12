/**
 * replaceOne 操作实现
 * 完整替换单个匹配的文档
 */

const { createError, ErrorCodes } = require('../../errors');
const CacheFactory = require('../../cache');
const { isInTransaction, getTransactionFromSession } = require('../common/transaction-aware');

/**
 * 创建 replaceOne 操作
 * @param {Object} context - 模块上下文
 * @param {Object} context.db - MongoDB 数据库实例
 * @param {Object} context.cache - 缓存实例
 * @param {Object} context.logger - 日志实例
 * @param {Object} context.defaults - 默认配置
 * @param {string} context.collection - 集合名称
 * @param {string} context.effectiveDbName - 数据库名称
 * @param {string} context.instanceId - 实例ID
 * @returns {Object} 包含 replaceOne 方法的对象
 */
function createReplaceOneOps(context) {
    const { db, cache, logger, defaults, collection, effectiveDbName: databaseName, instanceId } = context;

    // 提取集合名称和原生 collection 对象
    const collectionName = collection.collectionName;
    const nativeCollection = collection;

    /**
     * 替换单个文档（完整替换，不使用更新操作符）
     * @param {Object} filter - 筛选条件（必需）
     * @param {Object} replacement - 替换文档（必需，不能包含更新操作符）
     * @param {Object} [options] - 操作选项
     * @param {boolean} [options.upsert=false] - 不存在时是否插入
     * @param {Object} [options.writeConcern] - 写关注选项
     * @param {boolean} [options.bypassDocumentValidation] - 是否绕过文档验证
     * @param {string} [options.comment] - 操作注释（用于日志追踪）
     * @param {Object} [options.collation] - 排序规则
     * @param {Object} [options.hint] - 索引提示
     * @returns {Promise<Object>} 替换结果 { acknowledged, matchedCount, modifiedCount, upsertedId?, upsertedCount? }
     * @throws {Error} 当参数无效时
     *
     * @example
     * const result = await collection("users").replaceOne(
     *     { userId: "user123" },
     *     { userId: "user123", name: "Alice", age: 25, status: "active" }
     * );
     * console.log("Modified:", result.modifiedCount);
     *
     * @example
     * // 使用 upsert 选项
     * const result = await collection("users").replaceOne(
     *     { userId: "user456" },
     *     { userId: "user456", name: "Bob", age: 30 },
     *     { upsert: true }
     * );
     */
    const replaceOne = async function replaceOne(filter, replacement, options = {}) {
        const startTime = Date.now();

        // 1. 参数验证
        if (!filter || typeof filter !== 'object' || Array.isArray(filter)) {
            throw createError(
                ErrorCodes.INVALID_ARGUMENT,
                'filter 必须是对象类型',
                [{ field: 'filter', type: 'object.required', message: 'filter 是必需参数且必须是对象' }]
            );
        }

        if (!replacement || typeof replacement !== 'object' || Array.isArray(replacement)) {
            throw createError(
                ErrorCodes.INVALID_ARGUMENT,
                'replacement 必须是对象类型',
                [{ field: 'replacement', type: 'object.required', message: 'replacement 是必需参数且必须是对象' }]
            );
        }

        // 验证 replacement 不包含更新操作符（防止误用）
        const replacementKeys = Object.keys(replacement);
        if (replacementKeys.some(key => key.startsWith('$'))) {
            throw createError(
                ErrorCodes.INVALID_ARGUMENT,
                'replacement 不能包含更新操作符（如 $set, $inc 等）',
                [{ field: 'replacement', type: 'object.invalid', message: 'replaceOne 用于完整替换文档，请使用 updateOne 进行部分更新' }]
            );
        }

        // 2. 构建操作上下文
        const operation = 'replaceOne';
        const ns = `${databaseName}.${collectionName}`;

        try {
            // 3. 执行替换操作
            const result = await nativeCollection.replaceOne(filter, replacement, options);

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
                        const tx = getTransactionFromSession(options.session);
                        if (tx && typeof tx.recordInvalidation === 'function') {
                            await tx.recordInvalidation(pattern);
                            logger.debug(`[${operation}] 事务中失效缓存: ${ns.db}.${ns.collection}`);
                        } else {
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
                    replacementKeys: Object.keys(replacement),
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
                replacementKeys: Object.keys(replacement)
            });

            // 识别特定错误类型
            if (error.code === 11000) {
                // MongoDB 重复键错误（可能在 upsert 时发生）
                throw createError(
                    ErrorCodes.DUPLICATE_KEY,
                    '替换失败：违反唯一性约束',
                    [{ field: '_id', message: error.message }],
                    error
                );
            }

            // 其他错误
            throw createError(
                ErrorCodes.WRITE_ERROR,
                `replaceOne 操作失败: ${error.message}`,
                null,
                error
            );
        }
    };

    return { replaceOne };
}

module.exports = { createReplaceOneOps };

