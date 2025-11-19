/**
 * 检查操作是否在事务中执行
 * @param {Object} options - 操作选项
 * @returns {boolean}
 */
function isInTransaction(options) {
    return !!(options && options.session && options.session.inTransaction && options.session.inTransaction());
}

/**
 * 从 session 中获取 Transaction 实例
 * @param {Object} session - MongoDB ClientSession
 * @returns {Transaction|null}
 */
function getTransactionFromSession(session) {
    if (!session) return null;
    return session.__monSQLizeTransaction || null;
}

module.exports = {
    isInTransaction,
    getTransactionFromSession
};

