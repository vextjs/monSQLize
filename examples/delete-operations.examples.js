/**
 * deleteOne / deleteMany / findOneAndDelete 方法使用示例
 * 演示删除操作
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
        console.log("deleteOne / deleteMany / findOneAndDelete 示例");
        console.log("=".repeat(60) + "\n");

        // ============ deleteOne 示例 ============
        console.log("【deleteOne】删除单个文档");
        console.log("-".repeat(60));

        await collection("users").insertMany([
            { userId: "user1", name: "Alice", status: "inactive" },
            { userId: "user2", name: "Bob", status: "inactive" },
            { userId: "user3", name: "Charlie", status: "active" }
        ]);

        const r1 = await collection("users").deleteOne({ status: "inactive" });
        console.log("删除结果:", r1.deletedCount, "个文档");
        console.log();

        // ============ deleteMany 示例 ============
        console.log("【deleteMany】批量删除文档");
        console.log("-".repeat(60));

        await collection("logs").insertMany([
            { level: "info", timestamp: new Date("2024-01-01"), message: "log1" },
            { level: "info", timestamp: new Date("2024-01-02"), message: "log2" },
            { level: "error", timestamp: new Date("2024-01-03"), message: "log3" }
        ]);

        const r2 = await collection("logs").deleteMany({
            timestamp: { $lt: new Date("2024-01-03") }
        });
        console.log("删除了", r2.deletedCount, "条日志记录");
        console.log();

        // ============ findOneAndDelete 示例 ============
        console.log("【findOneAndDelete】原子地查找并删除");
        console.log("-".repeat(60));

        // 队列任务消费场景
        await collection("queue").insertMany([
            { taskId: "task1", status: "pending", priority: 1 },
            { taskId: "task2", status: "pending", priority: 2 },
            { taskId: "task3", status: "pending", priority: 3 }
        ]);

        const task = await collection("queue").findOneAndDelete(
            { status: "pending" },
            { sort: { priority: -1 } }
        );
        console.log("获取并删除任务:", task ? task.taskId : "无任务");
        console.log("任务优先级:", task ? task.priority : "-");
        console.log();

        // 过期会话清理场景
        const now = new Date();
        await collection("sessions").insertMany([
            { sessionId: "s1", expiresAt: new Date(now.getTime() - 3600000), userId: "user1" },
            { sessionId: "s2", expiresAt: new Date(now.getTime() + 3600000), userId: "user2" }
        ]);

        const expiredSession = await collection("sessions").findOneAndDelete({
            expiresAt: { $lt: now }
        });
        console.log("清理过期会话:", expiredSession ? expiredSession.sessionId : "无过期会话");
        console.log();

        // ============ 实际应用场景对比 ============
        console.log("【应用场景对比】");
        console.log("-".repeat(60));

        // 场景1: 删除单个特定记录（deleteOne）
        await collection("accounts").insertOne({
            accountId: "acc123",
            email: "user@example.com",
            status: "deleted_requested"
        });

        const d1 = await collection("accounts").deleteOne({
            accountId: "acc123",
            status: "deleted_requested"
        });
        console.log("场景1 - 删除单个账户:", d1.deletedCount);

        // 场景2: 批量清理数据（deleteMany）
        await collection("temp_data").insertMany([
            { type: "temp", data: "data1", createdAt: new Date("2024-01-01") },
            { type: "temp", data: "data2", createdAt: new Date("2024-01-02") },
            { type: "permanent", data: "data3" }
        ]);

        const d2 = await collection("temp_data").deleteMany({ type: "temp" });
        console.log("场景2 - 批量清理临时数据:", d2.deletedCount);

        // 场景3: 队列消费（findOneAndDelete）
        await collection("job_queue").insertMany([
            { jobId: "j1", status: "queued", createdAt: new Date("2024-01-01") },
            { jobId: "j2", status: "queued", createdAt: new Date("2024-01-02") }
        ]);

        const job = await collection("job_queue").findOneAndDelete(
            { status: "queued" },
            { sort: { createdAt: 1 } }
        );
        console.log("场景3 - 队列消费:", job ? job.jobId : "队列为空");
        console.log();

        // ============ projection 选项（findOneAndDelete） ============
        console.log("【findOneAndDelete - projection 选项】");
        console.log("-".repeat(60));

        await collection("sensitive").insertOne({
            userId: "user1",
            name: "Alice",
            email: "alice@example.com",
            password: "secret123",
            creditCard: "1234-5678-9012-3456"
        });

        const deletedUser = await collection("sensitive").findOneAndDelete(
            { userId: "user1" },
            { projection: { userId: 1, name: 1, email: 1 } }
        );
        console.log("已删除用户（仅安全字段）:");
        console.log("  userId:", deletedUser.userId);
        console.log("  name:", deletedUser.name);
        console.log("  email:", deletedUser.email);
        console.log("  password:", deletedUser.password === undefined ? "未返回" : "ERROR");
        console.log("  creditCard:", deletedUser.creditCard === undefined ? "未返回" : "ERROR");
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

