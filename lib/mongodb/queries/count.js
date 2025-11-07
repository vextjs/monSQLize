/**
 * count 查询模块
 * @description 提供文档计数功能，支持查询条件和缓存
 */

/**
 * 创建 count 查询操作
 * @param {Object} context - 上下文对象
 * @returns {Object} 包含 count 方法的对象
 */
function createCountOps(context) {
    const { collection, defaults, run, effectiveDbName } = context;

    return {
        /**
         * 统计条数
         * @param {Object} [options={}] - { query, cache, maxTimeMS, explain }
         * @param {boolean|string} [options.explain] - 是否返回查询执行计划，可选值：true/'queryPlanner'/'executionStats'/'allPlansExecution'
         * @returns {Promise<number>} 匹配文档数；当 explain=true 时返回执行计划
         */
        count: async (options = {}) => {
            const { query = {}, maxTimeMS = defaults.maxTimeMS, explain, comment } = options;

            // 如果启用 explain，直接返回查询执行计划（不缓存）
            if (explain) {
                const verbosity = typeof explain === 'string' ? explain : 'queryPlanner';
                // countDocuments 使用聚合管道实现，可以通过 aggregate 获取 explain
                const isEmptyQuery = !query || Object.keys(query).length === 0;
                if (isEmptyQuery) {
                    // estimatedDocumentCount 没有 explain，返回集合统计信息
                    return {
                        queryPlanner: { plannerVersion: 1, namespace: `${effectiveDbName}.${collection.collectionName}` },
                        executionStats: { executionSuccess: true, estimatedCount: true },
                        command: { estimatedDocumentCount: collection.collectionName }
                    };
                } else {
                    // countDocuments 通过聚合管道实现
                    const pipeline = [{ $match: query }, { $count: 'total' }];
                    const aggOpts = {
                        maxTimeMS,
                        ...(options.hint ? { hint: options.hint } : {}),
                        ...(options.collation ? { collation: options.collation } : {})
                    };
                    if (comment) aggOpts.comment = comment;
                    return await collection.aggregate(pipeline, aggOpts).explain(verbosity);
                }
            }

            // 性能优化：当没有查询条件时，使用 estimatedDocumentCount（基于元数据，速度快）
            const isEmptyQuery = !query || Object.keys(query).length === 0;

            return run(
                'count',
                options,
                () => {
                    if (isEmptyQuery) {
                        // 空查询使用 estimatedDocumentCount（快速，基于集合元数据）
                        const estOpts = { maxTimeMS };
                        if (comment) estOpts.comment = comment;
                        return collection.estimatedDocumentCount(estOpts);
                    } else {
                        // 有查询条件使用 countDocuments（精确，但较慢）
                        const countOpts = {
                            maxTimeMS,
                            ...(options.hint ? { hint: options.hint } : {}),
                            ...(options.collation ? { collation: options.collation } : {})
                        };
                        if (comment) countOpts.comment = comment;
                        return collection.countDocuments(query, countOpts);
                    }
                }
            );
        }
    };
}

module.exports = createCountOps;
