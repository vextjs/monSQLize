const SQLize = require('../lib/index');
(async ()=>{
    const db = await new SQLize({
        db: 'mongo',
        config: {
            uri: 'mongodb://localhost:27017/test'
        }
    }).connect();

    console.log(await db('demo').findOne())
})();