/**
 * insertBatch 方法使用示例
 * 
 * 功能：分批批量插入大量文档到 MongoDB 集合
 * 特性：
 * - 自动分批插入（避免内存溢出）
 * - 进度监控回调
 * - 三种错误处理策略（stop/skip/collect/retry）
 * - 支持并发批次控制
 * - 自动重试机制
 * - 自动缓存失效
 */

const MonSQLize = require("../lib");

async function main() {
    // 创建 MonSQLize 实例
    const msq = new MonSQLize({
        type: "mongodb",
        databaseName: "insertbatch_examples",
        config: {
            useMemoryServer: true
        }
    });

    try {
        // 连接数据库
        const { collection } = await msq.connect();
        console.log("✅ 数据库连接成功\n");

        // ============================================================
        // 示例 1: 基础分批插入（10000 条数据）
        // ============================================================
        console.log("【示例 1】基础分批插入 - 10000 条数据");
        
        // 生成测试数据
        const largeDataset = Array.from({ length: 10000 }, (_, i) => ({
            name: `User ${i + 1}`,
            email: `user${i + 1}@example.com`,
            age: 20 + (i % 50),
            score: Math.floor(Math.random() * 100),
            createdAt: new Date()
        }));

        const result1 = await collection("users").insertBatch(largeDataset, {
            batchSize: 1000  // 每批 1000 条
        });

        console.log("插入结果:");
        console.log("- totalCount:", result1.totalCount);
        console.log("- insertedCount:", result1.insertedCount);
        console.log("- batchCount:", result1.batchCount);
        console.log("- errors:", result1.errors.length);
        console.log();

        // ============================================================
        // 示例 2: 带进度监控的分批插入
        // ============================================================
        console.log("【示例 2】带进度监控");

        await collection("products").insertBatch(
            Array.from({ length: 5000 }, (_, i) => ({
                sku: `SKU-${i + 1}`,
                name: `Product ${i + 1}`,
                price: Math.floor(Math.random() * 1000) + 100,
                stock: Math.floor(Math.random() * 1000)
            })),
            {
                batchSize: 500,
                onProgress: (progress) => {
                    console.log(
                        `进度: ${progress.percentage}% ` +
                        `(批次 ${progress.currentBatch}/${progress.totalBatches}, ` +
                        `已插入 ${progress.inserted}/${progress.total})`
                    );
                }
            }
        );
        console.log("✅ 完成\n");

        // ============================================================
        // 示例 3: 错误处理 - stop 策略（遇错停止）
        // ============================================================
        console.log("【示例 3】错误处理 - stop 策略");

        const dataWithDuplicate = [
            { _id: "id-1", name: "Item 1" },
            { _id: "id-2", name: "Item 2" },
            { _id: "id-1", name: "Item 3 Duplicate" },  // 重复 _id
            { _id: "id-3", name: "Item 4" }
        ];

        try {
            await collection("items").insertBatch(dataWithDuplicate, {
                batchSize: 2,
                onError: "stop"  // 遇到错误立即停止
            });
        } catch (error) {
            console.log("❌ 捕获到错误（预期）:");
            console.log("- code:", error.code);
            console.log("- message:", error.message);
        }
        console.log();

        // ============================================================
        // 示例 4: 错误处理 - skip 策略（跳过失败批次）
        // ============================================================
        console.log("【示例 4】错误处理 - skip 策略");

        const result4 = await collection("items").insertBatch(
            [
                { _id: "skip-1", name: "Item 1" },
                { _id: "skip-2", name: "Item 2" },
                { _id: "skip-1", name: "Item 3 Duplicate" },  // 重复，跳过此批次
                { _id: "skip-3", name: "Item 4" },
                { _id: "skip-4", name: "Item 5" }
            ],
            {
                batchSize: 2,
                onError: "skip"  // 跳过失败批次，继续后续批次
            }
        );

        console.log("插入结果:");
        console.log("- insertedCount:", result4.insertedCount);
        console.log("- errors:", result4.errors.length);
        console.log();

        // ============================================================
        // 示例 5: 错误处理 - collect 策略（收集所有错误）
        // ============================================================
        console.log("【示例 5】错误处理 - collect 策略");

        const result5 = await collection("items").insertBatch(
            [
                { _id: "collect-1", name: "Item 1" },
                { _id: "collect-1", name: "Item 2 Duplicate" },  // 重复
                { _id: "collect-2", name: "Item 3" },
                { _id: "collect-2", name: "Item 4 Duplicate" },  // 重复
                { _id: "collect-3", name: "Item 5" }
            ],
            {
                batchSize: 1,
                onError: "collect"  // 收集所有错误，继续执行
            }
        );

        console.log("插入结果:");
        console.log("- insertedCount:", result5.insertedCount);
        console.log("- errors:", result5.errors.length);
        if (result5.errors.length > 0) {
            console.log("错误详情:");
            result5.errors.forEach((err, idx) => {
                console.log(`  ${idx + 1}. 批次 ${err.batchIndex + 1}: ${err.message}`);
            });
        }
        console.log();

        // ============================================================
        // 示例 6: retry 策略 - 自动重试（新特性）
        // ============================================================
        console.log("【示例 6】retry 策略 - 自动重试");

        let retryCount = 0;
        const result6 = await collection("test_retry").insertBatch(
            Array.from({ length: 100 }, (_, i) => ({
                name: `Test ${i + 1}`,
                value: Math.random()
            })),
            {
                batchSize: 50,
                onError: "retry",
                retryAttempts: 2,
                retryDelay: 500,
                onRetry: (retryInfo) => {
                    retryCount++;
                    console.log(
                        `批次 ${retryInfo.batchIndex + 1} 第 ${retryInfo.attempt} 次重试...`
                    );
                }
            }
        );

        console.log("插入结果:");
        console.log("- insertedCount:", result6.insertedCount);
        console.log("- retries:", result6.retries.length);
        console.log("提示: retry 策略在网络不稳定时会自动重试\n");

        // ============================================================
        // 示例 7: 并发批次插入（加速大数据导入）
        // ============================================================
        console.log("【示例 7】并发批次插入 - 对比性能");

        // 测试数据
        const testData = Array.from({ length: 5000 }, (_, i) => ({
            name: `Test ${i + 1}`,
            value: Math.random()
        }));

        // 串行插入
        console.time("串行插入");
        await collection("test_serial").insertBatch(testData, {
            batchSize: 500,
            concurrency: 1  // 串行
        });
        console.timeEnd("串行插入");

        // 并发插入
        console.time("并发插入");
        await collection("test_concurrent").insertBatch(testData, {
            batchSize: 500,
            concurrency: 3  // 3 个批次并发
        });
        console.timeEnd("并发插入");
        console.log("提示: 并发插入通常更快，但要注意控制并发数避免压垮数据库\n");

        // ============================================================
        // 示例 8: 结合 comment 参数（生产环境追踪）
        // ============================================================
        console.log("【示例 8】使用 comment 参数追踪");

        await collection("logs").insertBatch(
            Array.from({ length: 1000 }, (_, i) => ({
                level: ["info", "warn", "error"][i % 3],
                message: `Log message ${i + 1}`,
                timestamp: new Date()
            })),
            {
                batchSize: 200,
                comment: "DataImport:logs:batch-v1",
                onProgress: (progress) => {
                    if (progress.currentBatch === progress.totalBatches) {
                        console.log(`✅ 完成: ${progress.inserted} 条日志已导入`);
                    }
                }
            }
        );
        console.log();

        console.log("✅ 所有示例执行完成！");
        console.log("\n📝 关键特性:");
        console.log("1. 自动分批 - 避免内存溢出和网络超时");
        console.log("2. 进度监控 - 实时了解导入进度");
        console.log("3. 错误策略 - 灵活处理导入过程中的错误（stop/skip/collect/retry）");
        console.log("4. 自动重试 - retry策略在网络不稳定时自动重试");
        console.log("5. 并发控制 - 加速大数据导入");
        console.log("6. 自动缓存失效 - 保持数据一致性");

    } catch (error) {
        console.error("❌ 示例执行失败:", error.message);
        console.error(error.stack);
    } finally {
        await msq.close();
        console.log("\n✅ 数据库连接已关闭");
    }
}

main();

