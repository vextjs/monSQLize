// bookmarks.examples.js - Bookmark 维护 APIs 示例
// 用途：管理 findPage 的 bookmark 缓存，用于运维调试、性能优化

const MonSQLize = require('../lib');
const { stopMemoryServer } = require('../lib/mongodb/connect');

// MongoDB 连接配置 - 使用内存数据库方便独立运行
const DB_CONFIG = {
    type: 'mongodb',
    databaseName: 'example_bookmarks',
    config: { useMemoryServer: true },
    cache: { enabled: true, maxSize: 1000 },
    defaults: { limit: 10, bookmarkTTL: 3600000 } // bookmark 缓存 1 小时
};

/**
 * 示例 1: 预热常用页面的 bookmark 缓存
 * 使用场景：系统启动时预热热点数据，减少首次查询延迟
 */
async function example1_PrewarmBookmarks() {
    console.log('\n========== 示例 1: 预热 bookmark 缓存 ==========');
    
    const client = new MonSQLize(DB_CONFIG);

    try {
        const { collection } = await client.connect();
        const products = collection('products');

        // 预热前 3 页的 bookmark（常用的热点页面）
        const keyDims = {
            query: { status: 'active' },
            sort: { createdAt: -1 },
            limit: 10
        };

        console.log('预热页面: [1, 2, 3]');
        const result = await products.prewarmBookmarks(keyDims, [1, 2, 3]);

        console.log('预热结果:', {
            warmed: result.warmed,      // 成功预热的页数
            failed: result.failed,      // 失败的页数
            totalKeys: result.keys.length  // 缓存的 key 数量
        });

        console.log('\n✅ 预热完成，后续查询这些页面将命中缓存');
    } finally {
        await client.close();
    }
}

/**
 * 示例 2: 列出特定查询的所有 bookmark
 * 使用场景：运维调试，查看哪些页面已缓存
 */
async function example2_ListBookmarks() {
    console.log('\n========== 示例 2: 列出 bookmark 缓存 ==========');
    
    const client = new MonSQLize(DB_CONFIG);

    try {
        const { collection } = await client.connect();
        const products = collection('products');

        // 先预热一些页面
        const keyDims = {
            query: { category: 'electronics' },
            sort: { price: -1 },
            limit: 20
        };

        await products.prewarmBookmarks(keyDims, [1, 2, 3]);

        // 列出特定查询的所有 bookmark
        console.log('\n列出特定查询的 bookmark:');
        const list1 = await products.listBookmarks(keyDims);
        console.log('  - 查询: category=electronics, sort=price desc');
        console.log('  - 已缓存页面:', list1.pages);
        console.log('  - 缓存数量:', list1.count);

        // 列出所有 bookmark（不传 keyDims）
        console.log('\n列出所有 bookmark:');
        const listAll = await products.listBookmarks();
        console.log('  - 总缓存数量:', listAll.count);
        console.log('  - 所有页面:', listAll.pages);

        console.log('\n✅ 可用于运维监控、缓存统计');
    } finally {
        await client.close();
    }
}

/**
 * 示例 3: 清除特定查询的 bookmark 缓存
 * 使用场景：数据变更后清除缓存，确保查询最新数据
 */
async function example3_ClearBookmarks() {
    console.log('\n========== 示例 3: 清除 bookmark 缓存 ==========');
    
    const client = new MonSQLize(DB_CONFIG);

    try {
        const { collection } = await client.connect();
        const products = collection('products');

        // 预热两个不同的查询
        const keyDims1 = { query: { category: 'books' }, sort: { title: 1 }, limit: 10 };
        const keyDims2 = { query: { category: 'clothing' }, sort: { price: 1 }, limit: 15 };

        await products.prewarmBookmarks(keyDims1, [1, 2]);
        await products.prewarmBookmarks(keyDims2, [1]);

        console.log('\n清除前:');
        const before1 = await products.listBookmarks(keyDims1);
        const before2 = await products.listBookmarks(keyDims2);
        console.log('  - books 查询缓存:', before1.pages);
        console.log('  - clothing 查询缓存:', before2.pages);

        // 清除特定查询的 bookmark
        console.log('\n清除 books 查询的缓存...');
        const clearResult = await products.clearBookmarks(keyDims1);
        console.log('  - 已清除:', clearResult.cleared, '个 bookmark');

        console.log('\n清除后:');
        const after1 = await products.listBookmarks(keyDims1);
        const after2 = await products.listBookmarks(keyDims2);
        console.log('  - books 查询缓存:', after1.pages, '(已清除)');
        console.log('  - clothing 查询缓存:', after2.pages, '(保留)');

        console.log('\n✅ 清除操作支持精确控制，不影响其他查询');
    } finally {
        await client.close();
    }
}

/**
 * 示例 4: 清除所有 bookmark 缓存
 * 使用场景：全局缓存重置，释放内存
 */
async function example4_ClearAllBookmarks() {
    console.log('\n========== 示例 4: 清除所有 bookmark 缓存 ==========');
    
    const client = new MonSQLize(DB_CONFIG);

    try {
        const { collection } = await client.connect();
        const products = collection('products');

        // 预热多个查询
        await products.prewarmBookmarks({ sort: { _id: 1 }, limit: 10 }, [1, 2]);
        await products.prewarmBookmarks({ sort: { price: -1 }, limit: 20 }, [1]);

        console.log('\n清除前:');
        const beforeAll = await products.listBookmarks();
        console.log('  - 总缓存数量:', beforeAll.count);

        // 清除所有 bookmark（不传 keyDims）
        console.log('\n清除所有缓存...');
        const clearAllResult = await products.clearBookmarks();
        console.log('  - 已清除:', clearAllResult.cleared, '个 bookmark');

        console.log('\n清除后:');
        const afterAll = await products.listBookmarks();
        console.log('  - 总缓存数量:', afterAll.count, '(已全部清除)');

        console.log('\n✅ 一键清空所有 bookmark，适合全局重置');
    } finally {
        await client.close();
    }
}

/**
 * 示例 5: 完整工作流 - 预热 → 使用 → 清除
 * 使用场景：实际生产环境的典型流程
 */
async function example5_CompleteWorkflow() {
    console.log('\n========== 示例 5: 完整工作流 ==========');
    
    const client = new MonSQLize(DB_CONFIG);

    try {
        const { collection } = await client.connect();
        const orders = collection('orders');

        const keyDims = {
            query: { status: 'pending' },
            sort: { createdAt: -1 },
            limit: 50
        };

        // 步骤 1: 系统启动时预热常用页面
        console.log('\n步骤 1: 预热常用页面 [1, 2, 3, 4, 5]');
        const prewarmResult = await orders.prewarmBookmarks(keyDims, [1, 2, 3, 4, 5]);
        console.log('  - 预热成功:', prewarmResult.warmed, '页');

        // 步骤 2: 实际业务查询（直接跳转到第 3 页）
        console.log('\n步骤 2: 业务查询第 3 页（命中 bookmark 缓存）');
        const page3 = await orders.findPage({ ...keyDims, page: 3 });
        console.log('  - 查询到:', page3.items.length, '条数据');
        console.log('  - 缓存命中: 是（跳转速度极快）');

        // 步骤 3: 运维监控 - 查看缓存状态
        console.log('\n步骤 3: 监控缓存状态');
        const list = await orders.listBookmarks(keyDims);
        console.log('  - 当前缓存页:', list.pages);
        console.log('  - 缓存数量:', list.count);

        // 步骤 4: 数据更新后清除缓存
        console.log('\n步骤 4: 数据更新，清除缓存');
        // 模拟：批量更新订单状态
        console.log('  - 模拟: 批量更新订单状态...');
        const clearResult = await orders.clearBookmarks(keyDims);
        console.log('  - 已清除:', clearResult.cleared, '个 bookmark');

        // 步骤 5: 验证清除效果
        console.log('\n步骤 5: 验证缓存已清除');
        const finalList = await orders.listBookmarks(keyDims);
        console.log('  - 剩余缓存:', finalList.count, '(应该为 0)');

        console.log('\n✅ 完整工作流演示完成');
        console.log('   - 适用场景: 高频查询页面的性能优化');
        console.log('   - 注意事项: 数据变更后及时清除缓存');
    } finally {
        await client.close();
    }
}

// 运行所有示例
async function runAll() {
    console.log('========================================');
    console.log('MonSQLize Bookmark 维护 APIs 示例');
    console.log('========================================');
    console.log('\n使用内存数据库运行示例，无需外部 MongoDB 服务\n');

    try {
        await example1_PrewarmBookmarks();
        await example2_ListBookmarks();
        await example3_ClearBookmarks();
        await example4_ClearAllBookmarks();
        await example5_CompleteWorkflow();

        console.log('\n========================================');
        console.log('✅ 所有示例运行完成');
        console.log('========================================\n');
    } catch (error) {
        console.error('\n❌ 示例运行失败:', error.message);
        console.error('错误堆栈:', error.stack);
        process.exit(1);
    } finally {
        // 显式停止 Memory Server，否则 Node.js 进程会卡住
        await stopMemoryServer();
    }
}

// 如果直接运行此文件，执行所有示例
if (require.main === module) {
    runAll().catch(console.error);
}

// 导出各个示例函数，供单独调用
module.exports = {
    example1_PrewarmBookmarks,
    example2_ListBookmarks,
    example3_ClearBookmarks,
    example4_ClearAllBookmarks,
    example5_CompleteWorkflow
};
