/**
 * find 查询模块
 * @description 提供多条记录查询功能，支持投影、排序、分页、缓存和流式返回
 */

const { normalizeProjection, normalizeSort } = require('../../common/normalize');

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
         * @param {Object} [options={}] - { query, projection, sort, limit, skip, cache, maxTimeMS, stream, explain }
         * @param {boolean|string} [options.explain] - 是否返回查询执行计划，可选值：true/'queryPlanner'/'executionStats'/'allPlansExecution'
         * @returns {Promise<Array>|ReadableStream} 记录数组或可读流（当 stream: true 时）；当 explain=true 时返回执行计划
         */
        find: (options = {}) => {
            options.projection = normalizeProjection(options.projection);
            const {
                query = {},
                projection,
                limit = defaults.findLimit,
                skip,
                maxTimeMS = defaults.maxTimeMS,
                stream = false,
                batchSize,
                explain
            } = options;
            const sort = normalizeSort(options.sort);

            const driverOpts = { projection, sort, skip, maxTimeMS, ...(options.hint ? { hint: options.hint } : {}), ...(options.collation ? { collation: options.collation } : {}) };
            if (limit !== undefined) driverOpts.limit = limit;
            if (batchSize !== undefined) driverOpts.batchSize = batchSize;

            // 如果启用 explain，直接返回执行计划（不缓存）
            if (explain) {
                const verbosity = typeof explain === 'string' ? explain : 'queryPlanner';
                const cursor = collection.find(query, driverOpts);
                return cursor.explain(verbosity);
            }

            // 如果启用流式返回，直接返回 MongoDB 游标流
            if (stream) {
                const cursor = collection.find(query, driverOpts);
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

            return run(
                'find',
                options,
                async () => collection.find(query, driverOpts).toArray()
            );
        },

        /**
         * 流式查询多条记录（语法糖方法）
         * @description 这是 find({...options, stream: true}) 的便捷方法
         * @param {Object} [options={}] - { query, projection, sort, limit, skip, maxTimeMS, batchSize }
         * @returns {ReadableStream} MongoDB 游标流
         */
        stream: (options = {}) => {
            // 注意：这里需要通过回调获取完整的 collection 方法对象
            // 在主文件中会重写这个方法
            return context.getCollectionMethods().find({
                ...options,
                stream: true
            });
        }
    };
}

module.exports = createFindOps;
