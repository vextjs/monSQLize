/**
 * 缓存锁管理器
 * 用于在事务执行期间锁定缓存键，防止脏数据写入缓存
 */

class CacheLockManager {
    constructor(options = {}) {
        this.locks = new Map(); // key -> { sessionId, expiresAt }
        this.maxDuration = options.maxDuration || 300000; // 5分钟默认
        this.lockCleanupInterval = options.lockCleanupInterval || 10000; // 10秒清理一次
        this.cleanupTimer = null;

        // 启动自动清理
        this._startCleanup();
    }

    /**
     * 添加缓存锁
     * @param {string} key - 缓存键（支持通配符 *）
     * @param {Object} session - MongoDB session 对象
     */
    addLock(key, session) {
        if (!session || !session.id) {
            return;
        }

        const sessionId = session.id.toString();
        const expiresAt = Date.now() + this.maxDuration;

        this.locks.set(key, {
            sessionId,
            expiresAt,
            lockedAt: Date.now()
        });
    }

    /**
     * 检查缓存键是否被锁定
     * @param {string} key - 缓存键
     * @returns {boolean}
     */
    isLocked(key) {
        // 精确匹配
        if (this.locks.has(key)) {
            const lock = this.locks.get(key);
            if (Date.now() < lock.expiresAt) {
                return true;
            }
            // 过期自动删除
            this.locks.delete(key);
        }

        // 通配符匹配
        for (const [lockKey, lock] of this.locks.entries()) {
            if (lockKey.includes('*')) {
                const pattern = lockKey.replace(/\*/g, '.*');
                const regex = new RegExp(`^${pattern}$`);
                if (regex.test(key)) {
                    if (Date.now() < lock.expiresAt) {
                        return true;
                    }
                    // 过期自动删除
                    this.locks.delete(lockKey);
                }
            }
        }

        return false;
    }

    /**
     * 释放指定 session 的所有锁
     * @param {Object} session - MongoDB session 对象
     */
    releaseLocks(session) {
        if (!session || !session.id) {
            return;
        }

        const sessionId = session.id.toString();
        const keysToDelete = [];

        for (const [key, lock] of this.locks.entries()) {
            if (lock.sessionId === sessionId) {
                keysToDelete.push(key);
            }
        }

        keysToDelete.forEach(key => this.locks.delete(key));
    }

    /**
     * 清理过期的锁
     * @private
     */
    _cleanupExpiredLocks() {
        const now = Date.now();
        const keysToDelete = [];

        for (const [key, lock] of this.locks.entries()) {
            if (now >= lock.expiresAt) {
                keysToDelete.push(key);
            }
        }

        if (keysToDelete.length > 0) {
            keysToDelete.forEach(key => this.locks.delete(key));
        }
    }

    /**
     * 启动自动清理定时器
     * @private
     */
    _startCleanup() {
        if (this.cleanupTimer) {
            return;
        }

        this.cleanupTimer = setInterval(() => {
            this._cleanupExpiredLocks();
        }, this.lockCleanupInterval);

        // 防止定时器阻止进程退出
        if (this.cleanupTimer.unref) {
            this.cleanupTimer.unref();
        }
    }

    /**
     * 停止自动清理
     */
    stop() {
        if (this.cleanupTimer) {
            clearInterval(this.cleanupTimer);
            this.cleanupTimer = null;
        }
    }

    /**
     * 获取当前锁的统计信息
     */
    getStats() {
        return {
            totalLocks: this.locks.size,
            activeLocks: Array.from(this.locks.values()).filter(
                lock => Date.now() < lock.expiresAt
            ).length
        };
    }

    /**
     * 清除所有锁（用于测试）
     */
    clear() {
        this.locks.clear();
    }
}

module.exports = CacheLockManager;

