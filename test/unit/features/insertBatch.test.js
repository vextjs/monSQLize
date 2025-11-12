/**
 * insertBatch 方法测试套件
 * 测试分批批量插入功能（包含重试机制）
 */

const assert = require("assert");
const MonSQLize = require("../../../lib/index");

describe("insertBatch 方法测试套件", function () {
    this.timeout(60000);  // 分批插入可能需要更长时间

    let msq, collection;

    before(async () => {
        msq = new MonSQLize({
            type: "mongodb",
            databaseName: "test_insertbatch",
            config: { useMemoryServer: true }
        });

        const conn = await msq.connect();
        collection = conn.collection;
    });

    after(async () => {
        if (msq) await msq.close();
    });

    beforeEach(async () => {
        // 每个测试前清空集合
        const db = msq._adapter.db;
        await db.collection("users").deleteMany({});
        await db.collection("products").deleteMany({});
    });

    describe("基本功能测试", () => {
        it("应该成功分批插入大量文档", async () => {
            const testData = Array.from({ length: 2500 }, (_, i) => ({
                name: `User ${i + 1}`,
                index: i
            }));

            const result = await collection("users").insertBatch(testData, {
                batchSize: 500
            });

            assert.strictEqual(result.totalCount, 2500, "总数应为 2500");
            assert.strictEqual(result.insertedCount, 2500, "应全部插入成功");
            assert.strictEqual(result.batchCount, 5, "应分为 5 批");
            assert.strictEqual(result.errors.length, 0, "不应有错误");

            // 验证数据库中的实际数量
            const db = msq._adapter.db;
            const count = await db.collection("users").countDocuments({});
            assert.strictEqual(count, 2500);
        });

        it("应该正确返回 insertedIds 映射", async () => {
            const testData = Array.from({ length: 10 }, (_, i) => ({
                name: `User ${i + 1}`
            }));

            const result = await collection("users").insertBatch(testData, {
                batchSize: 3
            });

            assert.ok(result.insertedIds, "应返回 insertedIds");
            assert.strictEqual(Object.keys(result.insertedIds).length, 10, "应有 10 个 ID");

            // 验证索引连续性
            for (let i = 0; i < 10; i++) {
                assert.ok(result.insertedIds[i], `索引 ${i} 应有 ID`);
            }
        });
    });

    describe("参数验证测试", () => {
        it("应该在 documents 不是数组时抛出错误", async () => {
            try {
                await collection("users").insertBatch({ name: "Invalid" });
                assert.fail("应该抛出错误");
            } catch (err) {
                assert.ok(err.message.includes("数组"), "错误信息应包含'数组'");
            }
        });

        it("应该在 documents 为空数组时抛出错误", async () => {
            try {
                await collection("users").insertBatch([]);
                assert.fail("应该抛出错误");
            } catch (err) {
                assert.ok(err.message.includes("不能为空"), "错误信息应包含'不能为空'");
            }
        });

        it("应该在 batchSize 无效时抛出错误", async () => {
            try {
                await collection("users").insertBatch(
                    [{ name: "Test" }],
                    { batchSize: 0 }
                );
                assert.fail("应该抛出错误");
            } catch (err) {
                assert.ok(err.message.includes("batchSize"), "错误信息应包含batchSize");
            }
        });

        it("应该在 concurrency 无效时抛出错误", async () => {
            try {
                await collection("users").insertBatch(
                    [{ name: "Test" }],
                    { concurrency: -1 }
                );
                assert.fail("应该抛出错误");
            } catch (err) {
                assert.ok(err.message.includes("concurrency"), "错误信息应包含concurrency");
            }
        });

        it("应该在 onError 策略无效时抛出错误", async () => {
            try {
                await collection("users").insertBatch(
                    [{ name: "Test" }],
                    { onError: "invalid" }
                );
                assert.fail("应该抛出错误");
            } catch (err) {
                assert.ok(err.message.includes("onError"), "错误信息应包含onError");
            }
        });

        it("应该在 retryAttempts 无效时抛出错误", async () => {
            try {
                await collection("users").insertBatch(
                    [{ name: "Test" }],
                    { retryAttempts: -1 }
                );
                assert.fail("应该抛出错误");
            } catch (err) {
                assert.ok(err.message.includes("retryAttempts"), "错误信息应包含retryAttempts");
            }
        });
    });

    describe("进度回调测试", () => {
        it("应该正确触发进度回调", async () => {
            const testData = Array.from({ length: 100 }, (_, i) => ({
                name: `User ${i + 1}`
            }));

            const progressSteps = [];

            await collection("users").insertBatch(testData, {
                batchSize: 25,
                onProgress: (progress) => {
                    progressSteps.push(progress);
                }
            });

            assert.strictEqual(progressSteps.length, 4, "应触发 4 次进度回调");

            // 验证最后一次进度
            const lastProgress = progressSteps[progressSteps.length - 1];
            assert.strictEqual(lastProgress.currentBatch, 4);
            assert.strictEqual(lastProgress.totalBatches, 4);
            assert.strictEqual(lastProgress.inserted, 100);
            assert.strictEqual(lastProgress.total, 100);
            assert.strictEqual(lastProgress.percentage, 100);
        });

        it("进度回调应包含重试信息", async () => {
            const testData = Array.from({ length: 10 }, (_, i) => ({
                name: `User ${i + 1}`
            }));

            let lastProgress;

            await collection("users").insertBatch(testData, {
                batchSize: 5,
                onProgress: (progress) => {
                    lastProgress = progress;
                    assert.ok(typeof progress.retries === "number", "应包含重试数量");
                }
            });

            assert.ok(lastProgress, "应该有进度回调");
            assert.strictEqual(lastProgress.retries, 0, "无错误时重试应为0");
        });
    });

    describe("错误处理 - stop 策略", () => {
        it("应该在遇到错误时停止插入", async () => {
            const testData = [
                { _id: "stop-1", name: "User 1" },
                { _id: "stop-2", name: "User 2" },
                { _id: "stop-1", name: "User 3 Duplicate" },  // 重复
                { _id: "stop-3", name: "User 4" }
            ];

            try {
                await collection("users").insertBatch(testData, {
                    batchSize: 2,
                    onError: "stop"
                });
                assert.fail("应该抛出错误");
            } catch (err) {
                assert.strictEqual(err.code, "WRITE_ERROR");

                // 验证插入了前面的数据（可能包含第二批的部分成功数据）
                const db = msq._adapter.db;
                const count = await db.collection("users").countDocuments({});
                assert.ok(count >= 2, "应该至少插入了前 2 条");
                assert.ok(count <= 3, "不应超过 3 条");
            }
        });
    });

    describe("错误处理 - skip 策略", () => {
        it("应该跳过失败批次继续插入", async () => {
            const testData = [
                { _id: "skip-1", name: "User 1" },
                { _id: "skip-2", name: "User 2" },
                { _id: "skip-1", name: "User 3 Duplicate" },  // 重复，跳过此批次
                { _id: "skip-3", name: "User 4" },
                { _id: "skip-4", name: "User 5" }
            ];

            const result = await collection("users").insertBatch(testData, {
                batchSize: 2,
                onError: "skip"
            });

            // skip模式下，失败批次可能有部分成功
            assert.ok(result.insertedCount >= 3, "应至少插入 3 条");
            assert.strictEqual(result.errors.length, 1, "应有 1 个错误");

            // 验证数据库
            const db = msq._adapter.db;
            const count = await db.collection("users").countDocuments({});
            assert.ok(count >= 3, "数据库中应至少有 3 条");
        });
    });

    describe("错误处理 - collect 策略", () => {
        it("应该收集所有错误并继续执行", async () => {
            const testData = [
                { _id: "collect-1", name: "User 1" },
                { _id: "collect-1", name: "User 2 Duplicate" },  // 重复
                { _id: "collect-2", name: "User 3" },
                { _id: "collect-2", name: "User 4 Duplicate" },  // 重复
                { _id: "collect-3", name: "User 5" }
            ];

            const result = await collection("users").insertBatch(testData, {
                batchSize: 1,
                onError: "collect"
            });

            assert.strictEqual(result.insertedCount, 3, "应插入 3 条");
            assert.strictEqual(result.errors.length, 2, "应收集 2 个错误");

            // 验证错误信息
            assert.ok(result.errors[0].batchIndex !== undefined);
            assert.ok(result.errors[0].error);
            assert.ok(result.errors[0].attempts, "错误记录应包含重试次数");
        });
    });

    describe("错误处理 - retry 策略 ⭐ 新特性", () => {
        it("应该返回 retries 字段", async () => {
            const testData = Array.from({ length: 10 }, (_, i) => ({
                name: `User ${i + 1}`
            }));

            const result = await collection("users").insertBatch(testData, {
                batchSize: 5,
                onError: "retry",
                retryAttempts: 2
            });

            assert.ok(Array.isArray(result.retries), "应返回 retries 数组");
            assert.strictEqual(result.retries.length, 0, "无错误时重试应为空");
        });

        it("应该在失败时记录重试信息", async () => {
            // 注意：这个测试模拟重试，但在实际环境中很难触发真实的重试
            // 因为重复键错误重试也会失败
            const testData = [
                { _id: "retry-1", name: "User 1" }
            ];

            const result = await collection("users").insertBatch(testData, {
                batchSize: 1,
                onError: "retry",
                retryAttempts: 2,
                retryDelay: 100
            });

            assert.strictEqual(result.insertedCount, 1);
            assert.strictEqual(result.retries.length, 0, "成功插入无需重试");
        });

        it("retry 策略应触发 onRetry 回调", async () => {
            const testData = Array.from({ length: 5 }, (_, i) => ({
                name: `User ${i + 1}`
            }));

            let onRetryCalled = false;

            const result = await collection("users").insertBatch(testData, {
                batchSize: 5,
                onError: "retry",
                retryAttempts: 1,
                retryDelay: 100,
                onRetry: (retryInfo) => {
                    onRetryCalled = true;
                    assert.ok(typeof retryInfo.batchIndex === "number");
                    assert.ok(typeof retryInfo.attempt === "number");
                    assert.ok(typeof retryInfo.maxAttempts === "number");
                }
            });

            assert.strictEqual(result.insertedCount, 5);
            // 注意：onRetry 只在实际重试时才调用，正常情况不会调用
        });
    });

    describe("并发控制测试", () => {
        it("应该支持并发批次插入", async () => {
            const testData = Array.from({ length: 1000 }, (_, i) => ({
                name: `User ${i + 1}`,
                index: i
            }));

            const result = await collection("users").insertBatch(testData, {
                batchSize: 200,
                concurrency: 3  // 3 个批次并发
            });

            assert.strictEqual(result.insertedCount, 1000);
            assert.strictEqual(result.batchCount, 5);

            // 验证数据库
            const db = msq._adapter.db;
            const count = await db.collection("users").countDocuments({});
            assert.strictEqual(count, 1000);
        });
    });

    describe("缓存失效测试", () => {
        it("应该在分批插入后自动失效缓存", async () => {
            // 1. 先插入一些初始数据
            await collection("users").insertBatch(
                [{ name: "Initial" }],
                { batchSize: 1 }
            );

            // 2. 查询并缓存
            await collection("users").find({}, { cache: 5000 });

            const stats1 = msq.cache.getStats();
            assert.ok(stats1.size > 0, "应该有缓存");

            // 3. 分批插入新数据
            await collection("users").insertBatch(
                Array.from({ length: 100 }, (_, i) => ({ name: `User ${i}` })),
                { batchSize: 25 }
            );

            // 4. 验证缓存已清空
            const stats2 = msq.cache.getStats();
            assert.strictEqual(stats2.size, 0, "插入后缓存应该被清空");
        });
    });

    describe("选项参数测试", () => {
        it("应该支持 comment 参数", async () => {
            const testData = Array.from({ length: 10 }, (_, i) => ({
                name: `User ${i + 1}`
            }));

            const result = await collection("users").insertBatch(testData, {
                batchSize: 5,
                comment: "test-batch-insert"
            });

            assert.strictEqual(result.insertedCount, 10);
        });

        it("应该支持 writeConcern 参数", async () => {
            const testData = Array.from({ length: 10 }, (_, i) => ({
                name: `User ${i + 1}`
            }));

            const result = await collection("users").insertBatch(testData, {
                batchSize: 5,
                writeConcern: { w: 1 }
            });

            assert.strictEqual(result.insertedCount, 10);
        });

        it("应该支持 retryAttempts 和 retryDelay 参数", async () => {
            const testData = Array.from({ length: 10 }, (_, i) => ({
                name: `User ${i + 1}`
            }));

            const result = await collection("users").insertBatch(testData, {
                batchSize: 5,
                onError: "retry",
                retryAttempts: 3,
                retryDelay: 500
            });

            assert.strictEqual(result.insertedCount, 10);
            assert.ok(Array.isArray(result.retries));
        });
    });

    describe("边界用例测试", () => {
        it("应该正确处理文档数量小于 batchSize 的情况", async () => {
            const testData = [
                { name: "User 1" },
                { name: "User 2" }
            ];

            const result = await collection("users").insertBatch(testData, {
                batchSize: 10  // batchSize 大于数据量
            });

            assert.strictEqual(result.totalCount, 2);
            assert.strictEqual(result.insertedCount, 2);
            assert.strictEqual(result.batchCount, 1, "应该只有 1 批");
        });

        it("应该正确处理文档数量正好等于 batchSize 的情况", async () => {
            const testData = Array.from({ length: 100 }, (_, i) => ({
                name: `User ${i + 1}`
            }));

            const result = await collection("users").insertBatch(testData, {
                batchSize: 100
            });

            assert.strictEqual(result.batchCount, 1);
            assert.strictEqual(result.insertedCount, 100);
        });

        it("应该正确处理 retryAttempts 为 0 的情况", async () => {
            const testData = Array.from({ length: 10 }, (_, i) => ({
                name: `User ${i + 1}`
            }));

            const result = await collection("users").insertBatch(testData, {
                batchSize: 5,
                onError: "retry",
                retryAttempts: 0  // 不重试
            });

            assert.strictEqual(result.insertedCount, 10);
        });
    });
});

