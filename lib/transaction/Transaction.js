/**
 * Transaction 类
 * 表示一个 MongoDB 事务
 */

class Transaction {
    constructor(session, options = {}) {
        this.session = session;
        this.id = `tx_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        this.state = 'pending';
        this.cache = options.cache;
        this.logger = options.logger;
        this.timeout = options.timeout || 30000;
        this.startTime = null;
        this.timeoutTimer = null;

        // 记录待失效的缓存（事务提交后才失效）
        this.pendingInvalidations = new Set();

        // 缓存锁管理器
        this.lockManager = options.lockManager;
        this.lockedKeys = new Set();

        // ✨ 只读优化：追踪事务是否有写操作
        this.hasWriteOperation = false;
        this.operationCount = { read: 0, write: 0 };

        // 关键：将 Transaction 实例存储到 session 的自定义属性
        // 这样写操作可以通过 session.__monSQLizeTransaction 访问到 Transaction 实例
        if (session) {
            session.__monSQLizeTransaction = this;
        }
    }

    /**
     * 开始事务
     */
    async start() {
        if (this.state !== 'pending') {
            throw new Error(`Cannot start transaction in state: ${this.state}`);
        }

        this.session.startTransaction();
        this.state = 'active';
        this.startTime = Date.now();

        // 设置超时自动中止
        if (this.timeout > 0) {
            this.timeoutTimer = setTimeout(() => {
                if (this.state === 'active') {
                    this.logger?.warn(`[Transaction] Timeout after ${this.timeout}ms, auto-aborting transaction ${this.id}`);
                    this.abort().catch(() => {});
                }
            }, this.timeout);
        }

        this.logger?.debug(`[Transaction] Started transaction ${this.id}`);
    }

    /**
     * 提交事务
     * 注意：缓存已在 recordInvalidation() 中失效，这里只释放锁
     */
    async commit() {
        if (this.state !== 'active') {
            throw new Error(`Cannot commit transaction in ${this.state} state`);
        }

        try {
            // 1. 提交事务
            await this.session.commitTransaction();
            this.state = 'committed';

            // 2. 释放缓存锁（允许重新缓存）
            // 注意：缓存已在写操作时失效，这里不再失效
            this._releaseLocks();

            this.logger?.debug(`[Transaction] Committed transaction ${this.id}`);
        } finally {
            this._clearTimeout();
            this.pendingInvalidations.clear();
        }
    }

    /**
     * 回滚事务
     * 注意：
     * - 缓存已在写操作时失效
     * - 但数据实际未改变（事务回滚）
     * - 释放锁后，下次查询会从数据库读取并重新缓存（正确的旧值）
     */
    async abort() {
        if (this.state !== 'active' && this.state !== 'pending') {
            return; // 已经结束或中止
        }

        try {
            await this.session.abortTransaction();
            this.state = 'aborted';
            this.logger?.debug(`[Transaction] Aborted transaction ${this.id}`);
        } finally {
            this._clearTimeout();
            // 释放缓存锁（允许重新缓存）
            // 注意：缓存已在写时失效，不在这里失效
            this._releaseLocks();
            this.pendingInvalidations.clear();
        }
    }

    /**
     * 结束会话
     */
    async end() {
        await this.session.endSession();
        this._clearTimeout();
        this._releaseLocks();
        this.logger?.debug(`[Transaction] Ended session for transaction ${this.id}`);
    }

    /**
     * 记录待失效的缓存
     * 写操作应该调用此方法，立即失效缓存并添加锁
     * @param {string} cachePattern - 缓存键模式（支持通配符）
     * @param {Object} metadata - 操作元数据
     * @param {string} metadata.operation - 操作类型：'read' | 'write'
     * @param {Object} metadata.query - 查询条件（用于文档级别锁）
     * @param {string} metadata.collection - 集合名称
     * @param {boolean} metadata.useDocumentLock - 是否启用文档级别锁（默认：true）
     */
    async recordInvalidation(cachePattern, metadata = {}) {
        if (this.state === 'active') {
            const {
                operation = 'write',
                query = {},
                collection = '',
                useDocumentLock = true
            } = metadata;

            // ✨ 追踪操作类型
            if (operation === 'read') {
                this.operationCount.read++;
            } else {
                this.operationCount.write++;
                this.hasWriteOperation = true;
            }

            // ✨ 只读优化：只读操作不失效缓存
            if (operation === 'read') {
                // 只添加缓存锁，不失效缓存
                if (this.lockManager) {
                    this.lockManager.addLock(cachePattern, this.session);
                    this.lockedKeys.add(cachePattern);
                    this.logger?.debug(`[Transaction] Added cache lock (read-only): ${cachePattern}`);
                }
                this.pendingInvalidations.add(cachePattern);
                return;
            }

            // 🚀 文档级别锁：尝试提取文档键
            let lockPatterns = [cachePattern];
            let usedDocumentLock = false;

            if (useDocumentLock && collection && query) {
                const docKeys = this._extractDocumentKeys(query);

                // 如果成功提取文档键，且数量合理（<100个）
                if (docKeys.length > 0 && docKeys.length < 100) {
                    lockPatterns = docKeys.map(key =>
                        this._buildDocumentLockPattern(collection, key)
                    );
                    usedDocumentLock = true;
                    this.logger?.debug(`[Transaction] Using document-level locks for ${docKeys.length} documents`);
                } else if (docKeys.length >= 100) {
                    // 文档太多，回退到集合级别
                    lockPatterns = [this._buildCollectionLockPattern(collection)];
                    this.logger?.debug(`[Transaction] Too many documents (${docKeys.length}), falling back to collection-level lock`);
                } else {
                    // 无法提取文档键，使用传入的模式（通常是集合级别）
                    this.logger?.debug(`[Transaction] Cannot extract document keys, using pattern: ${cachePattern}`);
                }
            }

            // 步骤 1: 立即失效缓存（写时无效化）
            if (this.cache) {
                try {
                    let totalDeleted = 0;
                    for (const pattern of lockPatterns) {
                        const deleted = await this.cache.delPattern(pattern);
                        totalDeleted += deleted;
                    }
                    this.logger?.debug(`[Transaction] Immediately invalidated ${totalDeleted} cache keys (${usedDocumentLock ? 'document-level' : 'collection-level'})`);
                } catch (err) {
                    this.logger?.warn(`[Transaction] Failed to invalidate cache: ${err.message}`);
                }
            }

            // 步骤 2: 添加缓存锁
            if (this.lockManager) {
                for (const pattern of lockPatterns) {
                    this.lockManager.addLock(pattern, this.session);
                    this.lockedKeys.add(pattern);
                }
                this.logger?.debug(`[Transaction] Added ${lockPatterns.length} cache lock(s)`);
            }

            // 步骤 3: 记录到待处理列表
            lockPatterns.forEach(p => this.pendingInvalidations.add(p));
        }
    }

    /**
     * 释放所有缓存锁
     * @private
     */
    _releaseLocks() {
        if (this.lockManager && this.session) {
            this.lockManager.releaseLocks(this.session);
            this.lockedKeys.clear();
            this.logger?.debug('[Transaction] Released all cache locks');
        }
    }

    /**
     * 清除超时定时器
     * @private
     */
    _clearTimeout() {
        if (this.timeoutTimer) {
            clearTimeout(this.timeoutTimer);
            this.timeoutTimer = null;
        }
    }

    /**
     * 获取事务持续时间
     */
    getDuration() {
        if (!this.startTime) return 0;
        return Date.now() - this.startTime;
    }

    /**
     * 🚀 文档级别锁：提取查询中的文档键
     * @param {Object} query - MongoDB 查询条件
     * @returns {Array} 文档键数组
     * @private
     */
    _extractDocumentKeys(query) {
        if (!query || typeof query !== 'object') {
            return [];
        }

        const keys = [];

        // 1. 简单的 _id 查询
        if (query._id !== undefined && query._id !== null) {
            if (Array.isArray(query._id)) {
                // { _id: [1, 2, 3] }
                keys.push(...query._id.map(id => String(id)));
            } else if (query._id.$in && Array.isArray(query._id.$in)) {
                // { _id: { $in: [1, 2, 3] } }
                keys.push(...query._id.$in.map(id => String(id)));
            } else if (typeof query._id === 'object' && query._id.constructor.name === 'ObjectId') {
                // { _id: ObjectId("...") }
                keys.push(String(query._id));
            } else if (typeof query._id !== 'object' || query._id === null) {
                // { _id: 1 } 或 { _id: "xxx" }
                keys.push(String(query._id));
            }
        }

        return keys;
    }

    /**
     * 🚀 文档级别锁：构建文档级别的缓存模式
     * @param {string} collection - 集合名称
     * @param {string} docKey - 文档键
     * @returns {string} 文档级别缓存模式
     * @private
     */
    _buildDocumentLockPattern(collection, docKey) {
        // 格式: *"collection":"collectionName"*"base":{"_id":"docKey"}*
        return `*"collection":"${collection}"*"base":{"_id":"${docKey}"}*`;
    }

    /**
     * 🚀 文档级别锁：构建集合级别的缓存模式（回退）
     * @param {string} collection - 集合名称
     * @returns {string} 集合级别缓存模式
     * @private
     */
    _buildCollectionLockPattern(collection) {
        // 格式: *"collection":"collectionName"*
        return `*"collection":"${collection}"*`;
    }

    /**
     * 🚀 获取事务统计信息
     * @returns {Object} 统计信息
     */
    getStats() {
        return {
            id: this.id,
            state: this.state,
            duration: this.getDuration(),
            hasWriteOperation: this.hasWriteOperation,
            operationCount: { ...this.operationCount },
            lockedKeysCount: this.lockedKeys.size
        };
    }
}

module.exports = Transaction;

