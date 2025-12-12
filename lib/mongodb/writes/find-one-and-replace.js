/**
 * findOneAndReplace 操作实现
 * 原子地查找并替换单个文档
 */

const { createError, ErrorCodes } = require('../../errors');
const CacheFactory = require('../../cache');
const { handleFindOneAndResult, wasDocumentModified } = require('./result-handler');
const { isInTransaction, getTransactionFromSession } = require('../common/transaction-aware');

/**
 * 创建 findOneAndReplace 操作
 * @param {Object} context - 模块上下文
 * @param {Object} context.db - MongoDB 数据库实例
 * @param {Object} context.cache - 缓存实例
 * @param {Object} context.logger - 日志实例
 * @param {Object} context.defaults - 默认配置
 * @param {string} context.collection - 集合名称
 * @param {string} context.effectiveDbName - 数据库名称
 * @param {string} context.instanceId - 实例ID
 * @returns {Object} 包含 findOneAndReplace 方法的对象
 */
function createFindOneAndReplaceOps(context) {
    const { db, cache, logger, defaults, collection, effectiveDbName: databaseName, instanceId } = context;

    // 提取集合名称和原生 collection 对象
    const collectionName = collection.collectionName;
    const nativeCollection = collection;

    /**
     * 查找并替换单个文档（原子操作）
     * @param {Object} filter - 筛选条件（必需）
     * @param {Object} replacement - 替换文档（必需，不能包含更新操作符）
     * @param {Object} [options] - 操作选项
     * @param {Object} [options.projection] - 字段投影
     * @param {Object} [options.sort] - 排序条件
     * @param {boolean} [options.upsert=false] - 不存在时是否插入
     * @param {string} [options.returnDocument="before"] - 返回替换前("before")或替换后("after")的文档
     * @param {number} [options.maxTimeMS] - 最大执行时间
     * @param {Object} [options.writeConcern] - 写关注选项
     * @param {boolean} [options.bypassDocumentValidation] - 是否绕过文档验证
     * @param {string} [options.comment] - 操作注释（用于日志追踪）
     * @param {Object} [options.collation] - 排序规则
     * @param {Object} [options.hint] - 索引提示
     * @param {boolean} [options.includeResultMetadata=false] - 是否包含完整结果元数据
     * @returns {Promise<Object|null>} 返回文档或 null（未找到）；includeResultMetadata=true 时返回 { value, ok, lastErrorObject }
     * @throws {Error} 当参数无效时
     *
     * @example
     * // 返回替换前的文档（默认）
     * const oldDoc = await collection("users").findOneAndReplace(
     *     { userId: "user123" },
     *     { userId: "user123", name: "Alice", age: 25, status: "active" }
     * );
     * console.log("Old doc:", oldDoc);
     *
     * @example
     * // 返回替换后的文档
     * const newDoc = await collection("users").findOneAndReplace(
     *     { userId: "user123" },
     *     { userId: "user123", name: "Alice", age: 26 },
     *     { returnDocument: "after" }
     * );
     * console.log("New doc:", newDoc);
     *
     * @example
     * // 使用 upsert
     * const doc = await collection("config").findOneAndReplace(
     *     { key: "theme" },
     *     { key: "theme", value: "dark", updatedAt: new Date() },
     *     { upsert: true, returnDocument: "after" }
     * );
     */
    const findOneAndReplace = async function findOneAndReplace(filter, replacement, options = {}) {
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

        // 验证 replacement 不包含更新操作符
        const replacementKeys = Object.keys(replacement);
        if (replacementKeys.some(key => key.startsWith('$'))) {
            throw createError(
                ErrorCodes.INVALID_ARGUMENT,
                'replacement 不能包含更新操作符（如 $set, $inc 等）',
                [{ field: 'replacement', type: 'object.invalid', message: 'findOneAndReplace 用于完整替换文档，请使用 findOneAndUpdate 进行部分更新' }]
            );
        }

        // 2. 构建操作上下文
        const operation = 'findOneAndReplace';
        const ns = `${databaseName}.${collectionName}`;

        try {
            // 3. 执行查找并替换操作
            // MongoDB 驱动 6.x: 默认返回文档，需要 includeResultMetadata=true 获取完整元数据
            const driverOptions = { ...options, includeResultMetadata: true };
            const result = await nativeCollection.findOneAndReplace(filter, replacement, driverOptions);

            // 4. 自动失效缓存（如果有文档被修改）
            // 使用安全的修改判断函数
            const wasModified = wasDocumentModified(result);
            if (cache && wasModified) {
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
                        // 事务中：调用 Transaction 的 recordInvalidation 方法
                        const tx = getTransactionFromSession(options.session);
                        if (tx && typeof tx.recordInvalidation === 'function') {
                            // 🚀 传递 metadata 支持文档级别锁
                            await tx.recordInvalidation(pattern, {
                                operation: 'write',
                                query: filter,
                                collection: collectionName
                            });
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
                    found: result && result.value !== null,
                    upserted: result?.lastErrorObject?.upserted ? true : false,
                    returnDocument: options.returnDocument || 'before',
                    comment: options.comment
                });
            } else {
                logger.debug(`[${operation}] 操作完成`, {
                    ns,
                    duration,
                    found: result && result.value !== null,
                    upserted: result?.lastErrorObject?.upserted ? true : false,
                    returnDocument: options.returnDocument || 'before'
                });
            }

            // 6. 返回结果（使用统一的返回值处理函数）
            return handleFindOneAndResult(result, options, logger);

        } catch (error) {
            // 7. 错误处理
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
                throw createError(
                    ErrorCodes.DUPLICATE_KEY,
                    '查找并替换失败：违反唯一性约束',
                    [{ field: '_id', message: error.message }],
                    error
                );
            }

            // 其他错误
            throw createError(
                ErrorCodes.WRITE_ERROR,
                `findOneAndReplace 操作失败: ${error.message}`,
                null,
                error
            );
        }
    };

    return { findOneAndReplace };
}

module.exports = { createFindOneAndReplaceOps };

