/**
 * findOne 查询模块
 * @description 提供单条记录查询功能，支持投影、排序和缓存
 */

const { normalizeProjection, normalizeSort } = require('../../common/normalize');
const { convertObjectIdStrings } = require('../../utils/objectid-converter');

/**
 * 创建 findOne 查询操作
 * @param {Object} context - 上下文对象
 * @returns {Object} 包含 findOne 方法的对象
 */
function createFindOneOps(context) {
    const { collection, defaults, run } = context;

    return {
        /**
         * 查询单条记录
         * @description 根据指定条件查询集合中的第一条匹配记录，支持投影、排序和缓存功能
         * @param {Object} [query={}] - 查询条件，使用MongoDB查询语法，如 {name: 'John', age: {$gt: 18}}
         * @param {Object} [options={}] - 查询选项配置对象
         * @param {Object|Array} [options.projection] - 字段投影配置，指定返回的字段
         * @param {Object} [options.sort] - 排序配置，如 {createdAt: -1, name: 1}，-1降序，1升序
         * @param {number} [options.cache=0] - 缓存时间（毫秒），0表示不缓存，>0时结果将被缓存指定时间
         * @param {number} [options.maxTimeMS] - 查询超时时间（毫秒），防止长时间查询阻塞
         * @param {boolean|string} [options.explain] - 是否返回查询执行计划，可选值：true/'queryPlanner'/'executionStats'/'allPlansExecution'
         * @param {string} [options.hint] - 索引提示
         * @param {Object} [options.collation] - 排序规则
         * @param {string} [options.comment] - 查询注释
         * @returns {Promise<Object|null>} 返回匹配的第一条记录对象，未找到时返回null；当 explain=true 时返回执行计划
         */
        findOne: async (query = {}, options = {}) => {
            // ✅ v1.3.0: 自动转换 ObjectId 字符串
            const convertedQuery = convertObjectIdStrings(query, 'query', 0, new WeakSet(), {
                logger: context.logger,
                excludeFields: context.autoConvertConfig?.excludeFields,
                customFieldPatterns: context.autoConvertConfig?.customFieldPatterns,
                maxDepth: context.autoConvertConfig?.maxDepth
            });

            options.projection = normalizeProjection(options.projection);
            const {
                projection,
                maxTimeMS = defaults.maxTimeMS,
                explain,
                comment
            } = options;
            const sort = normalizeSort(options.sort);

            const driverOpts = { projection, sort, maxTimeMS, ...(options.hint ? { hint: options.hint } : {}), ...(options.collation ? { collation: options.collation } : {}) };
            if (comment) driverOpts.comment = comment;

            // 如果启用 explain，直接返回执行计划（不缓存）
            if (explain) {
                const verbosity = typeof explain === 'string' ? explain : 'queryPlanner';
                const cursor = collection.find(convertedQuery, driverOpts).limit(1);
                return await cursor.explain(verbosity);
            }

            return run(
                'findOne',
                { query: convertedQuery, ...options },
                () => collection.findOne(convertedQuery, driverOpts)
            );
        }
    };
}

module.exports = createFindOneOps;

