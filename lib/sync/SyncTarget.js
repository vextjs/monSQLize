/**
 * SyncTarget - 备份目标
 *
 * 负责连接备份数据库并执行同步操作
 * 复用 ConnectionPoolManager 管理连接
 *
 * @module lib/sync/SyncTarget
 * @since v1.0.8
 */

/**
 * 同步目标类
 */
class SyncTarget {
    /**
     * 构造函数
     *
     * @param {Object} options - 配置选项
     * @param {string} options.name - 目标名称
     * @param {Object} options.poolManager - ConnectionPoolManager 实例
     * @param {Object} options.config - 目标配置
     * @param {string} options.config.uri - MongoDB URI
     * @param {Array} [options.config.collections] - 同步的集合列表
     * @param {Object} [options.config.healthCheck] - 健康检查配置
     * @param {Object} [options.logger] - 日志记录器
     */
    constructor(options) {
        this.name = options.name;
        this.poolManager = options.poolManager;
        this.config = options.config;
        this.logger = options.logger || console;

        this.client = null;
        this.db = null;
        this.collections = new Map();  // 缓存 collection 对象

        this.stats = {
            syncCount: 0,
            errorCount: 0,
            lastSyncTime: null,
            lastError: null
        };
    }

    /**
     * 连接备份数据库
     *
     * 复用 ConnectionPoolManager，将备份库添加为连接池
     *
     * @returns {Promise<void>}
     */
    async connect() {
        try {
            // 🔴 关键：将备份库添加到 ConnectionPoolManager
            await this.poolManager.addPool({
                name: this.name,
                uri: this.config.uri,
                role: 'backup',  // 标记为备份角色
                healthCheck: this.config.healthCheck || {
                    enabled: true,
                    interval: 30000,  // 30秒检查一次
                    timeout: 5000,
                    retries: 3
                }
            });

            // 获取连接
            const pool = this.poolManager.getPool(this.name);
            this.client = pool.client;
            this.db = this.client.db();

            this.logger.info('[SyncTarget] 备份库已连接', {
                name: this.name,
                uri: this._maskUri(this.config.uri)
            });

        } catch (error) {
            this.logger.error('[SyncTarget] 连接备份库失败', {
                name: this.name,
                error: error.message
            });
            throw error;
        }
    }

    /**
     * 应用同步操作
     *
     * @param {string} operationType - 操作类型 ('insert' | 'update' | 'replace' | 'delete')
     * @param {Object} document - 文档对象
     * @param {Object} documentKey - 文档键 { _id, ns }
     * @returns {Promise<void>}
     */
    async apply(operationType, document, documentKey) {
        const collectionName = documentKey?.ns?.coll || this.config.collection;

        if (!collectionName) {
            this.logger.warn('[SyncTarget] 无法确定集合名称', {
                target: this.name,
                documentKey
            });
            return;
        }

        const collection = this._getCollection(collectionName);

        try {
            switch (operationType) {
                case 'insert':
                    await collection.insertOne(document);
                    break;

                case 'update':
                case 'replace':
                    // 使用 replaceOne + upsert 确保数据一致
                    await collection.replaceOne(
                        { _id: documentKey._id },
                        document,
                        { upsert: true }
                    );
                    break;

                case 'delete':
                    await collection.deleteOne({ _id: documentKey._id });
                    break;

                default:
                    this.logger.warn('[SyncTarget] 未知操作类型', {
                        target: this.name,
                        operationType
                    });
                    return;
            }

            // 更新统计
            this.stats.syncCount++;
            this.stats.lastSyncTime = new Date();

            this.logger.debug('[SyncTarget] 同步成功', {
                target: this.name,
                operation: operationType,
                collection: collectionName,
                id: documentKey._id
            });

        } catch (error) {
            // 更新统计
            this.stats.errorCount++;
            this.stats.lastError = {
                time: new Date(),
                message: error.message,
                operation: operationType,
                collection: collectionName
            };

            this.logger.error('[SyncTarget] 同步失败', {
                target: this.name,
                operation: operationType,
                collection: collectionName,
                error: error.message,
                code: error.code
            });

            // 抛出错误，由 ChangeStreamSyncManager 处理
            throw error;
        }
    }

    /**
     * 获取 Collection 对象（带缓存）
     *
     * @private
     * @param {string} name - 集合名称
     * @returns {Object} MongoDB Collection 对象
     */
    _getCollection(name) {
        if (!this.collections.has(name)) {
            this.collections.set(name, this.db.collection(name));
        }
        return this.collections.get(name);
    }

    /**
     * 掩码 URI（隐藏密码）
     *
     * @private
     * @param {string} uri - MongoDB URI
     * @returns {string} 掩码后的 URI
     */
    _maskUri(uri) {
        try {
            return uri.replace(/:([^:@]+)@/, ':***@');
        } catch (error) {
            return uri;
        }
    }

    /**
     * 获取统计信息
     *
     * @returns {Object} 统计信息
     */
    getStats() {
        return {
            name: this.name,
            syncCount: this.stats.syncCount,
            errorCount: this.stats.errorCount,
            lastSyncTime: this.stats.lastSyncTime,
            lastError: this.stats.lastError,
            successRate: this.stats.syncCount > 0
                ? ((this.stats.syncCount - this.stats.errorCount) / this.stats.syncCount * 100).toFixed(2) + '%'
                : '0%'
        };
    }

    /**
     * 关闭连接
     *
     * @returns {Promise<void>}
     */
    async close() {
        try {
            if (this.poolManager && this.name) {
                await this.poolManager.removePool(this.name);
                this.logger.info('[SyncTarget] 备份库连接已关闭', {
                    name: this.name
                });
            }
        } catch (error) {
            this.logger.warn('[SyncTarget] 关闭连接失败', {
                name: this.name,
                error: error.message
            });
        }
    }
}

module.exports = SyncTarget;


