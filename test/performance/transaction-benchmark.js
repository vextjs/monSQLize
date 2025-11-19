/**
 * 事务性能基准测试
 * 测试 v2.1.0 性能优化效果
 */

const MonSQLize = require('../../lib/index');

// 性能统计
class BenchmarkStats {
    constructor(name) {
        this.name = name;
        this.count = 0;
        this.successCount = 0;
        this.failCount = 0;
        this.durations = [];
        this.startTime = null;
    }

    start() {
        this.startTime = Date.now();
    }

    record(duration, success = true) {
        this.count++;
        if (success) {
            this.successCount++;
        } else {
            this.failCount++;
        }
        this.durations.push(duration);
    }

    getResults() {
        const totalTime = Date.now() - this.startTime;
        const sortedDurations = [...this.durations].sort((a, b) => a - b);
        const avg = sortedDurations.reduce((a, b) => a + b, 0) / sortedDurations.length;
        const p50 = sortedDurations[Math.floor(sortedDurations.length * 0.5)];
        const p95 = sortedDurations[Math.floor(sortedDurations.length * 0.95)];
        const p99 = sortedDurations[Math.floor(sortedDurations.length * 0.99)];
        const tps = (this.count / (totalTime / 1000)).toFixed(2);

        return {
            name: this.name,
            count: this.count,
            successCount: this.successCount,
            failCount: this.failCount,
            totalTime: `${(totalTime / 1000).toFixed(2)}s`,
            tps: parseFloat(tps),
            avgDuration: `${avg.toFixed(2)}ms`,
            p50Duration: `${p50.toFixed(2)}ms`,
            p95Duration: `${p95.toFixed(2)}ms`,
            p99Duration: `${p99.toFixed(2)}ms`,
            successRate: `${((this.successCount / this.count) * 100).toFixed(2)}%`
        };
    }
}

// 并发执行
async function runConcurrent(name, concurrency, iterations, task) {
    const stats = new BenchmarkStats(name);
    stats.start();

    const tasks = [];
    for (let i = 0; i < concurrency; i++) {
        const promise = (async () => {
            for (let j = 0; j < iterations; j++) {
                const start = Date.now();
                try {
                    await task(i, j);
                    const duration = Date.now() - start;
                    stats.record(duration, true);
                } catch (error) {
                    const duration = Date.now() - start;
                    stats.record(duration, false);
                    console.error(`[${name}] 错误:`, error.message);
                }
            }
        })();
        tasks.push(promise);
    }

    await Promise.all(tasks);
    return stats.getResults();
}

// 主测试函数
async function main() {
    console.log('\n═══════════════════════════════════════════');
    console.log('🚀 事务性能基准测试 v2.1.0');
    console.log('═══════════════════════════════════════════\n');

    const msq = new MonSQLize({
        type: 'mongodb',
        databaseName: 'benchmark_test',
        config: {
            uri: 'mongodb://localhost:27017/?replicaSet=rs0'
        },
        cache: { enabled: true, ttl: 60000 }
    });

    try {
        const { collection } = await msq.connect();

        // 获取集合访问器
        const products = collection('products');

        // 准备测试数据
        console.log('📝 准备测试数据...');
        await products.deleteMany({});

        const testProducts = [];
        for (let i = 1; i <= 1000; i++) {
            testProducts.push({
                _id: i,
                name: `Product ${i}`,
                stock: 1000,
                price: 99.99,
                views: 0
            });
        }
        await products.insertMany(testProducts);
        console.log(`✅ 插入 ${testProducts.length} 个测试产品\n`);

        // 测试1: 高并发写入（不同文档）- 文档级别锁优势
        console.log('═══════════════════════════════════════════');
        console.log('📊 测试1: 高并发写入（不同文档）');
        console.log('   期望: 文档级别锁带来显著提升');
        console.log('═══════════════════════════════════════════\n');

        const test1 = await runConcurrent(
            '高并发写入（不同文档）',
            50, // 50个并发
            10, // 每个并发10次
            async (clientId, iter) => {
                const productId = (clientId * 10 + iter) % 1000 + 1;
                await msq.withTransaction(async (tx) => {
                    await products.updateOne(
                        { _id: productId },
                        { $inc: { stock: -1 } },
                        { session: tx.session }
                    );
                });
            }
        );

        console.log('结果:', test1);
        console.log(`   TPS: ${test1.tps} (期望 >500)`);
        console.log(`   成功率: ${test1.successRate}`);
        console.log(`   P95延迟: ${test1.p95Duration}\n`);

        // 测试2: 高并发写入（相同文档）- 锁竞争
        console.log('═══════════════════════════════════════════');
        console.log('📊 测试2: 高并发写入（相同文档）');
        console.log('   期望: 存在锁竞争，TPS较低');
        console.log('═══════════════════════════════════════════\n');

        const test2 = await runConcurrent(
            '高并发写入（相同文档）',
            50,
            10,
            async () => {
                await msq.withTransaction(async (tx) => {
                    await products.updateOne(
                        { _id: 1 }, // 所有并发都写同一个文档
                        { $inc: { stock: -1 } },
                        { session: tx.session }
                    );
                });
            }
        );

        console.log('结果:', test2);
        console.log(`   TPS: ${test2.tps} (期望 <100，正常现象)`);
        console.log(`   成功率: ${test2.successRate}\n`);

        // 测试3: 只读事务优化
        console.log('═══════════════════════════════════════════');
        console.log('📊 测试3: 只读事务（缓存优化）');
        console.log('   期望: 缓存命中率高，减少DB访问');
        console.log('═══════════════════════════════════════════\n');

        const test3 = await runConcurrent(
            '只读事务',
            50,
            20, // 更多次数测试缓存
            async (clientId, iter) => {
                const productId = (iter % 10) + 1; // 重复查询前10个产品
                await msq.withTransaction(async (tx) => {
                    await products.findOne(
                        { _id: productId },
                        { session: tx.session, cache: 30000 }
                    );
                });
            }
        );

        console.log('结果:', test3);
        console.log(`   TPS: ${test3.tps}`);
        console.log(`   平均延迟: ${test3.avgDuration}`);
        console.log(`   P95延迟: ${test3.p95Duration}\n`);

        // 测试4: 混合读写
        console.log('═══════════════════════════════════════════');
        console.log('📊 测试4: 混合读写（70%读 + 30%写）');
        console.log('   期望: TPS显著提升');
        console.log('═══════════════════════════════════════════\n');

        const test4 = await runConcurrent(
            '混合读写',
            50,
            20,
            async (clientId, iter) => {
                const productId = (clientId * 20 + iter) % 1000 + 1;
                await msq.withTransaction(async (tx) => {
                    // 70% 读操作
                    if (Math.random() < 0.7) {
                        await products.findOne(
                            { _id: productId },
                            { session: tx.session, cache: 30000 }
                        );
                    } else {
                        // 30% 写操作
                        await products.updateOne(
                            { _id: productId },
                            { $inc: { views: 1 } },
                            { session: tx.session }
                        );
                    }
                });
            }
        );

        console.log('结果:', test4);
        console.log(`   TPS: ${test4.tps} (期望 >400)`);
        console.log(`   成功率: ${test4.successRate}`);
        console.log(`   P95延迟: ${test4.p95Duration}\n`);

        // 测试5: 批量文档锁（$in 查询）
        console.log('═══════════════════════════════════════════');
        console.log('📊 测试5: 批量文档锁（$in 查询）');
        console.log('   期望: 精确锁定多个文档');
        console.log('═══════════════════════════════════════════\n');

        const test5 = await runConcurrent(
            '批量文档锁',
            30,
            10,
            async (clientId, iter) => {
                const startId = (clientId * 10 + iter) * 5 + 1;
                const ids = Array.from({ length: 5 }, (_, i) => startId + i);
                await msq.withTransaction(async (tx) => {
                    await products.updateMany(
                        { _id: { $in: ids } },
                        { $inc: { views: 1 } },
                        { session: tx.session }
                    );
                });
            }
        );

        console.log('结果:', test5);
        console.log(`   TPS: ${test5.tps}`);
        console.log(`   成功率: ${test5.successRate}\n`);

        // 获取事务统计
        console.log('═══════════════════════════════════════════');
        console.log('📊 事务统计信息');
        console.log('═══════════════════════════════════════════\n');

        const txStats = msq._transactionManager.getStats();
        console.log('总事务数:', txStats.totalTransactions);
        console.log('只读事务:', txStats.readOnlyTransactions);
        console.log('写入事务:', txStats.writeTransactions);
        console.log('只读比例:', txStats.readOnlyRatio);
        console.log('成功率:', txStats.successRate);
        console.log('平均耗时:', `${txStats.averageDuration.toFixed(2)}ms`);
        console.log('P95 耗时:', `${txStats.p95Duration.toFixed(2)}ms`);
        console.log('P99 耗时:', `${txStats.p99Duration.toFixed(2)}ms\n`);

        // 汇总报告
        console.log('═══════════════════════════════════════════');
        console.log('📈 性能汇总报告');
        console.log('═══════════════════════════════════════════\n');

        console.log('| 测试场景 | TPS | 成功率 | P95延迟 |');
        console.log('|---------|-----|--------|---------|');
        console.log(`| 高并发写入（不同文档） | ${test1.tps} | ${test1.successRate} | ${test1.p95Duration} |`);
        console.log(`| 高并发写入（相同文档） | ${test2.tps} | ${test2.successRate} | ${test2.p95Duration} |`);
        console.log(`| 只读事务 | ${test3.tps} | ${test3.successRate} | ${test3.p95Duration} |`);
        console.log(`| 混合读写 | ${test4.tps} | ${test4.successRate} | ${test4.p95Duration} |`);
        console.log(`| 批量文档锁 | ${test5.tps} | ${test5.successRate} | ${test5.p95Duration} |`);

        console.log('\n✅ 性能测试完成！\n');

        // 清理测试数据
        await products.deleteMany({});

    } catch (error) {
        console.error('\n❌ 测试失败:', error);
        process.exit(1);
    } finally {
        await msq.close();
    }
}

// 运行测试
if (require.main === module) {
    main().catch(console.error);
}

module.exports = { runConcurrent, BenchmarkStats };

