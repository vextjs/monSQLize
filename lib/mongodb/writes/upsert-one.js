/**
 * upsertOne 写操作模块
 * @description 便利方法：存在则更新，不存在则插入
 */

const { createError, ErrorCodes } = require('../../errors');
const { isInTransaction, getTransactionFromSession } = require('../common/transaction-aware');
const { convertObjectIdStrings } = require('../../utils/objectid-converter');

/**
 * 创建 upsertOne 操作
 * @param {Object} context - 上下文对象
 * @returns {Function} upsertOne 方法
 */
function createUpsertOneOps(context) {
    const {
        collection,
        defaults,
        instanceId,
        effectiveDbName,
        logger,
        emit,
        mongoSlowLogShaper,
        cache,
        type
    } = context;

    /**
     * upsert 单个文档（存在则更新，不存在则插入）
     * @param {Object} filter - 查询条件
     * @param {Object} update - 更新内容（直接设置字段，自动包装为 $set）
     * @param {Object} [options={}] - 操作选项
     * @param {number} [options.maxTimeMS] - 操作超时（毫秒）
     * @param {string} [options.comment] - 查询注释
     * @returns {Promise<Object>} 操作结果
     *
     * @example
     * // 基础用法
     * const result = await collection('users').upsertOne(
     *   { userId: 'user123' },
     *   { name: 'Alice', email: 'alice@example.com' }
     * );
     *
     * @example
     * // 带选项
     * const result = await collection('config').upsertOne(
     *   { key: 'theme' },
     *   { value: 'dark', updatedAt: new Date() },
     *   { maxTimeMS: 5000, comment: 'sync-config' }
     * );
     */
    const upsertOne = async function upsertOne(filter, update, options = {}) {
        const startTime = Date.now();

        // 1. 参数验证
        if (!filter || typeof filter !== 'object' || Array.isArray(filter)) {
            throw createError(
                ErrorCodes.INVALID_ARGUMENT,
                'filter 必须是非空对象',
                [{ field: 'filter', type: 'type', message: 'filter 必须是对象', received: typeof filter }]
            );
        }

        if (!update || typeof update !== 'object' || Array.isArray(update)) {
            throw createError(
                ErrorCodes.INVALID_ARGUMENT,
                'update 必须是非空对象',
                [{ field: 'update', type: 'type', message: 'update 必须是对象', received: typeof update }]
            );
        }

        // ✅ v1.3.0: 自动转换 ObjectId 字符串
        const convertedFilter = convertObjectIdStrings(filter, 'filter', 0, new WeakSet(), {
            logger: context.logger,
            excludeFields: context.autoConvertConfig?.excludeFields,
            customFieldPatterns: context.autoConvertConfig?.customFieldPatterns,
            maxDepth: context.autoConvertConfig?.maxDepth
        });

        const convertedUpdate = convertObjectIdStrings(update, 'document', 0, new WeakSet(), {
            logger: context.logger,
            excludeFields: context.autoConvertConfig?.excludeFields,
            customFieldPatterns: context.autoConvertConfig?.customFieldPatterns,
            maxDepth: context.autoConvertConfig?.maxDepth
        });

        // 2. 检查 update 是否包含更新操作符
        const hasOperator = Object.keys(convertedUpdate).some(key => key.startsWith('$'));

        // 如果没有操作符，自动包装为 $set
        const updateDoc = hasOperator ? convertedUpdate : { $set: convertedUpdate };

        // 3. 构建选项
        const maxTimeMS = options.maxTimeMS !== undefined ? options.maxTimeMS : defaults.maxTimeMS;
        const comment = options.comment;

        const driverOpts = { upsert: true, maxTimeMS };
        if (comment) driverOpts.comment = comment;

        // 4. 执行 updateOne 操作
        let result;
        try {
            result = await collection.updateOne(convertedFilter, updateDoc, driverOpts);
        } catch (error) {
            // 统一错误处理
            if (error.code === 11000) {
                throw createError(
                    ErrorCodes.DUPLICATE_KEY,
                    '批量插入失败：违反唯一性约束',
                    [{ field: '_id', type: 'unique', message: error.message }],
                    error
                );
            }
            throw error;
        }

        // 5. 自动失效缓存
        const upsertedCount = result.matchedCount === 0 ? 1 : 0;

        if (cache && (result.modifiedCount > 0 || upsertedCount > 0)) {
            try {
                const namespace = `${instanceId}:${type}:${effectiveDbName}:${collection.collectionName}`;
                const pattern = `${namespace}:*`;

                // 检查是否在事务中
                if (isInTransaction(options)) {
                    // 事务中：调用 Transaction 的 recordInvalidation 方法
                    const tx = getTransactionFromSession(options.session);
                    if (tx && typeof tx.recordInvalidation === 'function') {
                        // 🚀 传递 metadata 支持文档级别锁
                        await tx.recordInvalidation(pattern, {
                            operation: 'write',
                            query: filter,
                            collection: collection.collectionName
                        });
                        logger?.debug?.(`[upsertOne] 事务中失效缓存: ${collection.collectionName}`);
                    } else {
                        const deleted = await cache.delPattern(pattern);
                        if (deleted > 0) {
                            logger?.debug?.(`[upsertOne] 自动失效缓存: ${collection.collectionName}, 删除 ${deleted} 个缓存键`);
                        }
                    }
                } else {
                    // 非事务：直接失效缓存
                    const deleted = await cache.delPattern(pattern);
                    if (deleted > 0) {
                        logger?.debug?.(`[upsertOne] 自动失效缓存: ${collection.collectionName}, 删除 ${deleted} 个缓存键`);
                    }
                }
            } catch (cacheError) {
                logger?.warn?.('[upsertOne] 缓存失效失败', { error: cacheError.message });
            }
        }

        // 6. 慢查询日志
        const duration = Date.now() - startTime;
        const slowQueryMs = defaults?.slowQueryMs || 1000;

        if (duration >= slowQueryMs) {
            try {
                const meta = {
                    operation: 'upsertOne',
                    durationMs: duration,
                    iid: instanceId,
                    type,
                    db: effectiveDbName,
                    collection: collection.collectionName,
                    matchedCount: result.matchedCount,
                    modifiedCount: result.modifiedCount,
                    upsertedId: result.upsertedId,
                    filter: mongoSlowLogShaper?.sanitize ? mongoSlowLogShaper.sanitize(filter) : filter,
                    update: mongoSlowLogShaper?.sanitize ? mongoSlowLogShaper.sanitize(updateDoc) : updateDoc,
                    comment
                };
                logger?.warn?.('🐌 Slow query: upsertOne', meta);
                emit?.('slow-query', meta);
            } catch (_) {
                // 忽略日志错误
            }
        }

        // 7. 日志记录
        logger?.debug?.('[upsertOne] 操作完成', {
            ns: `${effectiveDbName}.${collection.collectionName}`,
            duration,
            matchedCount: result.matchedCount,
            modifiedCount: result.modifiedCount,
            upsertedId: result.upsertedId === null ? undefined : result.upsertedId,
            upsertedCount
        });

        // 8. 返回结果
        return {
            acknowledged: result.acknowledged,
            matchedCount: result.matchedCount,
            modifiedCount: result.modifiedCount,
            upsertedId: result.upsertedId === null ? undefined : result.upsertedId,
            upsertedCount
        };
    };

    return { upsertOne };
}

module.exports = { createUpsertOneOps };

