/**
 * 集合管理操作模块
 * @module management/collection-ops
 */

const { createValidationError } = require('../../errors');

/**
 * 创建集合管理操作方法
 * @param {Object} context - 上下文对象
 * @param {Object} context.db - MongoDB 数据库实例
 * @param {Object} context.collection - MongoDB 集合实例
 * @param {Object} context.logger - 日志记录器
 * @returns {Object} 集合管理操作方法
 */
module.exports = function createCollectionOps(context) {
    const { db, collection, logger } = context;

    return {
        /**
         * 删除集合
         * @returns {Promise<boolean>} 删除操作的结果
         */
        dropCollection: async () => {
            return await collection.drop();
        },

        /**
         * 创建集合
         * @param {string} [name] - 集合名称；省略则使用当前绑定的集合名
         * @param {Object} [options={}] - 创建集合的配置选项
         * @param {boolean} [options.capped] - 是否创建固定大小集合
         * @param {number} [options.size] - 固定大小集合的字节数
         * @param {number} [options.max] - 固定大小集合的最大文档数
         * @param {Object} [options.timeseries] - 时间序列集合配置
         * @param {Object} [options.validator] - 文档验证规则
         * @returns {Promise<boolean>} 创建成功返回true
         * @example
         * // 创建普通集合
         * await db.createCollection('users');
         *
         * // 创建固定大小集合
         * await db.createCollection('logs', {
         *   capped: true,
         *   size: 10485760, // 10MB
         *   max: 5000
         * });
         *
         * // 创建时间序列集合
         * await db.createCollection('measurements', {
         *   timeseries: {
         *     timeField: 'timestamp',
         *     metaField: 'sensor',
         *     granularity: 'seconds'
         *   }
         * });
         */
        createCollection: async (name, options = {}) => {
            const collName = name || collection.collectionName;
            await db.createCollection(collName, options);
            return true;
        },

        /**
         * 创建视图集合
         * @param {string} name - 视图名称
         * @param {string} source - 源集合名称
         * @param {Array} [pipeline=[]] - 聚合管道数组
         * @returns {Promise<boolean>} 创建成功返回true
         */
        createView: async (name, source, pipeline = []) => {
            await db.createCollection(name, {
                viewOn: source,
                pipeline: pipeline || []
            });
            return true;
        },

        /**
         * 获取集合统计信息
         * @param {Object} [options] - 选项
         * @param {number} [options.scale=1] - 缩放因子（1=字节, 1024=KB, 1048576=MB）
         * @returns {Promise<Object>} 集合统计对象
         * @property {string} ns - 命名空间（数据库.集合）
         * @property {number} count - 文档数量
         * @property {number} size - 数据大小
         * @property {number} storageSize - 存储大小
         * @property {number} totalIndexSize - 索引总大小
         * @property {number} avgObjSize - 平均文档大小
         * @property {Object} indexSizes - 各索引大小
         * @example
         * const stats = await collection.stats();
         * console.log('Documents:', stats.count);
         * console.log('Data size:', stats.size, 'bytes');
         * console.log('Index size:', stats.totalIndexSize, 'bytes');
         *
         * // 使用 MB 为单位
         * const statsMB = await collection.stats({ scale: 1048576 });
         * console.log('Data size:', statsMB.size, 'MB');
         */
        stats: async (options = {}) => {
            try {
                const scale = options.scale || 1;
                // 使用 MongoDB 原生命令获取集合统计
                const result = await db.command({
                    collStats: collection.collectionName,
                    scale: scale
                });

                return {
                    ns: result.ns,
                    count: result.count,
                    size: result.size,
                    storageSize: result.storageSize,
                    totalIndexSize: result.totalIndexSize,
                    avgObjSize: result.avgObjSize,
                    indexSizes: result.indexSizes,
                    nindexes: result.nindexes,
                    scaleFactor: result.scaleFactor
                };
            } catch (error) {
                if (logger) {
                    logger.error('Collection stats failed', { error: error.message });
                }
                throw createValidationError(
                    `Failed to get collection stats: ${error.message}`,
                    { code: 'COLLECTION_STATS_ERROR' }
                );
            }
        },

        /**
         * 列出数据库中的所有集合
         * @param {Object} [options] - 选项
         * @param {boolean} [options.nameOnly=false] - 仅返回集合名称
         * @returns {Promise<Array<Object>|Array<string>>} 集合列表
         * @example
         * // 获取详细信息
         * const collections = await db.listCollections();
         * console.log(collections);
         * // [
         * //   { name: 'users', type: 'collection' },
         * //   { name: 'orders', type: 'collection' }
         * // ]
         *
         * // 仅获取名称
         * const names = await db.listCollections({ nameOnly: true });
         * console.log(names); // ['users', 'orders']
         */
        listCollections: async (options = {}) => {
            try {
                const collections = await db.listCollections().toArray();

                if (options.nameOnly) {
                    return collections.map(c => c.name);
                }

                return collections.map(c => ({
                    name: c.name,
                    type: c.type,
                    options: c.options,
                    info: c.info
                }));
            } catch (error) {
                if (logger) {
                    logger.error('listCollections failed', { error: error.message });
                }
                throw createValidationError(
                    `Failed to list collections: ${error.message}`,
                    'LIST_COLLECTIONS_ERROR'
                );
            }
        },

        /**
         * 重命名集合
         * @param {string} newName - 新集合名称
         * @param {Object} [options] - 选项
         * @param {boolean} [options.dropTarget=false] - 如果目标集合存在，是否删除
         * @returns {Promise<Object>} 重命名结果
         * @example
         * await collection.rename('users_new');
         *
         * // 如果目标已存在，删除并替换
         * await collection.rename('users_backup', { dropTarget: true });
         */
        renameCollection: async (newName, options = {}) => {
            try {
                if (!newName || typeof newName !== 'string') {
                    throw createValidationError(
                        'New collection name is required and must be a string',
                        'INVALID_COLLECTION_NAME'
                    );
                }

                const result = await collection.rename(newName, {
                    dropTarget: options.dropTarget || false
                });

                if (logger) {
                    logger.info('Collection renamed', {
                        from: collection.collectionName,
                        to: newName
                    });
                }

                return {
                    renamed: true,
                    from: collection.collectionName,
                    to: newName
                };
            } catch (error) {
                if (logger) {
                    logger.error('renameCollection failed', { error: error.message });
                }
                throw createValidationError(
                    `Failed to rename collection: ${error.message}`,
                    'RENAME_COLLECTION_ERROR'
                );
            }
        },

        /**
         * 修改集合属性
         * @param {Object} modifications - 修改选项
         * @param {Object} [modifications.validator] - 新的验证规则
         * @param {string} [modifications.validationLevel] - 验证级别
         * @param {string} [modifications.validationAction] - 验证行为
         * @param {Object} [modifications.index] - 索引修改
         * @returns {Promise<Object>} 修改结果
         * @example
         * // 修改验证级别
         * await collection.collMod({
         *   validationLevel: 'moderate'
         * });
         *
         * // 修改 TTL 索引过期时间
         * await collection.collMod({
         *   index: {
         *     keyPattern: { createdAt: 1 },
         *     expireAfterSeconds: 7200
         *   }
         * });
         */
        collMod: async (modifications) => {
            try {
                if (!modifications || typeof modifications !== 'object') {
                    throw createValidationError(
                        'Modifications object is required',
                        'INVALID_MODIFICATIONS'
                    );
                }

                const result = await db.command({
                    collMod: collection.collectionName,
                    ...modifications
                });

                if (logger) {
                    logger.info('Collection modified', {
                        collection: collection.collectionName,
                        modifications: Object.keys(modifications)
                    });
                }

                return {
                    ok: result.ok,
                    collection: collection.collectionName
                };
            } catch (error) {
                if (logger) {
                    logger.error('collMod failed', { error: error.message });
                }
                throw createValidationError(
                    `Failed to modify collection: ${error.message}`,
                    'COLLMOD_ERROR'
                );
            }
        },

        /**
         * 转换为固定大小集合
         * @param {number} size - 集合大小（字节）
         * @param {Object} [options] - 选项
         * @param {number} [options.max] - 最大文档数
         * @returns {Promise<Object>} 转换结果
         * @example
         * // 转换为 10MB 固定大小集合
         * await collection.convertToCapped(10485760);
         *
         * // 限制最大文档数
         * await collection.convertToCapped(10485760, { max: 5000 });
         */
        convertToCapped: async (size, options = {}) => {
            try {
                if (!size || typeof size !== 'number' || size <= 0) {
                    throw createValidationError(
                        'Size must be a positive number',
                        'INVALID_SIZE'
                    );
                }

                const command = {
                    convertToCapped: collection.collectionName,
                    size: size
                };

                if (options.max) {
                    command.max = options.max;
                }

                const result = await db.command(command);

                if (logger) {
                    logger.info('Collection converted to capped', {
                        collection: collection.collectionName,
                        size: size,
                        max: options.max
                    });
                }

                return {
                    ok: result.ok,
                    collection: collection.collectionName,
                    capped: true,
                    size: size
                };
            } catch (error) {
                if (logger) {
                    logger.error('convertToCapped failed', { error: error.message });
                }
                throw createValidationError(
                    `Failed to convert to capped collection: ${error.message}`,
                    'CONVERT_CAPPED_ERROR'
                );
            }
        },

        /**
         * 执行任意 MongoDB 命令
         * @param {Object} command - MongoDB 命令对象
         * @param {Object} [options] - 选项
         * @returns {Promise<Object>} 命令执行结果
         * @example
         * // 执行 collStats 命令
         * const result = await db.runCommand({
         *   collStats: 'users',
         *   scale: 1024
         * });
         *
         * // 执行 ping 命令
         * const ping = await db.runCommand({ ping: 1 });
         */
        runCommand: async (command, options = {}) => {
            try {
                if (!command || typeof command !== 'object') {
                    throw createValidationError(
                        'Command must be an object',
                        'INVALID_COMMAND'
                    );
                }

                const result = await db.command(command, options);

                if (logger) {
                    logger.debug('Command executed', {
                        command: Object.keys(command)[0]
                    });
                }

                return result;
            } catch (error) {
                if (logger) {
                    logger.error('runCommand failed', {
                        command: Object.keys(command)[0],
                        error: error.message
                    });
                }
                throw createValidationError(
                    `Failed to execute command: ${error.message}`,
                    'COMMAND_ERROR'
                );
            }
        }
    };
};
