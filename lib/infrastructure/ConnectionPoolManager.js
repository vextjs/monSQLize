/**
 * ConnectionPoolManager - 多连接池管理器
 *
 * 负责管理多个 MongoDB 连接池的生命周期
 * 支持动态添加/移除连接池、健康检查、统计监控
 *
 * @module lib/infrastructure/ConnectionPoolManager
 * @since v1.0.8
 */

const AsyncLock = require('async-lock');
const { MongoClient } = require('mongodb');
const PoolSelector = require('./PoolSelector');
const HealthChecker = require('./HealthChecker');
const PoolStats = require('./PoolStats');
const { validatePoolConfig } = require('./PoolConfig');

/**
 * 默认连接池配置
 */
const DEFAULT_POOL_CONFIG = {
    maxPoolSize: 100,
    minPoolSize: 0,
    maxIdleTimeMS: 60000,
    waitQueueTimeoutMS: 30000,
    connectTimeoutMS: 10000,
    serverSelectionTimeoutMS: 30000
};

/**
 * 默认健康检查配置
 */
const DEFAULT_HEALTH_CHECK = {
    enabled: true,
    interval: 5000,
    timeout: 3000,
    retries: 3
};

/**
 * 多连接池管理器
 */
class ConnectionPoolManager {
    /**
     * 构造函数
     *
     * @param {Object} options - 配置选项
     * @param {Array<PoolConfig>} options.pools - 连接池配置数组
     * @param {string} options.poolStrategy - 选择策略
     * @param {Object} options.poolFallback - 故障转移配置
     * @param {Object} options.logger - 日志记录器
     */
    constructor(options = {}) {
        this._pools = new Map();           // 连接池 Map<name, {client, config}>
        this._configs = new Map();         // 配置 Map<name, PoolConfig>
        this._poolLock = new AsyncLock();  // 并发锁（修复问题2）
        this._logger = options.logger || console;

        // 初始化选择器
        this._selector = new PoolSelector({
            strategy: options.poolStrategy || 'auto',
            logger: this._logger
        });

        // 初始化健康检查器
        this._healthChecker = new HealthChecker({
            poolManager: this,
            logger: this._logger
        });

        // 初始化统计收集器
        this._stats = new PoolStats({
            logger: this._logger
        });

        // 故障转移配置（修复问题1）
        this._fallbackConfig = {
            enabled: options.poolFallback?.enabled || false,
            retryDelay: options.poolFallback?.retryDelay || 1000,
            maxRetries: options.poolFallback?.maxRetries || 3,
            fallbackStrategy: options.poolFallback?.fallbackStrategy || 'error'
        };

        // 连接池数量上限（修复问题5）
        this._maxPoolsCount = options.maxPoolsCount || 10;

        this._closed = false;
    }

    /**
     * 添加连接池
     *
     * @param {PoolConfig} config - 连接池配置
     * @returns {Promise<void>}
     * @throws {Error} 如果配置无效或连接失败
     */
    async addPool(config) {
        // 🔴 修复问题2：使用并发锁保护
        return await this._poolLock.acquire('pools', async () => {
            // 验证配置
            validatePoolConfig(config);

            // 检查是否已存在
            if (this._pools.has(config.name)) {
                throw new Error(`Pool '${config.name}' already exists`);
            }

            // 检查连接池数量上限（修复问题5）
            if (this._pools.size >= this._maxPoolsCount) {
                throw new Error(`Maximum pool count (${this._maxPoolsCount}) reached`);
            }

            // 合并配置
            const poolOptions = {
                ...DEFAULT_POOL_CONFIG,
                ...config.options,
                // 🔴 修复问题7：根据角色设置 readPreference
                readPreference: config.role === 'secondary' ? 'secondary' : 'primary'
            };

            try {
                // 连接 MongoDB
                const client = await MongoClient.connect(config.uri, poolOptions);

                // 保存连接池
                this._pools.set(config.name, { client, config });
                this._configs.set(config.name, config);

                // 启动健康检查
                const healthCheckConfig = {
                    ...DEFAULT_HEALTH_CHECK,
                    ...config.healthCheck
                };
                if (healthCheckConfig.enabled) {
                    this._healthChecker.register(config.name, healthCheckConfig);
                }

                this._logger.info(`[PoolManager] 连接池已添加: ${config.name}`, {
                    role: config.role,
                    uri: this._maskUri(config.uri)
                });
            } catch (error) {
                this._logger.error(`[PoolManager] 连接池添加失败: ${config.name}`, {
                    error: error.message
                });
                throw error;
            }
        });
    }

    /**
     * 移除连接池
     *
     * @param {string} name - 连接池名称
     * @returns {Promise<void>}
     * @throws {Error} 如果连接池不存在
     */
    async removePool(name) {
        // 🔴 修复问题2：使用并发锁保护
        return await this._poolLock.acquire('pools', async () => {
            const pool = this._pools.get(name);
            if (!pool) {
                throw new Error(`Pool '${name}' not found`);
            }

            try {
                // 停止健康检查
                this._healthChecker.unregister(name);

                // 关闭连接
                await pool.client.close();

                // 删除连接池
                this._pools.delete(name);
                this._configs.delete(name);

                this._logger.info(`[PoolManager] 连接池已移除: ${name}`);
            } catch (error) {
                this._logger.error(`[PoolManager] 连接池移除失败: ${name}`, {
                    error: error.message
                });
                throw error;
            }
        });
    }

    /**
     * 获取连接池（内部方法）
     *
     * @private
     * @param {string} name - 连接池名称
     * @returns {MongoClient|null}
     */
    _getPool(name) {
        const pool = this._pools.get(name);
        return pool ? pool.client : null;
    }

    /**
     * 选择连接池
     *
     * @param {string} operation - 操作类型 ('read' | 'write')
     * @param {Object} options - 选项
     * @param {string} [options.pool] - 手动指定连接池名称
     * @param {Object} [options.poolPreference] - 连接池偏好
      * @returns {{name: string, client: MongoClient, db: Db, collection: Function}}
     * @throws {Error} 如果无可用连接池
     */
    selectPool(operation, options = {}) {
        // 手动指定连接池
        if (options.pool) {
            const poolData = this._pools.get(options.pool);
            if (!poolData) {
                throw new Error(`Pool '${options.pool}' not found`);
            }
            const config = this._configs.get(options.pool);
            return this._createPoolResult(options.pool, poolData.client, config);
        }

        // 获取健康的连接池列表
        let candidates = this._getHealthyPools();

        // 🔴 修复问题1：处理所有连接池故障的情况
        if (candidates.length === 0) {
            if (!this._fallbackConfig.enabled) {
                throw new Error('No available connection pool');
            }

            candidates = this._handleAllPoolsDown(operation);

            if (candidates.length === 0) {
                throw new Error('No available connection pool (all pools down)');
            }
        }

        // 使用选择器选择连接池
        const poolName = this._selector.select(candidates, {
            operation,
            healthStatus: this._healthChecker.getAllStatus(),
            stats: this._stats.getAllStats(),
            ...options
        });

        const poolData = this._pools.get(poolName);
        if (!poolData) {
            throw new Error(`Selected pool '${poolName}' not available`);
        }

        // 记录统计
        this._stats.recordSelection(poolName, operation);

        const config = this._configs.get(poolName);
        return this._createPoolResult(poolName, poolData.client, config);
    }

    /**
     * 创建连接池结果对象（包含 db 和 collection 访问器）
     *
     * @private
     * @param {string} name - 连接池名称
     * @param {MongoClient} client - MongoDB 客户端
     * @param {Object} config - 连接池配置
     * @returns {{name: string, client: MongoClient, db: Db, collection: Function}}
     */
    _createPoolResult(name, client, config) {
        // 从 URI 中提取数据库名称
        let dbName;
        try {
            const url = new URL(config.uri);
            dbName = url.pathname.slice(1) || 'test';
        } catch (err) {
            dbName = 'test';
        }

        const db = client.db(dbName);

        return {
            name,
            client,
            db,
            collection: (collectionName) => db.collection(collectionName)
        };
    }

    /**
     * 获取健康的连接池列表
     *
     * @private
     * @returns {Array<PoolConfig>}
     */
    _getHealthyPools() {
        const healthyPools = [];

        for (const [name, config] of this._configs.entries()) {
            const status = this._healthChecker.getStatus(name);
            if (status?.status === 'up' || !status) {
                healthyPools.push(config);
            }
        }

        return healthyPools;
    }

    /**
     * 处理所有连接池故障的情况（降级策略）
     *
     * @private
     * @param {string} operation - 操作类型
     * @returns {Array<PoolConfig>}
     */
    _handleAllPoolsDown(operation) {
        const strategy = this._fallbackConfig.fallbackStrategy;

        this._logger.warn(`[PoolManager] 所有连接池故障，使用降级策略: ${strategy}`);

        if (strategy === 'error') {
            return [];
        }

        if (strategy === 'readonly') {
            // 只允许读操作
            if (operation === 'write') {
                this._logger.error('[PoolManager] 写操作被拒绝（所有连接池故障）');
                return [];
            }
            // 尝试使用 down 状态的 secondary
            return this._getPoolsByRole('secondary');
        }

        if (strategy === 'secondary') {
            // 尝试使用 down 状态的 secondary
            return this._getPoolsByRole('secondary');
        }

        return [];
    }

    /**
     * 按角色获取连接池
     *
     * @private
     * @param {string} role - 角色
     * @returns {Array<PoolConfig>}
     */
    _getPoolsByRole(role) {
        const pools = [];

        for (const config of this._configs.values()) {
            if (config.role === role) {
                pools.push(config);
            }
        }

        return pools;
    }

    /**
     * 获取所有连接池名称
     *
     * @returns {string[]}
     */
    getPoolNames() {
        return Array.from(this._pools.keys());
    }

    /**
     * 获取连接池统计信息
     *
     * @returns {Object}
     */
    getPoolStats() {
        const stats = {};

        for (const name of this._pools.keys()) {
            const healthStatus = this._healthChecker.getStatus(name);
            const poolStats = this._stats.getStats(name);

            stats[name] = {
                connections: poolStats?.connections || 0,
                available: poolStats?.available || 0,
                waiting: poolStats?.waiting || 0,
                status: healthStatus?.status || 'unknown',
                avgResponseTime: poolStats?.avgResponseTime || 0,
                totalRequests: poolStats?.totalRequests || 0,
                errorRate: poolStats?.errorRate || 0
            };
        }

        return stats;
    }

    /**
     * 获取健康状态
     *
     * @returns {Map<string, HealthStatus>}
     */
    getPoolHealth() {
        return this._healthChecker.getAllStatus();
    }

    /**
     * 启动健康检查
     */
    startHealthCheck() {
        this._healthChecker.start();
    }

    /**
     * 停止健康检查
     */
    stopHealthCheck() {
        this._healthChecker.stop();
    }

    /**
     * 关闭所有连接池
     *
     * @returns {Promise<void>}
     */
    async close() {
        if (this._closed) {
            return;
        }

        this._closed = true;

        // 停止健康检查
        this.stopHealthCheck();

        // 关闭所有连接池
        const closePromises = [];
        for (const [name, pool] of this._pools.entries()) {
            closePromises.push(
                pool.client.close().catch(error => {
                    this._logger.error(`[PoolManager] 关闭连接池失败: ${name}`, {
                        error: error.message
                    });
                })
            );
        }

        await Promise.all(closePromises);

        this._pools.clear();
        this._configs.clear();

        this._logger.info('[PoolManager] 所有连接池已关闭');
    }

    /**
     * 脱敏 URI（移除密码）
     *
     * @private
     * @param {string} uri - MongoDB URI
     * @returns {string}
     */
    _maskUri(uri) {
        return uri.replace(/:([^:@]+)@/, ':****@');
    }
}

module.exports = ConnectionPoolManager;

