/**
 * updateOrInsert 扩展方法模块
 * @description 更新或插入文档（支持深度合并）
 */

const { ObjectId } = require('mongodb');
const { createError, ErrorCodes } = require('../../errors');

/**
 * 创建 updateOrInsert 操作
 * @param {Object} context - 上下文对象
 * @returns {Function} updateOrInsert 方法
 */
function createUpdateOrInsertOps(context) {
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
     * 更新或插入文档（支持深度合并）
     * @param {Object} query - 查询条件
     * @param {Object} update - 更新的数据
     * @param {Object} [options={}] - 选项
     * @param {string} [options.mergeStrategy='replace'] - 合并策略（'replace'|'shallow'|'deep'）
     * @param {Object} [options.projection] - 字段投影
     * @param {number} [options.maxTimeMS] - 查询超时时间
     * @param {string} [options.comment] - 查询注释
     * @param {Object} [options.session] - MongoDB 会话（事务支持）
     * @returns {Promise<Object>} 结果对象
     * @returns {Object} result.doc - 文档对象
     * @returns {boolean} result.upserted - 是否新插入（true: 新插入, false: 已更新）
     * @returns {boolean} result.modified - 是否有修改
     *
     * @example
     * // 用户配置管理（深度合并）
     * const result = await UserConfig.updateOrInsert(
     *   { userId: 123 },
     *   {
     *     config: {
     *       theme: 'dark'  // 只更新主题，保留其他配置
     *     }
     *   },
     *   { mergeStrategy: 'deep' }
     * );
     *
     * @example
     * // 系统配置（深度合并）
     * const result = await SystemConfig.updateOrInsert(
     *   { key: 'system' },
     *   {
     *     settings: {
     *       features: { ai: true }  // 只启用 AI 功能
     *     }
     *   },
     *   { mergeStrategy: 'deep' }
     * );
     */
    const updateOrInsert = async function updateOrInsert(query, update, options = {}) {
        const startTime = Date.now();

        // 1. 参数验证
        if (!query || typeof query !== 'object' || Array.isArray(query)) {
            throw createError(
                ErrorCodes.INVALID_ARGUMENT,
                'query 必须是对象',
                [{ field: 'query', type: 'type', message: 'query 必须是对象', received: typeof query }]
            );
        }

        if (!update || typeof update !== 'object' || Array.isArray(update)) {
            throw createError(
                ErrorCodes.INVALID_ARGUMENT,
                'update 必须是对象',
                [{ field: 'update', type: 'type', message: 'update 必须是对象', received: typeof update }]
            );
        }

        // 2. 提取选项
        const mergeStrategy = options.mergeStrategy || 'replace';
        const projection = options.projection;
        const maxTimeMS = options.maxTimeMS !== undefined ? options.maxTimeMS : defaults.maxTimeMS;
        const comment = options.comment;
        const session = options.session;

        // 3. 验证合并策略
        if (!['replace', 'shallow', 'deep'].includes(mergeStrategy)) {
            throw createError(
                ErrorCodes.INVALID_ARGUMENT,
                'mergeStrategy 必须是 replace、shallow 或 deep',
                [{ field: 'mergeStrategy', type: 'invalid', message: '无效的合并策略', received: mergeStrategy }]
            );
        }

        // 4. 查询现有文档
        let existing;
        try {
            existing = await collection.findOne(query, {
                maxTimeMS,
                session
            });
        } catch (error) {
            logger?.error?.('[updateOrInsert] findOne 失败', {
                ns: `${effectiveDbName}.${collection.collectionName}`,
                error: error.message
            });
            throw error;
        }

        let result;
        let upserted = false;
        let modified = false;

        if (existing) {
            // 5. 文档存在，执行更新
            let merged;

            if (mergeStrategy === 'replace') {
                // 完全替换（保留 _id）
                merged = { ...update, _id: existing._id };
            } else if (mergeStrategy === 'shallow') {
                // 浅合并（只合并第一层）
                merged = { ...existing, ...update };
            } else if (mergeStrategy === 'deep') {
                // 深度合并（递归合并所有层级）
                merged = deepMerge(existing, update);
            }

            try {
                const updateResult = await collection.replaceOne(
                    { _id: existing._id },
                    merged,
                    {
                        maxTimeMS,
                        comment,
                        session
                    }
                );

                modified = updateResult.modifiedCount > 0;

                // 应用 projection（如果有）
                let finalDoc = merged;
                if (projection) {
                    finalDoc = applyProjection(merged, projection);
                }

                result = {
                    doc: finalDoc,
                    upserted: false,
                    modified
                };

                logger?.debug?.('[updateOrInsert] 更新完成', {
                    ns: `${effectiveDbName}.${collection.collectionName}`,
                    query: mongoSlowLogShaper?.sanitize ? mongoSlowLogShaper.sanitize(query) : query,
                    modified
                });

            } catch (error) {
                logger?.error?.('[updateOrInsert] 更新失败', {
                    ns: `${effectiveDbName}.${collection.collectionName}`,
                    error: error.message
                });
                throw error;
            }

        } else {
            // 6. 文档不存在，执行插入
            const docToInsert = { ...query, ...update };

            try {
                const insertResult = await collection.insertOne(docToInsert, {
                    maxTimeMS,
                    comment,
                    session
                });

                upserted = true;

                // 应用 projection（如果有）
                let finalDoc = { _id: insertResult.insertedId, ...docToInsert };
                if (projection) {
                    finalDoc = applyProjection(finalDoc, projection);
                }

                result = {
                    doc: finalDoc,
                    upserted: true,
                    modified: false
                };

                logger?.debug?.('[updateOrInsert] 插入完成', {
                    ns: `${effectiveDbName}.${collection.collectionName}`,
                    query: mongoSlowLogShaper?.sanitize ? mongoSlowLogShaper.sanitize(query) : query,
                    upserted: true
                });

            } catch (error) {
                logger?.error?.('[updateOrInsert] 插入失败', {
                    ns: `${effectiveDbName}.${collection.collectionName}`,
                    error: error.message
                });
                throw error;
            }
        }

        const duration = Date.now() - startTime;

        // 7. 慢查询日志
        const slowQueryMs = defaults?.slowQueryMs || 1000;
        if (duration >= slowQueryMs) {
            try {
                const meta = {
                    operation: 'updateOrInsert',
                    durationMs: duration,
                    iid: instanceId,
                    type,
                    db: effectiveDbName,
                    collection: collection.collectionName,
                    query: mongoSlowLogShaper?.sanitize ? mongoSlowLogShaper.sanitize(query) : query,
                    mergeStrategy,
                    upserted,
                    modified,
                    comment
                };
                logger?.warn?.('🐌 Slow query: updateOrInsert', meta);
                emit?.('slow-query', meta);
            } catch (_) {
                // 忽略日志错误
            }
        }

        return result;
    };

    /**
     * 深度合并两个对象
     * @param {Object} target - 目标对象
     * @param {Object} source - 源对象
     * @returns {Object} 合并后的对象
     */
    function deepMerge(target, source) {
        const output = { ...target };

        for (const key in source) {
            if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key]) && !(source[key] instanceof Date) && !(source[key] instanceof ObjectId)) {
                // 递归合并对象（排除数组、Date、ObjectId）
                output[key] = deepMerge(target[key] || {}, source[key]);
            } else {
                // 直接替换（包括数组、基本类型、Date、ObjectId）
                output[key] = source[key];
            }
        }

        return output;
    }

    /**
     * 应用字段投影
     * @param {Object} doc - 文档对象
     * @param {Object} projection - 投影配置
     * @returns {Object} 应用投影后的文档
     */
    function applyProjection(doc, projection) {
        const projected = {};

        // _id 默认包含（除非显式排除）
        if (projection._id !== 0 && projection._id !== false) {
            projected._id = doc._id;
        }

        for (const key in projection) {
            if (key !== '_id' && (projection[key] === 1 || projection[key] === true)) {
                projected[key] = doc[key];
            }
        }

        return projected;
    }

    return { updateOrInsert };
}

module.exports = { createUpdateOrInsertOps };

