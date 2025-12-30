/**
 * updateBatch 单元测试
 */

const assert = require('assert');
const MonSQLize = require('../../../lib/index');

describe('updateBatch 方法测试套件', function () {
    this.timeout(60000);

    let msq, collection;

    before(async function () {
        // 使用内存数据库
        msq = new MonSQLize({
            type: 'mongodb',
            databaseName: 'test_updatebatch',
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
        await db.collection('test_batch_update').deleteMany({});
    });

    describe('基础功能', function () {
        it('应该能够分批更新文档', async function () {
            const docs = Array.from({ length: 2500 }, (_, i) => ({
                index: i,
                status: 'pending',
                value: 0
            }));
            await collection('test_batch_update').insertMany(docs);

            const result = await collection('test_batch_update').updateBatch(
                { status: 'pending' },
                { $set: { status: 'processed', value: 100 } },
                { batchSize: 1000 }
            );

            assert.strictEqual(result.acknowledged, true);
            assert.strictEqual(result.matchedCount, 2500);
            assert.strictEqual(result.modifiedCount, 2500);
            assert.strictEqual(result.batchCount, 3);

            const updated = await collection('test_batch_update').find({ status: 'processed' }, { limit: 0 });
            assert.strictEqual(updated.length, 2500);
            assert.strictEqual(updated[0].value, 100);
        });

        it('应该能够处理空结果集', async function () {
            const result = await collection('test_batch_update').updateBatch(
                { status: 'nonexistent' },
                { $set: { status: 'new' } },
                { batchSize: 1000 }
            );

            assert.strictEqual(result.matchedCount, 0);
            assert.strictEqual(result.modifiedCount, 0);
            assert.strictEqual(result.batchCount, 0);
        });

        it('应该能够更新小于一个批次的数据', async function () {
            const docs = Array.from({ length: 500 }, (_, i) => ({
                index: i,
                status: 'old'
            }));
            await collection('test_batch_update').insertMany(docs);

            const result = await collection('test_batch_update').updateBatch(
                { status: 'old' },
                { $set: { status: 'new' } },
                { batchSize: 1000 }
            );

            assert.strictEqual(result.matchedCount, 500);
            assert.strictEqual(result.modifiedCount, 500);
            assert.strictEqual(result.batchCount, 1);
        });
    });

    describe('更新操作符支持', function () {
        it('应该支持 $set 操作符', async function () {
            const docs = Array.from({ length: 100 }, (_, i) => ({
                index: i,
                status: 'test'
            }));
            await collection('test_batch_update').insertMany(docs);

            await collection('test_batch_update').updateBatch(
                { status: 'test' },
                { $set: { status: 'updated', newField: 'value' } },
                { batchSize: 50 }
            );

            const updated = await collection('test_batch_update').findOne({ index: 0 });
            assert.strictEqual(updated.status, 'updated');
            assert.strictEqual(updated.newField, 'value');
        });

        it('应该支持 $inc 操作符', async function () {
            const docs = Array.from({ length: 100 }, (_, i) => ({
                index: i,
                counter: 10
            }));
            await collection('test_batch_update').insertMany(docs);

            await collection('test_batch_update').updateBatch(
                {},
                { $inc: { counter: 5 } },
                { batchSize: 50 }
            );

            const updated = await collection('test_batch_update').findOne({ index: 0 });
            assert.strictEqual(updated.counter, 15);
        });

        it('应该支持 $push 操作符', async function () {
            const docs = Array.from({ length: 50 }, (_, i) => ({
                index: i,
                items: []
            }));
            await collection('test_batch_update').insertMany(docs);

            await collection('test_batch_update').updateBatch(
                {},
                { $push: { items: 'newItem' } },
                { batchSize: 25 }
            );

            const updated = await collection('test_batch_update').findOne({ index: 0 });
            assert.deepStrictEqual(updated.items, ['newItem']);
        });

        it('应该支持多个操作符组合', async function () {
            const docs = Array.from({ length: 100 }, (_, i) => ({
                index: i,
                status: 'pending',
                count: 0,
                tags: []
            }));
            await collection('test_batch_update').insertMany(docs);

            await collection('test_batch_update').updateBatch(
                { status: 'pending' },
                {
                    $set: { status: 'processed' },
                    $inc: { count: 1 },
                    $push: { tags: 'tag1' }
                },
                { batchSize: 50 }
            );

            const updated = await collection('test_batch_update').findOne({ index: 0 });
            assert.strictEqual(updated.status, 'processed');
            assert.strictEqual(updated.count, 1);
            assert.deepStrictEqual(updated.tags, ['tag1']);
        });
    });

    describe('参数验证', function () {
        it('应该验证 filter 参数', async function () {
            try {
                await collection('test_batch_update').updateBatch(
                    null,
                    { $set: { status: 'new' } }
                );
                assert.fail('应该抛出错误');
            } catch (error) {
                assert.ok(error.message.includes('filter 必须是对象类型'));
            }
        });

        it('应该验证 update 参数', async function () {
            try {
                await collection('test_batch_update').updateBatch(
                    { status: 'old' },
                    null
                );
                assert.fail('应该抛出错误');
            } catch (error) {
                assert.ok(error.message.includes('update 必须是对象类型'));
            }
        });

        it('应该验证 update 必须包含更新操作符', async function () {
            try {
                await collection('test_batch_update').updateBatch(
                    { status: 'old' },
                    { status: 'new' }
                );
                assert.fail('应该抛出错误');
            } catch (error) {
                assert.ok(error.message.includes('update 必须使用更新操作符'));
            }
        });
    });

    describe('进度监控', function () {
        it('应该能够监控更新进度', async function () {
            const docs = Array.from({ length: 3000 }, (_, i) => ({
                index: i,
                status: 'pending'
            }));
            await collection('test_batch_update').insertMany(docs);

            const progressUpdates = [];

            await collection('test_batch_update').updateBatch(
                { status: 'pending' },
                { $set: { status: 'done' } },
                {
                    batchSize: 1000,
                    estimateProgress: true,
                    onProgress: (p) => {
                        progressUpdates.push({
                            modified: p.modified,
                            percentage: p.percentage
                        });
                    }
                }
            );

            assert.strictEqual(progressUpdates.length, 3);
            assert.strictEqual(progressUpdates[0].modified, 1000);
            assert.strictEqual(progressUpdates[1].modified, 2000);
            assert.strictEqual(progressUpdates[2].modified, 3000);
        });
    });

    describe('错误处理', function () {
        it('应该能够使用 stop 策略', async function () {
            const docs = Array.from({ length: 1000 }, (_, i) => ({
                index: i,
                status: 'test'
            }));
            await collection('test_batch_update').insertMany(docs);

            const result = await collection('test_batch_update').updateBatch(
                { status: 'test' },
                { $set: { status: 'updated' } },
                {
                    batchSize: 500,
                    onError: 'stop'
                }
            );

            assert.strictEqual(result.modifiedCount, 1000);
            assert.ok(Array.isArray(result.errors));
            assert.strictEqual(result.errors.length, 0);
        });

        it('应该能够使用 skip 策略', async function () {
            const docs = Array.from({ length: 1000 }, (_, i) => ({
                index: i,
                status: 'test'
            }));
            await collection('test_batch_update').insertMany(docs);

            const result = await collection('test_batch_update').updateBatch(
                { status: 'test' },
                { $set: { status: 'updated' } },
                {
                    batchSize: 500,
                    onError: 'skip'
                }
            );

            assert.strictEqual(result.modifiedCount, 1000);
        });
    });

    describe('缓存失效', function () {
        it('应该在更新后自动失效缓存', async function () {
            const docs = Array.from({ length: 100 }, (_, i) => ({
                index: i,
                status: 'old'
            }));
            await collection('test_batch_update').insertMany(docs);

            // 查询并缓存
            await collection('test_batch_update').find(
                { status: 'old' },
                { cache: 60000 }
            );

            // 批量更新
            await collection('test_batch_update').updateBatch(
                { status: 'old' },
                { $set: { status: 'new' } },
                { batchSize: 50 }
            );

            // 验证缓存已失效
            const afterUpdate = await collection('test_batch_update').find({ status: 'old' }, { limit: 0 });
            assert.ok(Array.isArray(afterUpdate));
            assert.strictEqual(afterUpdate.length, 0);

            const newDocs = await collection('test_batch_update').find({ status: 'new' }, { limit: 0 });
            assert.strictEqual(newDocs.length, 100);
        });
    });

    describe('性能测试', function () {
        it('应该能够高效处理大数据量', async function () {
            this.timeout(60000);

            const docs = Array.from({ length: 10000 }, (_, i) => ({
                index: i,
                status: 'pending',
                value: 0
            }));
            await collection('test_batch_update').insertMany(docs);

            const startTime = Date.now();

            const result = await collection('test_batch_update').updateBatch(
                { status: 'pending' },
                { $set: { status: 'done' }, $inc: { value: 1 } },
                { batchSize: 1000 }
            );

            const duration = Date.now() - startTime;

            assert.strictEqual(result.modifiedCount, 10000);
            assert.strictEqual(result.batchCount, 10);

            console.log(`      更新 10000 条耗时: ${duration}ms`);
            assert.ok(duration < 30000, `耗时 ${duration}ms 应该少于 30000ms`);
        });
    });

    describe('边界情况', function () {
        it('应该能够处理恰好等于 batchSize 的数据量', async function () {
            const docs = Array.from({ length: 1000 }, (_, i) => ({
                index: i,
                status: 'old'
            }));
            await collection('test_batch_update').insertMany(docs);

            const result = await collection('test_batch_update').updateBatch(
                { status: 'old' },
                { $set: { status: 'new' } },
                { batchSize: 1000 }
            );

            assert.strictEqual(result.modifiedCount, 1000);
            assert.strictEqual(result.batchCount, 1);
        });

        it('应该能够处理 batchSize 为 1 的情况', async function () {
            const docs = Array.from({ length: 5 }, (_, i) => ({
                index: i,
                status: 'old'
            }));
            await collection('test_batch_update').insertMany(docs);

            const result = await collection('test_batch_update').updateBatch(
                { status: 'old' },
                { $set: { status: 'new' } },
                { batchSize: 1 }
            );

            assert.strictEqual(result.modifiedCount, 5);
            assert.strictEqual(result.batchCount, 5);
        });
    });
});

