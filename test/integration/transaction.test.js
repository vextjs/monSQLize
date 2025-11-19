/**
 * 事务集成测试 - 使用真实 MongoDB 连接
 * 需要本地 MongoDB 副本集运行
 */

const MonSQLize = require('../../lib/index');
const assert = require('assert');

describe('MongoDB 事务 - 集成测试', () => {
    let msq;

    before(async function () {
        this.timeout(60000);

        // 连接到本地 MongoDB（需要副本集）
        msq = new MonSQLize({
            type: 'mongodb',
            databaseName: 'test_transaction_integration',
            config: {
                uri: process.env.MONGODB_URI || 'mongodb://localhost:27017/?replicaSet=rs0'
            },
            cache: {
                maxSize: 1000,
                ttl: 60000
            }
        });

        try {
            await msq.connect();
            console.log('✅ 已连接到 MongoDB');
        } catch (error) {
            console.log('⚠️  无法连接到 MongoDB，跳过集成测试');
            console.log('   错误:', error.message);
            this.skip();
        }
    });

    after(async () => {
        if (msq) {
            await msq.close();
        }
    });

    beforeEach(async function () {
        if (!msq) {
            this.skip();
            return;
        }

        // 清空测试数据（所有测试用到的集合）
        const { collection } = await msq.connect();
        await collection('accounts').deleteMany({});
        await collection('users').deleteMany({});
        await collection('inventory').deleteMany({});
        await collection('orders').deleteMany({});
        await collection('logs').deleteMany({});
    });

    describe('基础事务功能', () => {
        it('应该成功执行转账事务', async function () {
            if (!msq) {
                this.skip();
                return;
            }

            const { collection } = await msq.connect();

            // 创建初始账户
            await collection('accounts').insertMany([
                { _id: 'A', balance: 1000 },
                { _id: 'B', balance: 500 }
            ]);

            // 执行转账事务
            const result = await msq.withTransaction(async (tx) => {
                await collection('accounts').updateOne(
                    { _id: 'A' },
                    { $inc: { balance: -100 } },
                    { session: tx.session }
                );

                await collection('accounts').updateOne(
                    { _id: 'B' },
                    { $inc: { balance: 100 } },
                    { session: tx.session }
                );

                return { success: true };
            });

            assert.strictEqual(result.success, true);

            // 验证余额
            const accountA = await collection('accounts').findOne({ _id: 'A' });
            const accountB = await collection('accounts').findOne({ _id: 'B' });

            assert.strictEqual(accountA.balance, 900);
            assert.strictEqual(accountB.balance, 600);
        });

        it('应该在事务失败时回滚', async function () {
            if (!msq) {
                this.skip();
                return;
            }

            const { collection } = await msq.connect();

            await collection('accounts').insertMany([
                { _id: 'A', balance: 1000 },
                { _id: 'B', balance: 500 }
            ]);

            try {
                await msq.withTransaction(async (tx) => {
                    await collection('accounts').updateOne(
                        { _id: 'A' },
                        { $inc: { balance: -100 } },
                        { session: tx.session }
                    );

                    // 故意抛出错误
                    throw new Error('模拟错误');
                });

                assert.fail('应该抛出错误');
            } catch (error) {
                assert.strictEqual(error.message, '模拟错误');
            }

            // 验证余额未改变（已回滚）
            const accountA = await collection('accounts').findOne({ _id: 'A' });
            assert.strictEqual(accountA.balance, 1000);
        });
    });

    describe('缓存失效机制', () => {
        it('应该在事务中立即失效缓存', async function () {
            if (!msq) {
                this.skip();
                return;
            }

            const { collection } = await msq.connect();

            await collection('accounts').insertOne({ _id: 'C', balance: 1000 });

            // 查询并缓存
            const cached = await collection('accounts').findOne({ _id: 'C' }, { cache: 60000 });
            assert.strictEqual(cached.balance, 1000);

            // 在事务中更新
            await msq.withTransaction(async (tx) => {
                await collection('accounts').updateOne(
                    { _id: 'C' },
                    { $set: { balance: 2000 } },
                    { session: tx.session }
                );
            });

            // 再次查询（应该从数据库读取，因为缓存已失效）
            const afterTx = await collection('accounts').findOne({ _id: 'C' }, { cache: 60000 });
            assert.strictEqual(afterTx.balance, 2000);
        });

        it('应该在事务回滚后正确处理缓存', async function () {
            if (!msq) {
                this.skip();
                return;
            }

            const { collection } = await msq.connect();

            await collection('accounts').insertOne({ _id: 'D', balance: 1000 });

            // 查询并缓存
            const cached = await collection('accounts').findOne({ _id: 'D' }, { cache: 60000 });
            assert.strictEqual(cached.balance, 1000);

            // 在事务中更新但回滚
            try {
                await msq.withTransaction(async (tx) => {
                    await collection('accounts').updateOne(
                        { _id: 'D' },
                        { $set: { balance: 2000 } },
                        { session: tx.session }
                    );

                    throw new Error('模拟错误');
                });
            } catch (error) {
                // 预期错误
            }

            // 验证数据未改变（已回滚）
            const afterRollback = await collection('accounts').findOne({ _id: 'D' });
            assert.strictEqual(afterRollback.balance, 1000);
        });
    });

    describe('多操作事务', () => {
        it('应该支持多集合操作', async function () {
            if (!msq) {
                this.skip();
                return;
            }

            const { collection } = await msq.connect();

            // 准备数据
            await collection('accounts').insertOne({ _id: 'A', balance: 1000 });
            await collection('logs').deleteMany({});

            // 执行跨集合事务
            await msq.withTransaction(async (tx) => {
                // 更新账户
                await collection('accounts').updateOne(
                    { _id: 'A' },
                    { $inc: { balance: -100 } },
                    { session: tx.session }
                );

                // 插入日志
                await collection('logs').insertOne(
                    { account: 'A', amount: -100, timestamp: new Date() },
                    { session: tx.session }
                );
            });

            // 验证
            const account = await collection('accounts').findOne({ _id: 'A' });
            const logs = await collection('logs').find({ account: 'A' });

            assert.strictEqual(account.balance, 900);
            assert.strictEqual(logs.length, 1);
        });

        it('应该支持批量操作', async function () {
            if (!msq) {
                this.skip();
                return;
            }

            const { collection } = await msq.connect();

            // 准备数据
            await collection('accounts').insertMany([
                { _id: 'A', balance: 1000 },
                { _id: 'B', balance: 500 },
                { _id: 'C', balance: 300 }
            ]);

            // 批量更新
            await msq.withTransaction(async (tx) => {
                await collection('accounts').updateMany(
                    { balance: { $gte: 500 } },
                    { $inc: { balance: 100 } },
                    { session: tx.session }
                );
            });

            // 验证
            const accounts = await collection('accounts').find({}).sort({ _id: 1 });
            assert.strictEqual(accounts[0].balance, 1100); // A
            assert.strictEqual(accounts[1].balance, 600);  // B
            assert.strictEqual(accounts[2].balance, 300);  // C 未改变
        });
    });

    describe('手动事务管理', () => {
        it('应该支持手动提交事务', async function () {
            if (!msq) {
                this.skip();
                return;
            }

            const { collection } = await msq.connect();

            await collection('accounts').insertOne({ _id: 'A', balance: 1000 });

            const tx = await msq.startSession();
            try {
                await tx.start();

                await collection('accounts').updateOne(
                    { _id: 'A' },
                    { $inc: { balance: -100 } },
                    { session: tx.session }
                );

                await tx.commit();

                // 验证
                const account = await collection('accounts').findOne({ _id: 'A' });
                assert.strictEqual(account.balance, 900);
            } finally {
                await tx.end();
            }
        });

        it('应该支持手动回滚事务', async function () {
            if (!msq) {
                this.skip();
                return;
            }

            const { collection } = await msq.connect();

            await collection('accounts').insertOne({ _id: 'A', balance: 1000 });

            const tx = await msq.startSession();
            try {
                await tx.start();

                await collection('accounts').updateOne(
                    { _id: 'A' },
                    { $inc: { balance: -100 } },
                    { session: tx.session }
                );

                await tx.abort();

                // 验证余额未改变
                const account = await collection('accounts').findOne({ _id: 'A' });
                assert.strictEqual(account.balance, 1000);
            } finally {
                await tx.end();
            }
        });
    });

    describe('并发事务隔离', () => {
        it('应该支持并发事务操作不同数据', async function () {
            if (!msq) {
                this.skip();
                return;
            }

            this.timeout(10000);

            const { collection } = await msq.connect();

            // 准备数据
            await collection('accounts').insertMany([
                { _id: 'A', balance: 1000 },
                { _id: 'B', balance: 500 }
            ]);

            // 并发执行两个事务
            const [result1, result2] = await Promise.all([
                // 事务1：修改账户A
                msq.withTransaction(async (tx) => {
                    await collection('accounts').updateOne(
                        { _id: 'A' },
                        { $inc: { balance: 100 } },
                        { session: tx.session }
                    );
                    return 'tx1';
                }),
                // 事务2：修改账户B
                msq.withTransaction(async (tx) => {
                    await collection('accounts').updateOne(
                        { _id: 'B' },
                        { $inc: { balance: 200 } },
                        { session: tx.session }
                    );
                    return 'tx2';
                })
            ]);

            // 验证
            assert.strictEqual(result1, 'tx1');
            assert.strictEqual(result2, 'tx2');

            const accountA = await collection('accounts').findOne({ _id: 'A' });
            const accountB = await collection('accounts').findOne({ _id: 'B' });

            assert.strictEqual(accountA.balance, 1100);
            assert.strictEqual(accountB.balance, 700);
        });

        it('应该正确处理并发事务的缓存锁', async function () {
            if (!msq) {
                this.skip();
                return;
            }

            this.timeout(10000);

            const { collection } = await msq.connect();

            await collection('accounts').insertOne({ _id: 'C', balance: 1000 });

            // 查询并缓存
            await collection('accounts').findOne({ _id: 'C' }, { cache: 60000 });

            // 事务中更新
            await msq.withTransaction(async (tx) => {
                await collection('accounts').updateOne(
                    { _id: 'C' },
                    { $set: { balance: 2000 } },
                    { session: tx.session }
                );
            });

            // 验证缓存已失效，获取到新值
            const account = await collection('accounts').findOne({ _id: 'C' }, { cache: 60000 });
            assert.strictEqual(account.balance, 2000);
        });
    });

    describe('错误处理与边界情况', () => {
        it('应该在更新不存在的文档时正常提交', async function () {
            if (!msq) {
                this.skip();
                return;
            }

            const { collection } = await msq.connect();

            let result;
            await msq.withTransaction(async (tx) => {
                result = await collection('accounts').updateOne(
                    { _id: 'NONEXISTENT' },
                    { $set: { balance: 100 } },
                    { session: tx.session }
                );
            });

            // 验证：没有匹配到文档，但事务正常提交
            assert.strictEqual(result.matchedCount, 0);
            assert.strictEqual(result.modifiedCount, 0);
        });

        it('应该在删除不存在的文档时正常提交', async function () {
            if (!msq) {
                this.skip();
                return;
            }

            const { collection } = await msq.connect();

            let result;
            await msq.withTransaction(async (tx) => {
                result = await collection('accounts').deleteOne(
                    { _id: 'NONEXISTENT' },
                    { session: tx.session }
                );
            });

            // 验证
            assert.strictEqual(result.deletedCount, 0);
        });

        it('应该正确处理事务中的异常', async function () {
            if (!msq) {
                this.skip();
                return;
            }

            const { collection } = await msq.connect();

            await collection('accounts').insertOne({ _id: 'A', balance: 1000 });

            const customError = new Error('自定义业务错误');
            try {
                await msq.withTransaction(async (tx) => {
                    await collection('accounts').updateOne(
                        { _id: 'A' },
                        { $inc: { balance: -100 } },
                        { session: tx.session }
                    );

                    throw customError;
                });

                assert.fail('应该抛出错误');
            } catch (error) {
                assert.strictEqual(error, customError);
            }

            // 验证已回滚
            const account = await collection('accounts').findOne({ _id: 'A' });
            assert.strictEqual(account.balance, 1000);
        });
    });

    describe('缓存一致性', () => {
        it('应该在事务提交后正确失效缓存', async function () {
            if (!msq) {
                this.skip();
                return;
            }

            const { collection } = await msq.connect();

            await collection('accounts').insertOne({ _id: 'D', balance: 1000 });

            // 第一次查询并缓存
            const cached1 = await collection('accounts').findOne({ _id: 'D' }, { cache: 60000 });
            assert.strictEqual(cached1.balance, 1000);

            // 在事务中更新
            await msq.withTransaction(async (tx) => {
                await collection('accounts').updateOne(
                    { _id: 'D' },
                    { $set: { balance: 3000 } },
                    { session: tx.session }
                );
            });

            // 第二次查询应该从数据库读取（缓存已失效）
            const cached2 = await collection('accounts').findOne({ _id: 'D' }, { cache: 60000 });
            assert.strictEqual(cached2.balance, 3000);
        });

        it('应该支持通配符缓存失效', async function () {
            if (!msq) {
                this.skip();
                return;
            }

            const { collection } = await msq.connect();

            // 插入多条数据
            await collection('users').insertMany([
                { _id: 'user1', name: 'Alice', age: 25 },
                { _id: 'user2', name: 'Bob', age: 30 }
            ]);

            // 查询并缓存
            await collection('users').findOne({ _id: 'user1' }, { cache: 60000 });
            await collection('users').findOne({ _id: 'user2' }, { cache: 60000 });

            // 在事务中更新（会失效 users 集合的所有缓存）
            await msq.withTransaction(async (tx) => {
                await collection('users').updateOne(
                    { _id: 'user1' },
                    { $set: { age: 26 } },
                    { session: tx.session }
                );
            });

            // 再次查询，应该从数据库读取
            const user1 = await collection('users').findOne({ _id: 'user1' }, { cache: 60000 });
            assert.strictEqual(user1.age, 26);
        });
    });

    describe('复杂业务场景', () => {
        it('应该支持库存扣减场景', async function () {
            if (!msq) {
                this.skip();
                return;
            }

            const { collection } = await msq.connect();

            // 准备库存数据
            await collection('inventory').insertOne({
                _id: 'product_123',
                stock: 100
            });

            // 扣减库存并创建订单
            const orderId = await msq.withTransaction(async (tx) => {
                // 检查库存
                const product = await collection('inventory').findOne(
                    { _id: 'product_123' },
                    { session: tx.session }
                );

                if (product.stock < 10) {
                    throw new Error('库存不足');
                }

                // 扣减库存
                await collection('inventory').updateOne(
                    { _id: 'product_123' },
                    { $inc: { stock: -10 } },
                    { session: tx.session }
                );

                // 创建订单
                const order = {
                    orderId: 'order_001',
                    productId: 'product_123',
                    quantity: 10,
                    timestamp: new Date()
                };
                await collection('orders').insertOne(order, { session: tx.session });

                return order.orderId;
            });

            // 验证
            assert.strictEqual(orderId, 'order_001');

            const product = await collection('inventory').findOne({ _id: 'product_123' });
            assert.strictEqual(product.stock, 90);

            const order = await collection('orders').findOne({ orderId: 'order_001' });
            assert.ok(order);
            assert.strictEqual(order.quantity, 10);
        });

        it('应该在库存不足时回滚整个事务', async function () {
            if (!msq) {
                this.skip();
                return;
            }

            const { collection } = await msq.connect();

            // 准备库存数据（库存不足）
            await collection('inventory').insertOne({
                _id: 'product_456',
                stock: 5
            });

            try {
                await msq.withTransaction(async (tx) => {
                    // 检查库存
                    const product = await collection('inventory').findOne(
                        { _id: 'product_456' },
                        { session: tx.session }
                    );

                    if (product.stock < 10) {
                        throw new Error('库存不足');
                    }

                    // 以下代码不会执行
                    await collection('inventory').updateOne(
                        { _id: 'product_456' },
                        { $inc: { stock: -10 } },
                        { session: tx.session }
                    );
                });

                assert.fail('应该抛出库存不足错误');
            } catch (error) {
                assert.strictEqual(error.message, '库存不足');
            }

            // 验证库存未改变
            const product = await collection('inventory').findOne({ _id: 'product_456' });
            assert.strictEqual(product.stock, 5);
        });

        it('应该支持余额不足时回滚转账', async function () {
            if (!msq) {
                this.skip();
                return;
            }

            const { collection } = await msq.connect();

            // 准备账户（A余额不足）
            await collection('accounts').insertMany([
                { _id: 'A', balance: 50 },
                { _id: 'B', balance: 500 }
            ]);

            try {
                await msq.withTransaction(async (tx) => {
                    // 检查余额
                    const accountA = await collection('accounts').findOne(
                        { _id: 'A' },
                        { session: tx.session }
                    );

                    if (accountA.balance < 100) {
                        throw new Error('余额不足');
                    }

                    // 以下代码不会执行
                    await collection('accounts').updateOne(
                        { _id: 'A' },
                        { $inc: { balance: -100 } },
                        { session: tx.session }
                    );

                    await collection('accounts').updateOne(
                        { _id: 'B' },
                        { $inc: { balance: 100 } },
                        { session: tx.session }
                    );
                });

                assert.fail('应该抛出余额不足错误');
            } catch (error) {
                assert.strictEqual(error.message, '余额不足');
            }

            // 验证余额未改变
            const accountA = await collection('accounts').findOne({ _id: 'A' });
            const accountB = await collection('accounts').findOne({ _id: 'B' });
            assert.strictEqual(accountA.balance, 50);
            assert.strictEqual(accountB.balance, 500);
        });
    });
});

