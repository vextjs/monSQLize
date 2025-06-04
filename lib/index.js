const Mysql = require('./mysql');
const Mongo = require('./mongo');
module.exports = class {

    /**
     * 初始化数据库连接配置
     * @param {Object} options - 数据库连接配置选项
     * @param {string} options.db - 数据库类型,支持 mongo、mysql、postgreSQL
     * @param {Object} options.config - 数据库连接配置
     * @param {Object} [options.redis] - Redis配置选项
     * @param {Object} [options.logger] - 日志记录器
     * @throws {Error} 如果数据库类型无效则抛出错误
     */
    constructor(options) {
        if (!options.dbType || !['mongodb', 'mysql', 'postgreSQL'].includes(options.dbType)) {
            throw new Error('Invalid database type. Supported types are: mongodb, mysql, postgreSQL');
        }
        const {dbType = 'mongodb', databaseName, config, redis, logger} = options;
        this.dbType = dbType;
        this.databaseName = databaseName;
        this.config = config;
        this.redis = redis;
        this.logger(logger);
    }

    /**
     * 设置日志记录器
     * @param {Object} [logger] - 自定义日志记录器,如果未提供则使用控制台
     * @param {Function} logger.debug - debug级别日志方法
     * @param {Function} logger.info - info级别日志方法
     * @param {Function} logger.warn - warn级别日志方法
     * @param {Function} logger.error - error级别日志方法
     */
    logger(logger) {
        this.logger = logger || {
            debug: (msg, ...args) => console.debug(msg, ...args),
            info: (msg, ...args) => console.log(msg, ...args),
            warn: (msg, ...args) => console.warn(msg, ...args),
            error: (msg, ...args) => console.error(msg, ...args)
        };
    }

    /**
     * 连接数据库并返回访问集合的函数
     * @returns {Function} 返回一个接收集合名称的函数,用于访问数据库集合
     * @throws {Error} 当数据库类型不支持时抛出错误
     */
    async connect() {
        const {databaseName, config, redis, logger} = this;

        // 如果已经有连接，直接返回数据库实例
        if (this.dbInstance) {
            return name => this.dbInstance.collection(name);
        }

        // 根据数据库类型创建对应的实例
        switch (this.dbType) {
            case 'mysql':
                throw new Error('MySQL support not implemented yet');
            case 'postgreSQL':
                throw new Error('PostgreSQL support not implemented yet');
            case 'mongodb':
                this.dbInstance = new Mongo(databaseName, redis, logger);
                break;
            default:
                throw new Error(`Unsupported database type: ${this.dbType}`);
        }

        // 建立连接并保存连接实例
        await this.dbInstance.connect(config);

        // 返回访问集合的函数
        return name => this.dbInstance.collection(name);
    }

}