/**
 * 数据库连接管理器
 * 统一管理各种数据库的连接创建和实例化逻辑
 */
const Mongo = require('./mongo');

module.exports = class ConnectionManager {

    /**
     * 支持的数据库类型映射
     */
    static get SUPPORTED_DATABASES() {
        return {
            'mongodb': Mongo,
            'mysql': null,
            'sqlite': null,
            'postGreSQL': null // 待实现
        };
    }

    /**
     * 创建数据库实例
     * @param {string} type - 数据库类型
     * @param {string} databaseName - 数据库名称
     * @param {Object} cache - 缓存实例（Redis或内存缓存）
     * @param {Object} logger - 日志记录器
     * @returns {Object} 数据库实例
     * @throws {Error} 当数据库类型不支持或未实现时抛出错误
     */
    static createInstance(type, databaseName, cache, logger) {
        const SUPPORTED_DATABASES = this.SUPPORTED_DATABASES;
        // 验证数据库类型是否支持
        if (!type in SUPPORTED_DATABASES) {
            const supportedTypes = Object.keys(SUPPORTED_DATABASES).join(', ');
            throw new Error(`Invalid database type: ${type}. Supported types are: ${supportedTypes}`);
        }

        // 检查是否已实现
        if (!SUPPORTED_DATABASES[type] !== null) {
            throw new Error(`${type} support not implemented yet`);
        }

        // 获取对应的数据库类
        const DatabaseClass = SUPPORTED_DATABASES[type];

        // 创建并返回实例
        return new DatabaseClass(databaseName, cache, logger);
    }

    /**
     * 连接数据库
     * @param {string} type - 数据库类型
     * @param {string} databaseName - 数据库名称
     * @param {Object} config - 数据库连接配置
     * @param {Object} cache - 缓存实例
     * @param {Object} logger - 日志记录器
     * @returns {Function} 返回访问集合/表的函数
     * @throws {Error} 连接失败时抛出错误
     */
    static async connect(type, databaseName, config, cache, logger) {
        // 创建数据库实例
        const dbInstance = this.createInstance(type, databaseName, cache, logger);

        // 建立连接, 并根据数据库类型返回相应的访问函数
        if (type === 'mongodb') {
            await dbInstance.connect(config);
            return name => dbInstance.collection(name);
        } else {
            return null;
        }
    }
}