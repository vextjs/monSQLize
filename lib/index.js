const Logger = require('./logger');
const ConnectionManager = require('./connect');
const MemoryCache = require('./cache');
const { createRedisCacheAdapter } = require('./redis-cache-adapter');
const TransactionManager = require('./transaction/TransactionManager');
const CacheLockManager = require('./transaction/CacheLockManager');

module.exports = class {

    /**
     * 初始化数据库连接配置
     * @param {Object} options - 数据库连接配置选项
     * @param {string} options.type - 数据库类型,支持 mongodb
     * @param {Object} options.config - 数据库连接配置
     * @param {Object} [options.cache] - 缓存配置选项
     * @param {Object} [options.logger] - 日志记录器
     * @param {number} [options.maxTimeMS] - 全局默认查询超时时间（毫秒）
     * @param {{instanceId?: string}} [options.namespace] - 命名空间设置（用于缓存隔离）
     * @throws {Error} 如果数据库类型无效则抛出错误
     */
    constructor(options) {
        if (!options.type || !['mongodb'].includes(options.type)) {
            throw new Error('Invalid database type. Supported types are: mongodb');
        }
        const { type = 'mongodb', databaseName, config, cache, logger } = options;
        this.type = type;
        this.databaseName = databaseName;
        this.config = config;
        this.cache = cache;

        // 使用缓存工厂获取有效的缓存实例
        this.cache = MemoryCache.getOrCreateCache(cache);

        // 使用 Logger 工具类创建日志记录器
        this.logger = Logger.create(logger);

        // 集中默认配置（库内默认 + 用户覆盖）
        const DEFAULTS = {
            maxTimeMS: 2000,
            findLimit: 10,
            slowQueryMs: 500,
            namespace: { scope: 'database' },
            // 深分页/聚合相关
            findPageMaxLimit: 500,
            cursorSecret: undefined,
            // 慢日志扩展
            log: { slowQueryTag: { event: 'slow_query', code: 'SLOW_QUERY' } },
        };
        const deepMerge = (base, patch) => {
            const out = { ...base };
            for (const k of Object.keys(patch || {})) {
                const v = patch[k];
                if (v && typeof v === 'object' && !Array.isArray(v)) {
                    out[k] = deepMerge(base[k] || {}, v);
                } else if (v !== undefined) {
                    out[k] = v;
                }
            }
            return out;
        };
        this.defaults = deepMerge(DEFAULTS, {
            maxTimeMS: options.maxTimeMS,
            findLimit: options.findLimit,
            namespace: options.namespace,
            slowQueryMs: options.slowQueryMs,
            // 新增可选项
            findPageMaxLimit: options.findPageMaxLimit,
            cursorSecret: options.cursorSecret,
            log: options.log,
        });
        // 冻结默认配置，避免运行期被意外修改
        this.defaults = Object.freeze(this.defaults);
    }

    /**
 * 连接数据库并返回访问集合/表的对象
 * @returns {{collection: Function, db: Function}} 返回包含 collection 与 db 方法的对象
 * @throws {Error} 当连接失败时抛出错误
 */
    async connect() {
        // 如果已经有连接，直接返回访问对象
        if (this.dbInstance) {
            return this.dbInstance;
        }

        // 防止并发连接：使用连接锁
        if (this._connecting) {
            return this._connecting;
        }

        try {
            this._connecting = (async () => {
                // 使用 ConnectionManager 建立连接
                const { collection, db, instance } = await ConnectionManager.connect(
                    this.type,
                    this.databaseName,
                    this.config,
                    this.cache,
                    this.logger,
                    this.defaults,
                );

                // 保存连接状态（关键：缓存对象，保证多次调用幂等返回同一形态/引用）
                this.dbInstance = { collection, db };
                this._adapter = instance;

                // 初始化事务管理器和缓存锁管理器
                if (this.type === 'mongodb' && instance.client) {
                    // 创建缓存锁管理器
                    this._lockManager = new CacheLockManager({
                        logger: this.logger,
                        maxDuration: 300000,  // 锁最长持续5分钟
                        cleanupInterval: 10000  // 每10秒清理一次
                    });

                    // 将锁管理器注入到缓存
                    if (this.cache && typeof this.cache.setLockManager === 'function') {
                        this.cache.setLockManager(this._lockManager);
                    }

                    // 创建事务管理器
                    this._transactionManager = new TransactionManager(
                        instance,  // 传入完整的 adapter 实例
                        this.cache,
                        this.logger,
                        {
                            lockManager: this._lockManager
                        }
                    );

                    this.logger.info('✅ Transaction manager initialized', {
                        hasClient: !!instance.client,
                        hasLockManager: !!this._lockManager
                    });
                } else {
                    this.logger.warn('⚠️  Transaction manager not initialized', {
                        type: this.type,
                        hasClient: !!instance.client
                    });
                }

                return this.dbInstance;
            })();

            const result = await this._connecting;
            this._connecting = null;
            return result;
        } catch (err) {
            this._connecting = null;
            throw err;
        }
    }

    /**
     * 获取底层缓存实例（用于查看统计或手动失效）
     * @returns {Object} 缓存实例
     */
    getCache() {
        return this.cache;
    }

    /**
     * 获取当前实例的默认配置（只读视图）
     * @returns {{maxTimeMS?:number, findLimit?:number, namespace?:object, slowQueryMs?:number}}
     */
    getDefaults() {
        return { ...this.defaults };
    }

    /**
     * 关闭底层数据库连接（释放资源）
     */
    async close() {
        // 清理事务管理器
        if (this._transactionManager && typeof this._transactionManager.destroy === 'function') {
            await this._transactionManager.destroy();
            this._transactionManager = null;
        }

        // 清理锁管理器
        if (this._lockManager && typeof this._lockManager.destroy === 'function') {
            this._lockManager.destroy();
            this._lockManager = null;
        }

        // 关闭数据库连接
        if (this._adapter && typeof this._adapter.close === 'function') {
            await this._adapter.close();
        }

        // 清理状态
        this.dbInstance = null;
        this._adapter = null;
        this._connecting = null;
    }

    /**
     * 健康检查（适配器透传）
     */
    async health() {
        if (this._adapter && typeof this._adapter.health === 'function') {
            return this._adapter.health();
        }
        return { status: 'down', connected: false };
    }

    /**
     * 事件订阅（适配器透传）
     * @param {'connected'|'closed'|'error'|'slow-query'} event
     * @param {(payload:any)=>void} handler
     */
    on(event, handler) {
        if (this._adapter && typeof this._adapter.on === 'function') {
            this._adapter.on(event, handler);
        }
    }


    /**
     * 启动一个事务会话（手动管理）
     * @param {Object} options - 事务选项
     * @param {Object} [options.readConcern] - 读关注级别 { level: 'majority' | 'local' | 'snapshot' }
     * @param {string} [options.readPreference] - 读偏好
     * @param {boolean} [options.causalConsistency=true] - 因果一致性
     * @param {number} [options.timeout=30000] - 事务超时时间（毫秒）
     * @returns {Promise<Transaction>}
     */
    async startSession(options = {}) {
        if (!this._transactionManager) {
            throw new Error('Connection not established. Call connect() first.');
        }
        return this._transactionManager.startSession(options);
    }

    /**
     * 使用事务执行操作（自动管理，推荐）
     * @param {Function} callback - 事务回调函数，接收 Transaction 对象作为参数
     * @param {Object} options - 事务选项（同 startSession）
     * @param {number} [options.maxRetries=3] - 最大重试次数
     * @param {number} [options.retryDelay=100] - 重试延迟（毫秒）
     * @param {number} [options.retryBackoff=2] - 重试退避系数
     * @returns {Promise<any>} 返回 callback 的返回值
     */
    async withTransaction(callback, options = {}) {
        if (!this._transactionManager) {
            throw new Error('Connection not established. Call connect() first.');
        }
        return this._transactionManager.withTransaction(callback, options);
    }

    /** 取消事件订阅（适配器透传） */
    off(event, handler) {
        if (this._adapter && typeof this._adapter.off === 'function') {
            this._adapter.off(event, handler);
        }
    }

    /**
     * 导出工具函数：创建 Redis 缓存适配器
     * @static
     */
    static createRedisCacheAdapter = createRedisCacheAdapter;
}
