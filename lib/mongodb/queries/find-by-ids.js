/**
 * findByIds 查询操作模块
 * @description 便利方法：批量通过 _id 数组查询多个文档
 */

const { ObjectId } = require('mongodb');
const { createError, ErrorCodes } = require('../../errors');

/**
 * 创建 findByIds 操作
 * @param {Object} context - 上下文对象
 * @returns {Function} findByIds 方法
 */
function createFindByIdsOps(context) {
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
     * 批量通过 _id 查询多个文档
     * @param {Array<string|ObjectId>} ids - _id 数组（支持字符串和 ObjectId）
     * @param {Object} [options={}] - 查询选项
     * @param {Object} [options.projection] - 字段投影
     * @param {Object} [options.sort] - 排序方式
     * @param {number} [options.cache] - 缓存时间（毫秒）
     * @param {number} [options.maxTimeMS] - 查询超时（毫秒）
     * @param {string} [options.comment] - 查询注释
     * @param {boolean} [options.preserveOrder=false] - 是否保持 ids 数组的顺序
     * @returns {Promise<Array>} 文档数组
     *
     * @example
     * // 基础用法
     * const users = await collection('users').findByIds([
     *   '507f1f77bcf86cd799439011',
     *   '507f1f77bcf86cd799439012'
     * ]);
     *
     * @example
     * // 带选项
     * const users = await collection('users').findByIds(
     *   ['507f1f77bcf86cd799439011', '507f1f77bcf86cd799439012'],
     *   {
     *     projection: { name: 1, email: 1 },
     *     preserveOrder: true
     *   }
     * );
     */
    const findByIds = async function findByIds(ids, options = {}) {
        const startTime = Date.now();

        // 1. 参数验证
        if (!Array.isArray(ids)) {
            throw createError(
                ErrorCodes.INVALID_ARGUMENT,
                'ids 必须是数组',
                [{ field: 'ids', type: 'type', message: 'ids 必须是数组', received: typeof ids }]
            );
        }

        if (ids.length === 0) {
            // 空数组直接返回空结果
            return [];
        }

        // 2. 转换所有 ID 为 ObjectId
        const objectIds = [];
        const invalidIds = [];

        for (let i = 0; i < ids.length; i++) {
            const id = ids[i];

            if (id instanceof ObjectId) {
                objectIds.push(id);
            } else if (typeof id === 'string') {
                if (!ObjectId.isValid(id)) {
                    invalidIds.push({ index: i, value: id });
                } else {
                    objectIds.push(new ObjectId(id));
                }
            } else {
                invalidIds.push({ index: i, value: id, type: typeof id });
            }
        }

        // 如果有无效 ID，抛出错误
        if (invalidIds.length > 0) {
            throw createError(
                ErrorCodes.INVALID_ARGUMENT,
                `ids 数组包含 ${invalidIds.length} 个无效 ID`,
                invalidIds.map(item => ({
                    field: `ids[${item.index}]`,
                    type: 'format',
                    message: '无效的 ObjectId 格式',
                    received: item.value
                }))
            );
        }

        // 3. 去重（避免重复查询）
        const uniqueIds = [...new Set(objectIds.map(id => id.toString()))].map(id => new ObjectId(id));

        // 4. 提取选项
        const projection = options.projection;
        const sort = options.sort;
        const cacheTime = options.cache !== undefined ? options.cache : defaults.cache;
        const maxTimeMS = options.maxTimeMS !== undefined ? options.maxTimeMS : defaults.maxTimeMS;
        const comment = options.comment;
        const preserveOrder = options.preserveOrder === true;

        // 5. 构建查询
        const query = { _id: { $in: uniqueIds } };

        // 6. 缓存键
        const cacheKey = cache ? `${instanceId}:${type}:${effectiveDbName}:${collection.collectionName}:findByIds:${JSON.stringify({ ids: uniqueIds.map(id => id.toString()), projection, sort })}` : null;

        // 7. 检查缓存
        if (cache && cacheTime > 0) {
            try {
                const cached = await cache.get(cacheKey);
                if (cached !== null) {
                    logger?.debug?.('[findByIds] 缓存命中', {
                        ns: `${effectiveDbName}.${collection.collectionName}`,
                        idsCount: ids.length,
                        uniqueCount: uniqueIds.length
                    });

                    // 如果需要保持顺序，重新排序结果
                    if (preserveOrder) {
                        return reorderResults(cached, objectIds);
                    }
                    return cached;
                }
            } catch (cacheError) {
                logger?.warn?.('[findByIds] 缓存读取失败', { error: cacheError.message });
            }
        }

        // 8. 构建查询选项
        const findOptions = { maxTimeMS };
        if (projection) findOptions.projection = projection;
        if (sort) findOptions.sort = sort;
        if (comment) findOptions.comment = comment;

        // 9. 执行查询
        let results;
        try {
            results = await collection.find(query, findOptions).toArray();
        } catch (error) {
            throw error;
        }

        // 10. 写入缓存
        if (cache && cacheTime > 0 && results) {
            try {
                await cache.set(cacheKey, results, cacheTime);
            } catch (cacheError) {
                logger?.warn?.('[findByIds] 缓存写入失败', { error: cacheError.message });
            }
        }

        // 11. 慢查询日志
        const duration = Date.now() - startTime;
        const slowQueryMs = defaults?.slowQueryMs || 1000;

        if (duration >= slowQueryMs) {
            try {
                const meta = {
                    operation: 'findByIds',
                    durationMs: duration,
                    iid: instanceId,
                    type: type,
                    db: effectiveDbName,
                    collection: collection.collectionName,
                    idsCount: ids.length,
                    uniqueCount: uniqueIds.length,
                    resultCount: results.length,
                    query: mongoSlowLogShaper?.sanitize ? mongoSlowLogShaper.sanitize(query) : query,
                    projection: projection,
                    sort: sort,
                    comment: comment
                };
                logger?.warn?.('🐌 Slow query: findByIds', meta);
                emit?.('slow-query', meta);
            } catch (_) {
                // 忽略日志错误
            }
        }

        // 12. 日志记录
        logger?.debug?.('[findByIds] 查询完成', {
            ns: `${effectiveDbName}.${collection.collectionName}`,
            duration: duration,
            idsCount: ids.length,
            uniqueCount: uniqueIds.length,
            resultCount: results.length
        });

        // 13. 如果需要保持顺序，重新排序结果
        if (preserveOrder) {
            return reorderResults(results, objectIds);
        }

        return results;
    };

    /**
     * 根据原始 ID 顺序重新排序结果
     * @param {Array} results - 查询结果
     * @param {Array<ObjectId>} orderedIds - 原始 ID 顺序
     * @returns {Array} 排序后的结果
     */
    function reorderResults(results, orderedIds) {
        const resultMap = new Map();
        results.forEach(doc => {
            resultMap.set(doc._id.toString(), doc);
        });

        return orderedIds.map(id => resultMap.get(id.toString())).filter(doc => doc !== undefined);
    }

    return { findByIds };
}

module.exports = { createFindByIdsOps };

