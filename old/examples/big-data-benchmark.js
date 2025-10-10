/**
 * 一亿数据分页性能测试
 * 测试 monSQLize 在大规模数据集下的分页表现
 */

const MonSQLize = require('../../lib');
const { MongoClient, ObjectId } = require('mongodb');

class BigDataPaginationBenchmark {
    constructor() {
        this.msq = null;
        this.collection = null;
        this.db = null;
        this.testResults = [];
    }

    async initialize() {
        // 连接原生 MongoDB 驱动（用于批量数据生成）
        this.client = new MongoClient('mongodb://localhost:27017');
        await this.client.connect();
        this.db = this.client.db('big_data_test');

        // 初始化 monSQLize
        this.msq = new MonSQLize({
            type: 'mongodb',
            databaseName: 'big_data_test',
            config: { uri: 'mongodb://localhost:27017' },
            maxTimeMS: 30000,  // 增加超时时间
            findLimit: 50,
            cache: {
                maxSize: 500000,  // 增大缓存
                enableStats: true
            },
            // 优化书签配置
            bookmarks: {
                step: 100,        // 每100页一个书签
                maxHops: 50,      // 允许更多跳转
                ttlMs: 30 * 60_000  // 30分钟缓存
            }
        });

        const { collection } = await this.msq.connect();
        this.collection = collection('big_orders');

        console.log('✅ 初始化完成');
    }

    async checkOrGenerateBigData() {
        const orders = this.db.collection('big_orders');
        const existingCount = await orders.countDocuments();

        console.log(`📊 当前数据量: ${existingCount.toLocaleString()} 条`);

        if (existingCount >= 100_000_000) {
            console.log('✅ 数据已足够，跳过生成');
            return existingCount;
        }

        if (existingCount >= 10_000_000) {
            console.log('⚠️  使用现有千万级数据进行测试');
            return existingCount;
        }

        console.log('🚀 开始生成大规模测试数据...');
        console.log('⚠️  注意：生成一亿数据需要很长时间，建议先用较小数据集测试');

        // 生成1000万条数据用于测试（实际生产中可扩展到1亿）
        const targetCount = 10_000_000;
        const batchSize = 10000;
        const statuses = ['paid', 'pending', 'shipped', 'delivered', 'cancelled'];

        console.log(`目标生成: ${targetCount.toLocaleString()} 条记录`);

        for (let batch = 0; batch * batchSize < targetCount; batch++) {
            const orders_batch = [];
            const currentBatchSize = Math.min(batchSize, targetCount - batch * batchSize);

            for (let i = 0; i < currentBatchSize; i++) {
                const recordId = batch * batchSize + i + 1;
                orders_batch.push({
                    _id: new ObjectId(),
                    orderNumber: `ORD-${String(recordId).padStart(10, '0')}`,
                    userId: `user_${Math.floor(Math.random() * 1000000) + 1}`,
                    status: statuses[Math.floor(Math.random() * statuses.length)],
                    amount: Math.floor(Math.random() * 10000) + 10,
                    category: `cat_${Math.floor(Math.random() * 100) + 1}`,
                    region: `region_${Math.floor(Math.random() * 10) + 1}`,
                    createdAt: new Date(Date.now() - Math.random() * 365 * 24 * 60 * 60 * 1000),
                    updatedAt: new Date(),
                    // 添加一些复杂字段模拟真实场景
                    metadata: {
                        source: Math.random() > 0.5 ? 'web' : 'mobile',
                        campaign: `campaign_${Math.floor(Math.random() * 50) + 1}`
                    }
                });
            }

            await orders.insertMany(orders_batch, { ordered: false });

            if (batch % 10 === 0) {
                console.log(`已生成: ${((batch + 1) * batchSize).toLocaleString()} 条记录`);
            }
        }

        console.log('📝 创建性能优化索引...');

        // 创建关键索引
        await orders.createIndex({ _id: 1 });
        await orders.createIndex({ createdAt: -1, _id: 1 });
        await orders.createIndex({ status: 1, createdAt: -1, _id: 1 });
        await orders.createIndex({ category: 1, createdAt: -1, _id: 1 });
        await orders.createIndex({ region: 1, status: 1, createdAt: -1, _id: 1 });

        // 复合索引优化分页查询
        await orders.createIndex({
            status: 1,
            category: 1,
            createdAt: -1,
            _id: 1
        }, { name: 'pagination_optimized' });

        const finalCount = await orders.countDocuments();
        console.log(`✅ 数据生成完成，总计: ${finalCount.toLocaleString()} 条记录`);

        return finalCount;
    }

    async runPerformanceTest(testName, testFn) {
        console.log(`\n🔍 测试: ${testName}`);

        const startTime = process.hrtime.bigint();
        const startMem = process.memoryUsage();

        let result;
        let error = null;

        try {
            result = await testFn();
        } catch (e) {
            error = e;
            console.log(`❌ 测试失败: ${e.message}`);
        }

        const endTime = process.hrtime.bigint();
        const endMem = process.memoryUsage();
        const duration = Number(endTime - startTime) / 1_000_000; // 转换为毫秒

        const testResult = {
            name: testName,
            duration,
            memoryDelta: {
                rss: endMem.rss - startMem.rss,
                heapUsed: endMem.heapUsed - startMem.heapUsed
            },
            success: !error,
            error: error?.message,
            result
        };

        this.testResults.push(testResult);

        if (!error) {
            console.log(`   ⏱️  耗时: ${duration.toFixed(2)}ms`);
            console.log(`   💾 内存增量: ${(testResult.memoryDelta.heapUsed / 1024 / 1024).toFixed(2)}MB`);
            if (result?.items) {
                console.log(`   📄 返回记录: ${result.items.length} 条`);
            }
        }

        return testResult;
    }

    async testBasicPagination() {
        return await this.runPerformanceTest('基础分页 - 第1页', async () => {
            return await this.collection.findPage({
                query: {},
                sort: { _id: 1 },
                limit: 50,
                cache: 30000
            });
        });
    }

    async testEarlyPageOffset() {
        return await this.runPerformanceTest('前期页面 - 第10页 (Offset)', async () => {
            return await this.collection.findPage({
                query: {},
                sort: { _id: 1 },
                limit: 50,
                page: 10,
                offsetJump: {
                    enable: true,
                    maxSkip: 50000
                },
                cache: 30000
            });
        });
    }

    async testMidRangeBookmark() {
        return await this.runPerformanceTest('中等距离 - 第500页 (书签)', async () => {
            return await this.collection.findPage({
                query: {},
                sort: { _id: 1 },
                limit: 50,
                page: 500,
                jump: {
                    step: 50,
                    maxHops: 30
                },
                cache: 30000
            });
        });
    }

    async testLongRangeBookmark() {
        return await this.runPerformanceTest('远距离 - 第10000页 (书签)', async () => {
            return await this.collection.findPage({
                query: {},
                sort: { _id: 1 },
                limit: 50,
                page: 10000,
                jump: {
                    step: 100,
                    maxHops: 50
                },
                cache: 30000,
                maxTimeMS: 30000
            });
        });
    }

    async testFilteredPagination() {
        return await this.runPerformanceTest('条件查询分页 - 付费订单', async () => {
            return await this.collection.findPage({
                query: { status: 'paid' },
                sort: { createdAt: -1, _id: 1 },
                limit: 50,
                page: 100,
                jump: {
                    step: 50,
                    maxHops: 30
                },
                cache: 30000,
                hint: { status: 1, createdAt: -1, _id: 1 }
            });
        });
    }

    async testComplexQuery() {
        return await this.runPerformanceTest('复杂查询分页', async () => {
            return await this.collection.findPage({
                query: {
                    status: { $in: ['paid', 'shipped'] },
                    amount: { $gte: 100, $lte: 5000 },
                    createdAt: { $gte: new Date('2024-01-01') }
                },
                sort: { createdAt: -1, _id: 1 },
                limit: 50,
                page: 50,
                jump: {
                    step: 25,
                    maxHops: 30
                },
                cache: 30000
            });
        });
    }

    async testCursorPagination() {
        return await this.runPerformanceTest('游标分页连续翻页', async () => {
            // 先获取第一页
            const page1 = await this.collection.findPage({
                query: { status: 'paid' },
                sort: { _id: 1 },
                limit: 50,
                cache: 30000
            });

            if (!page1.pageInfo?.endCursor) {
                throw new Error('无法获取游标');
            }

            // 使用游标获取下一页
            return await this.collection.findPage({
                query: { status: 'paid' },
                sort: { _id: 1 },
                limit: 50,
                after: page1.pageInfo.endCursor,
                cache: 30000
            });
        });
    }

    async testTotalCount() {
        return await this.runPerformanceTest('总数统计', async () => {
            return await this.collection.findPage({
                query: { status: 'paid' },
                sort: { _id: 1 },
                limit: 50,
                page: 1,
                totals: {
                    mode: 'sync',
                    maxTimeMS: 10000
                },
                cache: 30000
            });
        });
    }

    showPerformanceReport() {
        console.log('\n📊 性能测试报告');
        console.log('=====================================');

        const successful = this.testResults.filter(t => t.success);
        const failed = this.testResults.filter(t => !t.success);

        if (successful.length > 0) {
            console.log('\n✅ 成功的测试:');
            successful.forEach(test => {
                console.log(`   ${test.name}:`);
                console.log(`      ⏱️  响应时间: ${test.duration.toFixed(2)}ms`);
                console.log(`      💾 内存使用: ${(test.memoryDelta.heapUsed / 1024 / 1024).toFixed(2)}MB`);
            });

            // 性能分析
            const avgTime = successful.reduce((sum, t) => sum + t.duration, 0) / successful.length;
            const maxTime = Math.max(...successful.map(t => t.duration));
            const minTime = Math.min(...successful.map(t => t.duration));

            console.log('\n📈 性能统计:');
            console.log(`   平均响应时间: ${avgTime.toFixed(2)}ms`);
            console.log(`   最快响应: ${minTime.toFixed(2)}ms`);
            console.log(`   最慢响应: ${maxTime.toFixed(2)}ms`);
        }

        if (failed.length > 0) {
            console.log('\n❌ 失败的测试:');
            failed.forEach(test => {
                console.log(`   ${test.name}: ${test.error}`);
            });
        }

        // 缓存统计
        const cache = this.msq.getCache();
        const stats = cache.getStats && cache.getStats();
        if (stats) {
            console.log('\n🎯 缓存性能:');
            console.log(`   命中率: ${(stats.hitRate * 100).toFixed(2)}%`);
            console.log(`   命中次数: ${stats.hits}`);
            console.log(`   未命中次数: ${stats.misses}`);
            console.log(`   缓存大小: ${stats.size} 项`);
            console.log(`   内存使用: ${(stats.memoryUsageMB).toFixed(2)}MB`);
        }
    }

    async runFullBenchmark() {
        console.log('🚀 一亿数据分页性能基准测试');
        console.log('=====================================');

        try {
            await this.initialize();
            const dataCount = await this.checkOrGenerateBigData();

            console.log(`\n📊 开始性能测试 (数据量: ${dataCount.toLocaleString()})`);

            // 执行各种分页场景测试
            await this.testBasicPagination();
            await this.testEarlyPageOffset();
            await this.testMidRangeBookmark();
            await this.testLongRangeBookmark();
            await this.testFilteredPagination();
            await this.testComplexQuery();
            await this.testCursorPagination();
            await this.testTotalCount();

            this.showPerformanceReport();

        } catch (error) {
            console.error('❌ 基准测试失败:', error.message);
            throw error;
        }
    }

    async cleanup() {
        if (this.msq) {
            await this.msq.close();
        }
        if (this.client) {
            await this.client.close();
        }
        console.log('✅ 清理完成');
    }
}

// 主执行函数
async function runBigDataBenchmark() {
    const benchmark = new BigDataPaginationBenchmark();

    try {
        await benchmark.runFullBenchmark();
    } catch (error) {
        console.error('💥 基准测试出错:', error.message);
    } finally {
        await benchmark.cleanup();
    }
}

// 运行测试
if (require.main === module) {
    runBigDataBenchmark();
}

module.exports = { BigDataPaginationBenchmark };
