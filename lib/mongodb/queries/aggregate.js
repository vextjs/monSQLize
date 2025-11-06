/**
 * aggregate 查询模块
 * @description 提供 MongoDB 聚合管道功能，支持流式返回和缓存
 */

/**
 * 创建 aggregate 查询操作
 * @param {Object} context - 上下文对象
 * @returns {Object} 包含 aggregate 方法的对象
 */
function createAggregateOps(context) {
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
         * 聚合查询（MongoDB 聚合管道透传）
         * @param {Array} pipeline - 聚合管道数组，如 [{ $match: {...} }, { $group: {...} }]
         * @param {Object} [options={}] - 聚合选项
         * @param {number} [options.cache=0] - 缓存时间（毫秒），默认不缓存（聚合通常动态性强）
         * @param {number} [options.maxTimeMS] - 查询超时时间（毫秒）
         * @param {boolean} [options.allowDiskUse=false] - 是否允许使用磁盘（默认 false）
         * @param {Object} [options.collation] - 排序规则（可选）
         * @param {string|Object} [options.hint] - 索引提示（可选）
         * @param {string} [options.comment] - 查询注释（可选）
         * @param {boolean|Object} [options.meta] - 是否返回耗时元信息
         * @param {boolean} [options.stream] - 是否返回流式结果
         * @param {number} [options.batchSize] - 批处理大小
         * @param {boolean|string} [options.explain] - 是否返回查询执行计划，可选值：true/'queryPlanner'/'executionStats'/'allPlansExecution'
         * @returns {Promise<Array>|ReadableStream} 聚合结果数组或可读流（当 stream: true 时）；当 explain=true 时返回执行计划
         */
        aggregate: (pipeline = [], options = {}) => {
            const {
                maxTimeMS = defaults.maxTimeMS,
                allowDiskUse = false,
                collation,
                hint,
                comment,
                stream = false,
                batchSize,
                explain
            } = options;

            // 构建 MongoDB 聚合选项
            const aggOptions = { maxTimeMS, allowDiskUse };
            if (collation) aggOptions.collation = collation;
            if (hint) aggOptions.hint = hint;
            if (comment) aggOptions.comment = comment;
            if (batchSize !== undefined) aggOptions.batchSize = batchSize;

            // 如果启用 explain，直接返回执行计划（不缓存）
            if (explain) {
                const verbosity = typeof explain === 'string' ? explain : 'queryPlanner';
                const cursor = collection.aggregate(pipeline, aggOptions);
                return cursor.explain(verbosity);
            }

            // 如果启用流式返回，直接返回 MongoDB 游标流
            if (stream) {
                const cursor = collection.aggregate(pipeline, aggOptions);
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
                                op: 'aggregate-stream',
                                durationMs,
                                docCount,
                                iid: instanceId,
                                type: context.type,
                                db: effectiveDbName,
                                collection: collection.collectionName,
                                pipeline: mongoSlowLogShaper?.sanitize ? mongoSlowLogShaper.sanitize(pipeline) : pipeline,
                            };
                            logger?.warn?.('🐌 Slow aggregate stream', meta);
                            emit?.('slow-query', meta);
                        } catch (_) { }
                    }
                });

                return readableStream;
            }

            return run(
                'aggregate',
                options,
                async () => collection.aggregate(pipeline, aggOptions).toArray()
            );
        }
    };
}

module.exports = createAggregateOps;
