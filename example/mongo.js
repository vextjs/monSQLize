const SQLize = require('../lib/index');
(async ()=>{
    const db = await new SQLize({
        dbType: 'mongodb',                // 连接类型
        databaseName :'my_database',           // 数据库名称
        config: {
            uri: 'mongodb://localhost:27017'
        }
    }).connect();

    console.log(await db('demo').create('test'))
})();