const MonSQLize = require('../../lib');

async function setupTestData(orders) {
    // 检查是否有测试数据，如果没有就创建一些
    try {
        const count = await orders.count({ query: {} });
        console.log(`数据库中现有订单数量: ${count}`);

        if (count < 1000) {
            console.log('检测到数据不足，跳过需要大量数据的演示...\n');
            return false;
        }
        return true;
    } catch (error) {
        console.log('数据检查失败，可能是数据库连接问题');
        throw error;
    }
}

async function demonstratePagination() {
    // 初始化 monSQLize 实例
    const msq = new MonSQLize({
        type: 'mongodb',
        databaseName: 'ecommerce',
        config: { uri: 'mongodb://localhost:27017' },
        maxTimeMS: 3000,
        findLimit: 20,
        // 配置书签系统
        bookmarks: {
            step: 10,        // 每10页保存一个书签
            maxHops: 20,     // 最大连续跳转次数
            ttlMs: 6 * 3600_000  // 6小时过期
        },
        // 启用缓存
        cache: {
            maxSize: 100000,
            enableStats: true
        }
    });

    try {
        const { collection } = await msq.connect();
        const orders = collection('orders');

        console.log('=== 跳页功能演示 ===\n');

        // 检查数据库健康状态
        const health = await msq.health();
        console.log(`数据库连接状态: ${health.connected ? '正常' : '异常'}\n`);

        // 检查测试数据
        const hasEnoughData = await setupTestData(orders);

        // 1. 基础分页测试（从第1页开始，安全起见）
        console.log('1. 基础分页测试（第1页）');
        try {
            const page1 = await orders.findPage({
                query: {},
                sort: { _id: 1 },  // 使用 _id 排序更安全
                limit: 10,
                cache: 3000
            });

            console.log(`第1页数据条数: ${page1.items.length}`);
            console.log(`有下一页: ${page1.pageInfo.hasNext}`);

            if (page1.items.length === 0) {
                console.log('数据库中没有数据，创建一些测试数据或连接到有数据的数据库\n');
                return;
            }
        } catch (error) {
            console.log(`基础分页失败: ${error.message}`);
            if (error.code) console.log(`错误代码: ${error.code}`);
            return;
        }

        // 2. 小范围跳页（使用 offset 兜底）
        console.log('2. 小范围跳页到第3页（使用 offset 优化）');
        try {
            const page3 = await orders.findPage({
                query: {},
                sort: { _id: 1 },
                limit: 10,
                page: 3,
                offsetJump: {
                    enable: true,
                    maxSkip: 10000
                },
                cache: 3000
            });

            console.log(`第3页数据条数: ${page3.items.length}`);
            console.log(`当前页: ${page3.pageInfo.currentPage}\n`);
        } catch (error) {
            console.log(`小范围跳页失败: ${error.message}`);
            if (error.code === 'INVALID_CURSOR') {
                console.log('游标无效，可能是数据变化或排序不一致\n');
            }
        }

        // 只在有足够数据时执行大范围跳页
        if (hasEnoughData) {
            // 3. 中等距离跳页
            console.log('3. 中等距离跳页到第15页');
            try {
                const page15 = await orders.findPage({
                    query: {},
                    sort: { _id: 1 },
                    limit: 20,
                    page: 15,
                    jump: {
                        step: 5,        // 较小的步长
                        maxHops: 20
                    },
                    cache: 2000
                });

                console.log(`第15页数据条数: ${page15.items.length}`);
                console.log(`当前页: ${page15.pageInfo.currentPage}\n`);
            } catch (error) {
                console.log(`中等距离跳页失败: ${error.message}`);
                if (error.code === 'JUMP_TOO_FAR') {
                    console.log('跳页距离过远，尝试减小目标页数或增加 maxHops\n');
                }
            }
        }

        // 4. 游标分页演示（更安全的方式）
        console.log('4. 游标分页演示');
        try {
            // 先获取第一页
            const firstPage = await orders.findPage({
                query: {},
                sort: { _id: 1 },
                limit: 5
            });

            console.log(`第一页数据: ${firstPage.items.length} 条`);

            if (firstPage.pageInfo.hasNext && firstPage.pageInfo.endCursor) {
                // 使用游标获取下一页
                const nextPage = await orders.findPage({
                    query: {},
                    sort: { _id: 1 },
                    limit: 5,
                    after: firstPage.pageInfo.endCursor
                });

                console.log(`下一页数据: ${nextPage.items.length} 条`);
                console.log(`游标分页成功\n`);
            }
        } catch (error) {
            console.log(`游标分页失败: ${error.message}`);
            if (error.code === 'INVALID_CURSOR') {
                console.log('游标解析失败，请检查数据一致性\n');
            }
        }

        // 5. 异步总数统计
        console.log('5. 异步总数统计');
        try {
            const pageWithTotals = await orders.findPage({
                query: {},
                sort: { _id: 1 },
                limit: 10,
                page: 1,
                totals: {
                    mode: 'async',
                    maxTimeMS: 2000,
                    ttlMs: 10 * 60_000
                },
                cache: 3000
            });

            console.log(`当前页: ${pageWithTotals.pageInfo.currentPage}`);
            console.log(`总数状态: ${pageWithTotals.totals?.mode}`);
            console.log(`总数: ${pageWithTotals.totals?.total || '计算中...'}`);
            if (pageWithTotals.totals?.token) {
                console.log(`轮询 token: ${pageWithTotals.totals.token}`);
            }
        } catch (error) {
            console.log(`异步总数统计失败: ${error.message}\n`);
        }

        // 6. 同步总数统计
        console.log('\n6. 同步总数统计');
        try {
            const pageWithSyncTotals = await orders.findPage({
                query: {},
                sort: { _id: 1 },
                limit: 10,
                page: 1,
                totals: {
                    mode: 'sync',
                    maxTimeMS: 3000
                },
                cache: 2000
            });

            console.log(`当前页: ${pageWithSyncTotals.pageInfo.currentPage}`);
            console.log(`总数: ${pageWithSyncTotals.totals?.total}`);
            console.log(`总页数: ${pageWithSyncTotals.totals?.totalPages}\n`);
        } catch (error) {
            console.log(`同步总数统计失败: ${error.message}\n`);
        }

        // 7. 查看缓存统计
        console.log('=== 缓存统计 ===');
        const cache = msq.getCache();
        const stats = cache.getStats && cache.getStats();
        if (stats) {
            const hitRate = stats.hits + stats.misses > 0
                ? ((stats.hits / (stats.hits + stats.misses)) * 100).toFixed(2)
                : '0.00';
            console.log(`缓存命中率: ${hitRate}%`);
            console.log(`总命中次数: ${stats.hits}`);
            console.log(`总未命中次数: ${stats.misses}`);
            console.log(`内存使用: ${(stats.memoryUsage / 1024 / 1024).toFixed(2)} MB`);
        }

        console.log('\n演示完成！');

    } catch (error) {
        if (error.message.includes('ECONNREFUSED')) {
            console.error('数据库连接失败，请确保 MongoDB 正在运行');
        } else if (error.code === 'INVALID_CURSOR') {
            console.error('游标无效错误，这通常是因为:');
            console.error('1. 数据在分页过程中发生了变化');
            console.error('2. 排序字段不一致');
            console.error('3. 缓存中的游标已过期');
        } else {
            console.error('未预期的错误:', error.message);
        }
        throw error;
    } finally {
        await msq.close();
    }
}

// 错误处理包装器
async function runDemo() {
    try {
        await demonstratePagination();
    } catch (error) {
        console.error('演示过程中发生错误:', error.message);
        if (error.code) {
            console.error('错误代码:', error.code);
        }
        if (error.details) {
            console.error('错误详情:', error.details);
        }
    }
}

// 运行演示
if (require.main === module) {
    runDemo();
}

module.exports = { demonstratePagination };
