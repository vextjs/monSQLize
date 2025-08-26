const MonSQLize = require('../lib/index');
(async ()=>{

    const { db, collection } = await (new MonSQLize({
        type: 'mongodb',                                    // 连接类型
        databaseName :'example',                            // 数据库名称
        maxTimeMS: 3000,                                    // 全局默认：查询超时 3000ms，可被单次 options.maxTimeMS 覆盖
        findLimit: 10,                                      // 全局默认：find 未传 limit 时的默认值；传 0 表示不限制
        slowQueryMs: 5,                                   // 演示用：阈值设为 5ms，便于观察慢查询日志
        // namespace: { instanceId: 'local-example' },      // 可选：显式设置实例命名空间，未设置则会基于 uri+db 自动生成
        config: {
            uri: 'mongodb://localhost:27017'                // 链接 uri
        },
        // 可选：自定义 logger，观察 warn 输出（默认已输出到控制台）
        // logger: { debug: console.debug, info: console.log, warn: console.warn, error: console.error }
    }).connect());

    // 创建一个集合示例
    // console.log(await db('example').collection('test').createCollection('test'));

    // 查询一条记录示例（如果存在），并使用 5 秒缓存
    // console.log(await collection('test').findOne({ query: {}, cache: 5000 }))

    // 或者
    // console.log(await db('example').collection('test').findOne({ query: {}, cache: 5000 }))

    // 演示慢日志：执行一次 find，包含 projection/sort/limit 等，可在控制台查看 [WARN] ⏱️ Slow query
    console.log(await collection('test').find({
        query: { a: { $gte: 1 }, tags: ['x', 'y'] },
        projection: { a: 1, b: 1 },
        sort: { createdAt: -1 },
        limit: 50,
        cache: 1000,
        maxTimeMS: 1500,
    }));
})();