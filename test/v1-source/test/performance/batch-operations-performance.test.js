/**
 * deleteBatch/updateBatch 大数据量性能测试
 * 测试 100 万条数据的实际场景
 */

const MonSQLize = require('../../lib/index');

async function performanceTest() {
    console.log('========================================');
    console.log('批量操作大数据量性能测试');
    console.log('========================================\n');

    const msq = new MonSQLize({
        type: 'mongodb',
        databaseName: 'test_batch_performance',
        config: { useMemoryServer: true }
    });

    try {
        const { collection } = await msq.connect();
        console.log('✅ 连接成功\n');

        // ========================================
        // 场景1：批量删除 100 万条过期日志
        // ========================================
        console.log('【场景1】批量删除 100 万条过期日志');
        console.log('----------------------------------------');

        console.log('📝 准备数据：使用 insertBatch 插入 100 万条日志...');
        const startInsert = Date.now();

        // 🔴 使用 insertBatch 一次性插入 100 万条数据
        const totalDocs = 1000000;
        console.log(`   生成 ${totalDocs.toLocaleString()} 条测试数据...`);
        const docs = Array.from({ length: totalDocs }, (_, i) => ({
            index: i,
            level: i % 3 === 0 ? 'debug' : i % 3 === 1 ? 'info' : 'error',
            message: `Log message ${i}`,
            createdAt: new Date(Date.now() - Math.random() * 365 * 24 * 60 * 60 * 1000), // 过去一年内
            metadata: { userId: Math.floor(Math.random() * 10000), action: 'test' }
        }));

        console.log(`   开始插入 ${totalDocs.toLocaleString()} 条数据，批次大小: 10000...`);
        const insertResult = await collection('logs').insertBatch(docs, {
            batchSize: 10000
        });

        const insertDuration = Date.now() - startInsert;
        console.log(`✅ 插入完成: ${insertResult.insertedCount.toLocaleString()} 条，耗时 ${(insertDuration / 1000).toFixed(2)}s\n`);

        // 批量删除 90 天前的日志（约 75% 数据）
        const expireDate = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
        console.log(`📝 开始删除 90 天前的日志（过期时间: ${expireDate.toISOString().split('T')[0]}）...`);

        const startDelete = Date.now();
        let deletedProgress = [];

        const deleteResult = await collection('logs').deleteBatch(
            { createdAt: { $lt: expireDate } },
            {
                batchSize: 5000,
                estimateProgress: true,
                onProgress: (p) => {
                    if (p.currentBatch % 20 === 0 || p.percentage === 100) {
                        console.log(`   删除进度: ${p.percentage}% (${p.deleted.toLocaleString()}/${p.total.toLocaleString()} 条，${p.currentBatch} 批)`);
                        deletedProgress.push(p);
                    }
                }
            }
        );

        const deleteDuration = Date.now() - startDelete;
        console.log(`\n✅ 删除完成:`);
        console.log(`   - 删除数量: ${deleteResult.deletedCount.toLocaleString()} 条`);
        console.log(`   - 批次数: ${deleteResult.batchCount.toLocaleString()} 批`);
        console.log(`   - 耗时: ${(deleteDuration / 1000).toFixed(2)}s`);
        console.log(`   - 速度: ${Math.round(deleteResult.deletedCount / (deleteDuration / 1000)).toLocaleString()} 条/秒`);
        console.log(`   - 错误: ${deleteResult.errors.length} 个\n`);

        // ========================================
        // 场景2：批量更新剩余的日志级别
        // ========================================
        console.log('【场景2】批量更新剩余日志的级别');
        console.log('----------------------------------------');

        const remainingCount = await collection('logs').count({});
        console.log(`📝 剩余日志数量: ${remainingCount.toLocaleString()} 条`);
        console.log(`📝 开始将所有 debug 级别改为 info...`);

        const startUpdate = Date.now();
        let updateProgress = [];

        const updateResult = await collection('logs').updateBatch(
            { level: 'debug' },
            { $set: { level: 'info', updatedAt: new Date() } },
            {
                batchSize: 5000,
                estimateProgress: true,
                onProgress: (p) => {
                    if (p.currentBatch % 10 === 0 || p.percentage === 100) {
                        console.log(`   更新进度: ${p.percentage}% (${p.modified.toLocaleString()}/${p.total.toLocaleString()} 条，${p.currentBatch} 批)`);
                        updateProgress.push(p);
                    }
                }
            }
        );

        const updateDuration = Date.now() - startUpdate;
        console.log(`\n✅ 更新完成:`);
        console.log(`   - 匹配数量: ${updateResult.matchedCount.toLocaleString()} 条`);
        console.log(`   - 更新数量: ${updateResult.modifiedCount.toLocaleString()} 条`);
        console.log(`   - 批次数: ${updateResult.batchCount.toLocaleString()} 批`);
        console.log(`   - 耗时: ${(updateDuration / 1000).toFixed(2)}s`);
        console.log(`   - 速度: ${Math.round(updateResult.modifiedCount / (updateDuration / 1000)).toLocaleString()} 条/秒`);
        console.log(`   - 错误: ${updateResult.errors.length} 个\n`);

        // ========================================
        // 场景3：测试错误重试机制
        // ========================================
        console.log('【场景3】测试错误重试机制');
        console.log('----------------------------------------');

        // 插入一些测试数据
        const retryDocs = Array.from({ length: 10000 }, (_, i) => ({
            index: i,
            status: 'pending'
        }));
        await collection('retry_test').insertMany(retryDocs);
        console.log('✅ 插入 10,000 条测试数据\n');

        const startRetry = Date.now();
        let retryCount = 0;

        const retryResult = await collection('retry_test').deleteBatch(
            { status: 'pending' },
            {
                batchSize: 1000,
                onError: 'retry',
                retryAttempts: 3,
                retryDelay: 100,
                onRetry: (info) => {
                    retryCount++;
                    console.log(`   重试: 批次 ${info.batchIndex}，第 ${info.attempt} 次重试`);
                }
            }
        );

        const retryDuration = Date.now() - startRetry;
        console.log(`\n✅ 重试测试完成:`);
        console.log(`   - 删除数量: ${retryResult.deletedCount.toLocaleString()} 条`);
        console.log(`   - 重试次数: ${retryResult.retries.length} 次`);
        console.log(`   - 耗时: ${(retryDuration / 1000).toFixed(2)}s\n`);

        // ========================================
        // 性能总结
        // ========================================
        console.log('========================================');
        console.log('性能测试总结');
        console.log('========================================');
        console.log(`\n📊 测试数据:`);
        console.log(`   - 总数据量: ${insertResult.insertedCount.toLocaleString()} 条`);
        console.log(`   - 删除数量: ${deleteResult.deletedCount.toLocaleString()} 条`);
        console.log(`   - 更新数量: ${updateResult.modifiedCount.toLocaleString()} 条`);
        console.log(`\n⏱️  性能指标:`);
        console.log(`   - 插入速度: ${Math.round(insertResult.insertedCount / (insertDuration / 1000)).toLocaleString()} 条/秒`);
        console.log(`   - 删除速度: ${Math.round(deleteResult.deletedCount / (deleteDuration / 1000)).toLocaleString()} 条/秒`);
        console.log(`   - 更新速度: ${Math.round(updateResult.modifiedCount / (updateDuration / 1000)).toLocaleString()} 条/秒`);
        console.log(`\n💾 内存使用:`);
        const memUsage = process.memoryUsage();
        console.log(`   - RSS: ${(memUsage.rss / 1024 / 1024).toFixed(2)} MB`);
        console.log(`   - Heap Used: ${(memUsage.heapUsed / 1024 / 1024).toFixed(2)} MB`);
        console.log(`   - External: ${(memUsage.external / 1024 / 1024).toFixed(2)} MB`);

        console.log('\n🎉 所有性能测试完成！\n');

        await msq.close();
        console.log('✅ 连接已关闭');

        // 强制退出
        setTimeout(() => process.exit(0), 1000);

    } catch (error) {
        console.error('\n❌ 测试失败:', error.message);
        console.error(error.stack);
        try {
            await msq.close();
        } catch (e) {
            // ignore
        }
        process.exit(1);
    }
}

// 设置超时：10分钟
const timeout = setTimeout(() => {
    console.error('\n❌ 测试超时（10分钟），强制退出');
    process.exit(1);
}, 600000);

console.log('⚠️  警告：此测试将插入 100 万条数据，预计需要 5-10 分钟');
console.log('⚠️  建议使用内存数据库运行，避免影响真实数据\n');

performanceTest().catch((error) => {
    console.error('\n❌ 未捕获的错误:', error);
    process.exit(1);
}).finally(() => {
    clearTimeout(timeout);
});

