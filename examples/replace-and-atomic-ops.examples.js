/**
 * replaceOne, findOneAndUpdate, findOneAndReplace 方法使用示例
 * 演示文档替换和原子操作
 */

const MonSQLize = require("../lib/index");

async function main() {
    const msq = new MonSQLize({
        type: "mongodb",
        databaseName: "examples_db",
        config: { uri: "mongodb://localhost:27017" }
    });

    try {
        const conn = await msq.connect();
        const collection = conn.collection;

        console.log("=".repeat(60));
        console.log("replaceOne / findOneAndUpdate / findOneAndReplace 示例");
        console.log("=".repeat(60) + "\n");

        // ============ replaceOne 示例 ============
        console.log("【replaceOne】完整替换文档");
        console.log("-".repeat(60));

        await collection("configs").insertOne({
            configKey: "theme",
            value: "light",
            lang: "zh-CN",
            version: 1
        });

        const r1 = await collection("configs").replaceOne(
            { configKey: "theme" },
            {
                configKey: "theme",
                value: "dark",
                version: 2
                // lang 字段被删除
            }
        );
        console.log("replaceOne 结果:", r1.modifiedCount, "个文档\n");

        // ============ findOneAndUpdate 示例 ============
        console.log("【findOneAndUpdate】原子更新并返回");
        console.log("-".repeat(60));

        // 计数器场景
        await collection("counters").insertOne({
            counterName: "orderNumber",
            value: 1000
        });

        const counter = await collection("counters").findOneAndUpdate(
            { counterName: "orderNumber" },
            { $inc: { value: 1 } },
            { returnDocument: "after" }
        );
        console.log("获取新订单号:", counter.value);

        // 乐观锁场景
        await collection("documents").insertOne({
            docId: "doc1",
            content: "v1",
            version: 1
        });

        const doc = await collection("documents").findOneAndUpdate(
            { docId: "doc1", version: 1 },
            { $set: { content: "v2" }, $inc: { version: 1 } },
            { returnDocument: "after" }
        );
        console.log("文档更新（版本控制）:", doc ? doc.version : "冲突");

        // 队列场景
        await collection("tasks").insertMany([
            { taskId: 1, status: "pending", priority: 1 },
            { taskId: 2, status: "pending", priority: 2 }
        ]);

        const task = await collection("tasks").findOneAndUpdate(
            { status: "pending" },
            { $set: { status: "processing", startedAt: new Date() } },
            { sort: { priority: -1 }, returnDocument: "after" }
        );
        console.log("获取任务:", task ? `Task ${task.taskId}` : "无任务");
        console.log();

        // ============ findOneAndReplace 示例 ============
        console.log("【findOneAndReplace】原子替换并返回");
        console.log("-".repeat(60));

        await collection("settings").insertOne({
            settingKey: "feature-flags",
            featureA: true,
            featureB: false,
            oldFeature: true
        });

        const oldSettings = await collection("settings").findOneAndReplace(
            { settingKey: "feature-flags" },
            {
                settingKey: "feature-flags",
                featureA: true,
                featureB: true,
                featureC: true
                // oldFeature 被删除
            }
        );
        console.log("旧设置:", oldSettings.oldFeature);
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

