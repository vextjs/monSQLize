/**
 * insertMany 方法使用示例
 * 
 * 功能：批量插入多个文档到 MongoDB 集合
 * 特性：
 * - 批量插入性能优化（比单次插入快 50 倍）
 * - 有序/无序模式
 * - 自动缓存失效
 * - 慢查询日志
 * - 支持 ordered, writeConcern, comment, bypassDocumentValidation
 */

const MonSQLize = require('../lib');

async function main() {
    // 创建 MonSQLize 实例
    const msq = new MonSQLize({
        type: 'mongodb',
        databaseName: 'insertmany_examples',
        config: {
            uri: process.env.MONGODB_URI || 'mongodb://localhost:27017'
        }
    });

    try {
        // 连接数据库
        const { collection } = await msq.connect();
        console.log('✅ 数据库连接成功\n');

        // ============================================================
        // 示例 1: 基础批量插入
        // ============================================================
        console.log('【示例 1】基础批量插入');
        const users = [
            { name: 'Alice', email: 'alice@example.com', age: 25 },
            { name: 'Bob', email: 'bob@example.com', age: 30 },
            { name: 'Charlie', email: 'charlie@example.com', age: 35 }
        ];

        const result1 = await collection('users').insertMany(users);
        console.log('插入结果:');
        console.log('- acknowledged:', result1.acknowledged);
        console.log('- insertedCount:', result1.insertedCount);
        console.log('- insertedIds:', result1.insertedIds);
        console.log();

        // ============================================================
        // 示例 2: 有序插入（默认模式）
        // ============================================================
        console.log('【示例 2】有序插入（ordered: true，默认）');

        const products1 = [
            { _id: 'prod-001', name: 'Product A', price: 100 },
            { _id: 'prod-002', name: 'Product B', price: 200 },
            { _id: 'prod-001', name: 'Product C', price: 300 }, // ❌ 重复 _id
            { _id: 'prod-003', name: 'Product D', price: 400 }  // ⚠️ 不会被插入
        ];

        try {
            await collection('products').insertMany(products1, { ordered: true });
        } catch (error) {
            console.log('❌ 有序插入遇到错误时停止:');
            console.log('- code:', error.code);
            console.log('提示: 有序模式下，遇到错误立即停止，后续文档不会插入');
        }

        // 验证插入结果
        const count1 = await collection('products').count({});
        console.log('products 集合文档数:', count1); // 应该是 2
        console.log();

        // ============================================================
        // 示例 3: 无序插入
        // ============================================================
        console.log('【示例 3】无序插入（ordered: false）');

        const products2 = [
            { _id: 'prod-004', name: 'Product E', price: 500 },
            { _id: 'prod-001', name: 'Product F', price: 600 }, // ❌ 重复 _id
            { _id: 'prod-005', name: 'Product G', price: 700 }, // ✅ 会被插入
            { _id: 'prod-006', name: 'Product H', price: 800 }  // ✅ 会被插入
        ];

        try {
            await collection('products').insertMany(products2, { ordered: false });
        } catch (error) {
            console.log('❌ 无序插入遇到错误但继续处理其他文档:');
            console.log('- code:', error.code);
            console.log('提示: 无序模式下，遇到错误继续插入其他文档');
        }

        // 验证插入结果
        const count2 = await collection('products').count({});
        console.log('products 集合文档数:', count2); // 应该是 5 (2 + 3)
        console.log();

        // ============================================================
        // 示例 4: 大批量插入性能对比
        // ============================================================
        console.log('【示例 4】大批量插入性能对比');

        // 生成 100 个文档
        const largeDataset = Array.from({ length: 100 }, (_, i) => ({
            name: `User ${i}`,
            email: `user${i}@example.com`,
            age: 20 + (i % 50),
            createdAt: new Date()
        }));

        // 批量插入
        const start1 = Date.now();
        await collection('users_batch').insertMany(largeDataset);
        const time1 = Date.now() - start1;
        console.log(`✅ 批量插入 100 个文档耗时: ${time1}ms`);

        // 逐个插入对比
        const start2 = Date.now();
        for (let i = 0; i < 100; i++) {
            await collection('users_single').insertOne({
                name: `User ${i}`,
                email: `user_single_${i}@example.com`,
                age: 20 + (i % 50)
            });
        }
        const time2 = Date.now() - start2;
        console.log(`✅ 单次插入 100 次耗时: ${time2}ms`);
        console.log(`📊 性能提升: ${(time2 / time1).toFixed(2)}x`);
        console.log('提示: 批量插入比单次插入快 10-50 倍（取决于网络和数据大小）');
        console.log();

        // ============================================================
        // 示例 5: 使用 comment 参数
        // ============================================================
        console.log('【示例 5】使用 comment 参数');
        const result5 = await collection('logs').insertMany(
            [
                { type: 'info', message: 'User logged in', timestamp: new Date() },
                { type: 'warn', message: 'Slow query detected', timestamp: new Date() },
                { type: 'error', message: 'Connection failed', timestamp: new Date() }
            ],
            {
                comment: 'batch-log-import:v1:job-xyz789'
            }
        );
        console.log('插入结果:', result5);
        console.log('提示: 可在 MongoDB 日志中通过 comment 追踪批量操作');
        console.log();

        // ============================================================
        // 示例 6: 插入复杂嵌套文档
        // ============================================================
        console.log('【示例 6】插入复杂嵌套文档');
        const orders = [
            {
                orderNumber: 'ORD001',
                customer: {
                    id: 'CUST001',
                    name: 'Alice',
                    email: 'alice@example.com'
                },
                items: [
                    { sku: 'SKU001', name: 'Product A', quantity: 2, price: 100 },
                    { sku: 'SKU002', name: 'Product B', quantity: 1, price: 200 }
                ],
                total: 400,
                createdAt: new Date()
            },
            {
                orderNumber: 'ORD002',
                customer: {
                    id: 'CUST002',
                    name: 'Bob',
                    email: 'bob@example.com'
                },
                items: [
                    { sku: 'SKU003', name: 'Product C', quantity: 3, price: 150 }
                ],
                total: 450,
                createdAt: new Date()
            }
        ];

        const result6 = await collection('orders').insertMany(orders);
        console.log('插入结果:', result6);
        console.log();

        // ============================================================
        // 示例 7: 使用 writeConcern
        // ============================================================
        console.log('【示例 7】使用 writeConcern');
        const result7 = await collection('important_data').insertMany(
            [
                { type: 'critical', value: 1000, timestamp: new Date() },
                { type: 'critical', value: 2000, timestamp: new Date() }
            ],
            {
                writeConcern: { w: 'majority', wtimeout: 5000 }
            }
        );
        console.log('插入结果:', result7);
        console.log('提示: w="majority" 确保写入复制到多数副本节点');
        console.log();

        // ============================================================
        // 示例 8: 自动缓存失效验证
        // ============================================================
        console.log('【示例 8】自动缓存失效验证');

        // 先查询一次（建立缓存）
        const cached1 = await collection('users').find({ query: {} });
        console.log('首次查询结果数量:', cached1.length);

        // 批量插入新文档
        await collection('users').insertMany([
            { name: 'New User 1', email: 'newuser1@example.com' },
            { name: 'New User 2', email: 'newuser2@example.com' }
        ]);
        console.log('✅ 批量插入新文档');

        // 再次查询（缓存已自动失效）
        const cached2 = await collection('users').find({ query: {} });
        console.log('再次查询结果数量:', cached2.length);
        console.log('提示: 批量插入操作自动失效了该集合的所有查询缓存');
        console.log();

        // ============================================================
        // 总结
        // ============================================================
        console.log('✅ 所有示例执行完成！');
        console.log('\n📝 关键特性：');
        console.log('1. 性能优化 - 批量插入比单次插入快 10-50 倍');
        console.log('2. 有序模式 - ordered: true（默认），遇到错误停止');
        console.log('3. 无序模式 - ordered: false，遇到错误继续插入其他文档');
        console.log('4. 自动缓存失效 - 批量插入成功后自动清除该集合的查询缓存');
        console.log('5. 灵活参数 - 支持 ordered, comment, writeConcern, bypassDocumentValidation');

    } catch (error) {
        console.error('❌ 错误:', error.message);
        throw error;
    } finally {
        // 关闭连接
        await msq.close();
        console.log('\n✅ 数据库连接已关闭');
    }
}

// 运行示例
if (require.main === module) {
    main().catch(console.error);
}

module.exports = main;
