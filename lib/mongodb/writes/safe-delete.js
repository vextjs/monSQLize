/**
 * safeDelete 扩展方法模块
 * @description 安全删除文档（检查依赖关系，防止孤儿数据）
 */

const { ObjectId } = require('mongodb');
const { createError, ErrorCodes } = require('../../errors');

/**
 * 创建 safeDelete 操作
 * @param {Object} context - 上下文对象
 * @returns {Function} safeDelete 方法
 */
function createSafeDeleteOps(context) {
    const {
        collection,
        defaults,
        instanceId,
        effectiveDbName,
        logger,
        emit,
        mongoSlowLogShaper,
        type,
        db
    } = context;

    /**
     * 安全删除文档（检查依赖关系）
     * @param {Object} query - 删除条件
     * @param {Object} [options={}] - 选项
     * @param {Array<Object>} [options.checkDependencies=[]] - 依赖检查配置
     * @param {string} options.checkDependencies[].collection - 依赖集合名
     * @param {Object} options.checkDependencies[].query - 依赖查询条件
     * @param {number} [options.checkDependencies[].allowCount=0] - 允许的依赖数量
     * @param {string} [options.checkDependencies[].errorMessage] - 自定义错误消息
     * @param {boolean} [options.soft=false] - 是否软删除
     * @param {string} [options.softDeleteField='deletedAt'] - 软删除字段名
     * @param {*} [options.softDeleteValue] - 软删除字段值（默认：new Date()）
     * @param {Object} [options.additionalFields={}] - 软删除时的额外字段
     * @param {number} [options.maxTimeMS] - 查询超时时间
     * @param {string} [options.comment] - 查询注释
     * @param {Object} [options.session] - MongoDB 会话（事务支持）
     * @returns {Promise<Object>} 删除结果
     * @returns {number} result.deletedCount - 删除的文档数量
     * @returns {Array<Object>} result.dependencyChecks - 依赖检查结果
     *
     * @example
     * // 基础用法：删除用户前检查依赖
     * try {
     *   const result = await User.safeDelete(
     *     { _id: userId },
     *     {
     *       checkDependencies: [
     *         {
     *           collection: 'orders',
     *           query: { userId, status: { $in: ['pending', 'paid'] } },
     *           errorMessage: '用户有未完成的订单'
     *         },
     *         {
     *           collection: 'posts',
     *           query: { authorId: userId, published: true },
     *           errorMessage: '用户有已发布的文章'
     *         }
     *       ]
     *     }
     *   );
     *   console.log('删除成功', result);
     * } catch (err) {
     *   console.error('删除失败:', err.message);
     * }
     *
     * @example
     * // 软删除：保留数据用于审计
     * const result = await User.safeDelete(
     *   { _id: userId },
     *   {
     *     soft: true,
     *     softDeleteField: 'deletedAt',
     *     additionalFields: {
     *       deletedBy: currentUserId,
     *       deleteReason: '用户注销'
     *     }
     *   }
     * );
     */
    const safeDelete = async function safeDelete(query, options = {}) {
        const startTime = Date.now();

        // 1. 参数验证
        if (!query || typeof query !== 'object' || Array.isArray(query)) {
            throw createError(
                ErrorCodes.INVALID_ARGUMENT,
                'query 必须是对象',
                [{ field: 'query', type: 'type', message: 'query 必须是对象', received: typeof query }]
            );
        }

        // 2. 提取选项
        const checkDependencies = options.checkDependencies || [];
        const soft = options.soft === true;
        const softDeleteField = options.softDeleteField || 'deletedAt';
        const softDeleteValue = options.softDeleteValue !== undefined ? options.softDeleteValue : (() => new Date());
        const additionalFields = options.additionalFields || {};
        const maxTimeMS = options.maxTimeMS !== undefined ? options.maxTimeMS : defaults.maxTimeMS;
        const comment = options.comment;
        const session = options.session;

        // 3. 依赖检查
        const dependencyChecks = [];
        let hasBlockingDependencies = false;
        const blockingReasons = [];

        for (const dep of checkDependencies) {
            if (!dep.collection || !dep.query) {
                throw createError(
                    ErrorCodes.INVALID_ARGUMENT,
                    '依赖检查配置必须包含 collection 和 query',
                    [{ field: 'checkDependencies', type: 'invalid', message: '缺少 collection 或 query' }]
                );
            }

            const depCollection = db.collection(dep.collection);
            const allowCount = dep.allowCount !== undefined ? dep.allowCount : 0;

            try {
                const count = await depCollection.countDocuments(dep.query, {
                    maxTimeMS,
                    session
                });

                const passed = count <= allowCount;
                dependencyChecks.push({
                    collection: dep.collection,
                    count,
                    allowCount,
                    passed
                });

                if (!passed) {
                    hasBlockingDependencies = true;
                    const message = dep.errorMessage || `无法删除：${dep.collection} 中有 ${count} 条关联数据`;
                    blockingReasons.push(`${message} (${count} 条记录)`);
                }

                logger?.debug?.('[safeDelete] 依赖检查', {
                    ns: `${effectiveDbName}.${collection.collectionName}`,
                    depCollection: dep.collection,
                    count,
                    allowCount,
                    passed
                });

            } catch (error) {
                logger?.error?.('[safeDelete] 依赖检查失败', {
                    ns: `${effectiveDbName}.${collection.collectionName}`,
                    depCollection: dep.collection,
                    error: error.message
                });
                throw createError(
                    ErrorCodes.OPERATION_FAILED,
                    `依赖检查失败：${dep.collection}`,
                    [{ field: 'checkDependencies', type: 'error', message: error.message }]
                );
            }
        }

        // 4. 如果有阻塞依赖，抛出错误
        if (hasBlockingDependencies) {
            throw createError(
                ErrorCodes.OPERATION_FAILED,
                `无法删除：${blockingReasons.join('; ')}`,
                blockingReasons.map(reason => ({
                    field: 'dependencies',
                    type: 'blocking',
                    message: reason
                }))
            );
        }

        // 5. 执行删除或软删除
        let result;
        let deletedCount = 0;

        if (soft) {
            // 软删除：使用 updateOne/updateMany
            const updateDoc = {
                [softDeleteField]: typeof softDeleteValue === 'function' ? softDeleteValue() : softDeleteValue,
                ...additionalFields
            };

            try {
                const updateResult = await collection.updateMany(query, {
                    $set: updateDoc
                }, {
                    maxTimeMS,
                    comment,
                    session
                });

                deletedCount = updateResult.modifiedCount;

                logger?.debug?.('[safeDelete] 软删除完成', {
                    ns: `${effectiveDbName}.${collection.collectionName}`,
                    query: mongoSlowLogShaper?.sanitize ? mongoSlowLogShaper.sanitize(query) : query,
                    modifiedCount: deletedCount
                });

            } catch (error) {
                logger?.error?.('[safeDelete] 软删除失败', {
                    ns: `${effectiveDbName}.${collection.collectionName}`,
                    error: error.message
                });
                throw error;
            }

        } else {
            // 硬删除：使用 deleteMany
            try {
                const deleteResult = await collection.deleteMany(query, {
                    maxTimeMS,
                    comment,
                    session
                });

                deletedCount = deleteResult.deletedCount;

                logger?.debug?.('[safeDelete] 硬删除完成', {
                    ns: `${effectiveDbName}.${collection.collectionName}`,
                    query: mongoSlowLogShaper?.sanitize ? mongoSlowLogShaper.sanitize(query) : query,
                    deletedCount
                });

            } catch (error) {
                logger?.error?.('[safeDelete] 硬删除失败', {
                    ns: `${effectiveDbName}.${collection.collectionName}`,
                    error: error.message
                });
                throw error;
            }
        }

        const duration = Date.now() - startTime;

        // 6. 慢查询日志
        const slowQueryMs = defaults?.slowQueryMs || 1000;
        if (duration >= slowQueryMs) {
            try {
                const meta = {
                    operation: 'safeDelete',
                    durationMs: duration,
                    iid: instanceId,
                    type,
                    db: effectiveDbName,
                    collection: collection.collectionName,
                    query: mongoSlowLogShaper?.sanitize ? mongoSlowLogShaper.sanitize(query) : query,
                    soft,
                    deletedCount,
                    dependencyChecks: dependencyChecks.length,
                    comment
                };
                logger?.warn?.('🐌 Slow query: safeDelete', meta);
                emit?.('slow-query', meta);
            } catch (_) {
                // 忽略日志错误
            }
        }

        // 7. 返回结果
        return {
            deletedCount,
            dependencyChecks
        };
    };

    return { safeDelete };
}

module.exports = { createSafeDeleteOps };

