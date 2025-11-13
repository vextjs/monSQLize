/**
 * deleteOne 方法测试套件
 * 测试删除单个文档功能
 */

const assert = require("assert");
const MonSQLize = require("../../../lib/index");

describe("deleteOne 方法测试套件", function () {
    this.timeout(30000);

    let msq, collection;

    before(async () => {
        msq = new MonSQLize({
            type: "mongodb",
            databaseName: "test_deleteone",
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
        it("应该成功删除单个匹配的文档", async () => {
            await collection("users").insertOne({
                userId: "user1",
                name: "Alice"
            });

            const result = await collection("users").deleteOne({ userId: "user1" });

            assert.strictEqual(result.deletedCount, 1);
            assert.strictEqual(result.acknowledged, true);

            // 验证文档已删除
            const db = msq._adapter.db;
            const doc = await db.collection("users").findOne({ userId: "user1" });
            assert.strictEqual(doc, null);
        });

        it("未找到匹配文档时应返回 deletedCount=0", async () => {
            const result = await collection("users").deleteOne({ userId: "nonexistent" });

            assert.strictEqual(result.deletedCount, 0);
            assert.strictEqual(result.acknowledged, true);
        });

        it("有多个匹配文档时应只删除一个", async () => {
            await collection("users").insertMany([
                { type: "temp", name: "User1" },
                { type: "temp", name: "User2" },
                { type: "temp", name: "User3" }
            ]);

            const result = await collection("users").deleteOne({ type: "temp" });

            assert.strictEqual(result.deletedCount, 1);

            // 验证还有2个文档
            const db = msq._adapter.db;
            const count = await db.collection("users").countDocuments({ type: "temp" });
            assert.strictEqual(count, 2);
        });
    });

    describe("选项参数测试", () => {
        it("应该支持 collation 选项", async () => {
            await collection("users").insertOne({
                userId: "user1",
                name: "Alice"
            });

            const result = await collection("users").deleteOne(
                { name: "alice" },
                { collation: { locale: "en", strength: 2 } }
            );

            assert.strictEqual(result.deletedCount, 1);
        });


        it("应该支持 comment 选项", async () => {
            await collection("users").insertOne({
                userId: "user1",
                name: "Alice"
            });

            const result = await collection("users").deleteOne(
                { userId: "user1" },
                { comment: "test-delete-comment" }
            );

            assert.strictEqual(result.deletedCount, 1);
        });
    });

    describe("参数验证测试", () => {
        it("应该在 filter 缺失时抛出错误", async () => {
            try {
                await collection("users").deleteOne();
                assert.fail("应该抛出错误");
            } catch (err) {
                assert.strictEqual(err.code, "INVALID_ARGUMENT");
                assert.ok(err.message.includes("filter"));
            }
        });

        it("应该在 filter 为 null 时抛出错误", async () => {
            try {
                await collection("users").deleteOne(null);
                assert.fail("应该抛出错误");
            } catch (err) {
                assert.strictEqual(err.code, "INVALID_ARGUMENT");
            }
        });

        it("应该在 filter 为数组时抛出错误", async () => {
            try {
                await collection("users").deleteOne([{ userId: "user1" }]);
                assert.fail("应该抛出错误");
            } catch (err) {
                assert.strictEqual(err.code, "INVALID_ARGUMENT");
            }
        });
    });

    describe("缓存失效测试", () => {
        it("应该在删除成功后自动失效缓存", async () => {
            await collection("users").insertOne({
                userId: "user1",
                name: "Alice"
            });

            // 先查询生成缓存
            await collection("users").find({ userId: "user1" }, { cache: 5000 });
            const stats1 = msq.cache.getStats();
            assert.ok(stats1.size > 0);

            // 删除文档
            await collection("users").deleteOne({ userId: "user1" });

            // 缓存应该被清除
            const stats2 = msq.cache.getStats();
            assert.strictEqual(stats2.size, 0);
        });

        it("未找到文档时不应失效缓存", async () => {
            await collection("users").insertOne({ userId: "user1" });
            await collection("users").find({ userId: "user1" }, { cache: 5000 });

            const stats1 = msq.cache.getStats();
            const size1 = stats1.size;

            await collection("users").deleteOne({ userId: "nonexistent" });

            const stats2 = msq.cache.getStats();
            assert.strictEqual(stats2.size, size1);
        });
    });

    describe("实际应用场景", () => {
        it("删除过期的会话", async () => {
            const now = new Date();
            const expired = new Date(now.getTime() - 86400000); // 1天前

            await collection("users").insertMany([
                { sessionId: "s1", expiresAt: expired, userId: "user1" },
                { sessionId: "s2", expiresAt: now, userId: "user2" }
            ]);

            const result = await collection("users").deleteOne({
                expiresAt: { $lt: now }
            });

            assert.strictEqual(result.deletedCount, 1);
        });

        it("删除临时数据", async () => {
            await collection("users").insertMany([
                { type: "temp", data: "data1", createdAt: new Date() },
                { type: "permanent", data: "data2" }
            ]);

            const result = await collection("users").deleteOne({ type: "temp" });

            assert.strictEqual(result.deletedCount, 1);

            // 验证永久数据仍然存在
            const db = msq._adapter.db;
            const permanent = await db.collection("users").findOne({ type: "permanent" });
            assert.ok(permanent);
        });

        it("删除用户账户", async () => {
            await collection("users").insertOne({
                userId: "user123",
                email: "user@example.com",
                status: "deleted_requested"
            });

            const result = await collection("users").deleteOne({
                userId: "user123",
                status: "deleted_requested"
            });

            assert.strictEqual(result.deletedCount, 1);
        });
    });

    describe("边界用例测试", () => {
        it("应该能删除包含复杂嵌套对象的文档", async () => {
            await collection("users").insertOne({
                userId: "user1",
                profile: {
                    address: {
                        city: "Beijing",
                        country: "China"
                    },
                    preferences: {
                        theme: "dark",
                        language: "zh-CN"
                    }
                }
            });

            const result = await collection("users").deleteOne({
                "profile.address.city": "Beijing"
            });

            assert.strictEqual(result.deletedCount, 1);
        });

        it("应该能删除包含数组的文档", async () => {
            await collection("users").insertOne({
                userId: "user1",
                tags: ["premium", "active", "verified"]
            });

            const result = await collection("users").deleteOne({
                tags: { $in: ["premium"] }
            });

            assert.strictEqual(result.deletedCount, 1);
        });

        it("空 filter 应该删除集合中的第一个文档", async () => {
            await collection("users").insertMany([
                { userId: "user1" },
                { userId: "user2" }
            ]);

            const result = await collection("users").deleteOne({});

            assert.strictEqual(result.deletedCount, 1);

            // 应该还有一个文档
            const db = msq._adapter.db;
            const count = await db.collection("users").countDocuments({});
            assert.strictEqual(count, 1);
        });
    });
});

