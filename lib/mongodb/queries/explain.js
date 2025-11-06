/**
 * explain 查询分析模块
 * @description 提供查询执行计划分析功能，用于性能诊断
 */

/**
 * 创建 explain 查询操作
 * @param {Object} context - 上下文对象
 * @returns {Object} 包含 explain 方法的对象
 */
function createExplainOps(context) {
    const { collection, defaults, logger, effectiveDbName } = context;

    return {
        /**
         * 查询执行计划诊断（explain）
         * 
         * 用途：分析查询性能，诊断慢查询问题
         * 
         * @param {Object} options - 查询选项
         * @param {Object} [options.query={}] - 查询条件
         * @param {Object} [options.projection] - 字段投影
         * @param {Object} [options.sort] - 排序规则
         * @param {number} [options.limit] - 返回数量限制
         * @param {number} [options.skip] - 跳过数量
         * @param {number} [options.maxTimeMS] - 最大执行时间（毫秒）
         * @param {Object} [options.hint] - 强制使用的索引
         * @param {Object} [options.collation] - 排序规则（如不区分大小写）
         * @param {string} [options.verbosity='queryPlanner'] - 详细程度：'queryPlanner'/'executionStats'/'allPlansExecution'
         * 
         * @returns {Promise<Object>} 执行计划对象
         * 
         * @example
         * // 基础查询计划
         * const plan = await collection('users').explain({
         *     query: { status: 'active' },
         *     sort: { createdAt: -1 }
         * });
         * 
         * // 包含执行统计
         * const stats = await collection('users').explain({
         *     query: { age: { $gt: 18 } },
         *     verbosity: 'executionStats'
         * });
         * 
         * // 分析所有候选执行计划
         * const allPlans = await collection('users').explain({
         *     query: { email: 'user@example.com' },
         *     verbosity: 'allPlansExecution'
         * });
         */
        explain: async (options = {}) => {
            const {
                query = {},
                projection,
                sort,
                limit,
                skip,
                maxTimeMS = defaults.maxTimeMS,
                hint,
                collation,
                verbosity = 'queryPlanner' // 默认只返回查询计划
            } = options;

            // 验证 verbosity 参数
            const validVerbosity = ['queryPlanner', 'executionStats', 'allPlansExecution'];
            if (!validVerbosity.includes(verbosity)) {
                const err = new Error(`Invalid verbosity: ${verbosity}. Must be one of: ${validVerbosity.join(', ')}`);
                err.code = 'INVALID_EXPLAIN_VERBOSITY';
                throw err;
            }

            // 构建查询选项
            const findOptions = {};
            if (projection) findOptions.projection = projection;
            if (sort) findOptions.sort = sort;
            if (limit !== undefined) findOptions.limit = limit;
            if (skip !== undefined) findOptions.skip = skip;
            if (maxTimeMS) findOptions.maxTimeMS = maxTimeMS;
            if (hint) findOptions.hint = hint;
            if (collation) findOptions.collation = collation;

            // explain 诊断专用，禁用缓存
            const startTime = Date.now();
            try {
                // 使用 MongoDB 原生 explain 方法
                const explainResult = await collection.find(query, findOptions).explain(verbosity);

                const duration = Date.now() - startTime;

                // 记录慢查询日志（如果启用）
                if (duration > (defaults.log?.slowQueryMs || 500)) {
                    const safeQuery = logger?.getSafeShape ? logger.getSafeShape(query) : query;
                    logger?.warn?.(
                        'slow explain query',
                        {
                            ...defaults.log?.slowQueryTag,
                            collection: collection.collectionName,
                            database: effectiveDbName,
                            query: safeQuery,
                            verbosity,
                            duration,
                        }
                    );
                }

                return explainResult;
            } catch (error) {
                const safeQuery = logger?.getSafeShape ? logger.getSafeShape(query) : query;
                logger?.error?.(
                    'explain query failed',
                    {
                        collection: collection.collectionName,
                        database: effectiveDbName,
                        query: safeQuery,
                        verbosity,
                    },
                    error
                );
                throw error;
            }
        }
    };
}

module.exports = createExplainOps;
