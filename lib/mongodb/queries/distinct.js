/**
 * distinct 查询模块
 * @description 提供字段去重查询功能，使用 MongoDB 原生 distinct() 方法
 */

/**
 * 创建 distinct 查询操作
 * @param {Object} context - 上下文对象
 * @returns {Object} 包含 distinct 方法的对象
 */
function createDistinctOps(context) {
    const { collection, defaults, run } = context;

    return {
        /**
         * 字段去重查询
         * @description 对指定字段进行去重查询，返回该字段的所有唯一值数组。支持嵌套字段和数组字段（自动展开去重）
         * @param {string} field - 要去重的字段名，支持嵌套字段（如 'user.name'、'address.city'）
         * @param {Object} [query={}] - 查询条件，只对匹配的文档进行去重，使用 MongoDB 查询语法
         * @param {Object} [options={}] - 查询选项配置对象
         * @param {number} [options.maxTimeMS] - 查询超时时间（毫秒），防止长时间查询阻塞
         * @param {Object} [options.collation] - 排序规则配置，用于字符串比较和去重（如不区分大小写）
         * @param {string} [options.comment] - 查询注释，用于日志和性能分析
         * @param {number} [options.cache=0] - 缓存时间（毫秒），0表示不缓存，>0时结果将被缓存指定时间
         * @param {boolean|string} [options.explain] - 是否返回查询执行计划，可选值：true/'queryPlanner'/'executionStats'/'allPlansExecution'
         * @returns {Promise<Array>} 返回去重后的值数组；当 explain=true 时返回执行计划对象
         */
        distinct: async (field, query = {}, options = {}) => {
            const {
                maxTimeMS = defaults.maxTimeMS,
                collation,
                comment,
                explain
            } = options;

            // 构建驱动选项
            const driverOpts = { maxTimeMS };
            if (collation) driverOpts.collation = collation;
            if (comment) driverOpts.comment = comment;

            // 如果启用 explain，通过 aggregate 模拟 distinct 并返回执行计划
            // 注意：MongoDB 原生 distinct 命令不支持 explain，需要通过聚合管道模拟
            if (explain) {
                const verbosity = typeof explain === "string" ? explain : "queryPlanner";
                // distinct 命令通过聚合管道模拟：$match + $group
                const pipeline = [];
                if (query && Object.keys(query).length > 0) {
                    pipeline.push({ $match: query });
                }
                pipeline.push({ $group: { _id: `$${field}` } });

                const aggOpts = { maxTimeMS };
                if (collation) aggOpts.collation = collation;
                if (comment) aggOpts.comment = comment;

                return await collection.aggregate(pipeline, aggOpts).explain(verbosity);
            }

            return run(
                "distinct",
                { field, query, ...options },
                () => collection.distinct(field, query, driverOpts)
            );
        }
    };
}

module.exports = createDistinctOps;
