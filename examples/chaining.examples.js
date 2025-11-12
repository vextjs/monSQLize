/**
 * 链式调用方法使用示例
 * 演示 find 和 aggregate 的完整链式调用 API
 */

const MonSQLize = require("../lib");

async function main() {
    // 初始化 MonSQLize
    const monSQLize = new MonSQLize({
        type: "mongodb",
        databaseName: "shop",
        config: {
            uri: "mongodb://localhost:27017"
            // 或使用内存服务器进行测试:
            // useMemoryServer: true
        }
    });

    const { collection } = await monSQLize.connect();

    console.log("\n╔═══════════════════════════════════════════════════════════╗");
    console.log("║          链式调用方法使用示例                              ║");
    console.log("╚═══════════════════════════════════════════════════════════╝\n");

    // ========================================
    // 示例 1: find 基础链式调用
    // ========================================
    console.log("1️⃣  基础链式调用 - limit() 和 skip()");
    console.log("─".repeat(60));

    const basicResults = await collection("products")
        .find({ category: "electronics" })
        .limit(5)
        .skip(10);

    console.log(`✓ 找到 ${basicResults.length} 个商品（跳过前10个，限制5个）`);
    console.log();

    // ========================================
    // 示例 2: 排序链式调用
    // ========================================
    console.log("2️⃣  排序查询 - sort()");
    console.log("─".repeat(60));

    const sortedResults = await collection("products")
        .find({ inStock: true })
        .sort({ price: -1 })  // 按价格降序
        .limit(10);

    console.log(`✓ 找到 ${sortedResults.length} 个有库存商品，按价格降序排列`);
    if (sortedResults.length > 0) {
        console.log(`  最高价: ¥${sortedResults[0].price}`);
        console.log(`  最低价: ¥${sortedResults[sortedResults.length - 1].price}`);
    }
    console.log();

    // ========================================
    // 示例 3: 字段投影
    // ========================================
    console.log("3️⃣  字段投影 - project()");
    console.log("─".repeat(60));

    const projectedResults = await collection("products")
        .find({ category: "books" })
        .project({ name: 1, price: 1, author: 1 })
        .limit(5);

    console.log(`✓ 找到 ${projectedResults.length} 本书（仅返回指定字段）`);
    if (projectedResults.length > 0) {
        console.log("  字段:", Object.keys(projectedResults[0]).join(", "));
    }
    console.log();

    // ========================================
    // 示例 4: 复杂链式调用组合
    // ========================================
    console.log("4️⃣  复杂查询 - 组合多个链式方法");
    console.log("─".repeat(60));

    const complexResults = await collection("products")
        .find({ category: "electronics", inStock: true })
        .sort({ rating: -1, sales: -1 })  // 先按评分，再按销量降序
        .skip(5)
        .limit(10)
        .project({ name: 1, price: 1, rating: 1, sales: 1 })
        .maxTimeMS(5000)
        .comment("复杂查询示例");

    console.log(`✓ 找到 ${complexResults.length} 个商品`);
    console.log("  - 类别: 电子产品");
    console.log("  - 状态: 有库存");
    console.log("  - 排序: 评分降序 > 销量降序");
    console.log("  - 分页: 跳过5个，限制10个");
    console.log();

    // ========================================
    // 示例 5: 使用索引提示
    // ========================================
    console.log("5️⃣  索引优化 - hint()");
    console.log("─".repeat(60));

    const hintResults = await collection("products")
        .find({ category: "electronics", price: { $gte: 500 } })
        .hint({ category: 1, price: -1 })  // 强制使用指定索引
        .limit(10);

    console.log(`✓ 找到 ${hintResults.length} 个商品（使用指定索引）`);
    console.log();

    // ========================================
    // 示例 6: 查询执行计划
    // ========================================
    console.log("6️⃣  性能分析 - explain()");
    console.log("─".repeat(60));

    const plan = await collection("products")
        .find({ category: "electronics", price: { $gte: 500 } })
        .sort({ price: -1 })
        .limit(10)
        .explain("executionStats");

    console.log("✓ 查询执行计划:");
    console.log(`  - 扫描文档: ${plan.executionStats.totalDocsExamined}`);
    console.log(`  - 返回文档: ${plan.executionStats.nReturned}`);
    console.log(`  - 执行时间: ${plan.executionStats.executionTimeMillis}ms`);
    console.log(`  - 查询效率: ${(plan.executionStats.nReturned / plan.executionStats.totalDocsExamined * 100).toFixed(2)}%`);
    console.log();

    // ========================================
    // 示例 7: 流式查询
    // ========================================
    console.log("7️⃣  流式查询 - stream()");
    console.log("─".repeat(60));

    const stream = collection("products")
        .find({ category: "books" })
        .sort({ createdAt: -1 })
        .limit(20)
        .stream();

    let streamCount = 0;
    await new Promise((resolve, reject) => {
        stream.on("data", (doc) => {
            streamCount++;
        });

        stream.on("end", () => {
            console.log(`✓ 流式读取完成，共 ${streamCount} 条记录`);
            resolve();
        });

        stream.on("error", reject);
    });
    console.log();

    // ========================================
    // 示例 8: aggregate 链式调用
    // ========================================
    console.log("8️⃣  聚合查询 - aggregate 链式调用");
    console.log("─".repeat(60));

    const aggregateResults = await collection("orders")
        .aggregate([
            { $match: { status: "paid" } },
            { $group: { _id: "$category", total: { $sum: "$amount" }, count: { $sum: 1 } } },
            { $sort: { total: -1 } }
        ])
        .allowDiskUse(true)
        .maxTimeMS(10000)
        .comment("分类销售统计");

    console.log(`✓ 找到 ${aggregateResults.length} 个分类`);
    aggregateResults.forEach((item, index) => {
        console.log(`  ${index + 1}. ${item._id}: ¥${item.total} (${item.count}笔订单)`);
    });
    console.log();

    // ========================================
    // 示例 9: 显式 toArray() 调用
    // ========================================
    console.log("9️⃣  显式转换 - toArray()");
    console.log("─".repeat(60));

    const explicitResults = await collection("products")
        .find({ rating: { $gte: 4.5 } })
        .sort({ rating: -1 })
        .limit(5)
        .toArray();  // 显式调用 toArray()

    console.log(`✓ 找到 ${explicitResults.length} 个高评分商品`);
    console.log();

    // ========================================
    // 示例 10: 向后兼容 - options 参数
    // ========================================
    console.log("🔟 向后兼容 - 使用 options 参数");
    console.log("─".repeat(60));

    const legacyResults = await collection("products").find(
        { category: "electronics" },
        {
            sort: { price: -1 },
            limit: 10,
            projection: { name: 1, price: 1 }
        }
    );

    console.log(`✓ 找到 ${legacyResults.length} 个商品（使用传统 options 参数）`);
    console.log();

    // ========================================
    // 完成
    // ========================================
    console.log("╔═══════════════════════════════════════════════════════════╗");
    console.log("║          所有示例执行完成！                                ║");
    console.log("╚═══════════════════════════════════════════════════════════╝\n");

    await monSQLize.close();
}

// 运行示例
if (require.main === module) {
    main().catch(console.error);
}

module.exports = main;

