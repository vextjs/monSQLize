/**
 * findOneAndReplace 方法测试套件
 * 测试原子查找并替换功能
 */

const assert = require("assert");
const MonSQLize = require("../../../lib/index");

describe("findOneAndReplace 方法测试套件", function () {
    this.timeout(30000);

    let msq, collection;

    before(async () => {
        msq = new MonSQLize({
            type: "mongodb",
            databaseName: "test_findoneandreplace",
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
        it("应该原子地查找并替换文档（返回替换前）", async () => {
            await collection("users").insertOne({
                userId: "user1",
                name: "Alice",
                age: 25,
                status: "active"
            });

            const oldDoc = await collection("users").findOneAndReplace(
                { userId: "user1" },
                { userId: "user1", name: "Alice", age: 26 }
            );

            assert.ok(oldDoc);
            assert.strictEqual(oldDoc.age, 25, "应该返回替换前的值");
            assert.strictEqual(oldDoc.status, "active");

            // 验证文档已替换
            const db = msq._adapter.db;
            const newDoc = await db.collection("users").findOne({ userId: "user1" });
            assert.strictEqual(newDoc.age, 26);
            assert.strictEqual(newDoc.status, undefined, "旧字段应该被删除");
        });

        it("应该支持 returnDocument=after（返回替换后）", async () => {
            await collection("users").insertOne({
                userId: "user2",
                name: "Bob",
                oldField: "old"
            });

            const newDoc = await collection("users").findOneAndReplace(
                { userId: "user2" },
                { userId: "user2", name: "Bob Updated", newField: "new" },
                { returnDocument: "after" }
            );

            assert.ok(newDoc);
            assert.strictEqual(newDoc.name, "Bob Updated");
            assert.strictEqual(newDoc.newField, "new");
            assert.strictEqual(newDoc.oldField, undefined);
        });

        it("未找到文档时应返回 null", async () => {
            const result = await collection("users").findOneAndReplace(
                { userId: "nonexistent" },
                { userId: "nonexistent", name: "Test" }
            );

            assert.strictEqual(result, null);
        });

        it("应该保留 _id 字段", async () => {
            await collection("users").insertOne({
                userId: "user3",
                name: "Charlie"
            });

            const db = msq._adapter.db;
            const original = await db.collection("users").findOne({ userId: "user3" });
            const originalId = original._id;

            const oldDoc = await collection("users").findOneAndReplace(
                { userId: "user3" },
                { userId: "user3", name: "Charlie Replaced" }
            );

            assert.ok(oldDoc);

            // 验证 _id 未变
            const newDoc = await db.collection("users").findOne({ userId: "user3" });
            assert.deepStrictEqual(newDoc._id, originalId);
        });
    });

    describe("排序功能", () => {
        it("应该支持 sort 选项", async () => {
            await collection("users").insertMany([
                { type: "config", key: "theme", value: "light", priority: 1 },
                { type: "config", key: "language", value: "zh", priority: 2 }
            ]);

            const doc = await collection("users").findOneAndReplace(
                { type: "config" },
                { type: "config", key: "replaced", value: "new" },
                { sort: { priority: -1 }, returnDocument: "after" }
            );

            assert.ok(doc);
            assert.strictEqual(doc.key, "replaced");
        });
    });

    describe("upsert 选项测试", () => {
        it("upsert=true 且未找到时应插入并返回新文档", async () => {
            const doc = await collection("users").findOneAndReplace(
                { configKey: "newconfig" },
                { configKey: "newconfig", value: "default", version: 1 },
                { upsert: true, returnDocument: "after" }
            );

            assert.ok(doc);
            assert.strictEqual(doc.configKey, "newconfig");
            assert.strictEqual(doc.value, "default");
        });

        it("upsert=true 且找到时应替换", async () => {
            await collection("users").insertOne({
                configKey: "existing",
                value: "old",
                extra: "data"
            });

            const doc = await collection("users").findOneAndReplace(
                { configKey: "existing" },
                { configKey: "existing", value: "new" },
                { upsert: true, returnDocument: "after" }
            );

            assert.ok(doc);
            assert.strictEqual(doc.value, "new");
            assert.strictEqual(doc.extra, undefined);
        });
    });

    describe("projection 选项测试", () => {
        it("应该支持字段投影", async () => {
            await collection("users").insertOne({
                userId: "user4",
                name: "David",
                email: "david@example.com",
                password: "secret"
            });

            const doc = await collection("users").findOneAndReplace(
                { userId: "user4" },
                { userId: "user4", name: "David Updated" },
                { projection: { name: 1, userId: 1 } }
            );

            assert.ok(doc);
            assert.strictEqual(doc.name, "David");
            assert.strictEqual(doc.email, undefined);
            assert.strictEqual(doc.password, undefined);
        });
    });

    describe("参数验证测试", () => {
        it("应该在 filter 缺失时抛出错误", async () => {
            try {
                await collection("users").findOneAndReplace();
                assert.fail("应该抛出错误");
            } catch (err) {
                assert.strictEqual(err.code, "INVALID_ARGUMENT");
            }
        });

        it("应该在 replacement 缺失时抛出错误", async () => {
            try {
                await collection("users").findOneAndReplace({ userId: "test" });
                assert.fail("应该抛出错误");
            } catch (err) {
                assert.strictEqual(err.code, "INVALID_ARGUMENT");
            }
        });

        it("应该在 replacement 包含 $ 操作符时抛出错误", async () => {
            try {
                await collection("users").findOneAndReplace(
                    { userId: "test" },
                    { $set: { name: "Test" } }
                );
                assert.fail("应该抛出错误");
            } catch (err) {
                assert.strictEqual(err.code, "INVALID_ARGUMENT");
                assert.ok(err.message.includes("不能包含更新操作符"));
            }
        });
    });

    describe("缓存失效测试", () => {
        it("应该在替换成功后自动失效缓存", async () => {
            await collection("users").insertOne({
                userId: "user5",
                name: "Eve"
            });

            await collection("users").find({ userId: "user5" }, { cache: 5000 });
            const stats1 = msq.cache.getStats();
            assert.ok(stats1.size > 0);

            await collection("users").findOneAndReplace(
                { userId: "user5" },
                { userId: "user5", name: "Eve Replaced" }
            );

            const stats2 = msq.cache.getStats();
            assert.strictEqual(stats2.size, 0);
        });

        it("未找到文档时不应失效缓存", async () => {
            await collection("users").insertOne({ userId: "user6" });
            await collection("users").find({ userId: "user6" }, { cache: 5000 });

            const stats1 = msq.cache.getStats();
            const size1 = stats1.size;

            await collection("users").findOneAndReplace(
                { userId: "nonexistent" },
                { userId: "nonexistent", name: "Test" }
            );

            const stats2 = msq.cache.getStats();
            assert.strictEqual(stats2.size, size1);
        });
    });

    describe("实际应用场景", () => {
        it("配置管理场景：原子替换配置", async () => {
            await collection("users").insertOne({
                configKey: "app-settings",
                theme: "light",
                language: "zh-CN",
                version: 1
            });

            const oldConfig = await collection("users").findOneAndReplace(
                { configKey: "app-settings" },
                {
                    configKey: "app-settings",
                    theme: "dark",
                    language: "en-US",
                    notifications: true,
                    version: 2
                }
            );

            assert.ok(oldConfig);
            assert.strictEqual(oldConfig.theme, "light");
            assert.strictEqual(oldConfig.version, 1);

            // 验证新配置
            const db = msq._adapter.db;
            const newConfig = await db.collection("users").findOne({ configKey: "app-settings" });
            assert.strictEqual(newConfig.theme, "dark");
            assert.strictEqual(newConfig.notifications, true);
            assert.strictEqual(newConfig.language, "en-US", "旧的 zh-CN 应该被替换");
        });

        it("版本管理场景：获取旧版本并创建新版本", async () => {
            await collection("users").insertOne({
                documentId: "doc1",
                content: "Version 1",
                version: 1,
                author: "Alice"
            });

            const oldVersion = await collection("users").findOneAndReplace(
                { documentId: "doc1" },
                {
                    documentId: "doc1",
                    content: "Version 2",
                    version: 2,
                    author: "Bob",
                    updatedAt: new Date()
                }
            );

            assert.ok(oldVersion);
            assert.strictEqual(oldVersion.content, "Version 1");
            assert.strictEqual(oldVersion.version, 1);

            // 可以保存旧版本到历史表
            // await collection("history").insertOne(oldVersion);
        });

        it("状态机场景：完整替换状态", async () => {
            await collection("users").insertOne({
                taskId: "task1",
                status: "pending",
                assignee: null,
                attempts: 0
            });

            const oldState = await collection("users").findOneAndReplace(
                { taskId: "task1", status: "pending" },
                {
                    taskId: "task1",
                    status: "processing",
                    assignee: "worker-1",
                    startedAt: new Date()
                },
                { returnDocument: "after" }
            );

            assert.ok(oldState);
            assert.strictEqual(oldState.status, "processing");
            assert.strictEqual(oldState.assignee, "worker-1");
            assert.strictEqual(oldState.attempts, undefined, "旧字段应该被清除");
        });
    });

    describe("与其他方法的对比", () => {
        it("应该删除未在 replacement 中的字段（与 findOneAndUpdate 不同）", async () => {
            await collection("users").insertOne({
                userId: "user7",
                name: "Frank",
                age: 30,
                email: "frank@example.com",
                tags: ["premium"]
            });

            const doc = await collection("users").findOneAndReplace(
                { userId: "user7" },
                { userId: "user7", name: "Frank", age: 31 },
                { returnDocument: "after" }
            );

            assert.ok(doc);
            assert.strictEqual(doc.age, 31);
            assert.strictEqual(doc.email, undefined);
            assert.strictEqual(doc.tags, undefined);
        });
    });

    describe("并发安全测试", () => {
        it("应该保证原子性（获取唯一配置）", async function () {
            this.timeout(10000);

            await collection("users").insertOne({
                lockKey: "unique-lock",
                available: true
            });

            // 模拟多个并发尝试获取锁
            const attempts = Array.from({ length: 5 }, (_, i) =>
                collection("users").findOneAndReplace(
                    { lockKey: "unique-lock", available: true },
                    {
                        lockKey: "unique-lock",
                        available: false,
                        ownerId: `worker-${i}`,
                        acquiredAt: new Date()
                    }
                ).catch(() => null)
            );

            const results = await Promise.all(attempts);
            const successCount = results.filter(r => r !== null).length;

            assert.strictEqual(successCount, 1, "只有一个worker应该成功获取锁");
        });
    });

    describe("边界用例测试", () => {
        it("应该能替换为包含嵌套对象的文档", async () => {
            await collection("users").insertOne({
                userId: "user8",
                simple: "data"
            });

            const doc = await collection("users").findOneAndReplace(
                { userId: "user8" },
                {
                    userId: "user8",
                    complex: {
                        nested: {
                            data: "value"
                        }
                    },
                    array: [1, 2, 3]
                },
                { returnDocument: "after" }
            );

            assert.ok(doc);
            assert.deepStrictEqual(doc.complex.nested, { data: "value" });
            assert.deepStrictEqual(doc.array, [1, 2, 3]);
        });

        it("应该能替换为空对象", async () => {
            await collection("users").insertOne({
                userId: "user9",
                name: "Test",
                data: "value"
            });

            const doc = await collection("users").findOneAndReplace(
                { userId: "user9" },
                {},
                { returnDocument: "after" }
            );

            assert.ok(doc);
            assert.ok(doc._id);
            assert.strictEqual(doc.userId, undefined);
            assert.strictEqual(doc.name, undefined);
        });
    });
});

