/**
 * 运维监控方法工厂函数
 * 提供数据库和服务器级别的监控方法
 * @module mongodb/management/admin-ops
 */

const { createValidationError } = require('../../errors');

/**
 * 创建运维监控方法
 * @param {Object} context - 上下文对象
 * @param {Object} context.adapter - MongoDB 适配器
 * @param {Object} context.logger - 日志记录器
 * @returns {Object} 运维监控方法集合
 */
function createAdminOps(context) {
    const { adapter, logger } = context;

    return {
        /**
         * 检测数据库连接是否正常
         * @returns {Promise<boolean>} 连接正常返回 true，否则返回 false
         * @example
         * const isAlive = await db.ping();
         * console.log('Database is alive:', isAlive);
         */
        async ping() {
            try {
                await adapter.db.admin().ping();
                return true;
            } catch (error) {
                logger.error('Ping failed', { error: error.message });
                return false;
            }
        },

        /**
         * 获取 MongoDB 版本信息
         * @returns {Promise<Object>} 版本信息对象
         * @property {string} version - 版本号（如 "6.0.3"）
         * @property {Array<number>} versionArray - 版本号数组（如 [6, 0, 3]）
         * @property {string} gitVersion - Git 版本哈希
         * @property {Object} [bits] - 系统位数（32 或 64）
         * @property {boolean} [debug] - 是否为 Debug 版本
         * @example
         * const info = await db.buildInfo();
         * console.log('MongoDB version:', info.version);
         * console.log('Git version:', info.gitVersion);
         */
        async buildInfo() {
            try {
                const admin = adapter.db.admin();
                const info = await admin.buildInfo();

                // 返回精简的版本信息
                return {
                    version: info.version,
                    versionArray: info.versionArray,
                    gitVersion: info.gitVersion,
                    bits: info.bits,
                    debug: info.debug,
                    maxBsonObjectSize: info.maxBsonObjectSize
                };
            } catch (error) {
                logger.error('buildInfo failed', { error: error.message });
                throw createValidationError(
                    `Failed to get build info: ${error.message}`,
                    { code: 'BUILD_INFO_ERROR' }
                );
            }
        },

        /**
         * 获取服务器状态信息
         * @param {Object} [options] - 选项
         * @param {boolean} [options.scale=1] - 缩放因子（1=字节, 1024=KB, 1048576=MB）
         * @returns {Promise<Object>} 服务器状态对象
         * @property {Object} connections - 连接信息
         * @property {number} connections.current - 当前连接数
         * @property {number} connections.available - 可用连接数
         * @property {number} connections.totalCreated - 总创建连接数
         * @property {Object} mem - 内存使用信息
         * @property {number} mem.resident - 常驻内存（MB）
         * @property {number} mem.virtual - 虚拟内存（MB）
         * @property {Object} opcounters - 操作计数器
         * @property {number} opcounters.insert - 插入操作数
         * @property {number} opcounters.query - 查询操作数
         * @property {number} opcounters.update - 更新操作数
         * @property {number} opcounters.delete - 删除操作数
         * @property {Object} network - 网络统计
         * @property {number} uptime - 运行时间（秒）
         * @example
         * const status = await db.serverStatus();
         * console.log('Current connections:', status.connections.current);
         * console.log('Memory usage:', status.mem.resident, 'MB');
         * console.log('Insert operations:', status.opcounters.insert);
         */
        async serverStatus(options = {}) {
            try {
                const admin = adapter.db.admin();
                const scale = options.scale || 1;

                const status = await admin.serverStatus({ scale });

                // 返回关键的状态信息
                return {
                    connections: {
                        current: status.connections?.current,
                        available: status.connections?.available,
                        totalCreated: status.connections?.totalCreated
                    },
                    mem: {
                        resident: status.mem?.resident,
                        virtual: status.mem?.virtual,
                        mapped: status.mem?.mapped
                    },
                    opcounters: {
                        insert: status.opcounters?.insert,
                        query: status.opcounters?.query,
                        update: status.opcounters?.update,
                        delete: status.opcounters?.delete,
                        getmore: status.opcounters?.getmore,
                        command: status.opcounters?.command
                    },
                    network: {
                        bytesIn: status.network?.bytesIn,
                        bytesOut: status.network?.bytesOut,
                        numRequests: status.network?.numRequests
                    },
                    uptime: status.uptime,
                    localTime: status.localTime,
                    version: status.version,
                    process: status.process
                };
            } catch (error) {
                logger.error('serverStatus failed', { error: error.message });
                throw createValidationError(
                    `Failed to get server status: ${error.message}`,
                    { code: 'SERVER_STATUS_ERROR' }
                );
            }
        },

        /**
         * 获取数据库统计信息
         * @param {Object} [options] - 选项
         * @param {number} [options.scale=1] - 缩放因子（1=字节, 1024=KB, 1048576=MB）
         * @returns {Promise<Object>} 数据库统计对象
         * @property {string} db - 数据库名称
         * @property {number} collections - 集合数量
         * @property {number} views - 视图数量
         * @property {number} objects - 文档总数
         * @property {number} avgObjSize - 平均文档大小
         * @property {number} dataSize - 数据大小
         * @property {number} storageSize - 存储大小
         * @property {number} indexes - 索引数量
         * @property {number} indexSize - 索引大小
         * @example
         * const stats = await db.stats();
         * console.log('Collections:', stats.collections);
         * console.log('Total documents:', stats.objects);
         * console.log('Data size:', stats.dataSize, 'bytes');
         * console.log('Index size:', stats.indexSize, 'bytes');
         *
         * // 使用 MB 为单位
         * const statsMB = await db.stats({ scale: 1048576 });
         * console.log('Data size:', statsMB.dataSize, 'MB');
         */
        async stats(options = {}) {
            try {
                const scale = options.scale || 1;
                const stats = await adapter.db.stats({ scale });

                return {
                    db: stats.db,
                    collections: stats.collections,
                    views: stats.views,
                    objects: stats.objects,
                    avgObjSize: stats.avgObjSize,
                    dataSize: stats.dataSize,
                    storageSize: stats.storageSize,
                    indexes: stats.indexes,
                    indexSize: stats.indexSize,
                    totalSize: stats.totalSize,
                    scaleFactor: stats.scaleFactor
                };
            } catch (error) {
                logger.error('Database stats failed', { error: error.message });
                throw createValidationError(
                    `Failed to get database stats: ${error.message}`,
                    { code: 'DATABASE_STATS_ERROR' }
                );
            }
        }
    };
}

module.exports = { createAdminOps };

