/**
 * PoolStats - 连接池统计收集器
 *
 * 收集连接池的统计信息（连接数、响应时间、请求数等）
 * 🔴 修复问题6：使用异步批量更新提升性能
 *
 * @module lib/infrastructure/PoolStats
 * @since v1.0.8
 */

/**
 * 统计收集器
 */
class PoolStats {
    /**
     * 构造函数
     *
     * @param {Object} options - 配置选项
     * @param {Object} options.logger - 日志记录器
     */
    constructor(options = {}) {
        this._logger = options.logger || console;

        this._stats = new Map(); // Map<poolName, StatsData>
        this._buffer = [];       // 缓冲区（修复问题6）

        // 启动批量更新（每100ms）
        this._batchInterval = setInterval(() => {
            this._flush();
        }, 100);
    }

    /**
     * 记录选择事件
     *
     * @param {string} poolName - 连接池名称
     * @param {string} operation - 操作类型
     */
    recordSelection(poolName, operation) {
        this._buffer.push({
            poolName,
            type: 'selection',
            operation,
            timestamp: Date.now()
        });
    }

    /**
     * 记录查询（测试兼容方法）
     *
     * @param {string} poolName - 连接池名称
     * @param {number} responseTime - 响应时间（毫秒）
     * @param {Error|null} error - 错误对象
     */
    async recordQuery(poolName, responseTime, error) {
        this.recordRequest(poolName, responseTime, !error);
        // 立即刷新以确保测试能获取最新统计
        this._flush();
    }

    /**
     * 记录连接数（测试兼容方法）
     *
     * @param {string} poolName - 连接池名称
     * @param {number} count - 连接数
     */
    recordConnections(poolName, count) {
        let stats = this._stats.get(poolName);
        if (!stats) {
            stats = {
                connections: count,
                available: 0,
                waiting: 0,
                totalRequests: 0,
                successRequests: 0,
                failedRequests: 0,
                totalResponseTime: 0,
                avgResponseTime: 0,
                errorRate: 0
            };
            this._stats.set(poolName, stats);
        } else {
            stats.connections = count;
        }
    }

    /**
     * 记录请求完成
     *
     * @param {string} poolName - 连接池名称
     * @param {number} responseTime - 响应时间（毫秒）
     * @param {boolean} success - 是否成功
     */
    recordRequest(poolName, responseTime, success) {
        this._buffer.push({
            poolName,
            type: 'request',
            responseTime,
            success,
            timestamp: Date.now()
        });
    }

    /**
     * 批量更新统计（修复问题6）
     *
     * @private
     */
    _flush() {
        if (this._buffer.length === 0) {
            return;
        }

        // 取出缓冲区数据
        const batch = this._buffer.splice(0);

        // 批量更新
        for (const item of batch) {
            this._updateStats(item);
        }
    }

    /**
     * 更新统计
     *
     * @private
     */
    _updateStats(item) {
        const { poolName } = item;

        // 获取或创建统计对象
        let stats = this._stats.get(poolName);
        if (!stats) {
            stats = {
                connections: 0,
                available: 0,
                waiting: 0,
                totalRequests: 0,
                successRequests: 0,
                failedRequests: 0,
                totalResponseTime: 0,
                avgResponseTime: 0,
                errorRate: 0
            };
            this._stats.set(poolName, stats);
        }

        // 根据类型更新
        if (item.type === 'selection') {
            // 选择事件：暂时不需要更新
        } else if (item.type === 'request') {
            // 请求事件
            stats.totalRequests++;

            if (item.success) {
                stats.successRequests++;
            } else {
                stats.failedRequests++;
            }

            stats.totalResponseTime += item.responseTime;
            stats.avgResponseTime = stats.totalResponseTime / stats.totalRequests;
            stats.errorRate = stats.failedRequests / stats.totalRequests;
        }
    }

    /**
     * 获取连接池统计
     *
     * @param {string} poolName - 连接池名称
     * @returns {Object} 统计对象（总是返回，不存在则返回初始值）
     */
    getStats(poolName) {
        let stats = this._stats.get(poolName);
        if (!stats) {
            // 返回初��统计对象
            stats = {
                connections: 0,
                available: 0,
                waiting: 0,
                totalRequests: 0,
                successRequests: 0,
                failedRequests: 0,
                totalResponseTime: 0,
                avgResponseTime: 0,
                errorRate: 0
            };
        }
        return { ...stats }; // 返回副本
    }

    /**
     * 获取所有统计
     *
     * @returns {Object}
     */
    getAllStats() {
        const result = {};

        for (const [poolName, stats] of this._stats.entries()) {
            result[poolName] = { ...stats };
        }

        return result;
    }

    /**
     * 重置统计
     *
     * @param {string} [poolName] - 连接池名称（不传则重置所有）
     */
    reset(poolName) {
        if (poolName) {
            this._stats.delete(poolName);
        } else {
            this._stats.clear();
        }
    }

    /**
     * 重置所有统计
     */
    resetAll() {
        this._stats.clear();
        this._buffer = [];
    }

    /**
     * 关闭统计收集
     */
    close() {
        if (this._batchInterval) {
            clearInterval(this._batchInterval);
            this._batchInterval = null;
        }

        // 刷新剩余缓冲
        this._flush();
    }
}

module.exports = PoolStats;

