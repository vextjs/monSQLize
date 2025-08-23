const Logger = require('./logger');
const ConnectionManager = require('./connect');
const MemoryCache = require('./cache');

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
        const {type = 'mongodb', databaseName, config, cache, logger} = options;
        this.type = type;
        this.databaseName = databaseName;
        this.config = config;
        this.cache = cache;

        // 使用缓存工厂获取有效的缓存实例
        this.cache = MemoryCache.getOrCreateCache(cache);

        // 使用 Logger 工具类创建日志记录器
        this.logger = Logger.create(logger);

        // 统一默认配置（构造级别）
        this.defaults = {
            maxTimeMS: options.maxTimeMS,
            findLimit: options.findLimit,
            namespace: options.namespace,
            slowQueryMs: options.slowQueryMs,
        };
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

        // 使用 ConnectionManager 建立连接
        const { collection, db, instance } = await (ConnectionManager.connect(
            this.type,
            this.databaseName,
            this.config,
            this.cache,
            this.logger,
            this.defaults,
        ));

        // 保存连接状态（关键：缓存对象，保证多次调用幂等返回同一形态/引用）
        this.dbInstance = { collection, db };
        this._adapter = instance;
        
        return this.dbInstance;
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
        if (this._adapter && typeof this._adapter.close === 'function') {
            await this._adapter.close();
        }
        this._adapter = null;
        this.dbInstance = null;
    }
}