/**
 * findOneById 查询模块
 * @description 通过 _id 查询单个文档的便利方法，自动处理 ObjectId 转换
 */

const { ObjectId } = require('mongodb');
const { createError, ErrorCodes } = require('../../errors');

/**
 * 创建 findOneById 查询操作
 * @param {Object} context - 上下文对象
 * @param {Object} context.collection - MongoDB 集合实例
 * @param {Object} context.defaults - 默认配置
 * @param {Function} context.run - 缓存执行器
 * @param {string} context.instanceId - 实例ID
 * @param {string} context.effectiveDbName - 数据库名
 * @param {Object} context.logger - 日志器
 * @param {Function} context.emit - 事件发射器
 * @param {Object} context.mongoSlowLogShaper - 慢查询日志格式化器
 * @returns {Function} findOneById 方法
 */
function createFindOneByIdOps(context) {
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

    /**
     * 通过 _id 查询单个文档
     * @param {string|ObjectId} id - 文档 _id（字符串会自动转换为 ObjectId）
     * @param {Object} [options={}] - 查询选项
     * @param {Object|Array} [options.projection] - 字段投影配置
     * @param {number} [options.cache] - 缓存时间（毫秒）
     * @param {number} [options.maxTimeMS] - 查询超时时间（毫秒）
     * @param {string} [options.comment] - 查询注释
     * @returns {Promise<Object|null>} 查询到的文档，如果不存在则返回 null
     * @throws {Error} 当参数无效时
     *
     * @example
     * // 字符串 ID（自动转换为 ObjectId）
     * const user = await collection('users').findOneById('507f1f77bcf86cd799439011');
     *
     * @example
     * // ObjectId（直接使用）
     * const { ObjectId } = require('mongodb');
     * const user = await collection('users').findOneById(new ObjectId('507f1f77bcf86cd799439011'));
     *
     * @example
     * // 带选项
     * const user = await collection('users').findOneById(userId, {
     *   projection: { name: 1, email: 1 },
     *   cache: 5000,
     *   maxTimeMS: 3000
     * });
     */
    const findOneById = async function findOneById(id, options = {}) {
        const startTime = Date.now();

        // 1. 参数验证
        if (!id) {
            throw createError(
                ErrorCodes.INVALID_ARGUMENT,
                'id 参数是必需的',
                [{ field: 'id', type: 'required', message: 'id 不能为空' }]
            );
        }

        // 2. 转换 ID 为 ObjectId
        let objectId;
        try {
            if (typeof id === 'string') {
                // 验证字符串是否是有效的 ObjectId 格式（24 个十六进制字符）
                if (!/^[0-9a-fA-F]{24}$/.test(id)) {
                    throw createError(
                        ErrorCodes.INVALID_ARGUMENT,
                        `无效的 ObjectId 格式: "${id}"`,
                        [{
                            field: 'id',
                            type: 'format',
                            message: 'id 必须是 24 个十六进制字符的字符串或 ObjectId 实例',
                            received: id
                        }]
                    );
                }
                objectId = new ObjectId(id);
            } else if (id instanceof ObjectId) {
                // 只接受 ObjectId 实例
                objectId = id;
            } else {
                // 拒绝其他类型（包括数字、对象等）
                throw createError(
                    ErrorCodes.INVALID_ARGUMENT,
                    'id 必须是字符串或 ObjectId 实例',
                    [{
                        field: 'id',
                        type: 'type',
                        message: `期望: string 或 ObjectId，实际: ${typeof id}`,
                        received: typeof id
                    }]
                );
            }
        } catch (error) {
            if (error.code === ErrorCodes.INVALID_ARGUMENT) {
                throw error;
            }
            // ObjectId 构造函数抛出的错误
            throw createError(
                ErrorCodes.INVALID_ARGUMENT,
                `无效的 ObjectId: ${error.message}`,
                [{ field: 'id', type: 'invalid', message: error.message, received: id }]
            );
        }

        // 3. 构建查询
        const query = { _id: objectId };

        // 4. 标准化选项
        const { normalizeProjection } = require('../../common/normalize');
        const projection = normalizeProjection(options.projection);
        const cache = options.cache || 0;
        const maxTimeMS = options.maxTimeMS !== undefined ? options.maxTimeMS : defaults.maxTimeMS;
        const comment = options.comment;

        const driverOpts = { projection, maxTimeMS };
        if (comment) driverOpts.comment = comment;

        // 5. 执行查询（通过 run 支持缓存）
        const result = await run(
            'findOneById',
            { id: objectId.toString(), ...options },
            async () => collection.findOne(query, driverOpts)
        );

        // 6. 慢查询日志
        const duration = Date.now() - startTime;
        const slowQueryMs = defaults?.slowQueryMs || 1000;

        if (duration >= slowQueryMs) {
            try {
                const meta = {
                    operation: 'findOneById',
                    durationMs: duration,
                    iid: instanceId,
                    type: 'mongodb',
                    db: effectiveDbName,
                    collection: collection.collectionName,
                    id: mongoSlowLogShaper?.sanitize ? mongoSlowLogShaper.sanitize(objectId.toString()) : objectId.toString(),
                    options: mongoSlowLogShaper?.sanitize ? mongoSlowLogShaper.sanitize(options) : options
                };
                logger?.warn?.('🐌 Slow query: findOneById', meta);
                emit?.('slow-query', meta);
            } catch (_) {
                // 忽略日志错误
            }
        }

        return result;
    };

    return { findOneById };
}

module.exports = { createFindOneByIdOps };

