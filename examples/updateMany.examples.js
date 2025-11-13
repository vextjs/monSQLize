/**
 * updateMany 方法使用示例
 * 演示如何批量更新MongoDB文档
 */

const MonSQLize = require("../lib/index");

async function main() {
    const msq = new MonSQLize({
        type: "mongodb",
        databaseName: "examples_db",
        config: {
            uri: "mongodb://localhost:27017"
        }
    });

    try {
        const conn = await msq.connect();
        const collection = conn.collection;

        console.log("=".repeat(60));
        console.log("updateMany 方法示例");
        console.log("=".repeat(60) + "\n");

        // 示例 1: 批量更新状态
        console.log("示例 1: 批量更新状态");
        console.log("-".repeat(60));

        await collection("users").insertMany([
            { userId: "user001", status: "inactive", role: "user" },
            { userId: "user002", status: "inactive", role: "user" },
            { userId: "user003", status: "inactive", role: "admin" }
        ]);

        const result1 = await collection("users").updateMany(
            { status: "inactive" },
            { $set: { status: "active", updatedAt: new Date() } }
        );

        console.log("批量激活用户:");
        console.log("- matchedCount:", result1.matchedCount);
        console.log("- modifiedCount:", result1.modifiedCount);
        console.log();

        // 示例 2: 批量递增
        console.log("示例 2: 批量递增计数");
        console.log("-".repeat(60));

        await collection("products").insertMany([
            { productId: "p001", views: 100 },
            { productId: "p002", views: 200 },
            { productId: "p003", views: 150 }
        ]);

        const result2 = await collection("products").updateMany(
            {},
            { $inc: { views: 10 } }
        );

        console.log("所有产品浏览量 +10:", result2.modifiedCount, "个");
        console.log();

        // 示例 3: 条件批量更新
        console.log("示例 3: 条件批量更新");
        console.log("-".repeat(60));

        await collection("orders").insertMany([
            { orderId: "o001", status: "pending", amount: 100 },
            { orderId: "o002", status: "pending", amount: 200 },
            { orderId: "o003", status: "pending", amount: 50 }
        ]);

        const result3 = await collection("orders").updateMany(
            { status: "pending", amount: { $gte: 100 } },
            { $set: { priority: "high" } }
        );

        console.log("标记高优先级订单:", result3.modifiedCount, "个");
        console.log();

        // 示例 4: 使用数组过滤器
        console.log("示例 4: 使用数组过滤器更新");
        console.log("-".repeat(60));

        await collection("students").insertOne({
            studentId: "s001",
            scores: [
                { subject: "math", score: 80 },
                { subject: "english", score: 90 },
                { subject: "physics", score: 70 }
            ]
        });

        const result4 = await collection("students").updateMany(
            { studentId: "s001" },
            { $set: { "scores.$[elem].grade": "A" } },
            { arrayFilters: [{ "elem.score": { $gte: 80 } }] }
        );

        console.log("更新成绩等级:", result4.modifiedCount, "个");
        console.log();

        // 示例 5: 批量添加字段
        console.log("示例 5: 批量添加新字段");
        console.log("-".repeat(60));

        await collection("articles").insertMany([
            { articleId: "a001", title: "Article 1" },
            { articleId: "a002", title: "Article 2" }
        ]);

        const result5 = await collection("articles").updateMany(
            {},
            {
                $set: {
                    published: true,
                    publishedAt: new Date(),
                    version: 1
                }
            }
        );

        console.log("批量发布文章:", result5.modifiedCount, "个");
        console.log();

        // 示例 6: 批量删除字段
        console.log("示例 6: 批量删除字段");
        console.log("-".repeat(60));

        await collection("temp").insertMany([
            { id: 1, data: "value", tempField: "temp" },
            { id: 2, data: "value", tempField: "temp" }
        ]);

        const result6 = await collection("temp").updateMany(
            {},
            { $unset: { tempField: "" } }
        );

        console.log("批量清理临时字段:", result6.modifiedCount, "个");
        console.log();

        // 示例 7: 性能测试 - 大批量更新
        console.log("示例 7: 大批量更新性能测试");
        console.log("-".repeat(60));

        // 插入 1000 个文档
        const docs = Array.from({ length: 1000 }, (_, i) => ({
            id: i,
            status: "pending",
            count: 0
        }));
        await collection("bulk").insertMany(docs);

        const startTime = Date.now();
        const result7 = await collection("bulk").updateMany(
            { status: "pending" },
            { $set: { status: "processed" }, $inc: { count: 1 } }
        );
        const duration = Date.now() - startTime;

        console.log("批量更新 1000 个文档:");
        console.log("- modifiedCount:", result7.modifiedCount);
        console.log("- 耗时:", duration, "ms");
        console.log();

        console.log("=".repeat(60));
        console.log("示例执行完成！");
        console.log("=".repeat(60));

    } catch (error) {
        console.error("发生错误:", error);
    } finally {
        await msq.close();
    }
}

if (require.main === module) {
    main().catch(console.error);
}

module.exports = main;

