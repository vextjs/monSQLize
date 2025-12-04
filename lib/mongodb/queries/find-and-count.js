/**
 * findAndCount 查询操作模块
 * @description 便利方法：同时返回数据和总数
 */

const { createError, ErrorCodes } = require('../../errors');

/**
 * 创建 findAndCount 操作
 * @param {Object} context - 上下文对象
 * @returns {Function} findAndCount 方法
 */
function createFindAndCountOps(context) {
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
     * 查询数据并返回总数（同时执行）
     * @param {Object} [query={}] - 查询条件
     * @param {Object} [options={}] - 查询选项
     * @param {Object} [options.projection] - 字段投影
     * @param {Object} [options.sort] - 排序方式
     * @param {number} [options.limit] - 限制返回数量
     * @param {number} [options.skip] - 跳过数量
     * @param {number} [options.cache] - 缓存时间（毫秒）
     * @param {number} [options.maxTimeMS] - 查询超时（毫秒）
     * @param {string} [options.comment] - 查询注释
     * @returns {Promise<Object>} { data, total }
     *
     * @example
     * // 基础用法
     * const { data, total } = await collection('users').findAndCount(
     *   { status: 'active' },
     *   { limit: 10, skip: 0 }
     * );
     *
     * @example
     * // 分页查询
     * const page = 1;
     * const pageSize = 20;
     * const { data, total } = await collection('users').findAndCount(
     *   { role: 'user' },
     *   { limit: pageSize, skip: (page - 1) * pageSize }
     * );
     * const totalPages = Math.ceil(total / pageSize);
     */
    const findAndCount = async function findAndCount(query = {}, options = {}) {
        const startTime = Date.now();

        // 1. 参数验证和归一化
        if (query !== null && typeof query !== 'object' || Array.isArray(query)) {
            throw createError(
                ErrorCodes.INVALID_ARGUMENT,
                'query 必须是对象',
                [{ field: 'query', type: 'type', message: 'query 必须是对象', received: typeof query }]
            );
        }

        // 将 null 转为空对象
        if (query === null) {
            query = {};
        }

        // 2. 提取选项
        const projection = options.projection;
        const sort = options.sort;
        const limit = options.limit; // 不使用默认值，未指定时查询所有
        const skip = options.skip || 0;
        const cacheTime = options.cache !== undefined ? options.cache : defaults.cache;
        const maxTimeMS = options.maxTimeMS !== undefined ? options.maxTimeMS : defaults.maxTimeMS;
        const comment = options.comment;

        // 3. 缓存键（包含 query, projection, sort, limit, skip）
        const cacheKey = cache ? `${instanceId}:${type}:${effectiveDbName}:${collection.collectionName}:findAndCount:${JSON.stringify({ query, projection, sort, limit, skip })}` : null;

        // 4. 检查缓存
        if (cache && cacheTime > 0) {
            try {
                const cached = await cache.get(cacheKey);
                // 必须检查 !== null 和 !== undefined，因为 undefined 也会被缓存
                if (cached !== null && cached !== undefined) {
                    logger?.debug?.('[findAndCount] 缓存命中', {
                        ns: `${effectiveDbName}.${collection.collectionName}`,
                        query
                    });
                    return cached;
                }
            } catch (cacheError) {
                logger?.warn?.('[findAndCount] 缓存读取失败', { error: cacheError.message });
            }
        }

        // 5. 构建查询选项
        const findOptions = { maxTimeMS };
        if (projection) findOptions.projection = projection;
        if (sort) findOptions.sort = sort;
        // limit: undefined/null 表示不限制，0 表示返回0条，其他数字表示限制数量
        if (limit !== undefined && limit !== null) {
            findOptions.limit = limit;
        }
        if (skip) findOptions.skip = skip;
        if (comment) findOptions.comment = comment;

        const countOptions = { maxTimeMS };
        if (comment) countOptions.comment = comment;

        // 6. 并行执行查询和计数
        let data, total;
        try {
            [data, total] = await Promise.all([
                collection.find(query, findOptions).toArray(),
                collection.countDocuments(query, countOptions)
            ]);
        } catch (error) {
            throw error;
        }

        // 7. 构建结果
        const result = { data, total };

        // 8. 写入缓存
        if (cache && cacheTime > 0) {
            try {
                await cache.set(cacheKey, result, cacheTime);
            } catch (cacheError) {
                logger?.warn?.('[findAndCount] 缓存写入失败', { error: cacheError.message });
            }
        }

        // 9. 慢查询日志
        const duration = Date.now() - startTime;
        const slowQueryMs = defaults?.slowQueryMs || 1000;

        if (duration >= slowQueryMs) {
            try {
                const meta = {
                    operation: 'findAndCount',
                    durationMs: duration,
                    iid: instanceId,
                    type,
                    db: effectiveDbName,
                    collection: collection.collectionName,
                    dataCount: data.length,
                    total,
                    query: mongoSlowLogShaper?.sanitize ? mongoSlowLogShaper.sanitize(query) : query,
                    projection,
                    sort,
                    limit,
                    skip,
                    comment
                };
                logger?.warn?.('🐌 Slow query: findAndCount', meta);
                emit?.('slow-query', meta);
            } catch (_) {
                // 忽略日志错误
            }
        }

        // 10. 日志记录
        logger?.debug?.('[findAndCount] 查询完成', {
            ns: `${effectiveDbName}.${collection.collectionName}`,
            duration,
            dataCount: data.length,
            total
        });

        return result;
    };

    return { findAndCount };
}

module.exports = { createFindAndCountOps };

