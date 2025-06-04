const { MongoClient, ServerApiVersion,listDatabases, ObjectId } = require('mongodb');
module.exports = class {

    constructor(redis, logger) {
        this.redis = redis;
        this.logger = logger;
    }

    async connect(config) {
        // 如果已有连接，直接返回
        if (this.client) {
            return this.client;
        }
        const {uri, options = {}} = config;
        try {
            this.client = new MongoClient(uri, options);
            await this.client.connect();
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
        return {
            findOne: async () => {
                return name
            },
        }
    }
}