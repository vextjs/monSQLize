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

    /** 取消事件订阅（适配器透传） */
    off(event, handler) {
        if (this._adapter && typeof this._adapter.off === 'function') {
            this._adapter.off(event, handler);
        }
    }
}
