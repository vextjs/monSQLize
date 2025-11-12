/**
 * explain 查询诊断功能示例
 * 
 * explain 方法用于分析查询执行计划，帮助诊断性能问题和优化查询。
 * 
 * 主要用途：
 * - 分析查询是否使用了索引
 * - 获取查询执行统计信息（扫描文档数、耗时等）
 * - 比较不同查询策略的性能
 * - 诊断慢查询问题
 * 
 * 注意：explain 方法专用于诊断，不会返回实际数据，且禁用缓存。
 */

const MonSQLize = require('../lib');
const { stopMemoryServer } = require('../lib/mongodb/connect');

// MongoDB 连接配置 - 使用内存数据库方便独立运行
const DB_CONFIG = {
    type: 'mongodb',
    databaseName: 'testdb',
    config: { useMemoryServer: true }
};

/**
 * 示例 1: 基本查询计划分析 (默认 queryPlanner 模式)
 * 
 * queryPlanner 模式返回查询优化器选择的执行计划，不执行查询。
 * 这是最轻量的模式，适合快速检查索引使用情况。
 */
async function example1_basicQueryPlan() {
    console.log("\n" + "=".repeat(70));
    console.log("示例 1: 基本查询计划分析");
    console.log("=".repeat(70));

    const msq = new MonSQLize(DB_CONFIG);
    const { collection } = await msq.connect();
    const users = collection("users");
    const db = msq._adapter.db;
    const nativeUsers = db.collection("users");

    try {
        // 准备测试数据
        await nativeUsers.insertMany([
            { name: "Alice", age: 25, city: "Beijing" },
            { name: "Bob", age: 30, city: "Shanghai" },
            { name: "Charlie", age: 35, city: "Beijing" }
        ]);

        // 在 age 字段上创建索引
        await nativeUsers.createIndex({ age: 1 });

        console.log("\n方式 1: 链式调用（与原生 MongoDB 一致）");
        console.log("-".repeat(70));
        const plan1 = await users.find({ age: { $gte: 25 } }).explain('queryPlanner');
        console.log(`- 使用索引: ${plan1.queryPlanner.winningPlan.inputStage?.indexName || "无"}`);
        console.log(`- 执行策略: ${plan1.queryPlanner.winningPlan.stage}`);

        console.log("\n方式 2: options 参数");
        console.log("-".repeat(70));
        const plan2 = await users.find(
            { age: { $gte: 25 } },
            { explain: true }  // 或 'queryPlanner'
        );
        console.log(`- 使用索引: ${plan2.queryPlanner.winningPlan.inputStage?.indexName || "无"}`);
        console.log(`- 执行策略: ${plan2.queryPlanner.winningPlan.stage}`);

        console.log("\n✅ 两种方式返回相同的执行计划");

        console.log("\n✅ queryPlanner 模式适合快速检查索引使用情况");
    } finally {
        await msq.close();
    }
}

/**
 * 示例 2: 执行统计分析 (executionStats 模式)
 * 
 * executionStats 模式会实际执行查询，返回详细的统计信息。
 * 包括扫描文档数、返回文档数、执行耗时等关键性能指标。
 */
async function example2_executionStats() {
    console.log("\n" + "=".repeat(70));
    console.log("示例 2: 执行统计分析");
    console.log("=".repeat(70));

    const msq = new MonSQLize(DB_CONFIG);
    const { collection } = await msq.connect();
    const products = collection("products");
    const db = msq._adapter.db;
    const nativeProducts = db.collection("products");

    try {
        // 准备大量测试数据
        const docs = [];
        for (let i = 0; i < 1000; i++) {
            docs.push({
                name: `Product ${i}`,
                price: Math.floor(Math.random() * 1000),
                category: ["Electronics", "Clothing", "Food"][i % 3],
                stock: Math.floor(Math.random() * 100)
            });
        }
        await nativeProducts.insertMany(docs);

        // 创建复合索引
        await nativeProducts.createIndex({ category: 1, price: 1 });

        // 分析带排序的查询
        const stats = await products.find(
            { category: "Electronics", price: { $gte: 500 } },
            {
                sort: { price: -1 },
                limit: 10,
                explain: "executionStats"
            }
        );

        console.log("\n查询: { category: 'Electronics', price: { $gte: 500 } }");
        console.log("排序: { price: -1 }, 限制: 10 条");

        console.log("\n性能指标:");
        console.log(`- 扫描文档数: ${stats.executionStats.totalDocsExamined}`);
        console.log(`- 返回文档数: ${stats.executionStats.nReturned}`);
        console.log(`- 执行耗时: ${stats.executionStats.executionTimeMillis}ms`);
        console.log(`- 使用索引: ${stats.queryPlanner.winningPlan.inputStage?.indexName || "无"}`);

        // 计算效率
        const efficiency = (stats.executionStats.nReturned / stats.executionStats.totalDocsExamined * 100).toFixed(2);
        console.log(`- 查询效率: ${efficiency}% (返回/扫描)`);

        console.log("\n✅ executionStats 模式提供详细的性能指标");
    } finally {
        await msq.close();
    }
}

/**
 * 示例 3: 索引优化分析
 * 
 * 通过对比有索引和无索引的查询计划，评估索引的性能提升。
 */
async function example3_indexOptimization() {
    console.log("\n" + "=".repeat(70));
    console.log("示例 3: 索引优化分析");
    console.log("=".repeat(70));

    const msq = new MonSQLize(DB_CONFIG);
    const { collection } = await msq.connect();
    const logs = collection("logs");
    const db = msq._adapter.db;
    const nativeLogs = db.collection("logs");

    try {
        // 准备日志数据
        const logDocs = [];
        for (let i = 0; i < 5000; i++) {
            logDocs.push({
                timestamp: new Date(Date.now() - Math.random() * 7 * 24 * 60 * 60 * 1000),
                level: ["INFO", "WARN", "ERROR"][i % 3],
                service: `service-${i % 10}`,
                message: `Log message ${i}`
            });
        }
        await nativeLogs.insertMany(logDocs);

        // 1. 无索引的查询
        console.log("\n场景 1: 无索引查询");
        const noIndexPlan = await logs.find(
            { level: "ERROR", service: "service-5" },
            { explain: "executionStats" }
        );

        console.log("执行统计:");
        console.log(`- 扫描文档: ${noIndexPlan.executionStats.totalDocsExamined}`);
        console.log(`- 返回文档: ${noIndexPlan.executionStats.nReturned}`);
        console.log(`- 执行耗时: ${noIndexPlan.executionStats.executionTimeMillis}ms`);
        console.log(`- 执行方式: 全表扫描 (COLLSCAN)`);

        // 2. 创建索引后
        await nativeLogs.createIndex({ level: 1, service: 1 });

        console.log("\n场景 2: 使用索引查询");
        const withIndexPlan = await logs.find(
            { level: "ERROR", service: "service-5" },
            { explain: "executionStats" }
        );

        console.log("执行统计:");
        console.log(`- 扫描文档: ${withIndexPlan.executionStats.totalDocsExamined}`);
        console.log(`- 返回文档: ${withIndexPlan.executionStats.nReturned}`);
        console.log(`- 执行耗时: ${withIndexPlan.executionStats.executionTimeMillis}ms`);
        console.log(`- 使用索引: ${withIndexPlan.queryPlanner.winningPlan.inputStage?.indexName}`);

        // 3. 性能对比
        const scanReduction = ((1 - withIndexPlan.executionStats.totalDocsExamined / noIndexPlan.executionStats.totalDocsExamined) * 100).toFixed(2);
        console.log("\n性能提升:");
        console.log(`- 扫描文档减少: ${scanReduction}%`);
        console.log(`- 查询效率: 从全表扫描优化为索引查询`);

        console.log("\n✅ 索引可以显著减少扫描文档数，提升查询性能");
    } finally {
        await msq.close();
    }
}

/**
 * 示例 4: 使用 hint 强制索引选择
 * 
 * 有时优化器可能选择次优索引，可以使用 hint 强制指定索引。
 */
async function example4_hintUsage() {
    console.log("\n" + "=".repeat(70));
    console.log("示例 4: 使用 hint 强制索引选择");
    console.log("=".repeat(70));

    const msq = new MonSQLize(DB_CONFIG);
    const { collection } = await msq.connect();
    const inventory = collection("inventory");
    const db = msq._adapter.db;
    const nativeInventory = db.collection("inventory");

    try {
        // 准备数据
        const items = [];
        for (let i = 0; i < 2000; i++) {
            items.push({
                sku: `SKU${i.toString().padStart(6, "0")}`,
                category: `cat_${i % 20}`,
                warehouse: `wh_${i % 5}`,
                quantity: Math.floor(Math.random() * 1000),
                lastUpdated: new Date(Date.now() - Math.random() * 90 * 24 * 60 * 60 * 1000)
            });
        }
        await nativeInventory.insertMany(items);

        // 创建多个索引
        await nativeInventory.createIndex({ category: 1, quantity: 1 }, { name: "cat_qty_idx" });
        await nativeInventory.createIndex({ warehouse: 1, quantity: 1 }, { name: "wh_qty_idx" });

        const query = { category: "cat_5", warehouse: "wh_2", quantity: { $gte: 500 } };

        // 1. 让优化器自动选择
        console.log("\n场景 1: 优化器自动选择索引");
        const autoPlan = await inventory.find(
            query,
            { explain: "executionStats" }
        );

        console.log(`- 选择索引: ${autoPlan.queryPlanner.winningPlan.inputStage?.indexName || "无"}`);
        console.log(`- 扫描文档: ${autoPlan.executionStats.totalDocsExamined}`);

        // 2. 强制使用 category 索引
        console.log("\n场景 2: 强制使用 category 索引");
        const hintPlan = await inventory.find(
            query,
            {
                hint: { category: 1, quantity: 1 },
                explain: "executionStats"
            }
        );

        console.log(`- 使用索引: ${hintPlan.queryPlanner.winningPlan.inputStage?.indexName}`);
        console.log(`- 扫描文档: ${hintPlan.executionStats.totalDocsExamined}`);

        console.log("\n💡 提示:");
        console.log("- hint 适用于优化器选择不理想的场景");
        console.log("- 使用前应通过 explain 验证性能提升");
        console.log("- 过度使用 hint 可能导致维护困难");

        console.log("\n✅ hint 提供精确的索引控制能力");
    } finally {
        await msq.close();
    }
}

/**
 * 示例 5: 所有候选计划分析 (allPlansExecution 模式)
 * 
 * allPlansExecution 模式返回所有候选执行计划及其试执行结果。
 * 可以看到查询优化器如何在多个索引间选择最优方案。
 */
async function example5_allPlansExecution() {
    console.log("\n" + "=".repeat(70));
    console.log("示例 5: 所有候选计划分析");
    console.log("=".repeat(70));

    const msq = new MonSQLize(DB_CONFIG);
    const { collection } = await msq.connect();
    const orders = collection("orders");
    const db = msq._adapter.db;
    const nativeOrders = db.collection("orders");

    try {
        // 准备测试数据
        const orderDocs = [];
        for (let i = 0; i < 500; i++) {
            orderDocs.push({
                orderId: `ORD${i.toString().padStart(5, "0")}`,
                customerId: `CUS${(i % 100).toString().padStart(3, "0")}`,
                status: ["pending", "completed", "cancelled"][i % 3],
                total: Math.floor(Math.random() * 5000),
                createdAt: new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000)
            });
        }
        await nativeOrders.insertMany(orderDocs);

        // 创建多个索引
        await nativeOrders.createIndex({ customerId: 1 });
        await nativeOrders.createIndex({ status: 1 });
        await nativeOrders.createIndex({ createdAt: -1 });

        // 复杂查询，优化器需要在多个索引间选择
        const allPlans = await orders.find(
            {
                customerId: "CUS050",
                status: "completed",
                total: { $gte: 1000 }
            },
            { explain: "allPlansExecution" }
        );

        console.log("\n查询: { customerId: 'CUS050', status: 'completed', total: { $gte: 1000 } }");

        console.log("\n候选执行计划数量:", allPlans.executionStats.allPlansExecution?.length || 0);
        console.log("\n获胜计划:");
        console.log(`- 使用索引: ${allPlans.queryPlanner.winningPlan.inputStage?.indexName || "无"}`);
        console.log(`- 执行耗时: ${allPlans.executionStats.executionTimeMillis}ms`);
        console.log(`- 扫描文档: ${allPlans.executionStats.totalDocsExamined}`);

        if (allPlans.executionStats.allPlansExecution && allPlans.executionStats.allPlansExecution.length > 1) {
            console.log("\n其他候选计划:");
            allPlans.executionStats.allPlansExecution.slice(1).forEach((plan, idx) => {
                console.log(`\n  计划 ${idx + 2}:`);
                console.log(`  - 扫描文档: ${plan.totalDocsExamined || "N/A"}`);
                console.log(`  - 返回文档: ${plan.nReturned || "N/A"}`);
            });
        }

        console.log("\n✅ allPlansExecution 模式帮助理解优化器的选择过程");
    } finally {
        await msq.close();
    }
}

/**
 * 示例 6: 链式调用（与原生 MongoDB 完全一致）
 *
 * 演示链式调用 .explain() 方法，与原生 MongoDB 语法完全一致
 */
async function example6_chainExplain() {
    console.log("\n" + "=".repeat(70));
    console.log("示例 6: 链式调用（与原生 MongoDB 完全一致）");
    console.log("=".repeat(70));

    const msq = new MonSQLize(DB_CONFIG);
    const { collection } = await msq.connect();
    const products = collection("products");
    const db = msq._adapter.db;
    const nativeProducts = db.collection("products");

    try {
        // 准备测试数据
        const docs = [];
        for (let i = 0; i < 100; i++) {
            docs.push({
                name: `Product ${i}`,
                category: ["Electronics", "Books", "Clothing"][i % 3],
                price: Math.floor(Math.random() * 1000) + 50,
                inStock: i % 4 !== 0
            });
        }
        await nativeProducts.insertMany(docs);
        await nativeProducts.createIndex({ category: 1 });

        console.log("\n场景 1: 简单链式调用");
        console.log("-".repeat(70));
        const plan1 = await products.find({ category: "Electronics" }).explain();
        console.log(`使用索引: ${plan1.queryPlanner.winningPlan.inputStage?.indexName || "无"}`);

        console.log("\n场景 2: 指定 verbosity");
        console.log("-".repeat(70));
        const plan2 = await products.find({ category: "Books" }).explain("executionStats");
        console.log(`扫描文档: ${plan2.executionStats.totalDocsExamined}`);
        console.log(`返回文档: ${plan2.executionStats.nReturned}`);
        console.log(`执行时间: ${plan2.executionStats.executionTimeMillis}ms`);

        console.log("\n场景 3: 带查询选项的链式调用");
        console.log("-".repeat(70));
        const plan3 = await products
            .find({ inStock: true }, { sort: { price: 1 }, limit: 10 })
            .explain("queryPlanner");
        console.log(`查询计划: ${plan3.queryPlanner.winningPlan.stage}`);

        console.log("\n✅ 链式调用与原生 MongoDB 完全一致");
    } finally {
        await msq.close();
    }
}

// 运行所有示例
async function runAllExamples() {
    try {
        console.log("\n╔════════════════════════════════════════════════════════════════════╗");
        console.log("║              explain 查询诊断功能示例集合                          ║");
        console.log("╚════════════════════════════════════════════════════════════════════╝");

        await example1_basicQueryPlan();
        await example2_executionStats();
        await example3_indexOptimization();
        await example4_hintUsage();
        await example5_allPlansExecution();
        await example6_chainExplain();

        console.log("\n" + "=".repeat(70));
        console.log("✅ 所有示例运行完成！");
        console.log("=".repeat(70));
        console.log("\n📖 更多信息:");
        console.log("- MongoDB explain 文档: https://docs.mongodb.com/manual/reference/method/db.collection.explain/");
        console.log("- 查询优化最佳实践: 见项目文档");
        console.log("\n");

    } catch (error) {
        console.error("\n❌ 示例运行失败:", error.message);
        console.error(error.stack);
        process.exit(1);
    } finally {
        // 显式停止 Memory Server，否则 Node.js 进程会卡住
        await stopMemoryServer();
    }
}

// 执行示例
runAllExamples();
