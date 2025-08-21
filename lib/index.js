const Logger = require('./logger');
const ConnectionManager = require('./connect');
module.exports = class {

    /**
     * 初始化数据库连接配置
     * @param {Object} options - 数据库连接配置选项
     * @param {string} options.type - 数据库类型,支持 mongodb、mysql、postGreSQL、SQLite
     * @param {Object} options.config - 数据库连接配置
     * @param {Object} [options.cache] - 缓存配置选项
     * @param {Object} [options.logger] - 日志记录器
     * @throws {Error} 如果数据库类型无效则抛出错误
     */
    constructor(options) {
        if (!options.type || !['mongodb', 'mysql', 'postGreSQL', 'SQLite'].includes(options.type)) {
            throw new Error('Invalid database type. Supported types are: mongodb, mysql, postGreSQL, SQLite');
        }
        const {type = 'mongodb', databaseName, config, cache, logger} = options;
        this.type = type;
        this.databaseName = databaseName;
        this.config = config;
        this.cache = cache;

        // 使用 Logger 工具类创建日志记录器
        this.logger = Logger.create(logger);
    }

    /**
     * 连接数据库并返回访问集合/表的函数
     * @returns {Function} 返回一个接收集合/表名称的函数,用于访问数据库
     * @throws {Error} 当连接失败时抛出错误
     */
    async connect() {
        // 如果已经有连接，直接返回访问函数
        if (this.dbInstance) {
            return this.dbInstance;
        }

        // 使用 ConnectionManager 建立连接
        const accessFunction = await ConnectionManager.connect(
            this.type,
            this.databaseName,
            this.config,
            this.cache,
            this.logger
        );

        // 保存连接状态
        this.dbInstance = accessFunction;
        
        return accessFunction;
    }
}