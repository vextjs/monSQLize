/**
 * count 查询模块
 * @description 提供文档计数功能，使用 MongoDB 原生推荐的 countDocuments() 和 estimatedDocumentCount() 方法
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
         * 统计文档数量
         * @description 根据查询条件统计匹配的文档数量。空查询时使用 estimatedDocumentCount（基于元数据，快速），有查询条件时使用 countDocuments（精确统计）
         * @param {Object} [query={}] - 查询条件，使用 MongoDB 查询语法，空对象表示统计所有文档
         * @param {Object} [options={}] - 查询选项配置对象
         * @param {number} [options.cache=0] - 缓存时间（毫秒），0表示不缓存，>0时结果将被缓存指定时间
         * @param {number} [options.maxTimeMS] - 查询超时时间（毫秒），防止长时间查询阻塞
         * @param {boolean|string} [options.explain] - 是否返回查询执行计划，可选值：true/'queryPlanner'/'executionStats'/'allPlansExecution'
         * @param {string} [options.hint] - 索引提示，指定使用的索引名称或索引规范（仅 countDocuments）
         * @param {Object} [options.collation] - 排序规则配置（仅 countDocuments）
         * @param {number} [options.skip] - 跳过的文档数量（仅 countDocuments）
         * @param {number} [options.limit] - 限制统计的文档数量（仅 countDocuments）
         * @param {string} [options.comment] - 查询注释，用于日志和性能分析
         * @returns {Promise<number>} 匹配的文档数量；当 explain=true 时返回执行计划对象
         */
        count: async (query = {}, options = {}) => {
            const { maxTimeMS = defaults.maxTimeMS, explain, comment } = options;

            // 如果启用 explain，直接返回查询执行计划（不缓存）
            if (explain) {
                const verbosity = typeof explain === "string" ? explain : "queryPlanner";
                const isEmptyQuery = !query || Object.keys(query).length === 0;

                if (isEmptyQuery) {
                    // estimatedDocumentCount 没有 explain，返回集合统计信息
                    return {
                        queryPlanner: { plannerVersion: 1, namespace: `${effectiveDbName}.${collection.collectionName}` },
                        executionStats: { executionSuccess: true, estimatedCount: true },
                        command: { estimatedDocumentCount: collection.collectionName }
                    };
                } else {
                    // countDocuments 通过聚合管道实现，使用 aggregate 获取 explain
                    const pipeline = [{ $match: query }, { $count: "total" }];
                    const aggOpts = {
                        maxTimeMS,
                        ...(options.hint && { hint: options.hint }),
                        ...(options.collation && { collation: options.collation })
                    };
                    if (comment) aggOpts.comment = comment;
                    return await collection.aggregate(pipeline, aggOpts).explain(verbosity);
                }
            }

            // 性能优化：判断是否为空查询
            const isEmptyQuery = !query || Object.keys(query).length === 0;

            return run(
                "count",
                { query, ...options },
                () => {
                    if (isEmptyQuery) {
                        // 空查询使用 estimatedDocumentCount（快速，基于集合元数据）
                        const estOpts = { maxTimeMS };
                        if (comment) estOpts.comment = comment;
                        return collection.estimatedDocumentCount(estOpts);
                    } else {
                        // 有查询条件使用 countDocuments（精确统计）
                        const countOpts = {
                            maxTimeMS,
                            ...(options.hint && { hint: options.hint }),
                            ...(options.collation && { collation: options.collation }),
                            ...(options.skip && { skip: options.skip }),
                            ...(options.limit && { limit: options.limit })
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
