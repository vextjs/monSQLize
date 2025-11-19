/**
 * 事务优化测试 - 只读优化和文档级别锁
 */

const { expect } = require('chai');
const MonSQLize = require('../../..');

describe('事务优化功能', function () {
    this.timeout(60000);

    let msq;
    let collection;

    before(async function () {
        // 连接本地 MongoDB（需要副本集）
        const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017?replicaSet=rs0';
        
        try {
            msq = new MonSQLize({
                type: 'mongodb',
                databaseName: 'test_transaction_optimizations',
                config: {
                    uri,
                    serverSelectionTimeoutMS: 5000
                },
                cache: {
                    maxSize: 1000,
                    defaultTTL: 60000
                }
            });

            const conn = await msq.connect();
            collection = conn.collection;
        } catch (error) {
            if (error.message.includes('not connected to a replica set')) {
                this.skip();
            }
            throw error;
        }
    });

    after(async function () {
        if (msq) {
            await msq.close();
        }
    });

    beforeEach(async function () {
        if (!msq) {
            this.skip();
            return;
        }

        // 清空测试数据
        await collection('users').deleteMany({});
        await collection('products').deleteMany({});
    });

    describe('只读优化', () => {
        it('应该正确识别只读事务', async function () {
            // 插入测试数据
            await collection('users').insertMany([
                { _id: 1, name: 'Alice', balance: 1000 },
                { _id: 2, name: 'Bob', balance: 2000 }
            ]);

            // 执行只读事务
            await msq.withTransaction(async (tx) => {
                const user1 = await collection('users').findOne(
                    { _id: 1 },
                    { session: tx.session }
                );
                
                const user2 = await collection('users').findOne(
                    { _id: 2 },
                    { session: tx.session }
                );

                expect(user1.name).to.equal('Alice');
                expect(user2.name).to.equal('Bob');
            });

            // 检查事务统计
            const stats = msq._transactionManager.getStats();
            expect(stats.readOnlyTransactions).to.be.greaterThan(0);
        });

        it('应该正确识别写入事务', async function () {
            // 插入测试数据
            await collection('users').insertOne({ _id: 1, name: 'Alice', balance: 1000 });

            // 执行写入事务
            await msq.withTransaction(async (tx) => {
                await collection('users').updateOne(
                    { _id: 1 },
                    { $set: { balance: 900 } },
                    { session: tx.session }
                );
            });

            // 检查事务统计
            const stats = msq._transactionManager.getStats();
            expect(stats.writeTransactions).to.be.greaterThan(0);
        });

        it('只读事务应该不失效缓存', async function () {
            // 插入并缓存数据
            await collection('users').insertOne({ _id: 1, name: 'Alice' });
            const cachedUser = await collection('users').findOne(
                { _id: 1 },
                { cache: 60000 }
            );
            expect(cachedUser.name).to.equal('Alice');

            // 执行只读事务
            await msq.withTransaction(async (tx) => {
                const user = await collection('users').findOne(
                    { _id: 1 },
                    { session: tx.session }
                );
                expect(user.name).to.equal('Alice');
            });

            // 缓存应该仍然有效
            const cacheHit = await collection('users').findOne(
                { _id: 1 },
                { cache: 60000 }
            );
            expect(cacheHit.name).to.equal('Alice');
        });
    });

    describe('文档级别锁', () => {
        it('应该支持并发更新不同文档', async function () {
            // 插入测试数据
            await collection('users').insertMany([
                { _id: 1, name: 'Alice', balance: 1000 },
                { _id: 2, name: 'Bob', balance: 2000 }
            ]);

            // 并发更新不同用户
            const results = await Promise.all([
                msq.withTransaction(async (tx) => {
                    await collection('users').updateOne(
                        { _id: 1 },
                        { $inc: { balance: 100 } },
                        { session: tx.session }
                    );
                    return 'tx1-done';
                }),
                msq.withTransaction(async (tx) => {
                    await collection('users').updateOne(
                        { _id: 2 },
                        { $inc: { balance: 200 } },
                        { session: tx.session }
                    );
                    return 'tx2-done';
                })
            ]);

            expect(results).to.deep.equal(['tx1-done', 'tx2-done']);

            // 验证结果
            const user1 = await collection('users').findOne({ _id: 1 });
            const user2 = await collection('users').findOne({ _id: 2 });
            expect(user1.balance).to.equal(1100);
            expect(user2.balance).to.equal(2200);
        });

        it('应该支持 $in 查询的文档级别锁', async function () {
            // 插入测试数据
            await collection('users').insertMany([
                { _id: 1, name: 'Alice', balance: 1000 },
                { _id: 2, name: 'Bob', balance: 2000 },
                { _id: 3, name: 'Charlie', balance: 3000 }
            ]);

            // 更新多个文档
            await msq.withTransaction(async (tx) => {
                await collection('users').updateMany(
                    { _id: { $in: [1, 2] } },
                    { $inc: { balance: 100 } },
                    { session: tx.session }
                );
            });

            // 验证结果
            const users = await collection('users').find({}).toArray();
            expect(users.find(u => u._id === 1).balance).to.equal(1100);
            expect(users.find(u => u._id === 2).balance).to.equal(2100);
            expect(users.find(u => u._id === 3).balance).to.equal(3000);
        });

        it('应该在无法提取文档键时回退到集合级别锁', async function () {
            // 插入测试数据
            await collection('users').insertMany([
                { _id: 1, name: 'Alice', status: 'active' },
                { _id: 2, name: 'Bob', status: 'active' }
            ]);

            // 使用非 _id 查询（无法提取文档键）
            await msq.withTransaction(async (tx) => {
                await collection('users').updateMany(
                    { status: 'active' },
                    { $set: { lastActive: new Date() } },
                    { session: tx.session }
                );
            });

            // 验证结果
            const users = await collection('users').find({}).toArray();
            expect(users.every(u => u.lastActive)).to.be.true;
        });
    });

    describe('统计功能', () => {
        it('应该正确统计事务类型', async function () {
            // 清空统计
            msq._transactionManager.stats = {
                totalTransactions: 0,
                successfulTransactions: 0,
                failedTransactions: 0,
                readOnlyTransactions: 0,
                writeTransactions: 0,
                durations: []
            };

            // 执行1个只读事务
            await msq.withTransaction(async (tx) => {
                await collection('users').findOne(
                    { _id: 999 },
                    { session: tx.session }
                );
            });

            // 执行2个写入事务
            await msq.withTransaction(async (tx) => {
                await collection('users').insertOne(
                    { _id: 1, name: 'Alice' },
                    { session: tx.session }
                );
            });

            await msq.withTransaction(async (tx) => {
                await collection('users').updateOne(
                    { _id: 1 },
                    { $set: { name: 'Alice Updated' } },
                    { session: tx.session }
                );
            });

            // 检查统计
            const stats = msq._transactionManager.getStats();
            expect(stats.totalTransactions).to.equal(3);
            expect(stats.readOnlyTransactions).to.equal(1);
            expect(stats.writeTransactions).to.equal(2);
            expect(stats.successfulTransactions).to.equal(3);
            expect(stats.successRate).to.equal('100.00%');
            expect(stats.readOnlyRatio).to.equal('33.33%');
        });

        it('应该正确计算持续时间统计', async function () {
            // 执行几个事务
            for (let i = 0; i < 5; i++) {
                await msq.withTransaction(async (tx) => {
                    await collection('users').findOne(
                        { _id: i },
                        { session: tx.session }
                    );
                });
            }

            // 检查统计
            const stats = msq._transactionManager.getStats();
            expect(stats.averageDuration).to.be.a('number');
            expect(stats.averageDuration).to.be.greaterThan(0);
            expect(stats.p95Duration).to.be.a('number');
            expect(stats.p99Duration).to.be.a('number');
        });
    });

    describe('混合场景', () => {
        it('应该同时支持只读优化和文档级别锁', async function () {
            // 插入测试数据
            await collection('products').insertMany([
                { _id: 'SKU001', name: 'Product A', stock: 100 },
                { _id: 'SKU002', name: 'Product B', stock: 200 }
            ]);

            // 并发：1个只读事务 + 2个写入事务
            const results = await Promise.all([
                // 只读事务：查询产品信息
                msq.withTransaction(async (tx) => {
                    const product = await collection('products').findOne(
                        { _id: 'SKU001' },
                        { session: tx.session }
                    );
                    return product.stock;
                }),
                // 写入事务1：扣减库存
                msq.withTransaction(async (tx) => {
                    await collection('products').updateOne(
                        { _id: 'SKU001' },
                        { $inc: { stock: -10 } },
                        { session: tx.session }
                    );
                    return 'deducted';
                }),
                // 写入事务2：扣减另一个产品库存
                msq.withTransaction(async (tx) => {
                    await collection('products').updateOne(
                        { _id: 'SKU002' },
                        { $inc: { stock: -20 } },
                        { session: tx.session }
                    );
                    return 'deducted';
                })
            ]);

            expect(results[0]).to.equal(100);
            expect(results[1]).to.equal('deducted');
            expect(results[2]).to.equal('deducted');

            // 验证最终结果
            const product1 = await collection('products').findOne({ _id: 'SKU001' });
            const product2 = await collection('products').findOne({ _id: 'SKU002' });
            expect(product1.stock).to.equal(90);
            expect(product2.stock).to.equal(180);

            // 检查统计
            const stats = msq._transactionManager.getStats();
            expect(stats.readOnlyTransactions).to.be.greaterThan(0);
            expect(stats.writeTransactions).to.be.greaterThan(0);
        });
    });

    describe('其他写操作的事务支持', () => {
        it('insertOne 应该支持事务缓存锁', async function () {
            await msq.withTransaction(async (tx) => {
                const result = await collection('users').insertOne(
                    { _id: 100, name: 'Test User', email: 'test@example.com' },
                    { session: tx.session }
                );
                expect(result.insertedId).to.equal(100);
            });

            // 验证事务统计
            const stats = msq._transactionManager.getStats();
            expect(stats.writeTransactions).to.be.greaterThan(0);
        });

        it('insertMany 应该支持事务缓存锁', async function () {
            await msq.withTransaction(async (tx) => {
                const result = await collection('users').insertMany(
                    [
                        { _id: 101, name: 'User 101' },
                        { _id: 102, name: 'User 102' },
                        { _id: 103, name: 'User 103' }
                    ],
                    { session: tx.session }
                );
                expect(result.insertedCount).to.equal(3);
            });

            // 验证数据已提交
            const users = await collection('users').find(
                { _id: { $in: [101, 102, 103] } }
            ).toArray();
            expect(users).to.have.lengthOf(3);
        });

        it('findOneAndUpdate 应该支持文档级别锁', async function () {
            await collection('users').insertOne({ _id: 200, value: 0, status: 'active' });

            await msq.withTransaction(async (tx) => {
                const result = await collection('users').findOneAndUpdate(
                    { _id: 200 },
                    { $inc: { value: 1 }, $set: { status: 'updated' } },
                    { session: tx.session, returnDocument: 'after' }
                );
                expect(result.value).to.equal(1);
                expect(result.status).to.equal('updated');
            });

            // 验证更新生效
            const user = await collection('users').findOne({ _id: 200 });
            expect(user.value).to.equal(1);
            expect(user.status).to.equal('updated');
        });

        it('findOneAndReplace 应该支持事务', async function () {
            await collection('users').insertOne({ _id: 201, name: 'Old Name', version: 1 });

            await msq.withTransaction(async (tx) => {
                const result = await collection('users').findOneAndReplace(
                    { _id: 201 },
                    { _id: 201, name: 'New Name', version: 2, replaced: true },
                    { session: tx.session, returnDocument: 'after' }
                );
                expect(result.name).to.equal('New Name');
                expect(result.version).to.equal(2);
                expect(result.replaced).to.be.true;
            });

            // 验证替换生效
            const user = await collection('users').findOne({ _id: 201 });
            expect(user.name).to.equal('New Name');
            expect(user.replaced).to.be.true;
        });

        it('findOneAndDelete 应该支持事务', async function () {
            await collection('users').insertOne({ _id: 202, name: 'To Delete' });

            let deletedUser;
            await msq.withTransaction(async (tx) => {
                deletedUser = await collection('users').findOneAndDelete(
                    { _id: 202 },
                    { session: tx.session }
                );
                expect(deletedUser).to.not.be.null;
                expect(deletedUser.name).to.equal('To Delete');
            });

            // 验证删除生效
            const user = await collection('users').findOne({ _id: 202 });
            expect(user).to.be.null;
        });

        it('incrementOne 应该支持事务', async function () {
            await collection('counters').insertOne({ _id: 'counter1', value: 0 });

            await msq.withTransaction(async (tx) => {
                const result = await collection('counters').incrementOne(
                    { _id: 'counter1' },
                    'value',
                    5,
                    { session: tx.session }
                );
                expect(result.value).to.exist;
            });

            // 验证递增生效
            const counter = await collection('counters').findOne({ _id: 'counter1' });
            expect(counter.value).to.equal(5);
        });

        it('upsertOne 应该支持事务（插入场景）', async function () {
            await msq.withTransaction(async (tx) => {
                const result = await collection('settings').upsertOne(
                    { _id: 'setting1' },
                    { $set: { value: 'test', version: 1 } },
                    { session: tx.session }
                );
                expect(result.upsertedCount).to.equal(1);
            });

            // 验证插入生效
            const setting = await collection('settings').findOne({ _id: 'setting1' });
            expect(setting.value).to.equal('test');
            expect(setting.version).to.equal(1);
        });

        it('upsertOne 应该支持事务（更新场景）', async function () {
            await collection('settings').insertOne({ _id: 'setting2', value: 'old', version: 1 });

            await msq.withTransaction(async (tx) => {
                const result = await collection('settings').upsertOne(
                    { _id: 'setting2' },
                    { $set: { value: 'new', version: 2 } },
                    { session: tx.session }
                );
                expect(result.modifiedCount).to.equal(1);
            });

            // 验证更新生效
            const setting = await collection('settings').findOne({ _id: 'setting2' });
            expect(setting.value).to.equal('new');
            expect(setting.version).to.equal(2);
        });

        it('事务回滚应该撤销所有操作', async function () {
            await collection('users').insertOne({ _id: 300, balance: 1000 });

            try {
                await msq.withTransaction(async (tx) => {
                    // 操作1: 扣减余额
                    await collection('users').updateOne(
                        { _id: 300 },
                        { $inc: { balance: -500 } },
                        { session: tx.session }
                    );

                    // 操作2: 插入记录
                    await collection('transactions').insertOne(
                        { _id: 'tx1', userId: 300, amount: -500 },
                        { session: tx.session }
                    );

                    // 模拟错误，触发回滚
                    throw new Error('Simulated error');
                });
            } catch (error) {
                expect(error.message).to.include('Simulated error');
            }

            // 验证回滚生效
            const user = await collection('users').findOne({ _id: 300 });
            expect(user.balance).to.equal(1000); // 余额未变

            const transaction = await collection('transactions').findOne({ _id: 'tx1' });
            expect(transaction).to.be.null; // 记录未插入
        });
    });
});

