/**
 * 业务锁对象
 * 表示一个已获取的锁，提供释放和续期方法
 */
class Lock {
    /**
     * @param {string} key - 锁的标识
     * @param {string} lockId - 锁的唯一ID
     * @param {Object} manager - 锁管理器实例
     * @param {number} ttl - 锁的过期时间（毫秒）
     */
    constructor(key, lockId, manager, ttl) {
        this.key = key;
        this.lockId = lockId;
        this.manager = manager;
        this.ttl = ttl;
        this.released = false;
        this.acquiredAt = Date.now();
    }

    /**
     * 释放锁
     * @returns {Promise<boolean>}
     */
    async release() {
        if (this.released) {
            return false;
        }

        const result = await this.manager.releaseLock(this.key, this.lockId);
        this.released = true;
        return result;
    }

    /**
     * 续期（延长锁的过期时间）
     * @param {number} [ttl] - 新的过期时间，默认使用原TTL
     * @returns {Promise<boolean>}
     */
    async renew(ttl) {
        if (this.released) {
            return false;
        }

        return this.manager.renewLock(this.key, this.lockId, ttl || this.ttl);
    }

    /**
     * 检查锁是否仍被持有
     * @returns {boolean}
     */
    isHeld() {
        return !this.released;
    }

    /**
     * 获取锁持有时间
     * @returns {number} 毫秒
     */
    getHoldTime() {
        return Date.now() - this.acquiredAt;
    }
}

module.exports = Lock;


