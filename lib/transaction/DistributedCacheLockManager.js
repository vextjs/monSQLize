/**
 * 分布式缓存锁管理器
 * 基于 Redis 实现跨实例的事务缓存锁，确保事务隔离性
 *
 * @example
 * const lockManager = new DistributedCacheLockManager({
 *   redis: redisInstance,
 *   lockKeyPrefix: 'monsqlize:cache:lock:'
 * });
 *
 * await lockManager.addLock('user:1', session);
 * const isLocked = await lockManager.isLocked('user:1');
 * await lockManager.releaseLocks(session);
 */

class DistributedCacheLockManager {
    /**
     * @param {Object} options
     * @param {Object} options.redis - ioredis 实例
     * @param {string} [options.lockKeyPrefix='monsqlize:cache:lock:'] - 锁键前缀
     * @param {number} [options.maxDuration=300000] - 锁最大持续时间（毫秒）
     * @param {Object} [options.logger] - 日志记录器
     */
    constructor(options = {}) {
        if (!options.redis) {
            throw new Error('DistributedCacheLockManager requires a Redis instance');
        }

        this.redis = options.redis;
        this.lockKeyPrefix = options.lockKeyPrefix || 'monsqlize:cache:lock:';
        this.maxDuration = options.maxDuration || 300000; // 5 分钟默认
        this.logger = options.logger;

        // 统计信息
        this.stats = {
            locksAcquired: 0,
            locksReleased: 0,
            lockChecks: 0,
            errors: 0
        };

        // 错误处理
        this.redis.on('error', (err) => {
            this.stats.errors++;
            if (this.logger) {
                this.logger.error('[DistributedCacheLockManager] Redis error:', err.message);
            }
        });
    }

    /**
     * 添加分布式缓存锁
     * @param {string} key - 缓存键（支持通配符 *）
     * @param {Object} session - MongoDB session 对象
     * @returns {Promise<boolean>} 是否成功获取锁
     */
    async addLock(key, session) {
        if (!session || !session.id) {
            if (this.logger) {
                this.logger.warn('[DistributedCacheLockManager] Invalid session, skip lock');
            }
            return false;
        }

        const lockKey = this.lockKeyPrefix + key;
        const sessionId = session.id.toString();
        const ttlSeconds = Math.ceil(this.maxDuration / 1000);

        try {
            // 使用 SET NX EX 原子操作获取锁
            const result = await this.redis.set(lockKey, sessionId, 'EX', ttlSeconds, 'NX');

            if (result === 'OK') {
                this.stats.locksAcquired++;
                if (this.logger) {
                    this.logger.debug(`[DistributedCacheLockManager] Lock acquired: ${key}`);
                }
                return true;
            }

            return false;
        } catch (error) {
            this.stats.errors++;
            if (this.logger) {
                this.logger.error('[DistributedCacheLockManager] Add lock error:', error.message);
            }
            return false;
        }
    }

    /**
     * 检查缓存键是否被锁定
     * @param {string} key - 缓存键
     * @returns {Promise<boolean>}
     */
    async isLocked(key) {
        this.stats.lockChecks++;

        try {
            // 1. 检查精确匹配
            const lockKey = this.lockKeyPrefix + key;
            const exists = await this.redis.exists(lockKey);
            if (exists) {
                return true;
            }

            // 2. 检查通配符匹配
            // 注意：KEYS 命令在大数据量下性能较差，这里使用 SCAN 会更好
            // 但为了简单起见，暂时使用 KEYS，生产环境建议优化
            const pattern = this.lockKeyPrefix + '*';
            const keys = await this.redis.keys(pattern);

            for (const foundKey of keys) {
                const lockPattern = foundKey.replace(this.lockKeyPrefix, '');

                // 检查是否是通配符模式
                if (lockPattern.includes('*')) {
                    const regex = this._patternToRegex(lockPattern);
                    if (regex.test(key)) {
                        return true;
                    }
                }
            }

            return false;
        } catch (error) {
            this.stats.errors++;
            if (this.logger) {
                this.logger.error('[DistributedCacheLockManager] Is locked check error:', error.message);
            }
            // 发生错误时保守处理：假设没有锁（允许操作继续）
            return false;
        }
    }

    /**
     * 释放指定 session 的所有锁
     * @param {Object} session - MongoDB session 对象
     * @returns {Promise<number>} 释放的锁数量
     */
    async releaseLocks(session) {
        if (!session || !session.id) {
            return 0;
        }

        const sessionId = session.id.toString();
        const pattern = this.lockKeyPrefix + '*';

        try {
            const keys = await this.redis.keys(pattern);

            if (keys.length === 0) {
                return 0;
            }

            // 使用 Lua 脚本批量删除（原子操作）
            // 只删除属于当前 session 的锁
            const luaScript = `
                local deletedCount = 0
                for i, key in ipairs(KEYS) do
                    local value = redis.call('GET', key)
                    if value == ARGV[1] then
                        redis.call('DEL', key)
                        deletedCount = deletedCount + 1
                    end
                end
                return deletedCount
            `;

            const deleted = await this.redis.eval(
                luaScript,
                keys.length,
                ...keys,
                sessionId
            );

            this.stats.locksReleased += deleted;

            if (this.logger && deleted > 0) {
                this.logger.debug(`[DistributedCacheLockManager] Released ${deleted} locks for session ${sessionId}`);
            }

            return deleted;
        } catch (error) {
            this.stats.errors++;
            if (this.logger) {
                this.logger.error('[DistributedCacheLockManager] Release locks error:', error.message);
            }
            return 0;
        }
    }

    /**
     * 清理所有过期锁（Redis TTL 会自动清理，此方法保留用于手动清理）
     * @returns {Promise<void>}
     */
    async cleanup() {
        // Redis TTL 会自动清理过期的键
        // 这里可以添加额外的清理逻辑，比如强制清理超时的锁
        if (this.logger) {
            this.logger.debug('[DistributedCacheLockManager] Cleanup called (Redis handles TTL automatically)');
        }
    }

    /**
     * 获取统计信息
     * @returns {Object}
     */
    getStats() {
        return {
            ...this.stats,
            lockKeyPrefix: this.lockKeyPrefix,
            maxDuration: this.maxDuration
        };
    }

    /**
     * 将通配符模式转换为正则表达式
     * @private
     */
    _patternToRegex(pattern) {
        const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const wildcarded = escaped.replace(/\\\*/g, '.*');
        return new RegExp(`^${wildcarded}$`);
    }

    /**
     * 停止（清理资源）
     * 注意：不关闭 Redis 连接，因为连接是外部传入的
     */
    stop() {
        if (this.logger) {
            this.logger.info('[DistributedCacheLockManager] Stopped');
        }
    }
}

module.exports = DistributedCacheLockManager;

