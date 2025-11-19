/**
 * 事务基础功能测试
 * 测试 Transaction 和 TransactionManager 的核心功能
 */

const assert = require('assert');
const MonSQLize = require('../../../lib/index');

describe('MongoDB 事务 - 基础功能', () => {
    let msq, collection;

    before(async () => {
        // 使用内存数据库（支持副本集）
        msq = new MonSQLize({
            type: 'mongodb',
            databaseName: 'test_transaction',
            config: {
                useMemoryServer: true,
                memoryServerOptions: {
                    instance: {
                        replSet: 'rs0'  // 启用副本集（事务必需）
                    }
                }
            },
            cache: {
                maxSize: 1000,
                ttl: 60000
            }
        });

        const { collection: collectionFn } = await msq.connect();
        collection = collectionFn('test_items');

        // 清空测试数据
        await collection.deleteMany({});
    });

    after(async () => {
        if (msq) {
            await msq.close();
        }
    });

    beforeEach(async () => {
        // 每个测试前清空数据
        await collection.deleteMany({});
    });

    describe('withTransaction（自动管理）', () => {
        it('应该成功创建事务并提交', async () => {
            const result = await msq.withTransaction(async (tx) => {
                // 检查 tx 对象
                assert.ok(tx, 'Transaction 对象应该存在');
                assert.ok(tx.session, 'session 应该存在');
                assert.strictEqual(tx.state, 'active', '状态应该是 active');

                // 在事务中插入数据
                await collection.insertOne(
                    { _id: 1, value: 100 },
                    { session: tx.session }
                );

                return { success: true };
            });

            assert.deepStrictEqual(result, { success: true });

            // 验证数据已提交
            const doc = await collection.findOne({ _id: 1 });
            assert.strictEqual(doc.value, 100);
        });

        it('应该能够中止事务并回滚更改', async () => {
            try {
                await msq.withTransaction(async (tx) => {
                    // 插入数据
                    await collection.insertOne(
                        { _id: 1, value: 100 },
                        { session: tx.session }
                    );

                    // 抛出错误触发回滚
                    throw new Error('故意失败');
                });

                assert.fail('应该抛出错误');
            } catch (error) {
                assert.strictEqual(error.message, '故意失败');
            }

            // 验证数据已回滚（不存在）
            const doc = await collection.findOne({ _id: 1 });
            assert.strictEqual(doc, null, '数据应该已回滚');
        });

        it('应该在事务中正确更新数据', async () => {
            // 先插入初始数据
            await collection.insertOne({ _id: 1, value: 100 });

            await msq.withTransaction(async (tx) => {
                await collection.updateOne(
                    { _id: 1 },
                    { $inc: { value: 50 } },
                    { session: tx.session }
                );
            });

            // 验证更新成功
            const doc = await collection.findOne({ _id: 1 });
            assert.strictEqual(doc.value, 150);
        });
    });

    describe('startSession（手动管理）', () => {
        it('应该能够手动创建和管理事务', async () => {
            const tx = await msq.startSession();

            try {
                await tx.start();
                assert.strictEqual(tx.state, 'active');

                await collection.insertOne(
                    { _id: 1, value: 200 },
                    { session: tx.session }
                );

                await tx.commit();
                assert.strictEqual(tx.state, 'committed');
            } finally {
                await tx.end();
            }

            // 验证数据已提交
            const doc = await collection.findOne({ _id: 1 });
            assert.strictEqual(doc.value, 200);
        });

        it('应该能够手动回滚事务', async () => {
            const tx = await msq.startSession();

            try {
                await tx.start();

                await collection.insertOne(
                    { _id: 1, value: 300 },
                    { session: tx.session }
                );

                await tx.abort();
                assert.strictEqual(tx.state, 'aborted');
            } finally {
                await tx.end();
            }

            // 验证数据已回滚
            const doc = await collection.findOne({ _id: 1 });
            assert.strictEqual(doc, null);
        });
    });

    describe('事务配置', () => {
        it('应该支持自定义 readConcern', async function () {
            await msq.withTransaction(async (tx) => {
                // 验证 transaction options 被设置
                assert.ok(tx.session);
                await collection.insertOne(
                    { _id: 1, value: 400 },
                    { session: tx.session }
                );
            }, {
                readConcern: { level: 'majority' }
            });

            const doc = await collection.findOne({ _id: 1 });
            assert.strictEqual(doc.value, 400);
        });

        it('应该支持自定义超时时间', async function () {
            this.timeout(10000);

            const tx = await msq.startSession({ timeout: 1000 });

            try {
                await tx.start();

                // 等待超时
                await new Promise(resolve => setTimeout(resolve, 1500));

                // 此时事务应该已超时并自动中止
                assert.strictEqual(tx.state, 'aborted');
            } finally {
                await tx.end();
            }
        });
    });

    describe('缓存失效', () => {
        it('事务中的更新应该立即失效缓存', async function () {
            // 插入初始数据
            await collection.insertOne({ _id: 1, value: 100 });

            // 查询并缓存
            const cached = await collection.findOne({ _id: 1 }, { cache: 60000 });
            assert.strictEqual(cached.value, 100);

            // 在事务中更新
            await msq.withTransaction(async (tx) => {
                await collection.updateOne(
                    { _id: 1 },
                    { $set: { value: 200 } },
                    { session: tx.session }
                );
            });

            // 再次查询（应该从数据库读取，因为缓存已失效）
            const afterTx = await collection.findOne({ _id: 1 }, { cache: 60000 });
            assert.strictEqual(afterTx.value, 200);
        });

        it('事务回滚后，缓存锁应该被释放', async function () {
            await collection.insertOne({ _id: 1, value: 100 });

            try {
                await msq.withTransaction(async (tx) => {
                    await collection.updateOne(
                        { _id: 1 },
                        { $set: { value: 200 } },
                        { session: tx.session }
                    );

                    throw new Error('故意失败');
                });
            } catch (error) {
                // 预期错误
            }

            // 验证缓存可以正常写入（锁已释放）
            const doc = await collection.findOne({ _id: 1 }, { cache: 60000 });
            assert.strictEqual(doc.value, 100, '应该读取到原始值');
        });
    });
});

