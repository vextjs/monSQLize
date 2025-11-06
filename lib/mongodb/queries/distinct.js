/**
 * distinct 查询模块
 * @description 提供字段去重查询功能
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
         * @description 对指定字段进行去重查询，返回该字段的所有唯一值数组
         * @param {string} field - 要去重的字段名，支持嵌套字段（如 'user.name'）
         * @param {Object} [options={}] - 查询选项配置对象
         * @param {Object} [options.query={}] - 过滤条件，只对匹配的文档进行去重
         * @param {number} [options.cache] - 缓存时间（毫秒），默认继承实例缓存配置
         * @param {number} [options.maxTimeMS] - 查询超时时间（毫秒）
         * @param {Object} [options.collation] - 排序规则（可选）
         * @param {boolean|Object} [options.meta] - 是否返回耗时元信息
         * @param {boolean|string} [options.explain] - 是否返回查询执行计划，可选值：true/'queryPlanner'/'executionStats'/'allPlansExecution'
         * @returns {Promise<Array>} 返回去重后的值数组；当 explain=true 时返回执行计划
         */
        distinct: async (field, options = {}) => {
            const {
                query = {},
                maxTimeMS = defaults.maxTimeMS,
                collation,
                explain
            } = options;

            const driverOpts = { maxTimeMS };
            if (collation) driverOpts.collation = collation;
            // 注意：MongoDB distinct 命令不支持 hint 参数

            // 如果启用 explain，通过 aggregate 模拟 distinct 并返回执行计划
            if (explain) {
                const verbosity = typeof explain === 'string' ? explain : 'queryPlanner';
                // distinct 命令通过聚合管道模拟：$match + $group
                const pipeline = [];
                if (query && Object.keys(query).length > 0) {
                    pipeline.push({ $match: query });
                }
                pipeline.push({ $group: { _id: `$${field}` } });
                return await collection.aggregate(pipeline, {
                    maxTimeMS,
                    ...(collation ? { collation } : {})
                }).explain(verbosity);
            }

            return run(
                'distinct',
                options,
                () => collection.distinct(field, query, driverOpts)
            );
        }
    };
}

module.exports = createDistinctOps;
