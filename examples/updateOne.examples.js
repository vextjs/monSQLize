/**
 * updateOne 方法使用示例
 * 演示如何更新单个MongoDB文档
 */

const MonSQLize = require("../lib/index");

async function main() {
    // 初始化 MonSQLize
    const msq = new MonSQLize({
        type: "mongodb",
        databaseName: "examples_db",
        config: {
            uri: "mongodb://localhost:27017"
            // 或使用内存服务器: useMemoryServer: true
        }
    });

    try {
        const conn = await msq.connect();
        const collection = conn.collection;

        console.log("=".repeat(60));
        console.log("updateOne 方法示例");
        console.log("=".repeat(60) + "\n");

        // ========================================
        // 示例 1: 基本更新 - 使用 $set
        // ========================================
        console.log("示例 1: 基本更新 - 使用 $set");
        console.log("-".repeat(60));

        // 先插入测试数据
        await collection("users").insertOne({
            userId: "user001",
            name: "Alice",
            email: "alice@example.com",
            status: "inactive"
        });

        // 更新单个字段
        const result1 = await collection("users").updateOne(
            { userId: "user001" },
            { $set: { status: "active" } }
        );

        console.log("更新结果:", result1);
        console.log("- matchedCount:", result1.matchedCount);
        console.log("- modifiedCount:", result1.modifiedCount);
        console.log();

        // ========================================
        // 示例 2: 递增计数器 - 使用 $inc
        // ========================================
        console.log("示例 2: 递增计数器 - 使用 $inc");
        console.log("-".repeat(60));

        await collection("users").insertOne({
            userId: "user002",
            name: "Bob",
            loginCount: 5
        });

        const result2 = await collection("users").updateOne(
            { userId: "user002" },
            { $inc: { loginCount: 1 } }
        );

        console.log("登录计数递增:", result2.modifiedCount, "个文档");
        console.log();

        // ========================================
        // 示例 3: 数组操作 - 使用 $push
        // ========================================
        console.log("示例 3: 数组操作 - 使用 $push");
        console.log("-".repeat(60));

        await collection("users").insertOne({
            userId: "user003",
            name: "Charlie",
            tags: ["developer"]
        });

        const result3 = await collection("users").updateOne(
            { userId: "user003" },
            { $push: { tags: "nodejs" } }
        );

        console.log("添加标签:", result3.modifiedCount, "个文档");
        console.log();

        // ========================================
        // 示例 4: 多个操作符组合
        // ========================================
        console.log("示例 4: 多个操作符组合");
        console.log("-".repeat(60));

        await collection("users").insertOne({
            userId: "user004",
            name: "David",
            age: 25,
            loginCount: 10,
            tags: []
        });

        const result4 = await collection("users").updateOne(
            { userId: "user004" },
            {
                $set: { name: "David Updated", lastLoginAt: new Date() },
                $inc: { loginCount: 1, age: 1 },
                $push: { tags: "premium" }
            }
        );

        console.log("组合更新:", result4.modifiedCount, "个文档");
        console.log();

        // ========================================
        // 示例 5: 使用 upsert 选项
        // ========================================
        console.log("示例 5: 使用 upsert 选项");
        console.log("-".repeat(60));

        const result5 = await collection("users").updateOne(
            { userId: "user005" },
            {
                $set: {
                    name: "Eve",
                    email: "eve@example.com",
                    status: "active"
                },
                $setOnInsert: { createdAt: new Date() }
            },
            { upsert: true }
        );

        console.log("Upsert 结果:");
        console.log("- matchedCount:", result5.matchedCount);
        console.log("- modifiedCount:", result5.modifiedCount);
        console.log("- upsertedCount:", result5.upsertedCount);
        console.log("- upsertedId:", result5.upsertedId);
        console.log();

        // ========================================
        // 示例 6: 更新嵌套字段
        // ========================================
        console.log("示例 6: 更新嵌套字段");
        console.log("-".repeat(60));

        await collection("users").insertOne({
            userId: "user006",
            profile: {
                name: "Frank",
                address: {
                    city: "Beijing",
                    country: "China"
                }
            }
        });

        const result6 = await collection("users").updateOne(
            { userId: "user006" },
            { $set: { "profile.address.city": "Shanghai" } }
        );

        console.log("更新嵌套字段:", result6.modifiedCount, "个文档");
        console.log();

        // ========================================
        // 示例 7: 删除字段 - 使用 $unset
        // ========================================
        console.log("示例 7: 删除字段 - 使用 $unset");
        console.log("-".repeat(60));

        await collection("users").insertOne({
            userId: "user007",
            name: "Grace",
            tempField: "temp",
            debugMode: true
        });

        const result7 = await collection("users").updateOne(
            { userId: "user007" },
            { $unset: { tempField: "", debugMode: "" } }
        );

        console.log("删除字段:", result7.modifiedCount, "个文档");
        console.log();

        // ========================================
        // 示例 8: 使用 comment 选项（便于日志追踪）
        // ========================================
        console.log("示例 8: 使用 comment 选项");
        console.log("-".repeat(60));

        await collection("users").insertOne({
            userId: "user008",
            name: "Henry"
        });

        const result8 = await collection("users").updateOne(
            { userId: "user008" },
            { $set: { status: "verified" } },
            { comment: "用户验证更新 - 批次202511" }
        );

        console.log("带注释的更新:", result8.modifiedCount, "个文档");
        console.log();

        // ========================================
        // 示例 9: 条件更新（仅当字段满足条件）
        // ========================================
        console.log("示例 9: 条件更新");
        console.log("-".repeat(60));

        await collection("users").insertOne({
            userId: "user009",
            age: 30,
            status: "active"
        });

        // 仅更新年龄 >= 18 且状态为 active 的用户
        const result9 = await collection("users").updateOne(
            {
                userId: "user009",
                age: { $gte: 18 },
                status: "active"
            },
            { $set: { verified: true } }
        );

        console.log("条件更新:", result9.modifiedCount, "个文档");
        console.log();

        // ========================================
        // 示例 10: 错误处理
        // ========================================
        console.log("示例 10: 错误处理");
        console.log("-".repeat(60));

        try {
            // 错误示例：缺少更新操作符
            await collection("users").updateOne(
                { userId: "user010" },
                { name: "Invalid" } // 缺少 $set
            );
        } catch (err) {
            console.log("捕获错误:");
            console.log("- 错误代码:", err.code);
            console.log("- 错误信息:", err.message);
        }
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

// 运行示例
if (require.main === module) {
    main().catch(console.error);
}

module.exports = main;

