/**
 * find 查询模块
 * @description 提供多条记录查询功能，支持投影、排序、分页、缓存和流式返回
 */

const { normalizeProjection, normalizeSort } = require('../../common/normalize');
const { FindChain } = require('./chain');
const { convertObjectIdStrings } = require('../../utils/objectid-converter');

/**
 * 创建 find 查询操作
 * @param {Object} context - 上下文对象
 * @param {Object} context.collection - MongoDB 集合实例
 * @param {Object} context.defaults - 默认配置
 * @param {Function} context.run - 缓存执行器
 * @param {string} context.instanceId - 实例ID
 * @param {string} context.effectiveDbName - 数据库名
 * @param {Object} context.logger - 日志器
 * @param {Function} context.emit - 事件发射器
 * @param {Object} context.mongoSlowLogShaper - 慢查询日志格式化器
 * @returns {Object} 包含 find 和 stream 方法的对象
 */
function createFindOps(context) {
    const {
        collection,
        defaults,
        run,
        instanceId,
        effectiveDbName,
        logger,
        emit,
        mongoSlowLogShaper
    } = context;

    return {
        /**
         * 查询多条记录
         * @param {Object} [query={}] - 查询条件，使用 MongoDB 查询语法
         * @param {Object} [options={}] - 查询选项 { projection, sort, limit, skip, cache, maxTimeMS, stream, explain }
         * @param {Object|Array} [options.projection] - 字段投影配置
         * @param {Object} [options.sort] - 排序配置
         * @param {number} [options.limit] - 限制返回数量
         * @param {number} [options.skip] - 跳过记录数
         * @param {number} [options.cache] - 缓存时间（毫秒）
         * @param {number} [options.maxTimeMS] - 查询超时时间（毫秒）
         * @param {boolean} [options.stream] - 是否使用流式返回
         * @param {number} [options.batchSize] - 批处理大小
         * @param {boolean|string} [options.explain] - 是否返回查询执行计划，可选值：true/'queryPlanner'/'executionStats'/'allPlansExecution'
         * @param {string} [options.hint] - 索引提示
         * @param {Object} [options.collation] - 排序规则
         * @param {string} [options.comment] - 查询注释
         * @returns {Promise<Array>|ReadableStream|FindChain} 记录数组或可读流（当 stream: true 时）；当 explain=true 时返回执行计划；默认返回 FindChain 实例支持链式调用
         */
        find: (query = {}, options = {}) => {
            // ✅ v1.3.0: 自动转换 ObjectId 字符串
            const convertedQuery = convertObjectIdStrings(query, 'query', 0, new WeakSet(), {
                logger: context.logger,
                excludeFields: context.autoConvertConfig?.excludeFields,
                customFieldPatterns: context.autoConvertConfig?.customFieldPatterns,
                maxDepth: context.autoConvertConfig?.maxDepth
            });

            // 如果没有提供 options 或 options 为空对象，返回 FindChain 以支持完整的链式调用
            const hasOptions = options && Object.keys(options).length > 0;

            if (!hasOptions) {
                // 返回 FindChain 实例，支持 .limit().skip().sort() 等链式调用
                return new FindChain(context, convertedQuery, {});
            }

            // 如果提供了 options，执行原有逻辑（向后兼容）
            options.projection = normalizeProjection(options.projection);
            const {
                projection,
                limit = defaults.findLimit,
                skip,
                maxTimeMS = defaults.maxTimeMS,
                stream = false,
                batchSize,
                explain,
                comment
            } = options;
            const sort = normalizeSort(options.sort);

            const driverOpts = { projection, sort, skip, maxTimeMS, ...(options.hint ? { hint: options.hint } : {}), ...(options.collation ? { collation: options.collation } : {}) };
            if (limit !== undefined) driverOpts.limit = limit;
            if (batchSize !== undefined) driverOpts.batchSize = batchSize;
            if (comment) driverOpts.comment = comment;

            // 如果启用 explain，直接返回执行计划（不缓存）
            if (explain) {
                const verbosity = typeof explain === 'string' ? explain : 'queryPlanner';
                const cursor = collection.find(convertedQuery, driverOpts);
                return cursor.explain(verbosity);
            }

            // 如果启用流式返回，直接返回 MongoDB 游标流
            if (stream) {
                const cursor = collection.find(convertedQuery, driverOpts);
                const readableStream = cursor.stream();

                // 添加慢查询日志支持
                const startTime = Date.now();
                let docCount = 0;

                readableStream.on('data', () => {
                    docCount++;
                });

                readableStream.on('end', () => {
                    const durationMs = Date.now() - startTime;
                    const slowQueryMs = defaults?.slowQueryMs || 500;

                    if (durationMs >= slowQueryMs) {
                        try {
                            const meta = {
                                op: 'stream',
                                durationMs,
                                docCount,
                                iid: instanceId,
                                type: context.type,
                                db: effectiveDbName,
                                collection: collection.collectionName,
                                query: mongoSlowLogShaper?.sanitize ? mongoSlowLogShaper.sanitize(query) : query,
                                limit,
                            };
                            logger?.warn?.('🐌 Slow stream query', meta);
                            emit?.('slow-query', meta);
                        } catch (_) { }
                    }
                });

                return readableStream;
            }

            // 执行查询的 Promise
            const resultPromise = run(
                'find',
                { query: convertedQuery, ...options },
                async () => collection.find(convertedQuery, driverOpts).toArray()
            );

            // 添加 explain 方法支持链式调用（与原生 MongoDB 一致）
            resultPromise.explain = async (verbosity = 'queryPlanner') => {
                const cursor = collection.find(convertedQuery, driverOpts);
                return cursor.explain(verbosity);
            };

            return resultPromise;
        },

        /**
         * 流式查询多条记录（语法糖方法）
         * @description 这是 find(query, {...options, stream: true}) 的便捷方法
         * @param {Object} [query={}] - 查询条件
         * @param {Object} [options={}] - { projection, sort, limit, skip, maxTimeMS, batchSize }
         * @returns {ReadableStream} MongoDB 游标流
         */
        stream: (query = {}, options = {}) => {
            // 注意：这里需要通过回调获取完整的 collection 方法对象
            // 在主文件中会重写这个方法
            return context.getCollectionMethods().find(query, {
                ...options,
                stream: true
            });
        }
    };
}

module.exports = createFindOps;
