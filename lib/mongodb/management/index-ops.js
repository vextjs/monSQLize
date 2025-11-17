/**
 * MongoDB 索引管理操作
 * 提供统一的索引创建、删除、列出等功能
 *
 * @module mongodb/management/index-ops
 * @since 2025-11-17
 */

const { createError } = require('../../errors');
const { validateIndexKeys, normalizeIndexOptions } = require('../../common/index-options');

/**
 * 创建索引操作工厂函数
 *
 * @param {Object} context - 上下文对象
 * @param {Object} context.logger - 日志实例
 * @param {Object} context.cache - 缓存实例
 * @param {Object} context.defaults - 默认配置
 * @param {string} databaseName - 数据库名称
 * @param {string} collectionName - 集合名称
 * @param {Object} nativeCollection - MongoDB 原生集合对象
 * @returns {Object} 索引操作方法集合
 */
function createIndexOps(context, databaseName, collectionName, nativeCollection) {
    const { logger, defaults } = context;
    const operation = 'indexOps';

    /**
     * 创建单个索引
     *
     * @param {Object} keys - 索引键定义，如 { email: 1, age: -1 }
     * @param {Object} options - 索引选项
     * @param {string} [options.name] - 索引名称
     * @param {boolean} [options.unique] - 是否唯一索引
     * @param {boolean} [options.sparse] - 是否稀疏索引
     * @param {number} [options.expireAfterSeconds] - TTL 索引过期时间（秒）
     * @param {Object} [options.partialFilterExpression] - 部分索引过滤表达式
     * @param {Object} [options.collation] - 排序规则
     * @param {boolean} [options.hidden] - 是否隐藏索引（MongoDB 4.4+）
     * @param {boolean} [options.background] - 是否后台创建（已废弃但保留兼容）
     * @param {Object} [options.wildcardProjection] - 通配符投影（用于通配符索引）
     * @param {Object} [options.weights] - 文本索引权重
     * @param {string} [options.default_language] - 文本索引默认语言
     * @param {string} [options.language_override] - 文本索引语言覆盖字段
     * @returns {Promise<Object>} 索引创建结果 { name: string }
     *
     * @example
     * // 基本索引
     * await collection("users").createIndex({ email: 1 });
     *
     * @example
     * // 唯一索引
     * await collection("users").createIndex({ email: 1 }, { unique: true, name: "email_unique" });
     *
     * @example
     * // 复合索引
     * await collection("orders").createIndex({ userId: 1, status: 1 });
     *
     * @example
     * // TTL 索引（自动过期）
     * await collection("sessions").createIndex({ createdAt: 1 }, { expireAfterSeconds: 3600 });
     *
     * @example
     * // 文本索引
     * await collection("articles").createIndex({ title: "text", content: "text" });
     */
    async function createIndex(keys, options = {}) {
        const startTime = Date.now();
        const ns = `${databaseName}.${collectionName}`;

        try {
            // 1. 参数验证
            if (!keys || typeof keys !== 'object' || Object.keys(keys).length === 0) {
                throw createError(
                    'INVALID_ARGUMENT',
                    'createIndex: keys 参数必须是非空对象',
                    { keys, ns }
                );
            }

            // 验证索引键
            validateIndexKeys(keys);

            // 2. 归一化选项
            const normalizedOptions = normalizeIndexOptions(options);

            // 3. 记录开始日志
            logger.debug(`[createIndex] 开始创建索引`, {
                ns,
                keys,
                options: normalizedOptions
            });

            // 4. 执行创建
            const result = await nativeCollection.createIndex(keys, normalizedOptions);

            // 5. 记录成功日志
            const duration = Date.now() - startTime;
            logger.info(`[createIndex] 索引创建成功`, {
                ns,
                indexName: typeof result === 'string' ? result : result.name || 'unknown',
                keys,
                options: normalizedOptions,
                duration
            });

            // 6. 返回结果（统一格式）
            return typeof result === 'string' ? { name: result } : result;

        } catch (error) {
            // 7. 错误处理
            const duration = Date.now() - startTime;

            logger.error(`[createIndex] 索引创建失败`, {
                ns,
                keys,
                options,
                error: error.message,
                code: error.code,
                duration
            });

            // 识别特定错误类型（灵活处理错误码和消息）
            const errorMsg = error.message || '';

            // 索引已存在或名称冲突 (code 85, 86 或消息包含相关关键词)
            if (error.code === 85 || error.code === 86 ||
                errorMsg.includes('already exists') ||
                errorMsg.includes('same name') ||
                errorMsg.includes('index name')) {
                throw createError(
                    'MONGODB_ERROR',
                    `索引已存在或名称冲突: ${error.message}`,
                    { ns, keys, options, cause: error }
                );
            } else if (error.code === 67 || errorMsg.includes('CannotCreateIndex')) {
                // 不支持的索引类型
                throw createError(
                    'MONGODB_ERROR',
                    `不支持的索引类型: ${error.message}`,
                    { ns, keys, cause: error }
                );
            }

            // 抛出通用错误
            throw createError(
                'MONGODB_ERROR',
                `创建索引失败: ${error.message}`,
                { ns, keys, options, cause: error }
            );
        }
    }

    /**
     * 批量创建多个索引
     *
     * @param {Array<Object>} indexSpecs - 索引规范数组
     * @param {Object} indexSpecs[].key - 索引键定义
     * @param {string} [indexSpecs[].name] - 索引名称
     * @param {boolean} [indexSpecs[].unique] - 是否唯一索引
     * @param {boolean} [indexSpecs[].sparse] - 是否稀疏索引
     * @param {number} [indexSpecs[].expireAfterSeconds] - TTL 索引过期时间
     * @param {Object} [indexSpecs[].partialFilterExpression] - 部分索引过滤表达式
     * @param {Object} [indexSpecs[].collation] - 排序规则
     * @param {boolean} [indexSpecs[].hidden] - 是否隐藏索引
     * @returns {Promise<Array<string>>} 创建的索引名称数组
     *
     * @example
     * // 批量创建索引
     * await collection("users").createIndexes([
     *   { key: { email: 1 }, unique: true },
     *   { key: { age: 1 } },
     *   { key: { createdAt: -1 } }
     * ]);
     */
    async function createIndexes(indexSpecs) {
        const startTime = Date.now();
        const ns = `${databaseName}.${collectionName}`;

        try {
            // 1. 参数验证
            if (!Array.isArray(indexSpecs) || indexSpecs.length === 0) {
                throw createError(
                    'INVALID_ARGUMENT',
                    'createIndexes: indexSpecs 参数必须是非空数组',
                    { indexSpecs, ns }
                );
            }

            // 验证每个索引规范
            for (let i = 0; i < indexSpecs.length; i++) {
                const spec = indexSpecs[i];
                if (!spec.key || typeof spec.key !== 'object') {
                    throw createError(
                        'INVALID_ARGUMENT',
                        `createIndexes: indexSpecs[${i}] 缺少有效的 key 属性`,
                        { spec, ns }
                    );
                }
                validateIndexKeys(spec.key);
            }

            // 2. 归一化选项
            const normalizedSpecs = indexSpecs.map(spec => ({
                key: spec.key,
                ...normalizeIndexOptions(spec)
            }));

            // 3. 记录开始日志
            logger.debug(`[createIndexes] 开始批量创建索引`, {
                ns,
                count: normalizedSpecs.length,
                specs: normalizedSpecs
            });

            // 4. 执行批量创建
            const result = await nativeCollection.createIndexes(normalizedSpecs);

            // 5. 记录成功日志
            const duration = Date.now() - startTime;
            logger.info(`[createIndexes] 批量创建索引成功`, {
                ns,
                count: normalizedSpecs.length,
                indexNames: result,
                duration
            });

            // 6. 返回结果
            return result;

        } catch (error) {
            // 7. 错误处理
            const duration = Date.now() - startTime;

            logger.error(`[createIndexes] 批量创建索引失败`, {
                ns,
                count: indexSpecs?.length || 0,
                error: error.message,
                code: error.code,
                duration
            });

            // 抛出错误
            throw createError(
                'MONGODB_ERROR',
                `批量创建索引失败: ${error.message}`,
                { ns, indexSpecs, cause: error }
            );
        }
    }

    /**
     * 列出集合的所有索引
     *
     * @returns {Promise<Array<Object>>} 索引列表
     *
     * @example
     * const indexes = await collection("users").listIndexes();
     * console.log(indexes);
     * // [
     * //   { v: 2, key: { _id: 1 }, name: "_id_" },
     * //   { v: 2, key: { email: 1 }, name: "email_1", unique: true },
     * //   { v: 2, key: { age: 1 }, name: "age_1" }
     * // ]
     */
    async function listIndexes() {
        const startTime = Date.now();
        const ns = `${databaseName}.${collectionName}`;

        try {
            // 1. 记录开始日志
            logger.debug(`[listIndexes] 开始列出索引`, { ns });

            // 2. 执行查询
            const cursor = nativeCollection.listIndexes();
            const indexes = await cursor.toArray();

            // 3. 记录成功日志
            const duration = Date.now() - startTime;
            logger.debug(`[listIndexes] 列出索引成功`, {
                ns,
                count: indexes.length,
                indexNames: indexes.map(idx => idx.name),
                duration
            });

            // 4. 返回结果
            return indexes;

        } catch (error) {
            // 5. 错误处理
            const duration = Date.now() - startTime;

            logger.error(`[listIndexes] 列出索引失败`, {
                ns,
                error: error.message,
                code: error.code,
                duration
            });

            // MongoDB 命名空间不存在错误（集合不存在）
            if (error.code === 26) {
                // 返回空数组（集合不存在时没有索引）
                logger.debug(`[listIndexes] 集合不存在，返回空数组`, { ns });
                return [];
            }

            // 抛出其他错误
            throw createError(
                'MONGODB_ERROR',
                `列出索引失败: ${error.message}`,
                { ns, cause: error }
            );
        }
    }

    /**
     * 删除指定索引
     *
     * @param {string} indexName - 索引名称
     * @returns {Promise<Object>} 删除结果 { ok: 1, nIndexesWas: number }
     *
     * @example
     * await collection("users").dropIndex("email_1");
     */
    async function dropIndex(indexName) {
        const startTime = Date.now();
        const ns = `${databaseName}.${collectionName}`;

        try {
            // 1. 参数验证
            if (!indexName || typeof indexName !== 'string') {
                throw createError(
                    'INVALID_ARGUMENT',
                    'dropIndex: indexName 参数必须是非空字符串',
                    { indexName, ns }
                );
            }

            // 不允许删除 _id 索引
            if (indexName === '_id_') {
                throw createError(
                    'INVALID_ARGUMENT',
                    'dropIndex: 不允许删除 _id 索引',
                    { indexName, ns }
                );
            }

            // 2. 记录开始日志
            logger.debug(`[dropIndex] 开始删除索引`, { ns, indexName });

            // 3. 执行删除
            const result = await nativeCollection.dropIndex(indexName);

            // 4. 记录成功日志
            const duration = Date.now() - startTime;
            logger.info(`[dropIndex] 删除索引成功`, {
                ns,
                indexName,
                result,
                duration
            });

            // 5. 返回结果
            return result;

        } catch (error) {
            // 6. 错误处理
            const duration = Date.now() - startTime;

            logger.error(`[dropIndex] 删除索引失败`, {
                ns,
                indexName,
                error: error.message,
                code: error.code,
                duration
            });

            // 检查是否是尝试删除 _id 索引导致的错误
            const errorMsg = error.message || '';
            if (errorMsg.includes('_id_') || errorMsg.includes('cannot drop _id index')) {
                throw createError(
                    'INVALID_ARGUMENT',
                    `不允许删除 _id 索引`,
                    { ns, indexName, cause: error }
                );
            }

            // 索引不存在
            if (error.code === 27 || errorMsg.includes('index not found') || errorMsg.includes('IndexNotFound')) {
                throw createError(
                    'MONGODB_ERROR',
                    `索引不存在: ${indexName}`,
                    { ns, indexName, cause: error }
                );
            }

            // 抛出其他错误
            throw createError(
                'MONGODB_ERROR',
                `删除索引失败: ${error.message}`,
                { ns, indexName, cause: error }
            );
        }
    }

    /**
     * 删除集合的所有索引（_id 索引除外）
     *
     * @returns {Promise<Object>} 删除结果 { ok: 1, nIndexesWas: number }
     *
     * @example
     * await collection("users").dropIndexes();
     */
    async function dropIndexes() {
        const startTime = Date.now();
        const ns = `${databaseName}.${collectionName}`;

        try {
            // 1. 记录开始日志
            logger.debug(`[dropIndexes] 开始删除所有索引`, { ns });

            // 2. 执行删除（MongoDB 会自动保留 _id 索引）
            const result = await nativeCollection.dropIndexes();

            // 3. 记录成功日志
            const duration = Date.now() - startTime;
            logger.info(`[dropIndexes] 删除所有索引成功`, {
                ns,
                result,
                duration
            });

            // 4. 返回结果
            return result;

        } catch (error) {
            // 5. 错误处理
            const duration = Date.now() - startTime;

            logger.error(`[dropIndexes] 删除所有索引失败`, {
                ns,
                error: error.message,
                code: error.code,
                duration
            });

            // 命名空间不存在（集合不存在）
            if (error.code === 26) {
                logger.debug(`[dropIndexes] 集合不存在，无需删除索引`, { ns });
                return { ok: 1, msg: '集合不存在，无索引可删除', nIndexesWas: 0 };
            }

            // 抛出其他错误
            throw createError(
                'MONGODB_ERROR',
                `删除所有索引失败: ${error.message}`,
                { ns, cause: error }
            );
        }
    }

    // 返回索引操作方法
    return {
        createIndex,
        createIndexes,
        listIndexes,
        dropIndex,
        dropIndexes
    };
}

module.exports = createIndexOps;

