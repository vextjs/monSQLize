/**
 * findOneAndUpdate 方法测试套件
 * 测试原子查找并更新功能
 */

const assert = require("assert");
const MonSQLize = require("../../../lib/index");

describe("findOneAndUpdate 方法测试套件", function () {
    this.timeout(30000);

    let msq, collection;

    before(async () => {
        msq = new MonSQLize({
            type: "mongodb",
            databaseName: "test_findoneandupdate",
            config: { useMemoryServer: true }
        });

        const conn = await msq.connect();
        collection = conn.collection;

        const db = msq._adapter.db;
        await db.collection("users").deleteMany({});
    });

    after(async () => {
        if (msq) await msq.close();
    });

    beforeEach(async () => {
        const db = msq._adapter.db;
        await db.collection("users").deleteMany({});
    });

    describe("基本功能测试", () => {
        it("应该原子地查找并更新文档（返回更新前）", async () => {
            await collection("users").insertOne({
                userId: "user1",
                name: "Alice",
                loginCount: 5
            });

            const oldDoc = await collection("users").findOneAndUpdate(
                { userId: "user1" },
                { $inc: { loginCount: 1 } }
            );

            assert.ok(oldDoc);
            assert.strictEqual(oldDoc.name, "Alice");
            assert.strictEqual(oldDoc.loginCount, 5, "应该返回更新前的值");

            // 验证文档已更新
            const db = msq._adapter.db;
            const newDoc = await db.collection("users").findOne({ userId: "user1" });
            assert.strictEqual(newDoc.loginCount, 6);
        });

        it("应该支持 returnDocument=after（返回更新后）", async () => {
            await collection("users").insertOne({
                userId: "user2",
                name: "Bob",
                score: 100
            });

            const newDoc = await collection("users").findOneAndUpdate(
                { userId: "user2" },
                { $inc: { score: 50 } },
                { returnDocument: "after" }
            );

            assert.ok(newDoc);
            assert.strictEqual(newDoc.score, 150, "应该返回更新后的值");
        });

        it("未找到文档时应返回 null", async () => {
            const result = await collection("users").findOneAndUpdate(
                { userId: "nonexistent" },
                { $set: { name: "Test" } }
            );

            assert.strictEqual(result, null);
        });

        it("应该支持多种更新操作符", async () => {
            await collection("users").insertOne({
                userId: "user3",
                name: "Charlie",
                age: 25,
                tags: []
            });

            const oldDoc = await collection("users").findOneAndUpdate(
                { userId: "user3" },
                {
                    $set: { name: "Charlie Updated" },
                    $inc: { age: 1 },
                    $push: { tags: "premium" }
                }
            );

            assert.strictEqual(oldDoc.name, "Charlie");
            assert.strictEqual(oldDoc.age, 25);

            // 验证更新成功
            const db = msq._adapter.db;
            const updated = await db.collection("users").findOne({ userId: "user3" });
            assert.strictEqual(updated.name, "Charlie Updated");
            assert.strictEqual(updated.age, 26);
            assert.deepStrictEqual(updated.tags, ["premium"]);
        });
    });

    describe("排序功能", () => {
        it("应该支持 sort 选项", async () => {
            await collection("users").insertMany([
                { type: "user", name: "Alice", score: 100 },
                { type: "user", name: "Bob", score: 200 },
                { type: "user", name: "Charlie", score: 150 }
            ]);

            // 找到 score 最高的并更新
            const doc = await collection("users").findOneAndUpdate(
                { type: "user" },
                { $set: { winner: true } },
                { sort: { score: -1 }, returnDocument: "after" }
            );

            assert.ok(doc);
            assert.strictEqual(doc.name, "Bob");
            assert.strictEqual(doc.winner, true);
        });

        it("应该支持多字段排序", async () => {
            await collection("users").insertMany([
                { category: "A", priority: 1, name: "First" },
                { category: "A", priority: 2, name: "Second" },
                { category: "B", priority: 1, name: "Third" }
            ]);

            const doc = await collection("users").findOneAndUpdate(
                { category: "A" },
                { $set: { processed: true } },
                { sort: { priority: -1 }, returnDocument: "after" }
            );

            assert.strictEqual(doc.name, "Second");
        });
    });

    describe("upsert 选项测试", () => {
        it("upsert=true 且未找到时应插入并返回新文档", async () => {
            const doc = await collection("users").findOneAndUpdate(
                { userId: "newuser" },
                { $set: { name: "New User", status: "active" } },
                { upsert: true, returnDocument: "after" }
            );

            assert.ok(doc);
            assert.strictEqual(doc.userId, "newuser");
            assert.strictEqual(doc.name, "New User");
        });

        it("upsert=true 且找到时应更新", async () => {
            await collection("users").insertOne({
                userId: "user4",
                name: "Original"
            });

            const doc = await collection("users").findOneAndUpdate(
                { userId: "user4" },
                { $set: { name: "Updated" } },
                { upsert: true, returnDocument: "after" }
            );

            assert.ok(doc);
            assert.strictEqual(doc.name, "Updated");
        });
    });

    describe("projection 选项测试", () => {
        it("应该支持字段投影", async () => {
            await collection("users").insertOne({
                userId: "user5",
                name: "David",
                age: 30,
                email: "david@example.com",
                password: "secret"
            });

            const doc = await collection("users").findOneAndUpdate(
                { userId: "user5" },
                { $inc: { age: 1 } },
                {
                    projection: { name: 1, age: 1 },
                    returnDocument: "after"
                }
            );

            assert.ok(doc);
            assert.strictEqual(doc.name, "David");
            assert.strictEqual(doc.age, 31);
            assert.strictEqual(doc.email, undefined, "email 应该被排除");
            assert.strictEqual(doc.password, undefined, "password 应该被排除");
        });

        it("应该支持排除字段", async () => {
            await collection("users").insertOne({
                userId: "user6",
                name: "Eve",
                password: "secret",
                apiKey: "key123"
            });

            const doc = await collection("users").findOneAndUpdate(
                { userId: "user6" },
                { $set: { name: "Eve Updated" } },
                {
                    projection: { password: 0, apiKey: 0 },
                    returnDocument: "after"
                }
            );

            assert.ok(doc);
            assert.strictEqual(doc.name, "Eve Updated");
            assert.strictEqual(doc.password, undefined);
            assert.strictEqual(doc.apiKey, undefined);
        });
    });

    describe("includeResultMetadata 选项测试", () => {
        it("应该支持返回完整元数据", async () => {
            await collection("users").insertOne({
                userId: "user7",
                name: "Frank"
            });

            const result = await collection("users").findOneAndUpdate(
                { userId: "user7" },
                { $set: { name: "Frank Updated" } },
                { includeResultMetadata: true }
            );

            assert.ok(result);
            assert.ok(result.value, "应该包含 value");
            assert.strictEqual(result.value.name, "Frank");
            assert.strictEqual(result.ok, 1, "应该包含 ok");
            assert.ok(result.lastErrorObject, "应该包含 lastErrorObject");
        });
    });

    describe("参数验证测试", () => {
        it("应该在 filter 缺失时抛出错误", async () => {
            try {
                await collection("users").findOneAndUpdate();
                assert.fail("应该抛出错误");
            } catch (err) {
                assert.strictEqual(err.code, "INVALID_ARGUMENT");
            }
        });

        it("应该在 update 缺失时抛出错误", async () => {
            try {
                await collection("users").findOneAndUpdate({ userId: "test" });
                assert.fail("应该抛出错误");
            } catch (err) {
                assert.strictEqual(err.code, "INVALID_ARGUMENT");
            }
        });

        it("应该在 update 不包含操作符时抛出错误", async () => {
            try {
                await collection("users").findOneAndUpdate(
                    { userId: "test" },
                    { name: "Test" }
                );
                assert.fail("应该抛出错误");
            } catch (err) {
                assert.strictEqual(err.code, "INVALID_ARGUMENT");
                assert.ok(err.message.includes("更新操作符"));
            }
        });
    });

    describe("缓存失效测试", () => {
        it("应该在更新成功后自动失效缓存", async () => {
            await collection("users").insertOne({
                userId: "user8",
                name: "Grace"
            });

            await collection("users").find({ userId: "user8" }, { cache: 5000 });
            const stats1 = msq.cache.getStats();
            assert.ok(stats1.size > 0);

            await collection("users").findOneAndUpdate(
                { userId: "user8" },
                { $set: { name: "Grace Updated" } }
            );

            const stats2 = msq.cache.getStats();
            assert.strictEqual(stats2.size, 0);
        });

        it("未找到文档时不应失效缓存", async () => {
            await collection("users").insertOne({ userId: "user9" });
            await collection("users").find({ userId: "user9" }, { cache: 5000 });

            const stats1 = msq.cache.getStats();
            const size1 = stats1.size;

            await collection("users").findOneAndUpdate(
                { userId: "nonexistent" },
                { $set: { name: "Test" } }
            );

            const stats2 = msq.cache.getStats();
            assert.strictEqual(stats2.size, size1);
        });
    });

    describe("实际应用场景", () => {
        it("计数器场景：原子递增并获取新值", async () => {
            await collection("users").insertOne({
                counterName: "orderNumber",
                value: 1000
            });

            const result = await collection("users").findOneAndUpdate(
                { counterName: "orderNumber" },
                { $inc: { value: 1 } },
                { returnDocument: "after" }
            );

            assert.strictEqual(result.value, 1001);

            // 连续获取
            const result2 = await collection("users").findOneAndUpdate(
                { counterName: "orderNumber" },
                { $inc: { value: 1 } },
                { returnDocument: "after" }
            );

            assert.strictEqual(result2.value, 1002);
        });

        it("乐观锁场景：使用版本号", async () => {
            await collection("users").insertOne({
                userId: "user10",
                name: "Henry",
                version: 1
            });

            // 成功更新（版本匹配）
            const doc1 = await collection("users").findOneAndUpdate(
                { userId: "user10", version: 1 },
                { $set: { name: "Henry Updated" }, $inc: { version: 1 } },
                { returnDocument: "after" }
            );

            assert.ok(doc1);
            assert.strictEqual(doc1.version, 2);

            // 失败更新（版本不匹配）
            const doc2 = await collection("users").findOneAndUpdate(
                { userId: "user10", version: 1 },
                { $set: { name: "Should Fail" } }
            );

            assert.strictEqual(doc2, null, "版本不匹配时应该返回 null");
        });

        it("队列场景：获取并标记任务", async () => {
            await collection("users").insertMany([
                { taskId: 1, status: "pending", priority: 1 },
                { taskId: 2, status: "pending", priority: 2 },
                { taskId: 3, status: "pending", priority: 3 }
            ]);

            // 获取优先级最高的待处理任务
            const task = await collection("users").findOneAndUpdate(
                { status: "pending" },
                { $set: { status: "processing", startedAt: new Date() } },
                { sort: { priority: -1 }, returnDocument: "after" }
            );

            assert.ok(task);
            assert.strictEqual(task.taskId, 3);
            assert.strictEqual(task.status, "processing");

            // 验证其他任务未被修改
            const db = msq._adapter.db;
            const pendingCount = await db.collection("users").countDocuments({ status: "pending" });
            assert.strictEqual(pendingCount, 2);
        });
    });

    describe("并发安全测试", () => {
        it("应该保证原子性（多个并发更新）", async function () {
            this.timeout(10000);

            await collection("users").insertOne({
                counterId: "concurrent",
                value: 0
            });

            // 模拟 10 个并发更新
            const updates = Array.from({ length: 10 }, () =>
                collection("users").findOneAndUpdate(
                    { counterId: "concurrent" },
                    { $inc: { value: 1 } }
                )
            );

            await Promise.all(updates);

            // 验证最终值
            const db = msq._adapter.db;
            const doc = await db.collection("users").findOne({ counterId: "concurrent" });
            assert.strictEqual(doc.value, 10, "原子操作应该保证所有更新都生效");
        });
    });

    describe("边界用例测试", () => {
        it("应该能更新嵌套字段", async () => {
            await collection("users").insertOne({
                userId: "user11",
                profile: { name: "Test", age: 25 }
            });

            const doc = await collection("users").findOneAndUpdate(
                { userId: "user11" },
                { $set: { "profile.age": 26 } },
                { returnDocument: "after" }
            );

            assert.strictEqual(doc.profile.age, 26);
            assert.strictEqual(doc.profile.name, "Test");
        });

        it("应该支持复杂筛选条件", async () => {
            await collection("users").insertMany([
                { type: "premium", age: 20 },
                { type: "premium", age: 30 },
                { type: "basic", age: 25 }
            ]);

            const doc = await collection("users").findOneAndUpdate(
                { type: "premium", age: { $gte: 25 } },
                { $set: { upgraded: true } },
                { returnDocument: "after" }
            );

            assert.ok(doc);
            assert.strictEqual(doc.type, "premium");
            assert.ok(doc.age >= 25);
            assert.strictEqual(doc.upgraded, true);
        });
    });
});

