/**
 * 事务管理器
 * 负责管理 MongoDB 事务的生命周期
 */

const Transaction = require('./Transaction');
const CacheLockManager = require('./CacheLockManager');

class TransactionManager {
    constructor(adapter, cache, logger, options = {}) {
        this.adapter = adapter;
        this.cache = cache;
        this.logger = logger;
        this.options = {
            maxRetries: options.maxRetries || 3,
            retryDelay: options.retryDelay || 100,
            retryBackoff: options.retryBackoff || 2,
            defaultTimeout: options.defaultTimeout || 30000,
            enableRetry: options.enableRetry !== false,
            ...options
        };
        this.activeTransactions = new Map();

        // ✨ 统计信息
        this.stats = {
            totalTransactions: 0,
            successfulTransactions: 0,
            failedTransactions: 0,
            readOnlyTransactions: 0,
            writeTransactions: 0,
            durations: []
        };
        this.maxStatsSamples = options.maxStatsSamples || 1000;

        // 使用传入的 lockManager 或创建新的
        if (options.lockManager) {
            this.lockManager = options.lockManager;
        } else {
            // 初始化缓存锁管理器
            this.lockManager = new CacheLockManager({
                logger: this.logger,
                maxDuration: options.lockMaxDuration || 300000,
                cleanupInterval: options.lockCleanupInterval || 10000
            });

            // 将锁管理器设置到缓存实例
            if (cache && typeof cache.setLockManager === 'function') {
                cache.setLockManager(this.lockManager);
            }
        }
    }

    /**
     * 创建一个新的事务会话
     * @param {Object} options - 会话选项
     * @returns {Promise<Transaction>}
     */
    async startSession(options = {}) {
        const session = this.adapter.client.startSession({
            causalConsistency: options.causalConsistency !== false,
            defaultTransactionOptions: {
                readConcern: options.readConcern,
                writeConcern: options.writeConcern,
                readPreference: options.readPreference
            }
        });

        const transaction = new Transaction(session, {
            cache: this.cache,
            logger: this.logger,
            lockManager: this.lockManager,
            timeout: options.timeout || this.options.defaultTimeout,
            ...options
        });

        this.activeTransactions.set(transaction.id, transaction);

        return transaction;
    }

    /**
     * 自动管理事务（推荐用法）
     * @param {Function} callback - 事务回调函数
     * @param {Object} options - 事务选项
     * @returns {Promise<any>}
     */
    async withTransaction(callback, options = {}) {
        const maxRetries = options.maxRetries !== undefined
            ? options.maxRetries
            : this.options.maxRetries;

        const enableRetry = options.enableRetry !== undefined
            ? options.enableRetry
            : this.options.enableRetry;

        const retryDelay = options.retryDelay || this.options.retryDelay;
        const retryBackoff = options.retryBackoff || this.options.retryBackoff;

        let attempt = 0;
        let lastError = null;

        while (attempt <= maxRetries) {
            const transaction = await this.startSession(options);
            const startTime = Date.now();

            try {
                await transaction.start();
                const result = await callback(transaction);
                await transaction.commit();

                // ✨ 记录统计信息（成功）
                const duration = Date.now() - startTime;
                this._recordStats(transaction, duration, true);

                return result;
            } catch (error) {
                lastError = error;

                // 回滚事务
                try {
                    await transaction.abort();
                } catch (abortError) {
                    // 忽略回滚错误
                }

                // ✨ 记录统计信息（失败）
                const duration = Date.now() - startTime;
                this._recordStats(transaction, duration, false);

                // 检查是否需要重试
                if (enableRetry &&
                    attempt < maxRetries &&
                    this._isTransientError(error)) {
                    attempt++;

                    // 计算延迟时间（指数退避）
                    const delay = retryDelay * Math.pow(retryBackoff, attempt - 1);

                    this.logger?.info(`[TransactionManager] Retrying transaction (attempt ${attempt}/${maxRetries}) after ${delay}ms due to transient error: ${error.message}`);

                    // 等待后重试
                    await new Promise(resolve => setTimeout(resolve, delay));

                    continue;
                }

                // 不重试，抛出错误
                throw error;
            } finally {
                await transaction.end();
                this.activeTransactions.delete(transaction.id);
            }
        }

        // 达到最大重试次数
        throw new Error(
            `Transaction failed after ${maxRetries} retries: ${lastError.message}`
        );
    }

    /**
     * 判断是否为瞬态错误（可重试）
     * @private
     */
    _isTransientError(error) {
        if (!error) return false;

        // MongoDB TransientTransactionError
        if (error.hasErrorLabel && error.hasErrorLabel('TransientTransactionError')) {
            return true;
        }

        // 写冲突错误码
        const transientErrorCodes = [
            112,  // WriteConflict
            117,  // ConflictingOperationInProgress
        ];

        return transientErrorCodes.includes(error.code);
    }

    /**
     * 获取所有活跃的事务
     */
    getActiveTransactions() {
        return Array.from(this.activeTransactions.values());
    }

    /**
     * 中止所有活跃的事务
     */
    async abortAll() {
        const transactions = this.getActiveTransactions();
        await Promise.all(transactions.map(tx => tx.abort().catch(() => {})));
    }

    /**
     * ✨ 记录统计信息
     * @param {Transaction} transaction - 事务实例
     * @param {number} duration - 持续时间（毫秒）
     * @param {boolean} success - 是否成功
     * @private
     */
    _recordStats(transaction, duration, success) {
        this.stats.totalTransactions++;

        if (success) {
            this.stats.successfulTransactions++;
        } else {
            this.stats.failedTransactions++;
        }

        // 记录只读/写入事务
        if (transaction.hasWriteOperation) {
            this.stats.writeTransactions++;
        } else {
            this.stats.readOnlyTransactions++;
        }

        // 记录持续时间（环形缓冲）
        this.stats.durations.push(duration);
        if (this.stats.durations.length > this.maxStatsSamples) {
            this.stats.durations.shift();
        }
    }

    /**
     * ✨ 获取统计信息
     * @returns {Object} 统计信息
     */
    getStats() {
        const { durations } = this.stats;

        // 计算统计值
        let avgDuration = 0;
        let p95Duration = 0;
        let p99Duration = 0;

        if (durations.length > 0) {
            avgDuration = durations.reduce((a, b) => a + b, 0) / durations.length;

            const sorted = [...durations].sort((a, b) => a - b);
            const p95Index = Math.floor(sorted.length * 0.95);
            const p99Index = Math.floor(sorted.length * 0.99);
            p95Duration = sorted[p95Index] || 0;
            p99Duration = sorted[p99Index] || 0;
        }

        return {
            ...this.stats,
            averageDuration: avgDuration,
            p95Duration,
            p99Duration,
            successRate: this.stats.totalTransactions > 0
                ? (this.stats.successfulTransactions / this.stats.totalTransactions * 100).toFixed(2) + '%'
                : '0%',
            readOnlyRatio: this.stats.totalTransactions > 0
                ? (this.stats.readOnlyTransactions / this.stats.totalTransactions * 100).toFixed(2) + '%'
                : '0%',
            sampleCount: durations.length
        };
    }
}

module.exports = TransactionManager;


