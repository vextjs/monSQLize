/**
 * 业务锁模块导出
 */
const Lock = require('./Lock');
const { LockAcquireError, LockTimeoutError } = require('./errors');

module.exports = {
    Lock,
    LockAcquireError,
    LockTimeoutError
};

