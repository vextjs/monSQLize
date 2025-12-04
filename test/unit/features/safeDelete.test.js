/**
 * safeDelete 方法完整测试套件
 * 测试安全删除文档的功能（依赖检查、软删除）
 */

const MonSQLize = require('../../../lib');
const { ObjectId } = require('mongodb');
const assert = require('assert');

describe('safeDelete 方法测试套件', function () {
    this.timeout(30000);

    let msq;
    let collection;
    let nativeDb;

    before(async function () {
        console.log('🔧 初始化测试环境...');

        msq = new MonSQLize({
            type: 'mongodb',
            databaseName: 'test_safe_delete',
            config: { useMemoryServer: true },
            slowQueryMs: 1000
        });

        const conn = await msq.connect();
        collection = conn.collection;

        nativeDb = msq._adapter.db;

        console.log('✅ 测试环境准备完成');
    });

    after(async function () {
        console.log('🧹 清理测试环境...');
        if (msq) {
            await msq.close();
        }
        console.log('✅ 测试环境清理完成');
    });

    afterEach(async function () {
    // 清理所有测试集合
        const collections = await nativeDb.listCollections().toArray();
        for (const coll of collections) {
            await nativeDb.collection(coll.name).deleteMany({});
        }
    });

    describe('1. 基础功能测试', function () {
        it('1.1 应该成功删除无依赖的文档', async function () {
            // 插入测试数据
            await nativeDb.collection('users').insertOne({
                _id: new ObjectId(),
                name: 'Alice',
                email: 'alice@example.com'
            });

            const result = await collection('users').safeDelete(
                { email: 'alice@example.com' }
            );

            assert.strictEqual(result.deletedCount, 1, '应该删除 1 个文档');
            assert.strictEqual(result.dependencyChecks.length, 0, '没有依赖检查');

            // 验证已删除
            const count = await nativeDb.collection('users').countDocuments({ email: 'alice@example.com' });
            assert.strictEqual(count, 0, '文档应该已被删除');
        });

        it('1.2 应该删除多个匹配的文档', async function () {
            await nativeDb.collection('users').insertMany([
                { name: 'User1', status: 'inactive' },
                { name: 'User2', status: 'inactive' },
                { name: 'User3', status: 'active' }
            ]);

            const result = await collection('users').safeDelete(
                { status: 'inactive' }
            );

            assert.strictEqual(result.deletedCount, 2, '应该删除 2 个文档');
        });
    });

    describe('2. 依赖检查测试', function () {
        it('2.1 应该阻止删除有依赖的文档', async function () {
            const userId = new ObjectId();

            // 插入用户和订单
            await nativeDb.collection('users').insertOne({
                _id: userId,
                name: 'Bob',
                email: 'bob@example.com'
            });

            await nativeDb.collection('orders').insertMany([
                { userId, status: 'pending', amount: 100 },
                { userId, status: 'paid', amount: 200 }
            ]);

            try {
                await collection('users').safeDelete(
                    { _id: userId },
                    {
                        checkDependencies: [
                            {
                                collection: 'orders',
                                query: { userId, status: { $in: ['pending', 'paid'] } },
                                errorMessage: '用户有未完成的订单'
                            }
                        ]
                    }
                );
                assert.fail('应该抛出错误');
            } catch (error) {
                assert.ok(error.message.includes('用户有未完成的订单'), '错误消息应该包含自定义消息');
                assert.ok(error.message.includes('2 条记录'), '错误消息应该包含记录数');
            }

            // 验证用户未被删除
            const userCount = await nativeDb.collection('users').countDocuments({ _id: userId });
            assert.strictEqual(userCount, 1, '用户不应该被删除');
        });

        it('2.2 应该通过多个依赖检查', async function () {
            const userId = new ObjectId();

            await nativeDb.collection('users').insertOne({
                _id: userId,
                name: 'Charlie',
                email: 'charlie@example.com'
            });

            // 没有订单，也没有文章
            const result = await collection('users').safeDelete(
                { _id: userId },
                {
                    checkDependencies: [
                        {
                            collection: 'orders',
                            query: { userId },
                            errorMessage: '用户有订单'
                        },
                        {
                            collection: 'posts',
                            query: { authorId: userId },
                            errorMessage: '用户有文章'
                        }
                    ]
                }
            );

            assert.strictEqual(result.deletedCount, 1);
            assert.strictEqual(result.dependencyChecks.length, 2);
            assert.strictEqual(result.dependencyChecks[0].passed, true);
            assert.strictEqual(result.dependencyChecks[1].passed, true);
        });

        it('2.3 应该支持 allowCount（允许部分依赖）', async function () {
            const userId = new ObjectId();

            await nativeDb.collection('users').insertOne({
                _id: userId,
                name: 'David',
                email: 'david@example.com'
            });

            // 插入 3 个评论
            await nativeDb.collection('comments').insertMany([
                { userId, content: 'Comment 1' },
                { userId, content: 'Comment 2' },
                { userId, content: 'Comment 3' }
            ]);

            // 允许 <= 5 个评论
            const result = await collection('users').safeDelete(
                { _id: userId },
                {
                    checkDependencies: [
                        {
                            collection: 'comments',
                            query: { userId },
                            allowCount: 5,  // 允许 <= 5 个
                            errorMessage: '用户有过多评论'
                        }
                    ]
                }
            );

            assert.strictEqual(result.deletedCount, 1);
            assert.strictEqual(result.dependencyChecks[0].count, 3);
            assert.strictEqual(result.dependencyChecks[0].passed, true);
        });

        it('2.4 应该拒绝超过 allowCount 的依赖', async function () {
            const userId = new ObjectId();

            await nativeDb.collection('users').insertOne({
                _id: userId,
                name: 'Eve',
                email: 'eve@example.com'
            });

            // 插入 6 个评论
            await nativeDb.collection('comments').insertMany([
                { userId, content: 'Comment 1' },
                { userId, content: 'Comment 2' },
                { userId, content: 'Comment 3' },
                { userId, content: 'Comment 4' },
                { userId, content: 'Comment 5' },
                { userId, content: 'Comment 6' }
            ]);

            try {
                await collection('users').safeDelete(
                    { _id: userId },
                    {
                        checkDependencies: [
                            {
                                collection: 'comments',
                                query: { userId },
                                allowCount: 5,  // 只允许 <= 5 个
                                errorMessage: '用户有过多评论'
                            }
                        ]
                    }
                );
                assert.fail('应该抛出错误');
            } catch (error) {
                assert.ok(error.message.includes('用户有过多评论'));
                assert.ok(error.message.includes('6 条记录'));
            }
        });
    });

    describe('3. 软删除测试', function () {
        it('3.1 应该软删除文档（默认 deletedAt）', async function () {
            const userId = new ObjectId();

            await nativeDb.collection('users').insertOne({
                _id: userId,
                name: 'Frank',
                email: 'frank@example.com'
            });

            const result = await collection('users').safeDelete(
                { _id: userId },
                {
                    soft: true
                }
            );

            assert.strictEqual(result.deletedCount, 1);

            // 验证文档仍然存在，但有 deletedAt 字段
            const user = await nativeDb.collection('users').findOne({ _id: userId });
            assert.ok(user, '文档应该仍然存在');
            assert.ok(user.deletedAt, '应该有 deletedAt 字段');
            assert.ok(user.deletedAt instanceof Date, 'deletedAt 应该是 Date 类型');
        });

        it('3.2 应该支持自定义软删除字段', async function () {
            const userId = new ObjectId();

            await nativeDb.collection('users').insertOne({
                _id: userId,
                name: 'Grace',
                email: 'grace@example.com'
            });

            const result = await collection('users').safeDelete(
                { _id: userId },
                {
                    soft: true,
                    softDeleteField: 'removedAt',
                    softDeleteValue: new Date('2024-12-01')
                }
            );

            assert.strictEqual(result.deletedCount, 1);

            const user = await nativeDb.collection('users').findOne({ _id: userId });
            assert.ok(user.removedAt, '应该有 removedAt 字段');
            assert.strictEqual(user.removedAt.toISOString(), new Date('2024-12-01').toISOString());
        });

        it('3.3 应该支持额外字段（deletedBy、deleteReason）', async function () {
            const userId = new ObjectId();
            const adminId = new ObjectId();

            await nativeDb.collection('users').insertOne({
                _id: userId,
                name: 'Henry',
                email: 'henry@example.com'
            });

            const result = await collection('users').safeDelete(
                { _id: userId },
                {
                    soft: true,
                    additionalFields: {
                        deletedBy: adminId,
                        deleteReason: '用户注销'
                    }
                }
            );

            assert.strictEqual(result.deletedCount, 1);

            const user = await nativeDb.collection('users').findOne({ _id: userId });
            assert.ok(user.deletedAt);
            assert.strictEqual(user.deletedBy.toString(), adminId.toString());
            assert.strictEqual(user.deleteReason, '用户注销');
        });

        it('3.4 软删除应该也检查依赖', async function () {
            const userId = new ObjectId();

            await nativeDb.collection('users').insertOne({
                _id: userId,
                name: 'Ivy',
                email: 'ivy@example.com'
            });

            await nativeDb.collection('orders').insertOne({
                userId,
                status: 'pending'
            });

            try {
                await collection('users').safeDelete(
                    { _id: userId },
                    {
                        soft: true,
                        checkDependencies: [
                            {
                                collection: 'orders',
                                query: { userId, status: 'pending' },
                                errorMessage: '用户有未完成的订单'
                            }
                        ]
                    }
                );
                assert.fail('应该抛出错误');
            } catch (error) {
                assert.ok(error.message.includes('用户有未完成的订单'));
            }

            // 验证用户未被软删除
            const user = await nativeDb.collection('users').findOne({ _id: userId });
            assert.strictEqual(user.deletedAt, undefined, '不应该有 deletedAt 字段');
        });
    });

    describe('4. 参数验证测试', function () {
        it('4.1 应该拒绝非对象 query', async function () {
            try {
                await collection('users').safeDelete('invalid');
                assert.fail('应该抛出错误');
            } catch (error) {
                assert.ok(error.message.includes('query 必须是对象'));
            }
        });

        it('4.2 应该拒绝缺少 collection 的依赖检查', async function () {
            try {
                await collection('users').safeDelete(
                    { _id: new ObjectId() },
                    {
                        checkDependencies: [
                            {
                                query: { userId: new ObjectId() }
                                // 缺少 collection
                            }
                        ]
                    }
                );
                assert.fail('应该抛出错误');
            } catch (error) {
                assert.ok(error.message.includes('collection'));
            }
        });

        it('4.3 应该拒绝缺少 query 的依赖检查', async function () {
            try {
                await collection('users').safeDelete(
                    { _id: new ObjectId() },
                    {
                        checkDependencies: [
                            {
                                collection: 'orders'
                                // 缺少 query
                            }
                        ]
                    }
                );
                assert.fail('应该抛出错误');
            } catch (error) {
                assert.ok(error.message.includes('query'));
            }
        });
    });

    describe('5. 真实场景测试', function () {
        it('5.1 场景：删除用户前检查多个依赖', async function () {
            const userId = new ObjectId();

            // 创建用户
            await nativeDb.collection('users').insertOne({
                _id: userId,
                name: 'Jack',
                email: 'jack@example.com',
                status: 'active'
            });

            // 创建已完成的订单（允许删除）
            await nativeDb.collection('orders').insertMany([
                { userId, status: 'completed', amount: 100 },
                { userId, status: 'cancelled', amount: 50 }
            ]);

            // 创建评论（允许少量）
            await nativeDb.collection('comments').insertMany([
                { userId, content: 'Comment 1' },
                { userId, content: 'Comment 2' }
            ]);

            const result = await collection('users').safeDelete(
                { _id: userId },
                {
                    checkDependencies: [
                        {
                            collection: 'orders',
                            query: { userId, status: { $in: ['pending', 'paid', 'shipping'] } },
                            errorMessage: '用户有未完成的订单'
                        },
                        {
                            collection: 'comments',
                            query: { userId },
                            allowCount: 10,
                            errorMessage: '用户有过多评论'
                        }
                    ]
                }
            );

            assert.strictEqual(result.deletedCount, 1);
            assert.strictEqual(result.dependencyChecks.length, 2);
            assert.strictEqual(result.dependencyChecks[0].count, 0, '没有未完成的订单');
            assert.strictEqual(result.dependencyChecks[1].count, 2, '有 2 个评论');
            assert.strictEqual(result.dependencyChecks[0].passed, true);
            assert.strictEqual(result.dependencyChecks[1].passed, true);
        });

        it('5.2 场景：软删除用户（审计需求）', async function () {
            const userId = new ObjectId();
            const adminId = new ObjectId();

            await nativeDb.collection('users').insertOne({
                _id: userId,
                name: 'Kate',
                email: 'kate@example.com',
                balance: 0
            });

            const result = await collection('users').safeDelete(
                { _id: userId },
                {
                    checkDependencies: [
                        {
                            collection: 'orders',
                            query: { userId, status: 'pending' },
                            errorMessage: '用户有未完成的订单'
                        }
                    ],
                    soft: true,
                    additionalFields: {
                        deletedBy: adminId,
                        deleteReason: '用户注销',
                        deletedBalance: 0
                    }
                }
            );

            assert.strictEqual(result.deletedCount, 1);

            const user = await nativeDb.collection('users').findOne({ _id: userId });
            assert.ok(user, '用户应该仍然存在');
            assert.ok(user.deletedAt, '应该有 deletedAt');
            assert.strictEqual(user.deletedBy.toString(), adminId.toString());
            assert.strictEqual(user.deleteReason, '用户注销');
            assert.strictEqual(user.deletedBalance, 0);

            console.log('  软删除用户信息:', {
                deletedAt: user.deletedAt,
                deletedBy: user.deletedBy,
                deleteReason: user.deleteReason
            });
        });

        it('5.3 场景：删除商品（检查订单引用）', async function () {
            const productId = new ObjectId();

            await nativeDb.collection('products').insertOne({
                _id: productId,
                name: 'Product A',
                price: 100
            });

            // 创建已完成的订单（允许删除）
            await nativeDb.collection('order_items').insertMany([
                { productId, orderId: new ObjectId(), quantity: 1, orderStatus: 'completed' },
                { productId, orderId: new ObjectId(), quantity: 2, orderStatus: 'completed' }
            ]);

            // 创建少量购物车引用（允许）
            await nativeDb.collection('cart_items').insertMany([
                { productId, userId: new ObjectId(), quantity: 1 },
                { productId, userId: new ObjectId(), quantity: 1 }
            ]);

            const result = await collection('products').safeDelete(
                { _id: productId },
                {
                    checkDependencies: [
                        {
                            collection: 'order_items',
                            query: { productId, orderStatus: { $in: ['pending', 'paid', 'shipping'] } },
                            errorMessage: '商品在未完成的订单中'
                        },
                        {
                            collection: 'cart_items',
                            query: { productId },
                            allowCount: 10,
                            errorMessage: '商品在过多购物车中'
                        }
                    ]
                }
            );

            assert.strictEqual(result.deletedCount, 1);
            assert.strictEqual(result.dependencyChecks[0].count, 0);
            assert.strictEqual(result.dependencyChecks[1].count, 2);

            // 删除成功后，清理购物车引用
            await nativeDb.collection('cart_items').deleteMany({ productId });
        });
    });
});

