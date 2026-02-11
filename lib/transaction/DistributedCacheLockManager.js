/**
 * 分布式缓存锁管理器
 * 基于 Redis 实现跨实例的事务缓存锁，确保事务隔离性
 *
 * v1.4.0 新增：业务级分布式锁支持
 * - withLock(): 自动管理锁生命周期
 * - acquireLock(): 手动获取锁（阻塞重试）
 * - tryAcquireLock(): 尝试获取锁（不阻塞）
 *
 * @example
 * // 事务缓存锁（原有功能）
 * await lockManager.addLock('user:1', session);
 * const isLocked = await lockManager.isLocked('user:1');
 * await lockManager.releaseLocks(session);
 *
 * // 业务锁（v1.4.0 新增）
 * await lockManager.withLock('inventory:SKU123', async () => {
 *   // 临界区代码
 * });
 */

const Lock = require('../lock/Lock');
const { LockAcquireError } = require('../lock/errors');

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

    // ==================== 业务锁 API (v1.4.0) ====================

    /**
     * 业务锁：自动管理锁生命周期（推荐）
     * @param {string} key - 锁的唯一标识
     * @param {Function} callback - 获取锁后执行的函数
     * @param {Object} [options] - 锁选项
     * @param {number} [options.ttl=10000] - 锁过期时间（毫秒）
     * @param {number} [options.retryTimes=3] - 重试次数
     * @param {number} [options.retryDelay=100] - 重试间隔（毫秒）
     * @param {boolean} [options.fallbackToNoLock=false] - Redis不可用时降级为无锁执行
     * @returns {Promise<*>} callback 的返回值
     */
    async withLock(key, callback, options = {}) {
        try {
            const lock = await this.acquireLock(key, options);
            try {
                return await callback();
            } finally {
                // 释放失败不应阻塞业务（锁会在 TTL 后自动过期）
                await lock.release().catch(err => {
                    if (this.logger) {
                        this.logger.warn(`[Lock] Release failed: ${key}`, err);
                    }
                });
            }
        } catch (error) {
            // Redis 连接问题检测
            if (this._isRedisConnectionError(error)) {
                if (options.fallbackToNoLock) {
                    if (this.logger) {
                        this.logger.warn(`[Lock] Redis unavailable, proceeding without lock: ${key}`);
                    }
                    return callback();
                }
                throw new LockAcquireError(`Redis unavailable: ${error.message}`);
            }
            throw error;
        }
    }

    /**
     * 业务锁：手动获取锁（阻塞重试）
     * @param {string} key - 锁的唯一标识
     * @param {Object} [options] - 锁选项
     * @returns {Promise<Lock>}
     */
    async acquireLock(key, options = {}) {
        const ttl = options.ttl || 10000; // 默认 10 秒
        const retryTimes = options.retryTimes ?? 3;
        const retryDelay = options.retryDelay || 100;
        const lockId = this._generateLockId();
        const fullKey = this.lockKeyPrefix + key;

        for (let attempt = 0; attempt <= retryTimes; attempt++) {
            try {
                // 使用 SET NX PX 原子操作（毫秒级 TTL）
                const result = await this.redis.set(
                    fullKey,
                    lockId,
                    'PX', ttl,  // PX = 毫秒
                    'NX'
                );

                if (result === 'OK') {
                    this.stats.locksAcquired++;
                    if (this.logger) {
                        this.logger.debug(`[Lock] Acquired: ${key}`);
                    }
                    return new Lock(key, lockId, this, ttl);
                }

                // 最后一次尝试失败
                if (attempt === retryTimes) {
                    break;
                }

                // 等待后重试
                await this._sleep(retryDelay);
            } catch (error) {
                // 如果是最后一次尝试，抛出错误
                if (attempt === retryTimes) {
                    throw error;
                }
                // 否则等待后重试
                await this._sleep(retryDelay);
            }
        }

        this.stats.errors++;
        throw new LockAcquireError(`Failed to acquire lock: ${key}`);
    }

    /**
     * 业务锁：尝试获取锁（不阻塞）
     * @param {string} key - 锁的唯一标识
     * @param {Object} [options] - 锁选项（不包含 retryTimes）
     * @returns {Promise<Lock|null>} Lock对象或null
     */
    async tryAcquireLock(key, options = {}) {
        const ttl = options.ttl || 10000;
        const lockId = this._generateLockId();
        const fullKey = this.lockKeyPrefix + key;

        try {
            const result = await this.redis.set(
                fullKey,
                lockId,
                'PX', ttl,
                'NX'
            );

            if (result === 'OK') {
                this.stats.locksAcquired++;
                if (this.logger) {
                    this.logger.debug(`[Lock] Acquired (try): ${key}`);
                }
                return new Lock(key, lockId, this, ttl);
            }

            return null;
        } catch (error) {
            if (this.logger) {
                this.logger.error(`[Lock] Try acquire error: ${key}`, error.message);
            }
            return null;
        }
    }

    /**
     * 释放单个锁（由 Lock 对象调用）
     * @param {string} key - 锁标识
     * @param {string} lockId - 锁ID
     * @returns {Promise<boolean>}
     */
    async releaseLock(key, lockId) {
        const fullKey = this.lockKeyPrefix + key;

        try {
            // 使用 Lua 脚本确保原子性（只释放自己的锁）
            const luaScript = `
                if redis.call("get", KEYS[1]) == ARGV[1] then
                    return redis.call("del", KEYS[1])
                else
                    return 0
                end
            `;

            const result = await this.redis.eval(luaScript, 1, fullKey, lockId);

            if (result === 1) {
                this.stats.locksReleased++;
                if (this.logger) {
                    this.logger.debug(`[Lock] Released: ${key}`);
                }
                return true;
            }

            return false;
        } catch (error) {
            this.stats.errors++;
            if (this.logger) {
                this.logger.error(`[Lock] Release error: ${key}`, error.message);
            }
            return false;
        }
    }

    /**
     * 续期（延长锁的过期时间）
     * @param {string} key - 锁标识
     * @param {string} lockId - 锁ID
     * @param {number} ttl - 新的过期时间（毫秒）
     * @returns {Promise<boolean>}
     */
    async renewLock(key, lockId, ttl) {
        const fullKey = this.lockKeyPrefix + key;

        try {
            // 使用 Lua 脚本确保只续期自己的锁
            const luaScript = `
                if redis.call("get", KEYS[1]) == ARGV[1] then
                    return redis.call("pexpire", KEYS[1], ARGV[2])
                else
                    return 0
                end
            `;

            const result = await this.redis.eval(luaScript, 1, fullKey, lockId, ttl);
            return result === 1;
        } catch (error) {
            if (this.logger) {
                this.logger.error(`[Lock] Renew error: ${key}`, error.message);
            }
            return false;
        }
    }

    /**
     * 生成唯一锁ID
     * @private
     */
    _generateLockId() {
        return `${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    }

    /**
     * 延迟
     * @private
     */
    _sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * 检测是否是 Redis 连接错误
     * @private
     */
    _isRedisConnectionError(error) {
        const msg = error.message || '';
        return msg.includes('ECONNREFUSED') ||
               msg.includes('ETIMEDOUT') ||
               msg.includes('ENOTFOUND') ||
               msg.includes('Connection is closed');
    }
}

module.exports = DistributedCacheLockManager;


