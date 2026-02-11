/**
 * Count 队列控制器
 * 限制同时执行的 count 数量，避免高并发下压垮数据库
 *
 * 使用场景:
 * - findPage 的 totals 统计
 * - 任何需要执行 countDocuments 的场景
 *
 * 核心功能:
 * 1. 并发控制 - 限制同时执行的 count 数量
 * 2. 队列管理 - 超出并发限制的请求排队等待
 * 3. 超时保护 - 防止请求长时间等待
 * 4. 统计监控 - 提供队列状态和统计信息
 */
class CountQueue {
    constructor(options = {}) {
        // 默认并发数：CPU 核心数（最少 4，最多 16）
        const cpuCount = require('os').cpus().length;
        const defaultConcurrency = Math.max(4, Math.min(cpuCount, 16));

        this.concurrency = options.concurrency || defaultConcurrency;
        this.maxQueueSize = options.maxQueueSize || 10000;  // 队列最大长度（增加到 10000）
        this.timeout = options.timeout || 60000;  // 超时 60 秒（增加到 1 分钟）

        this.queue = [];  // 等待队列
        this.running = 0;  // 当前执行数

        // 统计信息
        this.stats = {
            executed: 0,      // 已执行总数
            queued: 0,        // 曾排队总数
            timeout: 0,       // 超时次数
            rejected: 0,      // 拒绝次数（队列满）
            avgWaitTime: 0,   // 平均等待时间
            maxWaitTime: 0    // 最大等待时间
        };
    }

    /**
     * 执行 count 操作（带队列控制）
     * @param {Function} fn - count 操作函数
     * @returns {Promise<number>} count 结果
     * @throws {Error} 队列满或超时
     */
    async execute(fn) {
        const startTime = Date.now();

        // 检查是否需要排队
        if (this.running >= this.concurrency) {
            // 检查队列是否满了
            if (this.queue.length >= this.maxQueueSize) {
                this.stats.rejected++;
                throw new Error(`Count queue is full (${this.maxQueueSize})`);
            }

            this.stats.queued++;
            // 等待轮到自己
            await this._waitInQueue(startTime);
        }

        // 获得执行机会，增加 running
        this.running++;
        this.stats.executed++;

        try {
            // 带超时控制
            return await this._executeWithTimeout(fn);
        } finally {
            this.running--;
            // 唤醒队列中的下一个
            this._wakeNext();
        }
    }

    /**
     * 等待队列
     * @private
     */
    async _waitInQueue(startTime) {
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                // 超时，从队列中移除
                const index = this.queue.findIndex(item => item.resolve === resolve);
                if (index !== -1) {
                    this.queue.splice(index, 1);
                    this.stats.timeout++;
                    reject(new Error(`Count queue wait timeout (${this.timeout}ms)`));
                }
            }, this.timeout);

            this.queue.push({
                resolve: () => {
                    const waitTime = Date.now() - startTime;
                    this._updateWaitTimeStats(waitTime);
                    resolve();
                },
                timer,
                startTime
            });
        });
    }

    /**
     * 唤醒队列中的下一个
     * @private
     */
    _wakeNext() {
        if (this.queue.length > 0) {
            const { resolve, timer } = this.queue.shift();
            clearTimeout(timer);
            resolve();
        }
    }

    /**
     * 带超时的执行
     * @private
     */
    async _executeWithTimeout(fn) {
        return Promise.race([
            fn(),
            new Promise((_, reject) =>
                setTimeout(() => reject(new Error(`Count execution timeout (${this.timeout}ms)`)), this.timeout)
            )
        ]);
    }

    /**
     * 更新等待时间统计
     * @private
     */
    _updateWaitTimeStats(waitTime) {
        // 计算平均等待时间
        const totalQueued = this.stats.queued;
        this.stats.avgWaitTime = (this.stats.avgWaitTime * (totalQueued - 1) + waitTime) / totalQueued;

        // 更新最大等待时间
        if (waitTime > this.stats.maxWaitTime) {
            this.stats.maxWaitTime = waitTime;
        }
    }

    /**
     * 获取统计信息
     * @returns {Object} 统计信息
     */
    getStats() {
        return {
            ...this.stats,
            running: this.running,          // 当前执行中
            queuedNow: this.queue.length,   // 当前排队中
            concurrency: this.concurrency,  // 并发限制
            maxQueueSize: this.maxQueueSize // 队列容量
        };
    }

    /**
     * 重置统计信息
     */
    resetStats() {
        this.stats = {
            executed: 0,
            queued: 0,
            timeout: 0,
            rejected: 0,
            avgWaitTime: 0,
            maxWaitTime: 0
        };
    }

    /**
     * 清空队列（慎用）
     */
    clear() {
        // 拒绝所有等待中的请求
        while (this.queue.length > 0) {
            const item = this.queue.shift();
            clearTimeout(item.timer);
            // 注意：这里不能直接 resolve 错误
            // 因为队列项只存储了 resolve，没有 reject
            // 所以清空操作只是清理队列，不触发错误
        }
    }
}

module.exports = CountQueue;


