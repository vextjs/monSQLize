// debug-bookmark-detailed.js - 详细调试 bookmark 功能
const MonSQLize = require('../lib');
const { stopMemoryServer } = require('../lib/mongodb/connect');

(async () => {
    let client;
    try {
        console.log('创建 MonSQLize 实例...');
        client = new MonSQLize({ 
            type: 'mongodb',
            databaseName: 'test_debug',
            config: { useMemoryServer: true },
            cache: { enabled: true, maxSize: 1000 },
            defaults: { limit: 5, bookmarkTTL: 5000 } 
        });
        
        console.log('连接数据库...');
        const dbAccessor = await client.connect();
        const accessor = dbAccessor.collection('users');
        const db = client._adapter.db;

        // 插入测试数据
        console.log('插入测试数据...');
        const usersCollection = db.collection('users');
        const testData = Array.from({ length: 50 }, (_, i) => ({
            _id: `user-${String(i + 1).padStart(3, '0')}`,
            name: `User ${i + 1}`,
            score: (i + 1) * 10,
        }));
        await usersCollection.insertMany(testData);
        console.log('✓ 插入 50 条数据');

        // 复现测试场景："应列出特定查询的 bookmark"
        console.log('\n=== 场景: 应列出特定查询的 bookmark ===');
        
        console.log('\n步骤 1: 清空缓存');
        await accessor.clearBookmarks();
        const cache = client._adapter.cache;
        let allKeys = await cache.keys('*');
        console.log('清空后缓存 keys:', allKeys);

        console.log('\n步骤 2: 预热 [1, 3, 5]');
        const keyDims = { sort: { _id: 1 }, limit: 5 };
        const result = await accessor.prewarmBookmarks(keyDims, [1, 3, 5]);
        console.log('预热结果:', result);
        
        allKeys = await cache.keys('*');
        console.log('预热后缓存 keys:', allKeys);
        console.log('预热后缓存 keys 数量:', allKeys.length);

        console.log('\n步骤 3: 列出 bookmark');
        const list = await accessor.listBookmarks(keyDims);
        console.log('列出结果:', list);
        console.log('列出的页码:', list.pages);
        console.log('期望: [1, 3, 5], 实际 count:', list.count);

        console.log('\n✓ 调试完成');
    } catch (error) {
        console.error('❌ 错误:', error);
    } finally {
        if (client) await client.close();
        await stopMemoryServer();
    }
})();
