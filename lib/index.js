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
        if (!options.db || !['mongo', 'mysql', 'postgreSQL'].includes(options.db)) {
            throw new Error('Invalid database type. Supported types are: mongo, mysql, postgreSQL');
        }
        const {db = 'mongo', config, redis, logger} = options;
        this.db = db;
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

    async connect() {
        const {config, redis, logger} = this;

        // 如果已经有连接，直接返回数据库实例
        if (this.dbInstance) {
            return name => this.dbInstance.collection(name);
        }

        switch (this.db) {
            case 'mysql':
                throw new Error('MySQL support not implemented yet');
            case 'postgreSQL':
                throw new Error('PostgreSQL support not implemented yet');
            case 'mongo':
                this.dbInstance = new Mongo(redis, logger);
                break;
            default:
                throw new Error(`Unsupported database type: ${this.db}`);
        }

        // 建立连接并保存连接实例
        await this.dbInstance.connect(config);

        // 返回访问集合的函数
        return name => this.dbInstance.collection(name);
    }

}