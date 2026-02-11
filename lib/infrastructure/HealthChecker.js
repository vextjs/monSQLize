/**
 * HealthChecker - 连接池健康检查器
 *
 * 定期检查连接池健康状态，自动标记 up/down
 * 支持故障检测和自动恢复
 *
 * @module lib/infrastructure/HealthChecker
 * @since v1.0.8
 */

/**
 * 健康状态
 * @typedef {Object} HealthStatus
 * @property {'up'|'down'|'checking'} status - 状态
 * @property {Date} lastCheck - 最后检查时间
 * @property {Error} [lastError] - 最后错误
 * @property {number} consecutiveFailures - 连续失败次数
 */

/**
 * 健康检查器
 */
class HealthChecker {
    /**
     * 构造函数
     *
     * @param {Object} options - 配置选项
     * @param {ConnectionPoolManager} options.poolManager - 连接池管理器
     * @param {Object} options.logger - 日志记录器
     */
    constructor(options = {}) {
        this._poolManager = options.poolManager;
        this._logger = options.logger || console;

        this._healthStatus = new Map(); // Map<poolName, HealthStatus>
        this._checkConfigs = new Map(); // Map<poolName, CheckConfig>
        this._intervals = new Map();    // Map<poolName, NodeJS.Timeout>

        this._started = false;
    }

    /**
     * 注册连接池
     *
     * @param {string} poolName - 连接池名称
     * @param {Object} config - 健康检查配置
     */
    register(poolName, config) {
        this._checkConfigs.set(poolName, config);

        // 初始化健康状态
        this._healthStatus.set(poolName, {
            status: 'up',
            lastCheck: new Date(),
            consecutiveFailures: 0
        });

        // 如果已启动，立即开始检查
        if (this._started) {
            this._startCheckForPool(poolName, config);
        }
    }

    /**
     * 注销连接池
     *
     * @param {string} poolName - 连接池名称
     */
    unregister(poolName) {
        // 停止检查
        this._stopCheckForPool(poolName);

        // 删除状态和配置
        this._healthStatus.delete(poolName);
        this._checkConfigs.delete(poolName);
    }

    /**
     * 启动所有健康检查
     */
    start() {
        if (this._started) {
            return;
        }

        this._started = true;

        // 为所有已注册的连接池启动检查
        for (const [poolName, config] of this._checkConfigs.entries()) {
            this._startCheckForPool(poolName, config);
        }

        this._logger.info('[HealthChecker] 健康检查已启动');
    }

    /**
     * 停止所有健康检查
     */
    stop() {
        if (!this._started) {
            return;
        }

        this._started = false;

        // 停止所有检查
        for (const poolName of this._intervals.keys()) {
            this._stopCheckForPool(poolName);
        }

        this._logger.info('[HealthChecker] 健康检查已停止');
    }

    /**
     * 为单个连接池启动检查
     *
     * @private
     */
    _startCheckForPool(poolName, config) {
        // 清除现有定时器
        this._stopCheckForPool(poolName);

        // 创建新定时器
        const interval = setInterval(async () => {
            await this._checkPool(poolName, config);
        }, config.interval);

        this._intervals.set(poolName, interval);

        // 立即执行一次检查
        setImmediate(async () => {
            await this._checkPool(poolName, config);
        });
    }

    /**
     * 为单个连接池停止检查
     *
     * @private
     */
    _stopCheckForPool(poolName) {
        const interval = this._intervals.get(poolName);
        if (interval) {
            clearInterval(interval);
            this._intervals.delete(poolName);
        }
    }

    /**
     * 检查单个连接池
     *
     * @private
     */
    async _checkPool(poolName, config) {
        const status = this._healthStatus.get(poolName);
        if (!status) {
            return;
        }

        // 更新状态为检查中
        status.status = 'checking';
        status.lastCheck = new Date();

        const retries = config.retries || 3;
        let success = false;
        let lastError = null;

        // 重试机制
        for (let attempt = 0; attempt < retries; attempt++) {
            try {
                const isHealthy = await this._pingPool(poolName, config.timeout);
                if (isHealthy) {
                    success = true;
                    break;
                }
            } catch (error) {
                lastError = error;
            }

            // 等待后重试
            if (attempt < retries - 1) {
                await this._sleep(1000);
            }
        }

        if (success) {
            // 健康检查成功
            const wasDown = status.status === 'down';

            status.status = 'up';
            status.consecutiveFailures = 0;
            delete status.lastError;

            if (wasDown) {
                this._logger.info(`[HealthChecker] 连接池已恢复: ${poolName}`);
                // TODO: 触发 onPoolUp 事件
            }
        } else {
            // 健康检查失败
            status.consecutiveFailures++;
            status.lastError = lastError;

            // 连续失败达到阈值，标记为 down
            if (status.consecutiveFailures >= retries) {
                const wasUp = status.status === 'up';

                status.status = 'down';

                if (wasUp) {
                    this._logger.warn(`[HealthChecker] 连接池已故障: ${poolName}`, {
                        consecutiveFailures: status.consecutiveFailures,
                        error: lastError?.message
                    });
                    // TODO: 触发 onPoolDown 事件
                }
            }
        }
    }

    /**
     * Ping 连接池
     *
     * @private
     * @param {string} poolName - 连接池名称
     * @param {number} timeout - 超时时间
     * @returns {Promise<boolean>}
     */
    async _pingPool(poolName, timeout) {
        const client = this._poolManager._getPool(poolName);
        if (!client) {
            return false;
        }

        try {
            // 使用 Promise.race 实现超时
            const pingPromise = client.db('admin').command({ ping: 1 });
            const timeoutPromise = new Promise((_, reject) => {
                setTimeout(() => reject(new Error('Ping timeout')), timeout);
            });

            await Promise.race([pingPromise, timeoutPromise]);
            return true;
        } catch (error) {
            return false;
        }
    }

    /**
     * 获取连接池健康状态
     *
     * @param {string} poolName - 连接池名称
     * @returns {HealthStatus|null}
     */
    getStatus(poolName) {
        return this._healthStatus.get(poolName) || null;
    }

    /**
     * 获取所有健康状态
     *
     * @returns {Map<string, HealthStatus>}
     */
    getAllStatus() {
        return new Map(this._healthStatus);
    }

    /**
     * 睡眠
     *
     * @private
     * @param {number} ms - 毫秒
     * @returns {Promise<void>}
     */
    _sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

module.exports = HealthChecker;


