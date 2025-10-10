/**
 * 完整的流式查询示例（包含数据生成）
 * 这个示例会先生成测试数据，然后演示所有流式查询功能
 */

const MonSQLize = require('../../lib');

async function streamWithDataExample() {
    console.log('🎯 完整的流式查询示例（含数据生成）\n');

    const msq = new MonSQLize({
        type: 'mongodb',
        databaseName: 'test',
        config: { uri: 'mongodb://localhost:27017' },
        slowQueryMs: 2000,
    });

    try {
        const { collection } = await msq.connect();
        console.log('✅ 数据库连接成功\n');

        // ============================================================
        // 步骤 0: 生成测试数据
        // ============================================================
        console.log('📝 生成测试数据');
        console.log('='.repeat(60));

        // 先清空现有数据
        try {
            await collection('orders').dropCollection();
            console.log('  清空了旧数据');
        } catch (e) {
            // 集合不存在，忽略
        }

        // 生成 100 条测试订单
        const testOrders = [];
        const statuses = ['paid', 'pending', 'shipped', 'cancelled'];
        const userIds = ['user001', 'user002', 'user003', 'user004', 'user005'];

        for (let i = 1; i <= 100; i++) {
            testOrders.push({
                orderId: `ORDER${String(i).padStart(5, '0')}`,
                userId: userIds[i % userIds.length],
                amount: Math.floor(Math.random() * 1000) + 50,
                status: statuses[i % statuses.length],
                items: Math.floor(Math.random() * 5) + 1,
                createdAt: new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000)
            });
        }

        // 插入数据（使用 MonSQLize 的适配器）
        const nativeDb = msq._adapter.client.db('test');
        await nativeDb.collection('orders').insertMany(testOrders);
        console.log(`  ✅ 已生成 ${testOrders.length} 条测试订单\n`);

        // ============================================================
        // 示例 1: 使用 stream() 方法处理数据
        // ============================================================
        console.log('示例 1: 使用 stream() 方法处理所有已支付订单');
        console.log('-'.repeat(60));

        let count1 = 0;
        let totalAmount1 = 0;

        const stream1 = collection('orders').stream({
            query: { status: 'paid' },
            projection: { orderId: 1, amount: 1, userId: 1 },
            sort: { amount: -1 },
            batchSize: 10
        });

        stream1.on('data', (doc) => {
            count1++;
            totalAmount1 += doc.amount;
            if (count1 <= 5) {
                console.log(`  订单 ${count1}: ${doc.orderId}, 金额: ¥${doc.amount}, 用户: ${doc.userId}`);
            }
        });

        await new Promise((resolve, reject) => {
            stream1.on('end', () => {
                console.log(`  ...更多订单`);
                console.log(`✅ 共处理 ${count1} 个已支付订单，总金额: ¥${totalAmount1}\n`);
                resolve();
            });
            stream1.on('error', reject);
        });

        // ============================================================
        // 示例 2: 使用 for await 语法进行数据分析
        // ============================================================
        console.log('示例 2: 使用 for await 语法分析用户订单');
        console.log('-'.repeat(60));

        const userStats = new Map();
        const stream2 = collection('orders').stream({
            query: { status: { $in: ['paid', 'shipped'] } },
            batchSize: 20
        });

        for await (const doc of stream2) {
            const userId = doc.userId;
            if (!userStats.has(userId)) {
                userStats.set(userId, { userId, count: 0, total: 0 });
            }
            const stats = userStats.get(userId);
            stats.count++;
            stats.total += doc.amount;
        }

        console.log('  用户订单统计:');
        for (const [userId, stats] of userStats.entries()) {
            console.log(`    ${userId}: ${stats.count} 个订单, 总额 ¥${stats.total}, 平均 ¥${Math.round(stats.total / stats.count)}`);
        }
        console.log(`✅ 共分析 ${userStats.size} 个用户\n`);

        // ============================================================
        // 示例 3: 聚合管道流式处理
        // ============================================================
        console.log('示例 3: 使用聚合管道统计每个状态的订单');
        console.log('-'.repeat(60));

        const aggStream = collection('orders').aggregate([
            {
                $group: {
                    _id: '$status',
                    count: { $sum: 1 },
                    totalAmount: { $sum: '$amount' },
                    avgAmount: { $avg: '$amount' }
                }
            },
            { $sort: { count: -1 } }
        ], {
            stream: true
        });

        console.log('  订单状态统计:');
        for await (const doc of aggStream) {
            console.log(`    ${doc._id}: ${doc.count} 个订单, 总额 ¥${doc.totalAmount}, 平均 ¥${Math.round(doc.avgAmount)}`);
        }
        console.log('✅ 聚合统计完成\n');

        // ============================================================
        // 示例 4: 流式数据转换和过滤
        // ============================================================
        console.log('示例 4: 流式过滤高价值订单（金额 > 500）');
        console.log('-'.repeat(60));

        const stream4 = collection('orders').stream({
            query: { amount: { $gt: 500 } },
            sort: { amount: -1 },
            limit: 10
        });

        let count4 = 0;
        for await (const doc of stream4) {
            count4++;
            console.log(`  高价订单 ${count4}: ${doc.orderId}, ¥${doc.amount}, ${doc.status}`);
        }
        console.log(`✅ 找到 ${count4} 个高价值订单\n`);

        // ============================================================
        // 示例 5: findPage 流式查询
        // ============================================================
        console.log('示例 5: findPage 流式分页查询');
        console.log('-'.repeat(60));

        const pageStream = await collection('orders').findPage({
            query: { status: 'paid' },
            sort: { createdAt: -1 },
            limit: 10,
            stream: true
        });

        let count5 = 0;
        console.log('  最新的已支付订单:');
        for await (const doc of pageStream) {
            count5++;
            if (count5 <= 5) {
                const date = new Date(doc.createdAt).toLocaleDateString('zh-CN');
                console.log(`    ${doc.orderId}: ¥${doc.amount}, ${date}`);
            }
        }
        console.log(`  ...还有更多`);
        console.log(`✅ 处理了 ${count5} 条分页数据\n`);

        // ============================================================
        // 示例 6: 批量处理模式
        // ============================================================
        console.log('示例 6: 批量处理模式（每 10 条处理一次）');
        console.log('-'.repeat(60));

        const stream6 = collection('orders').stream({
            query: { status: 'pending' },
            batchSize: 10
        });

        let batch = [];
        let batchCount = 0;

        for await (const doc of stream6) {
            batch.push(doc);

            if (batch.length >= 10) {
                batchCount++;
                // 模拟批量处理
                const batchTotal = batch.reduce((sum, order) => sum + order.amount, 0);
                console.log(`  批次 ${batchCount}: 处理 ${batch.length} 个订单, 批次总额 ¥${batchTotal}`);
                batch = [];
            }
        }

        // 处理最后一批
        if (batch.length > 0) {
            batchCount++;
            const batchTotal = batch.reduce((sum, order) => sum + order.amount, 0);
            console.log(`  批次 ${batchCount}: 处理 ${batch.length} 个订单, 批次总额 ¥${batchTotal}`);
        }

        console.log(`✅ 共处理 ${batchCount} 个批次\n`);

        // ============================================================
        // 示例 7: 实时监控模式
        // ============================================================
        console.log('示例 7: 实时监控大额订单（> 800）');
        console.log('-'.repeat(60));

        const monitorStream = collection('orders').stream({
            query: { amount: { $gt: 800 } },
            sort: { amount: -1 }
        });

        console.log('  🚨 大额订单警报:');
        let alertCount = 0;

        for await (const doc of monitorStream) {
            alertCount++;
            console.log(`    ⚠️  警报 ${alertCount}: 订单 ${doc.orderId}, 金额 ¥${doc.amount}, 用户 ${doc.userId}`);
        }

        console.log(`✅ 共发现 ${alertCount} 个大额订单\n`);

        // ============================================================
        // 总结统计
        // ============================================================
        console.log('=' .repeat(60));
        console.log('📊 数据总览');
        console.log('=' .repeat(60));

        const totalCount = await collection('orders').count({ query: {} });
        const paidCount = await collection('orders').count({ query: { status: 'paid' } });
        const pendingCount = await collection('orders').count({ query: { status: 'pending' } });

        console.log(`  总订单数: ${totalCount}`);
        console.log(`  已支付: ${paidCount}`);
        console.log(`  待处理: ${pendingCount}`);
        console.log(`  已取消: ${totalCount - paidCount - pendingCount}`);

        console.log('\n' + '='.repeat(60));
        console.log('✅ 所有示例执行完成！');
        console.log('='.repeat(60));

        // ============================================================
        // 清理测试数据（可选）
        // ============================================================
        console.log('\n❓ 是否清理测试数据？');
        console.log('   运行以下命令可以保留数据供后续使用:');
        console.log('   注释掉下面的清理代码\n');

        // 取消下面的注释以保留数据
        // return;

        await collection('orders').dropCollection();
        console.log('🗑️  测试数据已清理\n');

    } catch (error) {
        console.error('❌ 错误:', error.message);
        console.error(error.stack);
        process.exit(1);
    } finally {
        await msq.close();
        console.log('✅ 连接已关闭');
    }
}

// 运行示例
if (require.main === module) {
    streamWithDataExample();
}

module.exports = streamWithDataExample;
