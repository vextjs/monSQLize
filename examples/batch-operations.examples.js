/**
 * deleteBatch 和 updateBatch 使用示例
 * 展示各种真实业务场景的完整用法
 */

const MonSQLize = require('../lib/index');

async function examples() {
    console.log('========================================');
    console.log('批量操作示例演示');
    console.log('========================================\n');

    // 创建连接（使用内存数据库演示）
    const msq = new MonSQLize({
        type: 'mongodb',
        databaseName: 'batch_examples',
        config: { useMemoryServer: true }
    });

    try {
        const { collection } = await msq.connect();
        console.log('✅ 连接成功\n');

        // ============================================================
        // 示例 1: 基础批量删除 - 清理过期日志
        // ============================================================
        console.log('【示例 1】基础批量删除 - 清理过期日志');
        console.log('------------------------------------------------------------\n');

        // 准备测试数据
        const logs = Array.from({ length: 5000 }, (_, i) => ({
            level: i % 3 === 0 ? 'debug' : 'info',
            message: `Log ${i}`,
            createdAt: new Date(Date.now() - Math.random() * 180 * 24 * 60 * 60 * 1000) // 过去180天内
        }));
        await collection('logs').insertMany(logs);
        console.log('✅ 插入 5000 条测试日志\n');

        // 删除 90 天前的日志
        const expireDate = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
        const result1 = await collection('logs').deleteBatch(
            { createdAt: { $lt: expireDate } },
            { batchSize: 1000 }
        );

        console.log('删除结果:');
        console.log(`  - 删除数量: ${result1.deletedCount} 条`);
        console.log(`  - 批次数: ${result1.batchCount} 批`);
        console.log(`  - 错误: ${result1.errors.length} 个\n`);

        // ============================================================
        // 示例 2: 带进度监控的删除 - 清理大量数据
        // ============================================================
        console.log('【示例 2】带进度监控的删除 - 清理大量数据');
        console.log('------------------------------------------------------------\n');

        // 准备更多测试数据
        const moreData = Array.from({ length: 10000 }, (_, i) => ({
            index: i,
            status: 'pending',
            createdAt: new Date()
        }));
        await collection('tasks').insertMany(moreData);
        console.log('✅ 插入 10000 条任务数据\n');

        console.log('开始删除...');
        const result2 = await collection('tasks').deleteBatch(
            { status: 'pending' },
            {
                batchSize: 2000,
                estimateProgress: true,
                onProgress: (progress) => {
                    console.log(`  进度: ${progress.percentage}% (${progress.deleted}/${progress.total} 条，批次 ${progress.currentBatch}/${progress.totalBatches})`);
                }
            }
        );

        console.log(`\n✅ 删除完成: ${result2.deletedCount} 条\n`);

        // ============================================================
        // 示例 3: 基础批量更新 - 批量修改用户状态
        // ============================================================
        console.log('【示例 3】基础批量更新 - 批量修改用户状态');
        console.log('------------------------------------------------------------\n');

        // 准备用户数据
        const users = Array.from({ length: 3000 }, (_, i) => ({
            username: `user${i}`,
            status: 'inactive',
            lastLogin: new Date(Date.now() - Math.random() * 365 * 24 * 60 * 60 * 1000)
        }));
        await collection('users').insertMany(users);
        console.log('✅ 插入 3000 个用户\n');

        // 将 30 天未登录的用户标记为休眠
        const inactiveDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        const result3 = await collection('users').updateBatch(
            {
                status: 'inactive',
                lastLogin: { $lt: inactiveDate }
            },
            {
                $set: {
                    status: 'dormant',
                    dormantAt: new Date()
                }
            },
            { batchSize: 1000 }
        );

        console.log('更新结果:');
        console.log(`  - 匹配数量: ${result3.matchedCount} 条`);
        console.log(`  - 更新数量: ${result3.modifiedCount} 条`);
        console.log(`  - 批次数: ${result3.batchCount} 批\n`);

        // ============================================================
        // 示例 4: 带进度监控的更新 - 批量数据迁移
        // ============================================================
        console.log('【示例 4】带进度监控的更新 - 批量数据迁移');
        console.log('------------------------------------------------------------\n');

        // 准备订单数据
        const orders = Array.from({ length: 8000 }, (_, i) => ({
            orderNo: `ORD${i}`,
            oldStatus: 'paid',
            amount: Math.random() * 1000
        }));
        await collection('orders').insertMany(orders);
        console.log('✅ 插入 8000 个订单\n');

        console.log('开始迁移订单状态字段...');
        const result4 = await collection('orders').updateBatch(
            { oldStatus: { $exists: true } },
            {
                $set: { status: 'completed' },
                $unset: { oldStatus: '' }
            },
            {
                batchSize: 2000,
                estimateProgress: true,
                onProgress: (progress) => {
                    console.log(`  迁移进度: ${progress.percentage}% (${progress.modified}/${progress.total} 条)`);
                }
            }
        );

        console.log(`\n✅ 迁移完成: ${result4.modifiedCount} 条\n`);

        // ============================================================
        // 示例 5: 错误处理 - skip 策略
        // ============================================================
        console.log('【示例 5】错误处理 - skip 策略（跳过失败批次）');
        console.log('------------------------------------------------------------\n');

        const result5 = await collection('products').deleteBatch(
            { category: 'temp' },
            {
                batchSize: 1000,
                onError: 'skip'  // 跳过失败的批次，继续执行后续批次
            }
        );

        console.log('删除结果（skip 策略）:');
        console.log(`  - 删除数量: ${result5.deletedCount} 条`);
        console.log(`  - 错误数量: ${result5.errors.length} 个\n`);

        // ============================================================
        // 示例 6: 错误处理 - retry 策略
        // ============================================================
        console.log('【示例 6】错误处理 - retry 策略（自动重试）');
        console.log('------------------------------------------------------------\n');

        // 准备测试数据
        const retryData = Array.from({ length: 2000 }, (_, i) => ({
            id: i,
            status: 'test'
        }));
        await collection('retry_test').insertMany(retryData);
        console.log('✅ 插入 2000 条测试数据\n');

        const result6 = await collection('retry_test').deleteBatch(
            { status: 'test' },
            {
                batchSize: 500,
                onError: 'retry',
                retryAttempts: 3,
                retryDelay: 500,
                onRetry: (info) => {
                    console.log(`  重试批次 ${info.batchIndex + 1}，第 ${info.attempt} 次尝试`);
                }
            }
        );

        console.log('\n删除结果（retry 策略）:');
        console.log(`  - 删除数量: ${result6.deletedCount} 条`);
        console.log(`  - 重试次数: ${result6.retries.length} 次\n`);

        // ============================================================
        // 示例 7: 复杂更新操作 - 多字段批量修改
        // ============================================================
        console.log('【示例 7】复杂更新操作 - 多字段批量修改');
        console.log('------------------------------------------------------------\n');

        // 准备商品数据
        const products = Array.from({ length: 4000 }, (_, i) => ({
            sku: `SKU${i}`,
            price: 100,
            stock: 50,
            tags: ['old']
        }));
        await collection('products').insertMany(products);
        console.log('✅ 插入 4000 个商品\n');

        const result7 = await collection('products').updateBatch(
            { price: { $lte: 100 } },
            {
                $mul: { price: 1.1 },        // 价格上涨 10%
                $inc: { stock: 100 },        // 库存增加 100
                $push: { tags: 'promoted' }, // 添加促销标签
                $set: { updatedAt: new Date() }
            },
            {
                batchSize: 1000,
                estimateProgress: true,
                onProgress: (p) => {
                    if (p.percentage === 100 || p.currentBatch % 2 === 0) {
                        console.log(`  更新进度: ${p.percentage}%`);
                    }
                }
            }
        );

        console.log(`\n✅ 批量调价完成: ${result7.modifiedCount} 个商品\n`);

        // ============================================================
        // 示例 8: 性能对比 - deleteBatch vs deleteMany
        // ============================================================
        console.log('【示例 8】性能对比 - deleteBatch vs deleteMany');
        console.log('------------------------------------------------------------\n');

        // 测试 deleteBatch
        const testData1 = Array.from({ length: 10000 }, (_, i) => ({
            type: 'batch_test',
            index: i
        }));
        await collection('perf_test').insertMany(testData1);

        console.log('测试 deleteBatch...');
        const start1 = Date.now();
        await collection('perf_test').deleteBatch(
            { type: 'batch_test' },
            { batchSize: 2000 }
        );
        const time1 = Date.now() - start1;
        console.log(`  deleteBatch 耗时: ${time1}ms\n`);

        // 测试 deleteMany
        const testData2 = Array.from({ length: 10000 }, (_, i) => ({
            type: 'many_test',
            index: i
        }));
        await collection('perf_test').insertMany(testData2);

        console.log('测试 deleteMany...');
        const start2 = Date.now();
        await collection('perf_test').deleteMany({ type: 'many_test' });
        const time2 = Date.now() - start2;
        console.log(`  deleteMany 耗时: ${time2}ms\n`);

        console.log('结论:');
        if (time1 < time2 * 1.2) {
            console.log(`  ✅ deleteBatch 性能相当或更优 (${time1}ms vs ${time2}ms)`);
        } else {
            console.log(`  ⚠️  对于小数据量，deleteMany 可能更快 (${time1}ms vs ${time2}ms)`);
        }
        console.log('  💡 建议: 数据量 > 10000 时使用 deleteBatch\n');

        // ============================================================
        // 总结
        // ============================================================
        console.log('========================================');
        console.log('✅ 所有示例运行完成！');
        console.log('========================================\n');

        console.log('📝 使用建议:');
        console.log('  1. 数据量 > 10000 时，使用 deleteBatch/updateBatch');
        console.log('  2. 需要进度监控时，设置 estimateProgress: true');
        console.log('  3. 网络不稳定时，使用 onError: "retry"');
        console.log('  4. 批次大小建议: 1000-5000 条/批\n');

        await msq.close();
        console.log('✅ 连接已关闭');

        // 强制退出
        setTimeout(() => process.exit(0), 1000);

    } catch (error) {
        console.error('\n❌ 示例运行失败:', error.message);
        console.error(error.stack);
        try {
            await msq.close();
        } catch (e) {
            // ignore
        }
        process.exit(1);
    }
}

// 设置超时
const timeout = setTimeout(() => {
    console.error('\n❌ 示例超时，强制退出');
    process.exit(1);
}, 120000);

examples().catch((error) => {
    console.error('\n❌ 未捕获的错误:', error);
    process.exit(1);
}).finally(() => {
    clearTimeout(timeout);
});

