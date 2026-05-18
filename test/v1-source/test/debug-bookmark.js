// debug-bookmark.js - 调试 bookmark 功能
const MonSQLize = require('../lib');
const { stopMemoryServer } = require('../lib/mongodb/connect');

(async () => {
    let client;
    try {
        console.log('创建 MonSQLize 实例（内部会自动启动 Memory Server）...');
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

        // 测试 findPage
        console.log('\n测试 findPage...');
        console.log('调用参数:', JSON.stringify({ sort: { _id: 1 }, limit: 5, page: 1 }, null, 2));
        const page1 = await accessor.findPage({ sort: { _id: 1 }, limit: 5, page: 1 });
        console.log('Page 1 结果:', {
            itemCount: page1.items.length,
            firstId: page1.items[0]?._id,
            lastId: page1.items[page1.items.length - 1]?._id,
            pageInfo: page1.pageInfo
        });

        // 检查缓存
        console.log('\n检查缓存...');
        const cache = client._adapter.cache;
        console.log('Cache 是否存在:', !!cache);
        console.log('Cache 类型:', cache?.constructor?.name);

        if (cache && cache.keys) {
            const allKeys = await cache.keys('*');
            console.log('缓存中的所有 key:', allKeys);
        }

        // 测试 prewarmBookmarks
        console.log('\n测试 prewarmBookmarks...');
        const keyDims = { sort: { _id: 1 }, limit: 5 };
        const result = await accessor.prewarmBookmarks(keyDims, [1, 2, 3]);
        console.log('预热结果:', result);

        // 再次检查缓存
        if (cache && cache.keys) {
            const allKeys = await cache.keys('*');
            console.log('预热后缓存中的 key:', allKeys);
        }

        // 测试 listBookmarks
        console.log('\n测试 listBookmarks...');
        const list = await accessor.listBookmarks(keyDims);
        console.log('列出的 bookmarks:', list);

        console.log('\n✓ 调试完成');
    } catch (error) {
        console.error('❌ 错误:', error);
    } finally {
        if (client) await client.close();
        // 显式停止 Memory Server，否则 Node.js 进程会卡住
        await stopMemoryServer();
    }
})();
