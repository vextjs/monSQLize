/**
 * deleteBatch 单元测试
 */

const assert = require('assert');
const MonSQLize = require('../../../lib/index');

describe('deleteBatch 方法测试套件', function () {
    this.timeout(60000);

    let msq, collection;

    before(async function () {
        // 使用内存数据库
        msq = new MonSQLize({
            type: 'mongodb',
            databaseName: 'test_deletebatch',
            config: { useMemoryServer: true }
        });

        const conn = await msq.connect();
        collection = conn.collection;
    });

    after(async function () {
        if (msq) await msq.close();
    });

    beforeEach(async function () {
        // 每个测试前清空集合
        const db = msq._adapter.db;
        await db.collection('test_batch_delete').deleteMany({});
    });

    describe('基础功能', function () {
        it('应该能够分批删除文档', async function () {
            const docs = Array.from({ length: 2500 }, (_, i) => ({
                index: i,
                status: 'pending',
                createdAt: new Date()
            }));
            await collection('test_batch_delete').insertMany(docs);

            const result = await collection('test_batch_delete').deleteBatch(
                { status: 'pending' },
                { batchSize: 1000 }
            );

            assert.strictEqual(result.acknowledged, true);
            assert.strictEqual(result.deletedCount, 2500);
            assert.strictEqual(result.batchCount, 3);

            const db = msq._adapter.db;
            const count = await db.collection('test_batch_delete').countDocuments({});
            assert.strictEqual(count, 0);
        });

        it('应该能够处理空结果集', async function () {
            const result = await collection('test_batch_delete').deleteBatch(
                { status: 'nonexistent' },
                { batchSize: 1000 }
            );

            assert.strictEqual(result.deletedCount, 0);
            assert.strictEqual(result.batchCount, 0);
            assert.ok(Array.isArray(result.errors));
            assert.strictEqual(result.errors.length, 0);
        });

        it('应该能够删除小于一个批次的数据', async function () {
            const docs = Array.from({ length: 500 }, (_, i) => ({
                index: i,
                status: 'test'
            }));
            await collection('test_batch_delete').insertMany(docs);

            const result = await collection('test_batch_delete').deleteBatch(
                { status: 'test' },
                { batchSize: 1000 }
            );

            assert.strictEqual(result.deletedCount, 500);
            assert.strictEqual(result.batchCount, 1);
        });
    });

    describe('进度监控', function () {
        it('应该能够监控删除进度', async function () {
            const docs = Array.from({ length: 3000 }, (_, i) => ({
                index: i,
                status: 'progress_test'
            }));
            await collection('test_batch_delete').insertMany(docs);

            const progressUpdates = [];

            const result = await collection('test_batch_delete').deleteBatch(
                { status: 'progress_test' },
                {
                    batchSize: 1000,
                    estimateProgress: true,
                    onProgress: (p) => {
                        progressUpdates.push({
                            deleted: p.deleted,
                            percentage: p.percentage
                        });
                    }
                }
            );

            assert.strictEqual(result.deletedCount, 3000);
            assert.strictEqual(progressUpdates.length, 3);
            assert.strictEqual(progressUpdates[0].deleted, 1000);
            assert.strictEqual(progressUpdates[1].deleted, 2000);
            assert.strictEqual(progressUpdates[2].deleted, 3000);
            assert.strictEqual(progressUpdates[2].percentage, 100);
        });

        it('应该能够在不预先 count 的情况下删除', async function () {
            const docs = Array.from({ length: 2000 }, (_, i) => ({
                index: i,
                status: 'no_count'
            }));
            await collection('test_batch_delete').insertMany(docs);

            const progressUpdates = [];

            const result = await collection('test_batch_delete').deleteBatch(
                { status: 'no_count' },
                {
                    batchSize: 1000,
                    estimateProgress: false,
                    onProgress: (p) => {
                        progressUpdates.push({
                            deleted: p.deleted,
                            percentage: p.percentage
                        });
                    }
                }
            );

            assert.strictEqual(result.deletedCount, 2000);
            assert.strictEqual(result.totalCount, null);
            assert.strictEqual(progressUpdates.length, 2);
            assert.strictEqual(progressUpdates[0].percentage, null);
            assert.strictEqual(progressUpdates[1].percentage, null);
        });
    });

    describe('错误处理', function () {
        it('应该能够使用 stop 策略在错误时停止', async function () {
            const docs = Array.from({ length: 1500 }, (_, i) => ({
                index: i,
                status: 'error_test'
            }));
            await collection('test_batch_delete').insertMany(docs);

            const result = await collection('test_batch_delete').deleteBatch(
                { status: 'error_test' },
                {
                    batchSize: 1000,
                    onError: 'stop'
                }
            );

            assert.strictEqual(result.deletedCount, 1500);
            assert.ok(Array.isArray(result.errors));
            assert.strictEqual(result.errors.length, 0);
        });

        it('应该能够使用 skip 策略跳过错误', async function () {
            const docs = Array.from({ length: 1000 }, (_, i) => ({
                index: i,
                status: 'skip_test'
            }));
            await collection('test_batch_delete').insertMany(docs);

            const result = await collection('test_batch_delete').deleteBatch(
                { status: 'skip_test' },
                {
                    batchSize: 500,
                    onError: 'skip'
                }
            );

            assert.strictEqual(result.deletedCount, 1000);
        });

        it('应该能够验证 filter 参数', async function () {
            try {
                await collection('test_batch_delete').deleteBatch(null);
                assert.fail('应该抛出错误');
            } catch (error) {
                assert.ok(error.message.includes('filter 必须是对象类型'));
            }

            try {
                await collection('test_batch_delete').deleteBatch([]);
                assert.fail('应该抛出错误');
            } catch (error) {
                assert.ok(error.message.includes('filter 必须是对象类型'));
            }
        });
    });

    describe('自动重试', function () {
        it('应该支持重试配置', async function () {
            const docs = Array.from({ length: 1000 }, (_, i) => ({
                index: i,
                status: 'retry_test'
            }));
            await collection('test_batch_delete').insertMany(docs);

            const retryInfo = [];

            const result = await collection('test_batch_delete').deleteBatch(
                { status: 'retry_test' },
                {
                    batchSize: 500,
                    onError: 'retry',
                    retryAttempts: 3,
                    retryDelay: 100,
                    onRetry: (info) => {
                        retryInfo.push(info);
                    }
                }
            );

            assert.strictEqual(result.deletedCount, 1000);
            assert.ok(Array.isArray(result.retries));
            assert.strictEqual(result.retries.length, 0);
            assert.strictEqual(retryInfo.length, 0);
        });
    });

    describe('缓存失效', function () {
        it('应该在删除后自动失效缓存', async function () {
            const docs = Array.from({ length: 100 }, (_, i) => ({
                index: i,
                status: 'cache_test'
            }));
            await collection('test_batch_delete').insertMany(docs);

            // 查询并缓存
            await collection('test_batch_delete').find(
                { status: 'cache_test' },
                { cache: 60000 }
            );

            // 批量删除
            const result = await collection('test_batch_delete').deleteBatch(
                { status: 'cache_test' },
                { batchSize: 50 }
            );

            assert.strictEqual(result.deletedCount, 100);

            // 验证缓存已失效
            const afterDelete = await collection('test_batch_delete').find(
                { status: 'cache_test' }
            );
            assert.ok(Array.isArray(afterDelete));
            assert.strictEqual(afterDelete.length, 0);
        });
    });

    describe('性能测试', function () {
        it('应该能够高效处理大数据量', async function () {
            this.timeout(60000);

            const docs = Array.from({ length: 10000 }, (_, i) => ({
                index: i,
                status: 'perf_test',
                data: 'x'.repeat(100)
            }));
            await collection('test_batch_delete').insertMany(docs);

            const startTime = Date.now();

            const result = await collection('test_batch_delete').deleteBatch(
                { status: 'perf_test' },
                { batchSize: 1000 }
            );

            const duration = Date.now() - startTime;

            assert.strictEqual(result.deletedCount, 10000);
            assert.strictEqual(result.batchCount, 10);

            console.log(`      删除 10000 条耗时: ${duration}ms`);
            assert.ok(duration < 30000, `耗时 ${duration}ms 应该少于 30000ms`);
        });
    });

    describe('边界情况', function () {
        it('应该能够处理恰好等于 batchSize 的数据量', async function () {
            const docs = Array.from({ length: 1000 }, (_, i) => ({
                index: i,
                status: 'exact_batch'
            }));
            await collection('test_batch_delete').insertMany(docs);

            const result = await collection('test_batch_delete').deleteBatch(
                { status: 'exact_batch' },
                { batchSize: 1000 }
            );

            assert.strictEqual(result.deletedCount, 1000);
            assert.strictEqual(result.batchCount, 1);
        });

        it('应该能够处理 batchSize 为 1 的情况', async function () {
            const docs = Array.from({ length: 5 }, (_, i) => ({
                index: i,
                status: 'small_batch'
            }));
            await collection('test_batch_delete').insertMany(docs);

            const result = await collection('test_batch_delete').deleteBatch(
                { status: 'small_batch' },
                { batchSize: 1 }
            );

            assert.strictEqual(result.deletedCount, 5);
            assert.strictEqual(result.batchCount, 5);
        });

        it('应该能够处理非常大的 batchSize', async function () {
            const docs = Array.from({ length: 100 }, (_, i) => ({
                index: i,
                status: 'large_batch'
            }));
            await collection('test_batch_delete').insertMany(docs);

            const result = await collection('test_batch_delete').deleteBatch(
                { status: 'large_batch' },
                { batchSize: 10000 }
            );

            assert.strictEqual(result.deletedCount, 100);
            assert.strictEqual(result.batchCount, 1);
        });
    });
});

