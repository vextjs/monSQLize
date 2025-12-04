/**
 * findOneOrCreate 查询模块
 * @description 查找文档，如果不存在则创建。自动处理并发竞态，充分利用缓存。
 */

const { ObjectId } = require('mongodb');
const { createError, ErrorCodes } = require('../../errors');

/**
 * 创建 findOneOrCreate 查询操作
 * @param {Object} context - 上下文对象
 * @param {Object} context.collection - MongoDB 集合实例
 * @param {Object} context.defaults - 默认配置
 * @param {Function} context.run - 缓存执行器
 * @param {string} context.instanceId - 实例ID
 * @param {string} context.effectiveDbName - 数据库名
 * @param {Object} context.logger - 日志器
 * @param {Function} context.emit - 事件发射器
 * @returns {Function} findOneOrCreate 方法
 */
function createFindOneOrCreateOps(context) {
    const {
        collection,
        defaults,
        run,
        instanceId,
        effectiveDbName,
        logger,
        emit
    } = context;

    /**
     * 查找文档，如果不存在则创建
     *
     * 核心特性：
     * 1. 充分利用缓存：如果文档存在，直接命中缓存（0 DB 调用）
     * 2. 并发安全：自动处理 unique 索引冲突，自动重试
     * 3. 减少代码量：6-8 行原生代码 → 1 行扩展方法（减少 80%）
     *
     * @param {Object} query - 查询条件
     * @param {Object} doc - 不存在时插入的文档
     * @param {Object} [options={}] - 选项
     * @param {Object|Array} [options.projection] - 字段投影配置
     * @param {number} [options.cache] - 缓存时间（毫秒）
     * @param {boolean} [options.retryOnConflict=true] - 并发冲突时是否自动重试
     * @param {number} [options.maxRetries=3] - 最大重试次数
     * @param {number} [options.maxTimeMS] - 查询超时时间（毫秒）
     * @param {string} [options.comment] - 查询注释
     * @param {Object} [options.session] - MongoDB 会话（事务支持）
     *
     * @returns {Promise<Object>} 返回对象
     * @returns {Object} result.doc - 文档对象
     * @returns {boolean} result.created - 是否新创建（true: 新创建, false: 已存在）
     * @returns {boolean} result.fromCache - 是否来自缓存（仅当 created: false 时有效）
     *
     * @throws {Error} 当参数无效时
     * @throws {Error} 当数据库操作失败时
     * @throws {Error} 当并发冲突重试次数超限时
     *
     * @example
     * // 场景1：OAuth 用户首次登录
     * const { doc: user, created } = await collection.findOneOrCreate(
     *   { githubId: profile.id },
     *   {
     *     githubId: profile.id,
     *     username: profile.login,
     *     email: profile.email,
     *     createdAt: new Date()
     *   }
     * );
     *
     * if (created) {
     *   await sendWelcomeEmail(user.email);
     * }
     *
     * @example
     * // 场景2：标签自动创建
     * const { doc: tag } = await collection.findOneOrCreate(
     *   { name: 'JavaScript' },
     *   { name: 'JavaScript', count: 0, createdAt: new Date() }
     * );
     *
     * @example
     * // 场景3：缓存计算结果
     * const { doc: stats, fromCache } = await collection.findOneOrCreate(
     *   { month: '2024-12' },
     *   {
     *     month: '2024-12',
     *     data: await calculateMonthlyStats('2024-12'),
     *     createdAt: new Date()
     *   },
     *   { cache: 3600000 } // 缓存 1 小时
     * );
     *
     * console.log(fromCache ? '缓存命中' : '计算并缓存');
     */
    const findOneOrCreate = async function findOneOrCreate(query, doc, options = {}) {
        const startTime = Date.now();

        // 1. 参数验证
        if (!query || typeof query !== 'object' || Object.keys(query).length === 0) {
            throw createError(
                ErrorCodes.INVALID_ARGUMENT,
                'query 参数必须是非空对象',
                [{ field: 'query', type: 'required', message: 'query 不能为空对象' }]
            );
        }

        if (!doc || typeof doc !== 'object' || Object.keys(doc).length === 0) {
            throw createError(
                ErrorCodes.INVALID_ARGUMENT,
                'doc 参数必须是非空对象',
                [{ field: 'doc', type: 'required', message: 'doc 不能为空对象' }]
            );
        }

        // 2. 提取选项
        const {
            projection,
            cache,
            retryOnConflict = true,
            maxRetries = 3,
            maxTimeMS,
            comment,
            session
        } = options;

        // 3. 先查询（利用缓存）
        try {
            const existing = await run(
                'findOne',
                { db: effectiveDbName, coll: collection.collectionName },
                async () => {
                    return await collection.findOne(query, {
                        projection,
                        maxTimeMS,
                        comment,
                        session
                    });
                },
                { cache, query, projection }
            );

            if (existing) {
                // 文档存在，直接返回
                const duration = Date.now() - startTime;

                if (logger && defaults?.slowQueryMs && duration >= defaults.slowQueryMs) {
                    logger.warn('findOneOrCreate 慢查询', {
                        operation: 'findOneOrCreate',
                        duration,
                        query,
                        fromCache: !!cache,
                        result: 'existing'
                    });
                }

                return {
                    doc: existing,
                    created: false,
                    fromCache: !!cache
                };
            }
        } catch (err) {
            // findOne 失败，记录错误并继续尝试插入
            if (logger) {
                logger.warn('findOneOrCreate findOne 失败，尝试插入', {
                    error: err.message,
                    query
                });
            }
        }

        // 4. 文档不存在，尝试插入（带重试机制）
        let retries = 0;
        let lastError;

        while (retries <= maxRetries) {
            try {
                const insertResult = await collection.insertOne(doc, {
                    maxTimeMS,
                    comment,
                    session
                });

                const duration = Date.now() - startTime;

                if (logger && defaults?.slowQueryMs && duration >= defaults.slowQueryMs) {
                    logger.warn('findOneOrCreate 慢查询', {
                        operation: 'findOneOrCreate',
                        duration,
                        query,
                        result: 'inserted'
                    });
                }

                // 插入成功，构建返回的文档
                let insertedDoc = { _id: insertResult.insertedId, ...doc };

                // 应用 projection（如果有）
                if (projection) {
                    const projectedDoc = { _id: insertedDoc._id };  // _id 默认包含

                    for (const key in projection) {
                        if (projection[key] === 1 || projection[key] === true) {
                            if (key !== '_id') {
                                projectedDoc[key] = insertedDoc[key];
                            }
                        }
                    }

                    // 检查是否显式排除 _id
                    if (projection._id === 0 || projection._id === false) {
                        delete projectedDoc._id;
                    }

                    insertedDoc = projectedDoc;
                }

                return {
                    doc: insertedDoc,
                    created: true,
                    fromCache: false
                };

            } catch (err) {
                lastError = err;

                // 检查是否是 duplicate key 错误（E11000）
                const isDuplicateKeyError =
                    err.code === 11000 ||
                    (err.message && err.message.includes('E11000')) ||
                    (err.name && err.name === 'MongoServerError' && err.code === 11000);

                if (isDuplicateKeyError && retryOnConflict && retries < maxRetries) {
                    // 并发冲突，重试查询
                    retries++;

                    if (logger) {
                        logger.info('findOneOrCreate 检测到并发冲突，重试查询', {
                            retry: retries,
                            maxRetries,
                            query
                        });
                    }

                    try {
                        // 重新查询（不使用缓存，确保获取最新数据）
                        const existing = await collection.findOne(query, {
                            projection,
                            maxTimeMS,
                            comment,
                            session
                        });

                        if (existing) {
                            const duration = Date.now() - startTime;

                            if (logger && defaults?.slowQueryMs && duration >= defaults.slowQueryMs) {
                                logger.warn('findOneOrCreate 慢查询（重试后）', {
                                    operation: 'findOneOrCreate',
                                    duration,
                                    query,
                                    retry: retries,
                                    result: 'existing'
                                });
                            }

                            return {
                                doc: existing,
                                created: false,
                                fromCache: false
                            };
                        }

                        // 查询仍然不存在，继续重试插入
                        continue;

                    } catch (queryErr) {
                        // 重试查询失败，记录错误并继续下一次重试
                        if (logger) {
                            logger.error('findOneOrCreate 重试查询失败', {
                                retry: retries,
                                error: queryErr.message,
                                query
                            });
                        }
                        continue;
                    }
                } else {
                    // 非 duplicate key 错误，或重试次数用尽，直接抛出
                    throw err;
                }
            }
        }

        // 重试次数用尽，抛出错误
        throw createError(
            ErrorCodes.OPERATION_FAILED,
            `findOneOrCreate 并发冲突，重试 ${maxRetries} 次后仍失败`,
            [
                {
                    field: 'query',
                    type: 'conflict',
                    message: `尝试插入时检测到并发冲突，重试 ${maxRetries} 次后仍无法完成操作`,
                    originalError: lastError?.message
                }
            ]
        );
    };

    return {
        findOneOrCreate
    };
}

module.exports = {
    createFindOneOrCreateOps
};

