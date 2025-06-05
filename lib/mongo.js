const { MongoClient } = require('mongodb');
module.exports = class {

    /**
     * 初始化MongoDB实例
     * @param {string} databaseName - MongoDB数据库名称
     * @param {Object} redis - Redis客户端实例,用于缓存查询结果
     * @param {Object} logger - 日志记录器对象,用于记录操作和错误信息
     */
    constructor(databaseName, redis, logger) {
        this.redis = redis;
        this.logger = logger;
        this.databaseName = databaseName;
    }

    /**
     * 连接到MongoDB数据库
     * @param {Object} config - MongoDB连接配置
     * @param {string} config.uri - MongoDB连接URI
     * @param {Object} [config.options={}] - MongoDB连接选项
     * @returns {MongoClient} 返回MongoDB客户端连接实例
     * @throws {Error} 当连接失败时记录错误日志
     */
    async connect(config) {
        // 如果已有连接，直接返回
        if (this.client) {
            return this.client;
        }
        const {uri, options = {}} = config;
        try {
            this.client = new MongoClient(uri, options);
            await this.client.connect();
            this.db = this.client.db(this.databaseName);
            this.logger.info('✅ MongoDB connected');
            return this.client;
        } catch (err) {
            this.client = null;
            this.logger.error('❌ MongoDB connection failed:', err);
        }
    }

    options(){
        this.options = {
            collection:'',          // 集合名称
            data:{},                // 更新的数据（INSERT 或 UPDATE 用）
            options:{},             // 其他配置参数
            query:{},               // 查询条件
            limit:1,                // 返回的最大记录数（分页）
            skip:0,                 // 跳过指定数量的记录（分页）
            projection:{},          // 选择返回字段（类似 MongoDB projection）
            cache:0,                // 缓存时间（毫秒）
            sort:{id:1},            // 排序方式（默认 id 升序）
            maxTimeMs:500,          // 最大查询执行时间
            count:false,            // 是否返回总记录数（类似 COUNT(*)）
            pipeline:[],            // 聚合管道
            source:'',              // 数据来源、缓存或者数据库
        }
    }

    collection(name){
        const collection = this.db.collection(name);
        return {
            /**
             * 删除集合
             * @param {string} name - 集合名称(可选)
             * @returns {Promise<boolean>} 删除操作的结果
             */
            dropCollection: async (name) => {
                return await collection.drop(name);
            },

            /**
             * 创建集合
             * @param {string} name - 集合名称
             * @param {Object} options - 创建集合的配置选项
             * @returns {Promise<boolean>} 创建成功返回true
             */
            createCollection: async (name, options = {}) => {
                await this.db.createCollection(name, options);
                return true;
            },

            /**
             * 创建视图集合
             * @param {string} name - 视图名称
             * @param {string} source - 源集合名称
             * @param {Array} pipeline - 聚合管道数组
             * @returns {Promise<boolean>} 创建成功返回true
             */
            createView: async (name, source, pipeline = []) => {
                await this.db.createCollection(name, {
                    viewOn: name,
                    source: source,
                    pipeline: pipeline || []
                });
                return true;
            },

            findOne: async (options) => {
                return await collection.insertOne({ name: 'Bob' })
            },
        }
    }
}