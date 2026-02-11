/**
 * 锁获取失败错误
 */
class LockAcquireError extends Error {
    constructor(message) {
        super(message);
        this.name = 'LockAcquireError';
        this.code = 'LOCK_ACQUIRE_FAILED';
    }
}

/**
 * 锁超时错误
 */
class LockTimeoutError extends Error {
    constructor(message) {
        super(message);
        this.name = 'LockTimeoutError';
        this.code = 'LOCK_TIMEOUT';
    }
}

module.exports = {
    LockAcquireError,
    LockTimeoutError
};


