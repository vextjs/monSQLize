/**
 * 安全的分页演示 - 解决游标无效错误
 * 这个版本专门处理各种边界情况和错误场景
 */

const MonSQLize = require('../../lib');

class SafePaginationDemo {
    constructor() {
        this.msq = null;
        this.orders = null;
    }

    async initialize() {
        this.msq = new MonSQLize({
            type: 'mongodb',
            databaseName: 'ecommerce',
            config: { uri: 'mongodb://localhost:27017' },
            maxTimeMS: 5000,  // 增加超时时间
            findLimit: 20,
            cache: {
                maxSize: 100000,
                enableStats: true
            }
        });

        try {
            const { collection } = await this.msq.connect();
            this.orders = collection('orders');

            // 验证连接
            const health = await this.msq.health();
            if (!health.connected) {
                throw new Error('数据库连接失败');
            }

            console.log('✅ 数据库连接成功');
            return true;
        } catch (error) {
            console.error('❌ 数据库初始化失败:', error.message);
            return false;
        }
    }

    async checkDataAvailability() {
        try {
            const count = await this.orders.count({ query: {} });
            console.log(`📊 数据库中现有记录数量: ${count}`);

            if (count === 0) {
                console.log('⚠️  数据库为空，需要先生成测试数据');
                return { hasData: false, count: 0 };
            }

            if (count < 50) {
                console.log('⚠️  数据量较少，将使用简化演示');
                return { hasData: true, count, limited: true };
            }

            return { hasData: true, count, limited: false };
        } catch (error) {
            console.error('❌ 数据检查失败:', error.message);
            return { hasData: false, count: 0, error: error.message };
        }
    }

    async demonstrateBasicPagination() {
        console.log('\n🔍 1. 基础分页演示');

        try {
            // 获取第一页
            const page1 = await this.orders.findPage({
                query: {},
                sort: { _id: 1 },
                limit: 5,
                cache: 3000
            });

            console.log(`   ✅ 第1页: ${page1.items.length} 条记录`);
            console.log(`   📄 有下一页: ${page1.pageInfo.hasNext}`);
            console.log(`   🔗 游标存在: ${!!page1.pageInfo.endCursor}`);

            if (page1.pageInfo.hasNext && page1.pageInfo.endCursor) {
                // 使用游标获取第二页
                const page2 = await this.orders.findPage({
                    query: {},
                    sort: { _id: 1 },
                    limit: 5,
                    after: page1.pageInfo.endCursor,
                    cache: 3000
                });

                console.log(`   ✅ 第2页: ${page2.items.length} 条记录`);
                console.log(`   🎯 游标分页成功`);

                return { page1, page2, success: true };
            }

            return { page1, success: true };

        } catch (error) {
            console.log(`   ❌ 基础分页失败: ${error.message}`);
            if (error.code === 'INVALID_CURSOR') {
                console.log('   💡 建议: 检查数据库中是否有有效数据');
            }
            return { success: false, error };
        }
    }

    async demonstrateOffsetPagination(dataInfo) {
        console.log('\n🚀 2. Offset 分页演示');

        if (!dataInfo.hasData) {
            console.log('   ⏭️  跳过: 无可用数据');
            return { success: false, reason: 'no_data' };
        }

        try {
            // 计算安全的目标页
            const maxPage = Math.min(5, Math.floor(dataInfo.count / 5));
            const targetPage = Math.max(2, maxPage);

            const result = await this.orders.findPage({
                query: {},
                sort: { _id: 1 },
                limit: 5,
                page: targetPage,
                offsetJump: {
                    enable: true,
                    maxSkip: 1000  // 较小的 skip 限制
                },
                cache: 3000
            });

            console.log(`   ✅ 跳转到第${targetPage}页成功`);
            console.log(`   📊 数据条数: ${result.items.length}`);
            console.log(`   🔢 当前页: ${result.pageInfo.currentPage}`);

            return { success: true, result, targetPage };

        } catch (error) {
            console.log(`   ❌ Offset 分页失败: ${error.message}`);
            return { success: false, error };
        }
    }

    async demonstrateBookmarkPagination(dataInfo) {
        console.log('\n📚 3. 书签跳页演示');

        if (!dataInfo.hasData || dataInfo.count < 100) {
            console.log('   ⏭️  跳过: 数据量不足（需要 >100 条记录）');
            return { success: false, reason: 'insufficient_data' };
        }

        try {
            // 计算安全的目标页
            const maxSafePage = Math.floor(dataInfo.count / 10);
            const targetPage = Math.min(15, maxSafePage);

            const result = await this.orders.findPage({
                query: {},
                sort: { _id: 1 },
                limit: 10,
                page: targetPage,
                jump: {
                    step: 5,       // 较小的步长
                    maxHops: 30    // 充足的跳转限制
                },
                cache: 5000
            });

            console.log(`   ✅ 书签跳转到第${targetPage}页成功`);
            console.log(`   📊 数据条数: ${result.items.length}`);
            console.log(`   🔢 当前页: ${result.pageInfo.currentPage}`);

            return { success: true, result, targetPage };

        } catch (error) {
            console.log(`   ❌ 书签跳页失败: ${error.message}`);
            if (error.code === 'JUMP_TOO_FAR') {
                console.log('   💡 建议: 减小目标页数或增加 maxHops');
            }
            return { success: false, error };
        }
    }

    async demonstrateTotalsCount() {
        console.log('\n🧮 4. 总数统计演示');

        try {
            // 异步总数
            const asyncResult = await this.orders.findPage({
                query: {},
                sort: { _id: 1 },
                limit: 10,
                page: 1,
                totals: {
                    mode: 'async',
                    maxTimeMS: 2000,
                    ttlMs: 5 * 60_000
                },
                cache: 3000
            });

            console.log(`   ✅ 异步总数查询: ${asyncResult.totals?.mode}`);
            console.log(`   🔢 总数: ${asyncResult.totals?.total || '计算中...'}`);
            if (asyncResult.totals?.token) {
                console.log(`   🎫 轮询 token: ${asyncResult.totals.token.substring(0, 8)}...`);
            }

            // 同步总数（如果数据量不大）
            const syncResult = await this.orders.findPage({
                query: {},
                sort: { _id: 1 },
                limit: 10,
                page: 1,
                totals: {
                    mode: 'sync',
                    maxTimeMS: 3000
                },
                cache: 3000
            });

            console.log(`   ✅ 同步总数查询: ${syncResult.totals?.total}`);
            console.log(`   📄 总页数: ${syncResult.totals?.totalPages}`);

            return { success: true, asyncResult, syncResult };

        } catch (error) {
            console.log(`   ❌ 总数统计失败: ${error.message}`);
            return { success: false, error };
        }
    }

    async showCacheStats() {
        console.log('\n📈 缓存统计');

        const cache = this.msq.getCache();
        const stats = cache.getStats && cache.getStats();

        if (stats) {
            const hitRate = stats.hits + stats.misses > 0
                ? ((stats.hits / (stats.hits + stats.misses)) * 100).toFixed(2)
                : '0.00';

            console.log(`   🎯 缓存命中率: ${hitRate}%`);
            console.log(`   ✅ 命中次数: ${stats.hits}`);
            console.log(`   ❌ 未命中次数: ${stats.misses}`);
            console.log(`   💾 内存使用: ${(stats.memoryUsage / 1024 / 1024).toFixed(2)} MB`);
        } else {
            console.log('   ⚠️  缓存统计不可用');
        }
    }

    async runFullDemo() {
        console.log('🚀 MonSQLize 安全分页功能演示');
        console.log('=====================================\n');

        // 1. 初始化
        const initialized = await this.initialize();
        if (!initialized) {
            console.log('\n❌ 演示终止: 初始化失败');
            console.log('💡 请确保 MongoDB 正在运行并且可以连接到 localhost:27017');
            return;
        }

        // 2. 检查数据
        const dataInfo = await this.checkDataAvailability();

        if (!dataInfo.hasData) {
            console.log('\n💡 建议操作:');
            console.log('   1. 运行 generate-test-data.js 生成测试数据');
            console.log('   2. 或者连接到包含数据的数据库');
            console.log('\n演示将使用有限功能继续...');
        }

        // 3. 执行各种分页演示
        await this.demonstrateBasicPagination();
        await this.demonstrateOffsetPagination(dataInfo);
        await this.demonstrateBookmarkPagination(dataInfo);
        await this.demonstrateTotalsCount();

        // 4. 显示统计
        await this.showCacheStats();

        console.log('\n🎉 演示完成!');
        console.log('=====================================');
    }

    async cleanup() {
        if (this.msq) {
            await this.msq.close();
            console.log('✅ 数据库连接已关闭');
        }
    }
}

// 主执行函数
async function runSafeDemo() {
    const demo = new SafePaginationDemo();

    try {
        await demo.runFullDemo();
    } catch (error) {
        console.error('\n💥 演示过程中发生严重错误:');
        console.error(`   错误信息: ${error.message}`);

        if (error.code) {
            console.error(`   错误代码: ${error.code}`);
        }

        // 提供针对性的解决方案
        if (error.message.includes('ECONNREFUSED')) {
            console.log('\n🔧 解决方案:');
            console.log('   1. 启动 MongoDB 服务');
            console.log('   2. 确认连接字符串正确');
            console.log('   3. 检查防火墙设置');
        } else if (error.code === 'INVALID_CURSOR') {
            console.log('\n🔧 解决方案:');
            console.log('   1. 清空缓存重试');
            console.log('   2. 检查数据一致性');
            console.log('   3. 使用稳定的排序字段');
        }
    } finally {
        await demo.cleanup();
    }
}

// 运行演示
if (require.main === module) {
    runSafeDemo();
}

module.exports = { SafePaginationDemo, runSafeDemo };
