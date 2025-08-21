const MonSQLize = require('../lib/index');
(async ()=>{
    const db = await new MonSQLize({
        type: 'mongodb',                // 连接类型
        databaseName :'test',           // 数据库名称
        config: {
            uri: 'mongodb://localhost:27017'
        }
    }).connect();

    console.log(await db('demo').create('test'))
})();