/**
 * 测试数据生成脚本
 * 用于为 pagination 演示创建足够的测试数据
 */

const { MongoClient, ObjectId } = require('mongodb');

async function generateTestData() {
    const client = new MongoClient('mongodb://localhost:27017');

    try {
        await client.connect();
        console.log('连接到 MongoDB');

        const db = client.db('ecommerce');
        const orders = db.collection('orders');

        // 检查现有数据
        const existingCount = await orders.countDocuments();
        console.log(`现有订单数量: ${existingCount}`);

        if (existingCount >= 1000) {
            console.log('数据已足够，无需生成');
            return;
        }

        console.log('生成测试数据...');

        const statuses = ['paid', 'pending', 'shipped', 'delivered', 'cancelled'];
        const users = [];

        // 先生成一些用户
        for (let i = 1; i <= 100; i++) {
            users.push({
                _id: new ObjectId(),
                name: `User${i}`,
                email: `user${i}@example.com`
            });
        }

        await db.collection('users').insertMany(users);
        console.log(`生成了 ${users.length} 个用户`);

        // 生成订单数据
        const orders_data = [];
        const batchSize = 1000;
        const totalOrders = 5000;

        for (let i = 1; i <= totalOrders; i++) {
            const user = users[Math.floor(Math.random() * users.length)];

            orders_data.push({
                _id: new ObjectId(),
                orderNumber: `ORD-${String(i).padStart(6, '0')}`,
                userId: user._id.toString(),
                status: statuses[Math.floor(Math.random() * statuses.length)],
                amount: Math.floor(Math.random() * 1000) + 10,
                items: [
                    {
                        productId: `PROD-${Math.floor(Math.random() * 1000) + 1}`,
                        quantity: Math.floor(Math.random() * 5) + 1,
                        price: Math.floor(Math.random() * 100) + 5
                    }
                ],
                createdAt: new Date(Date.now() - Math.random() * 365 * 24 * 60 * 60 * 1000),
                updatedAt: new Date()
            });

            // 批量插入
            if (orders_data.length >= batchSize) {
                await orders.insertMany(orders_data);
                console.log(`已生成 ${i} 个订单`);
                orders_data.length = 0; // 清空数组
            }
        }

        // 插入剩余数据
        if (orders_data.length > 0) {
            await orders.insertMany(orders_data);
        }

        console.log(`总共生成了 ${totalOrders} 个订单`);

        // 创建索引
        await orders.createIndex({ status: 1, createdAt: -1, _id: 1 });
        await orders.createIndex({ createdAt: -1, _id: 1 });
        await orders.createIndex({ _id: 1 });
        await orders.createIndex({ userId: 1 });

        console.log('索引创建完成');

        // 验证数据
        const finalCount = await orders.countDocuments();
        console.log(`最终订单总数: ${finalCount}`);

        // 显示一些统计信息
        const statusStats = await orders.aggregate([
            { $group: { _id: '$status', count: { $sum: 1 } } },
            { $sort: { count: -1 } }
        ]).toArray();

        console.log('\n订单状态统计:');
        statusStats.forEach(stat => {
            console.log(`  ${stat._id}: ${stat.count} 个`);
        });

        console.log('\n测试数据生成完成！现在可以运行分页演示了。');

    } catch (error) {
        console.error('数据生成失败:', error.message);
        throw error;
    } finally {
        await client.close();
    }
}

// 运行数据生成
if (require.main === module) {
    generateTestData().catch(console.error);
}

module.exports = { generateTestData };
