/**
 * updateMany 方法测试套件
 * 测试批量文档更新功能
 */

const assert = require("assert");
const MonSQLize = require("../../../lib/index");

describe("updateMany 方法测试套件", function () {
    this.timeout(30000);

    let msq, collection;

    before(async () => {
        msq = new MonSQLize({
            type: "mongodb",
            databaseName: "test_updatemany",
            config: { useMemoryServer: true }
        });

        const conn = await msq.connect();
        collection = conn.collection;

        // 清空测试集合
        const db = msq._adapter.db;
        await db.collection("users").deleteMany({});
    });

    after(async () => {
        if (msq) await msq.close();
    });

    beforeEach(async () => {
        // 每个测试前清空集合
        const db = msq._adapter.db;
        await db.collection("users").deleteMany({});
    });

    describe("基本功能测试", () => {
        it("应该成功更新多个文档", async () => {
            // 插入测试数据
            await collection("users").insertMany([
                { userId: "user1", name: "Alice", status: "inactive" },
                { userId: "user2", name: "Bob", status: "inactive" },
                { userId: "user3", name: "Charlie", status: "inactive" }
            ]);

            // 批量更新
            const result = await collection("users").updateMany(
                { status: "inactive" },
                { $set: { status: "active", updatedAt: new Date() } }
            );

            assert.ok(result, "返回结果不应为空");
            assert.strictEqual(result.acknowledged, true);
            assert.strictEqual(result.matchedCount, 3, "应该匹配 3 个文档");
            assert.strictEqual(result.modifiedCount, 3, "应该修改 3 个文档");

            // 验证所有文档都已更新
            const db = msq._adapter.db;
            const activeCount = await db.collection("users").countDocuments({ status: "active" });
            assert.strictEqual(activeCount, 3);
        });

        it("应该支持部分匹配更新", async () => {
            await collection("users").insertMany([
                { userId: "user1", status: "inactive", role: "admin" },
                { userId: "user2", status: "inactive", role: "user" },
                { userId: "user3", status: "active", role: "user" }
            ]);

            // 只更新 inactive 状态的
            const result = await collection("users").updateMany(
                { status: "inactive" },
                { $set: { status: "active" } }
            );

            assert.strictEqual(result.matchedCount, 2);
            assert.strictEqual(result.modifiedCount, 2);

            // 验证
            const db = msq._adapter.db;
            const activeCount = await db.collection("users").countDocuments({ status: "active" });
            assert.strictEqual(activeCount, 3); // 原来1个 + 新更新2个
        });

        it("应该支持 $inc 操作符批量增加", async () => {
            await collection("users").insertMany([
                { userId: "user1", loginCount: 5 },
                { userId: "user2", loginCount: 10 },
                { userId: "user3", loginCount: 15 }
            ]);

            const result = await collection("users").updateMany(
                {},
                { $inc: { loginCount: 1 } }
            );

            assert.strictEqual(result.matchedCount, 3);
            assert.strictEqual(result.modifiedCount, 3);

            // 验证
            const db = msq._adapter.db;
            const users = await db.collection("users").find({}).toArray();
            assert.strictEqual(users[0].loginCount, 6);
            assert.strictEqual(users[1].loginCount, 11);
            assert.strictEqual(users[2].loginCount, 16);
        });

        it("应该支持 $push 操作符批量添加数组元素", async () => {
            await collection("users").insertMany([
                { userId: "user1", tags: ["developer"] },
                { userId: "user2", tags: ["designer"] }
            ]);

            const result = await collection("users").updateMany(
                {},
                { $push: { tags: "active" } }
            );

            assert.strictEqual(result.modifiedCount, 2);

            // 验证
            const db = msq._adapter.db;
            const users = await db.collection("users").find({}).toArray();
            assert.ok(users[0].tags.includes("active"));
            assert.ok(users[1].tags.includes("active"));
        });

        it("应该支持多个操作符组合", async () => {
            await collection("users").insertMany([
                { userId: "user1", name: "Alice", age: 25, loginCount: 10, tags: [] },
                { userId: "user2", name: "Bob", age: 30, loginCount: 20, tags: [] }
            ]);

            const result = await collection("users").updateMany(
                {},
                {
                    $set: { status: "verified" },
                    $inc: { loginCount: 5 },
                    $push: { tags: "updated" }
                }
            );

            assert.strictEqual(result.modifiedCount, 2);

            // 验证
            const db = msq._adapter.db;
            const user1 = await db.collection("users").findOne({ userId: "user1" });
            assert.strictEqual(user1.status, "verified");
            assert.strictEqual(user1.loginCount, 15);
            assert.deepStrictEqual(user1.tags, ["updated"]);
        });
    });

    describe("匹配和修改计数", () => {
        it("匹配但未修改时 modifiedCount 应为 0", async () => {
            await collection("users").insertMany([
                { userId: "user1", status: "active" },
                { userId: "user2", status: "active" }
            ]);

            // 更新为相同的值
            const result = await collection("users").updateMany(
                { status: "active" },
                { $set: { status: "active" } }
            );

            assert.strictEqual(result.matchedCount, 2);
            assert.strictEqual(result.modifiedCount, 0);
        });

        it("未匹配时计数都应为 0", async () => {
            await collection("users").insertMany([
                { userId: "user1", status: "active" },
                { userId: "user2", status: "active" }
            ]);

            const result = await collection("users").updateMany(
                { status: "inactive" },
                { $set: { status: "archived" } }
            );

            assert.strictEqual(result.matchedCount, 0);
            assert.strictEqual(result.modifiedCount, 0);
        });

        it("应该更新所有匹配的文档", async () => {
            // 插入 100 个文档
            const docs = Array.from({ length: 100 }, (_, i) => ({
                userId: `user${i}`,
                status: "inactive"
            }));
            await collection("users").insertMany(docs);

            const result = await collection("users").updateMany(
                { status: "inactive" },
                { $set: { status: "active" } }
            );

            assert.strictEqual(result.matchedCount, 100);
            assert.strictEqual(result.modifiedCount, 100);
        });
    });

    describe("upsert 选项测试", () => {
        it("upsert=true 且未匹配时应插入新文档", async () => {
            const result = await collection("users").updateMany(
                { userId: "newuser" },
                { $set: { name: "New User", status: "active" } },
                { upsert: true }
            );

            assert.strictEqual(result.matchedCount, 0);
            assert.strictEqual(result.upsertedCount, 1);
            assert.ok(result.upsertedId);

            // 验证
            const db = msq._adapter.db;
            const doc = await db.collection("users").findOne({ userId: "newuser" });
            assert.ok(doc);
            assert.strictEqual(doc.name, "New User");
        });

        it("upsert=true 且有匹配时应更新", async () => {
            await collection("users").insertMany([
                { userId: "user1", name: "Alice" },
                { userId: "user2", name: "Bob" }
            ]);

            const result = await collection("users").updateMany(
                { userId: { $in: ["user1", "user2"] } },
                { $set: { status: "updated" } },
                { upsert: true }
            );

            assert.strictEqual(result.matchedCount, 2);
            assert.strictEqual(result.modifiedCount, 2);
            assert.strictEqual(result.upsertedCount, 0);
        });
    });

    describe("参数验证测试", () => {
        it("应该在 filter 缺失时抛出错误", async () => {
            try {
                await collection("users").updateMany();
                assert.fail("应该抛出错误");
            } catch (err) {
                assert.strictEqual(err.code, "INVALID_ARGUMENT");
                assert.ok(err.message.includes("filter"));
            }
        });

        it("应该在 update 缺失时抛出错误", async () => {
            try {
                await collection("users").updateMany({ userId: "test" });
                assert.fail("应该抛出错误");
            } catch (err) {
                assert.strictEqual(err.code, "INVALID_ARGUMENT");
                assert.ok(err.message.includes("update"));
            }
        });

        it("应该在 update 不包含操作符时抛出错误", async () => {
            try {
                await collection("users").updateMany(
                    { status: "inactive" },
                    { name: "Test", age: 25 }
                );
                assert.fail("应该抛出错误");
            } catch (err) {
                assert.strictEqual(err.code, "INVALID_ARGUMENT");
                assert.ok(err.message.includes("更新操作符"));
            }
        });

        it("应该在 filter 为数组时抛出错误", async () => {
            try {
                await collection("users").updateMany([], { $set: { name: "Test" } });
                assert.fail("应该抛出错误");
            } catch (err) {
                assert.strictEqual(err.code, "INVALID_ARGUMENT");
            }
        });
    });

    describe("缓存失效测试", () => {
        it("应该在更新后自动失效缓存", async () => {
            await collection("users").insertMany([
                { userId: "user1", status: "inactive" },
                { userId: "user2", status: "inactive" }
            ]);

            // 查询并缓存
            await collection("users").find({ status: "inactive" }, { cache: 5000 });

            const stats1 = msq.cache.getStats();
            assert.ok(stats1.size > 0);

            // 批量更新
            await collection("users").updateMany(
                { status: "inactive" },
                { $set: { status: "active" } }
            );

            // 验证缓存已清空
            const stats2 = msq.cache.getStats();
            assert.strictEqual(stats2.size, 0);
        });

        it("未匹配文档时不应失效缓存", async () => {
            await collection("users").insertMany([
                { userId: "user1", status: "active" }
            ]);

            // 查询并缓存
            await collection("users").find({}, { cache: 5000 });

            const stats1 = msq.cache.getStats();
            const size1 = stats1.size;

            // 更新不存在的文档
            await collection("users").updateMany(
                { status: "nonexistent" },
                { $set: { status: "updated" } }
            );

            // 缓存应该不变
            const stats2 = msq.cache.getStats();
            assert.strictEqual(stats2.size, size1);
        });
    });

    describe("选项参数测试", () => {
        it("应该支持 arrayFilters 选项", async () => {
            await collection("users").insertOne({
                userId: "user1",
                scores: [
                    { subject: "math", score: 80 },
                    { subject: "english", score: 90 }
                ]
            });

            const result = await collection("users").updateMany(
                { userId: "user1" },
                { $set: { "scores.$[elem].score": 100 } },
                { arrayFilters: [{ "elem.subject": "math" }] }
            );

            assert.strictEqual(result.modifiedCount, 1);

            // 验证
            const db = msq._adapter.db;
            const doc = await db.collection("users").findOne({ userId: "user1" });
            assert.strictEqual(doc.scores[0].score, 100);
            assert.strictEqual(doc.scores[1].score, 90);
        });

        it("应该支持 comment 参数", async () => {
            await collection("users").insertOne({ userId: "user1" });

            const result = await collection("users").updateMany(
                { userId: "user1" },
                { $set: { name: "Test" } },
                { comment: "test update" }
            );

            assert.strictEqual(result.modifiedCount, 1);
        });
    });

    describe("边界用例测试", () => {
        it("应该能更新嵌套字段", async () => {
            await collection("users").insertMany([
                { userId: "user1", profile: { name: "Alice", age: 25 } },
                { userId: "user2", profile: { name: "Bob", age: 30 } }
            ]);

            const result = await collection("users").updateMany(
                {},
                { $set: { "profile.verified": true } }
            );

            assert.strictEqual(result.modifiedCount, 2);

            // 验证
            const db = msq._adapter.db;
            const users = await db.collection("users").find({}).toArray();
            assert.strictEqual(users[0].profile.verified, true);
            assert.strictEqual(users[1].profile.verified, true);
        });

        it("应该能使用复杂的筛选条件", async () => {
            await collection("users").insertMany([
                { userId: "user1", age: 20, status: "active" },
                { userId: "user2", age: 25, status: "active" },
                { userId: "user3", age: 30, status: "active" },
                { userId: "user4", age: 35, status: "inactive" }
            ]);

            const result = await collection("users").updateMany(
                { age: { $gte: 25, $lt: 35 }, status: "active" },
                { $set: { category: "middle-age" } }
            );

            assert.strictEqual(result.matchedCount, 2);
            assert.strictEqual(result.modifiedCount, 2);

            // 验证
            const db = msq._adapter.db;
            const middle = await db.collection("users").countDocuments({ category: "middle-age" });
            assert.strictEqual(middle, 2);
        });

        it("应该能批量更新空集合（0 条匹配）", async () => {
            const result = await collection("users").updateMany(
                { status: "nonexistent" },
                { $set: { updated: true } }
            );

            assert.strictEqual(result.matchedCount, 0);
            assert.strictEqual(result.modifiedCount, 0);
        });
    });

    describe("性能测试", () => {
        it("应该能高效处理大批量更新", async function () {
            this.timeout(10000);

            // 插入 1000 个文档
            const docs = Array.from({ length: 1000 }, (_, i) => ({
                userId: `user${i}`,
                status: "inactive",
                count: 0
            }));
            await collection("users").insertMany(docs);

            const startTime = Date.now();
            const result = await collection("users").updateMany(
                { status: "inactive" },
                { $set: { status: "active" }, $inc: { count: 1 } }
            );
            const duration = Date.now() - startTime;

            assert.strictEqual(result.matchedCount, 1000);
            assert.strictEqual(result.modifiedCount, 1000);
            assert.ok(duration < 5000, `批量更新应该在 5 秒内完成，实际: ${duration}ms`);

            console.log(`      批量更新 1000 个文档耗时: ${duration}ms`);
        });
    });
});

