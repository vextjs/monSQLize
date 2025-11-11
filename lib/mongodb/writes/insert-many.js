/**
 * insertMany 操作实现
 * 批量插入多个文档到集合
 */

const { createError, ErrorCodes } = require('../../errors');
const CacheFactory = require('../../cache');

/**
 * 创建 insertMany 操作
 * @param {Object} context - 模块上下文
 * @param {Object} context.db - MongoDB 数据库实例
 * @param {Object} context.cache - 缓存实例
 * @param {Object} context.logger - 日志实例
 * @param {Object} context.defaults - 默认配置
 * @param {string} context.collection - 集合名称
 * @param {string} context.effectiveDbName - 数据库名称
 * @param {string} context.instanceId - 实例ID
 * @returns {Object} 包含 insertMany 方法的对象
 */
function createInsertManyOps(context) {
    const { db, cache, logger, defaults, collection, effectiveDbName: databaseName, instanceId } = context;

    // 提取集合名称和原生 collection 对象
    const collectionName = collection.collectionName;
    const nativeCollection = collection;

    /**
     * 批量插入多个文档
     * @param {Object} options - 操作选项
     * @param {Array<Object>} options.documents - 要插入的文档数组（必需）
     * @param {boolean} [options.ordered=true] - 是否按顺序插入（遇到错误是否继续）
     * @param {Object} [options.writeConcern] - 写关注选项
     * @param {boolean} [options.bypassDocumentValidation] - 是否绕过文档验证
     * @param {string} [options.comment] - 操作注释（用于日志追踪）
     * @returns {Promise<Object>} 插入结果 { acknowledged, insertedCount, insertedIds }
     * @throws {Error} 当 documents 参数无效时
     * 
     * @example
     * const result = await collection('users').insertMany({
     *     documents: [
     *         { name: 'Alice', age: 25 },
     *         { name: 'Bob', age: 30 }
     *     ]
     * });
     * console.log('Inserted count:', result.insertedCount);
     * console.log('Inserted IDs:', result.insertedIds);
     */
    const insertMany = async function insertMany(options = {}) {
        const startTime = Date.now();
        const { documents, ...restOptions } = options;

        // 1. 参数验证
        if (!Array.isArray(documents)) {
            throw createError(
                ErrorCodes.DOCUMENTS_REQUIRED,
                'documents 必须是数组类型',
                [{ field: 'documents', type: 'array.required', message: 'documents 是必需参数且必须是数组' }]
            );
        }

        if (documents.length === 0) {
            throw createError(
                ErrorCodes.DOCUMENTS_REQUIRED,
                'documents 数组不能为空',
                [{ field: 'documents', type: 'array.min', message: 'documents 至少需要包含一个文档' }]
            );
        }

        // 验证每个文档都是对象
        const invalidDocs = documents.filter((doc, index) => {
            return !doc || typeof doc !== 'object' || Array.isArray(doc);
        });

        if (invalidDocs.length > 0) {
            throw createError(
                ErrorCodes.DOCUMENTS_REQUIRED,
                'documents 中的所有元素必须是对象类型',
                invalidDocs.map((doc, idx) => ({
                    field: `documents[${idx}]`,
                    type: 'object.required',
                    message: '必须是对象类型'
                }))
            );
        }

        // 2. 构建操作上下文
        const operation = 'insertMany';
        const ns = `${databaseName}.${collectionName}`;
        const docCount = documents.length;

        try {
            // 3. 执行批量插入操作
            const result = await nativeCollection.insertMany(documents, restOptions);

            // 4. 自动失效缓存
            if (cache) {
                try {
                    // 使用标准命名空间模式删除该集合的所有缓存
                    const nsObj = {
                        iid: instanceId,
                        type: 'mongodb',
                        db: databaseName,
                        collection: collectionName
                    };
                    const pattern = CacheFactory.buildNamespacePattern(nsObj);
                    const deleted = await cache.delPattern(pattern);

                    if (deleted > 0) {
                        logger.debug(`[${operation}] 自动失效缓存: ${nsObj.db}.${nsObj.collection}, 删除 ${deleted} 个缓存键`);
                    }
                } catch (cacheErr) {
                    // 缓存失效失败不影响写操作
                    logger.warn(`[${operation}] 缓存失效失败: ${cacheErr.message}`, { ns: `${databaseName}.${collectionName}`, error: cacheErr });
                }
            }

            // 5. 记录慢操作日志
            const duration = Date.now() - startTime;
            const slowThreshold = defaults.slowThreshold || 1000;
            if (duration > slowThreshold) {
                logger.warn(`[${operation}] 慢操作警告`, {
                    ns,
                    duration,
                    threshold: slowThreshold,
                    documentCount: docCount,
                    insertedCount: result.insertedCount,
                    ordered: restOptions.ordered !== false,
                    comment: restOptions.comment
                });
            } else {
                logger.debug(`[${operation}] 操作完成`, {
                    ns,
                    duration,
                    documentCount: docCount,
                    insertedCount: result.insertedCount
                });
            }

            return result;

        } catch (error) {
            // 6. 错误处理
            const duration = Date.now() - startTime;

            logger.error(`[${operation}] 操作失败`, {
                ns,
                duration,
                error: error.message,
                code: error.code,
                documentCount: docCount,
                ordered: restOptions.ordered !== false
            });

            // 识别特定错误类型
            if (error.code === 11000) {
                // MongoDB 重复键错误
                throw createError(
                    ErrorCodes.DUPLICATE_KEY,
                    '批量插入失败：违反唯一性约束',
                    [{ message: error.message, writeErrors: error.writeErrors }],
                    error
                );
            }

            // 部分成功的情况（ordered=false 时可能发生）
            if (error.result && error.result.insertedCount > 0) {
                logger.warn(`[${operation}] 部分成功`, {
                    ns,
                    insertedCount: error.result.insertedCount,
                    totalCount: docCount,
                    failedCount: docCount - error.result.insertedCount
                });
            }

            // 其他错误
            throw createError(
                ErrorCodes.WRITE_ERROR,
                `insertMany 操作失败: ${error.message}`,
                error.writeErrors || null,
                error
            );
        }
    };

    return { insertMany };
}

module.exports = { createInsertManyOps };
