const Logger = require('./logger');
const ConnectionManager = require('./connect');
const MemoryCache = require('./cache');
const { createRedisCacheAdapter } = require('./redis-cache-adapter');
const TransactionManager = require('./transaction/TransactionManager');
const CacheLockManager = require('./transaction/CacheLockManager');
const DistributedCacheInvalidator = require('./distributed-cache-invalidator');
const { validateRange } = require('./common/validation');

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

        // ✅ v1.3.0: 自动 ObjectId 转换配置
        this.autoConvertConfig = this._initAutoConvertConfig(
            options.autoConvertObjectId,
            options.type
        );

        // 🔧 修复：保存 distributed 配置到单独的变量
        this._cacheConfig = cache;

        // Count 队列配置（高并发控制，避免压垮数据库）
        // 默认值：
        //   - enabled: true (默认启用)
        //   - concurrency: CPU 核心数（最少 4，最多 16）
        //   - maxQueueSize: 10000
        //   - timeout: 60000ms (1分钟)
        this.countQueue = options.countQueue !== undefined ? options.countQueue : {
            enabled: true,       // 默认启用
            concurrency: undefined,  // undefined 则使用 CPU 核心数
            maxQueueSize: 10000,     // 队列最大 10000
            timeout: 60000           // 超时 60 秒
        };

        // 使用缓存工厂获取有效的缓存实例
        this.cache = MemoryCache.getOrCreateCache(cache);

        // 使用 Logger 工具类创建日志记录器
        this.logger = Logger.create(logger);

        // 🔒 参数验证：防止 DoS 攻击（允许null值用于显式禁用）
        if (options.maxTimeMS !== undefined && options.maxTimeMS !== null) {
            validateRange(options.maxTimeMS, 1, 300000, 'maxTimeMS');
        }
        if (options.findLimit !== undefined && options.findLimit !== null) {
            validateRange(options.findLimit, 1, 10000, 'findLimit');
        }
        if (options.findPageMaxLimit !== undefined && options.findPageMaxLimit !== null) {
            validateRange(options.findPageMaxLimit, 1, 10000, 'findPageMaxLimit');
        }
        if (options.slowQueryMs !== undefined && options.slowQueryMs !== null && options.slowQueryMs !== -1) {
            validateRange(options.slowQueryMs, 0, 60000, 'slowQueryMs');
        }

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

                // 初始化分布式缓存失效器（如果配置了）
                // 🔧 修复：使用 _cacheConfig 读取 distributed 配置
                if (this._cacheConfig &&
                    typeof this._cacheConfig.distributed === 'object' &&
                    this._cacheConfig.distributed.enabled !== false) {
                    try {
                        // 🆕 自动从 cache.remote 提取 Redis 实例（如果未配置）
                        let redis = this._cacheConfig.distributed.redis;
                        if (!redis && !this._cacheConfig.distributed.redisUrl) {
                            // 尝试从 remote 缓存适配器中获取 Redis 实例
                            if (this.cache.remote && typeof this.cache.remote.getRedisInstance === 'function') {
                                redis = this.cache.remote.getRedisInstance();
                                if (this.logger) {
                                    this.logger.info('[DistributedCache] Auto-detected Redis from cache.remote');
                                }
                            }
                        }

                        this._cacheInvalidator = new DistributedCacheInvalidator({
                            redisUrl: this._cacheConfig.distributed.redisUrl,
                            redis,
                            channel: this._cacheConfig.distributed.channel,
                            instanceId: this._cacheConfig.distributed.instanceId,
                            cache: this.cache,
                            logger: this.logger
                        });

                        // 🆕 关键：将 invalidate 方法注入到 MultiLevelCache
                        if (this.cache && typeof this.cache.setPublish === 'function') {
                            this.cache.setPublish((msg) => {
                                if (msg && msg.type === 'invalidate' && msg.pattern) {
                                    this._cacheInvalidator.invalidate(msg.pattern).catch((err) => {
                                        this.logger.error('❌ Broadcast invalidation failed:', err.message);
                                    });
                                }
                            });
                            this.logger.info('✅ Distributed cache invalidator initialized', {
                                channel: this._cacheInvalidator.channel,
                                integrated: true
                            });
                        } else {
                            this.logger.warn('⚠️  Cache does not support setPublish, distributed invalidation disabled');
                        }
                    } catch (error) {
                        this.logger.error('❌ Failed to initialize distributed cache invalidator:', error.message);
                    }
                }

                // 初始化事务管理器和缓存锁管理器
                if (this.type === 'mongodb' && instance.client) {
                    // 检查是否配置了分布式事务锁
                    const useDistributedLock = this.cache &&
                        typeof this.cache.transaction === 'object' &&
                        this.cache.transaction.distributedLock &&
                        this.cache.transaction.distributedLock.redis;

                    if (useDistributedLock) {
                        // 使用分布式缓存锁管理器
                        const DistributedCacheLockManager = require('./transaction/DistributedCacheLockManager');
                        this._lockManager = new DistributedCacheLockManager({
                            redis: this.cache.transaction.distributedLock.redis,
                            lockKeyPrefix: this.cache.transaction.distributedLock.keyPrefix || 'monsqlize:cache:lock:',
                            maxDuration: 300000,
                            logger: this.logger
                        });
                        this.logger.info('✅ Distributed cache lock manager initialized');
                    } else {
                        // 使用本地缓存锁管理器
                        this._lockManager = new CacheLockManager({
                            logger: this.logger,
                            maxDuration: 300000,  // 锁最长持续5分钟
                            cleanupInterval: 10000  // 每10秒清理一次
                        });
                    }

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
                        hasLockManager: !!this._lockManager,
                        isDistributed: useDistributedLock
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
        // 清理分布式缓存失效器
        if (this._cacheInvalidator && typeof this._cacheInvalidator.close === 'function') {
            await this._cacheInvalidator.close();
            this._cacheInvalidator = null;
        }

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
     * @param {import('ioredis').Redis | import('ioredis').Cluster} client - Redis客户端
     * @param {Object} [options] - 配置选项
     * @returns {import('./cache').CacheLike} Redis缓存适配器
     */
    static createRedisCacheAdapter(client, options) {
        return createRedisCacheAdapter(client, options);
    }

    /**
     * 初始化 ObjectId 自动转换配置
     * @private
     * @param {boolean|Object} config - 用户配置
     * @param {string} dbType - 数据库类型
     * @returns {Object} 配置对象
     */
    _initAutoConvertConfig(config, dbType) {
        // 只在 MongoDB 类型下启用
        if (dbType !== 'mongodb') {
            return { enabled: false };
        }

        // 默认配置
        const defaults = {
            enabled: true,
            excludeFields: [],
            customFieldPatterns: [],
            maxDepth: 10,
            logLevel: 'warn'
        };

        // 用户禁用
        if (config === false) {
            return { enabled: false };
        }

        // 用户自定义配置
        if (typeof config === 'object' && config !== null) {
            return {
                enabled: config.enabled !== false,
                excludeFields: Array.isArray(config.excludeFields)
                    ? config.excludeFields
                    : defaults.excludeFields,
                customFieldPatterns: Array.isArray(config.customFieldPatterns)
                    ? config.customFieldPatterns
                    : defaults.customFieldPatterns,
                maxDepth: typeof config.maxDepth === 'number'
                    ? config.maxDepth
                    : defaults.maxDepth,
                logLevel: config.logLevel || defaults.logLevel
            };
        }

        return defaults;
    }
};
