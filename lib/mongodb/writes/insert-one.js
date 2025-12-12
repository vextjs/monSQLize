/**
 * insertOne 操作实现
 * 插入单个文档到集合
 */

const { createError, ErrorCodes } = require('../../errors');
const CacheFactory = require('../../cache');
const { isInTransaction, getTransactionFromSession } = require('../common/transaction-aware');
const { convertObjectIdStrings } = require('../../utils/objectid-converter');

/**
 * 创建 insertOne 操作
 * @param {Object} context - 模块上下文
 * @param {Object} context.db - MongoDB 数据库实例
 * @param {Object} context.cache - 缓存实例
 * @param {Object} context.logger - 日志实例
 * @param {Object} context.defaults - 默认配置
 * @param {string} context.collectionName - 集合名称
 * @param {string} context.databaseName - 数据库名称
 * @param {string} context.instanceId - 实例ID
 * @returns {Object} 包含 insertOne 方法的对象
 */
function createInsertOneOps(context) {
    const { db, cache, logger, defaults, collection, effectiveDbName: databaseName, instanceId } = context;

    // 提取集合名称和原生 collection 对象
    const collectionName = collection.collectionName;
    const nativeCollection = collection;

    /**
     * 插入单个文档
     * @param {Object} document - 要插入的文档（必需）
     * @param {Object} [options] - 操作选项
     * @param {Object} [options.writeConcern] - 写关注选项
     * @param {boolean} [options.bypassDocumentValidation] - 是否绕过文档验证
     * @param {string} [options.comment] - 操作注释（用于日志追踪）
     * @returns {Promise<Object>} 插入结果 { acknowledged, insertedId }
     * @throws {Error} 当 document 参数无效时
     *
     * @example
     * const result = await collection('users').insertOne(
     *     { name: 'Alice', age: 25 }
     * );
     * console.log('Inserted ID:', result.insertedId);
     *
     * @example
     * // 使用 options 参数
     * const result = await collection('users').insertOne(
     *     { name: 'Bob', age: 30 },
     *     { bypassDocumentValidation: true, comment: 'test insert' }
     * );
     */
    const insertOne = async function insertOne(document, options = {}) {
        const startTime = Date.now();

        // 1. 参数验证
        if (!document || typeof document !== 'object' || Array.isArray(document)) {
            throw createError(
                ErrorCodes.DOCUMENT_REQUIRED,
                'document 必须是对象类型',
                [{ field: 'document', type: 'object.required', message: 'document 是必需参数且必须是对象' }]
            );
        }

        // ✅ v1.3.0: 自动转换 ObjectId 字符串
        const convertedDocument = convertObjectIdStrings(document, 'document', 0, new WeakSet(), {
            logger: context.logger,
            excludeFields: context.autoConvertConfig?.excludeFields,
            customFieldPatterns: context.autoConvertConfig?.customFieldPatterns,
            maxDepth: context.autoConvertConfig?.maxDepth
        });

        // 2. 构建操作上下文
        const operation = 'insertOne';
        const ns = `${databaseName}.${collectionName}`;

        try {
            // 3. 执行插入操作
            const result = await nativeCollection.insertOne(convertedDocument, options);

            // 4. 自动失效缓存
            if (cache) {
                try {
                    // 使用标准命名空间模式删除该集合的所有缓存
                    const ns = {
                        iid: instanceId,
                        type: 'mongodb',
                        db: databaseName,
                        collection: collectionName
                    };
                    const pattern = CacheFactory.buildNamespacePattern(ns);

                    // 检查是否在事务中
                    if (isInTransaction(options)) {
                        // 事务中：调用 Transaction 的 recordInvalidation 方法
                        const tx = getTransactionFromSession(options.session);
                        if (tx && typeof tx.recordInvalidation === 'function') {
                            // 🚀 传递 metadata 支持文档级别锁
                            await tx.recordInvalidation(pattern, {
                                operation: 'write',
                                query: { _id: result.insertedId },
                                collection: collectionName
                            });
                            logger.debug(`[${operation}] 事务中失效缓存: ${ns.db}.${ns.collection}`);
                        } else {
                            const deleted = await cache.delPattern(pattern);
                            if (deleted > 0) {
                                logger.debug(`[${operation}] 自动失效缓存: ${ns.db}.${ns.collection}, 删除 ${deleted} 个缓存键`);
                            }
                        }
                    } else {
                        // 非事务：直接失效缓存
                        const deleted = await cache.delPattern(pattern);
                        if (deleted > 0) {
                            logger.debug(`[${operation}] 自动失效缓存: ${ns.db}.${ns.collection}, 删除 ${deleted} 个缓存键`);
                        }
                    }
                } catch (cacheErr) {
                    // 缓存失效失败不影响写操作
                    logger.warn(`[${operation}] 缓存失效失败: ${cacheErr.message}`, { ns: `${databaseName}.${collectionName}`, error: cacheErr });
                }
            }

            // 5. 记录慢操作日志
            const duration = Date.now() - startTime;
            const slowQueryMs = defaults.slowQueryMs || 1000;
            if (duration > slowQueryMs) {
                logger.warn(`[${operation}] 慢操作警告`, {
                    ns,
                    duration,
                    threshold: slowQueryMs,
                    documentKeys: Object.keys(document),
                    insertedId: result.insertedId,
                    comment: options.comment
                });
            } else {
                logger.debug(`[${operation}] 操作完成`, {
                    ns,
                    duration,
                    insertedId: result.insertedId
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
                documentKeys: Object.keys(document)
            });

            // 识别特定错误类型
            if (error.code === 11000) {
                // MongoDB 重复键错误
                throw createError(
                    ErrorCodes.DUPLICATE_KEY,
                    '文档插入失败：违反唯一性约束',
                    [{ field: '_id', message: error.message }],
                    error
                );
            }

            // 其他错误
            throw createError(
                ErrorCodes.WRITE_ERROR,
                `insertOne 操作失败: ${error.message}`,
                null,
                error
            );
        }
    };

    return { insertOne };
} module.exports = { createInsertOneOps };
