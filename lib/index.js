const Mysql = require('./mysql');
module.exports = class {
    constructor(options) {
        const { db, dbType, redis, logger } = options;
        this.db = db;
        this.dbType = dbType;
        this.redis = redis;
        this.logger = logger || {
            debug: (msg, ...args) => console.debug(msg, ...args),
            info: (msg, ...args) => console.log(msg, ...args),
            error: (msg, ...args) => console.error(msg, ...args)
        };
        this.options = {
            table:'',               // 表名，用于 SQL 查询
            data:{},                // 更新的数据（INSERT 或 UPDATE 用）
            options:{},             // 其他配置参数
            query:{},               // 查询条件（SQL WHERE）
            limit:1,                // 返回的最大记录数（分页）
            skip:0,                 // 跳过指定数量的记录（分页）
            projection:{},          // 选择返回字段（类似 MongoDB projection）
            cache:0,                // 缓存时间（毫秒）
            sort:{id:1},            // 排序方式（默认 id 升序）
            maxTimeMs:500,          // 最大查询执行时间（防止 SQL 运行过久）
            count:false,            // 是否返回总记录数（类似 COUNT(*)）
            pipeline:[],            // 聚合管道（类似 SQL GROUP BY）
            source:'',              // 数据来源、缓存或者数据库
        }
    }

    // queryClause 查询规则适配
    queryClause(){
        if(this.dbType === 'mysql'){
            return Mysql.queryClause(this.db);
        }
    }




}