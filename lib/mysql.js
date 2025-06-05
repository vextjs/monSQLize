const Mysql = require('mysql2/promise');
module.exports = class {

    constructor(databaseName, redis, logger) {
        this.redis = redis;
        this.logger = logger;
        this.databaseName = databaseName;
    }

    async connect(config) {
        // 如果已有连接，直接返回
        if (this.client) {
            return this.client;
        }

        const {uri, options = {}} = config;

        try {
            // 创建 MySQL 连接（使用 uri 或 options）
            this.client = await Mysql.createConnection(uri || options);
            this.logger.info('✅ MySQL connected');
            return this.client;
        } catch (err) {
            this.client = null;
            this.logger.error('❌ MySQL connection failed:', err);
        }
    }

    table(name) {
        const tableName = name;
        const client = this.client;

        return {
            /**
             * 删除表
             * @param {string} [name] - 表名（可选，默认使用初始化时的表名）
             * @returns {Promise<boolean>}
             */
            dropTable: async (name = tableName) => {
                await client.query(`DROP TABLE IF EXISTS \`${name}\``);
                return true;
            },

            /**
             * 创建表
             * @param {string} name - 表名
             * @param {string} schema - 表结构定义（例如：id INT PRIMARY KEY, name VARCHAR(100)）
             * @returns {Promise<boolean>}
             */
            createTable: async (name, schema) => {
                await client.query(`CREATE TABLE IF NOT EXISTS \`${name}\` (${schema})`);
                return true;
            },

            /**
             * 创建视图
             * @param {string} viewName - 视图名称
             * @param {string} selectSQL - 创建视图的 SELECT 语句
             * @returns {Promise<boolean>}
             */
            createView: async (viewName, selectSQL) => {
                await client.query(`CREATE OR REPLACE VIEW \`${viewName}\` AS ${selectSQL}`);
                return true;
            },

            /**
             * 查询单条记录
             * @param {string} whereSQL - WHERE 条件，例如 'id = ?'
             * @param {Array} params - 对应的参数值
             * @returns {Promise<Object|null>}
             */
            findOne: async (whereSQL, params = []) => {
                const [rows] = await client.query(`SELECT * FROM \`${tableName}\` WHERE ${whereSQL} LIMIT 1`, params);
                return rows[0] || null;
            },
        };
    }
}