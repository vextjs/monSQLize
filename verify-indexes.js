// 快速验证索引功能集成
const MonSQLize = require('./lib/index');

(async () => {
    try {
        const msq = new MonSQLize({
            type: 'mongodb',
            databaseName: 'test_verify',
            config: { uri: process.env.MONGODB_URI || 'mongodb://localhost:27017' }
        });

        const { collection } = await msq.connect();
        
        console.log('✓ 连接成功');

        // 检查索引方法是否存在
        const coll = collection('test_verify');
        
        console.log('检查方法存在性:');
        console.log('  createIndex:', typeof coll.createIndex);
        console.log('  createIndexes:', typeof coll.createIndexes);
        console.log('  listIndexes:', typeof coll.listIndexes);
        console.log('  dropIndex:', typeof coll.dropIndex);
        console.log('  dropIndexes:', typeof coll.dropIndexes);

        // 测试基本功能
        console.log('\n测试基本功能:');
        
        // 清理
        try {
            await coll.dropIndexes();
        } catch (e) {
            // 忽略
        }

        // 列出索引
        const indexes1 = await coll.listIndexes();
        console.log('  初始索引数量:', indexes1.length);

        // 创建索引
        const result = await coll.createIndex({ test: 1 });
        console.log('  ✓ 创建索引成功:', result.name);

        // 再次列出
        const indexes2 = await coll.listIndexes();
        console.log('  ✓ 创建后索引数量:', indexes2.length);

        // 删除索引
        await coll.dropIndex('test_1');
        console.log('  ✓ 删除索引成功');

        // 验证
        const indexes3 = await coll.listIndexes();
        console.log('  ✓ 删除后索引数量:', indexes3.length);

        await msq.close();
        
        console.log('\n✅ 所有测试通过！');
        process.exit(0);
    } catch (error) {
        console.error('\n❌ 测试失败:', error.message);
        console.error(error.stack);
        process.exit(1);
    }
})();

