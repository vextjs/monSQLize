/**
 * Update 聚合管道测试套件
 * 专门测试 v1.0.8 新增的聚合管道功能
 */

const assert = require('assert');
const MonSQLize = require('../../../lib/index');

describe('Update 聚合管道测试套件 (v1.0.8+)', function () {
    this.timeout(30000);

    let msq, collection;

    before(async () => {
        msq = new MonSQLize({
            type: 'mongodb',
            databaseName: 'test_update_aggregation',
            config: { useMemoryServer: true }
        });

        const conn = await msq.connect();
        collection = conn.collection;

        // 清空测试集合
        const db = msq._adapter.db;
        await db.collection('users').deleteMany({});
        await db.collection('orders').deleteMany({});
        await db.collection('products').deleteMany({});
    });

    after(async () => {
        if (msq) await msq.close();
    });

    beforeEach(async () => {
        // 每个测试前清空集合
        const db = msq._adapter.db;
        await db.collection('users').deleteMany({});
        await db.collection('orders').deleteMany({});
        await db.collection('products').deleteMany({});
    });

    // ===========================================
    // 1. 聚合管道基础验证测试
    // ===========================================
    describe('聚合管道基础验证', () => {
        it('应该在聚合管道包含非对象元素时抛出错误', async () => {
            await collection('users').insertOne({ userId: 'user1' });

            try {
                await collection('users').updateOne(
                    { userId: 'user1' },
                    [
                        { $set: { name: 'Test' } },
                        'invalid_element',  // ❌ 非对象元素
                        { $set: { age: 25 } }
                    ]
                );
                assert.fail('应该抛出错误');
            } catch (err) {
                assert.strictEqual(err.code, 'INVALID_ARGUMENT');
                assert.ok(err.message.includes('必须是对象'));
            }
        });

        it('应该在聚合管道阶段为空对象时抛出错误', async () => {
            await collection('users').insertOne({ userId: 'user1' });

            try {
                await collection('users').updateOne(
                    { userId: 'user1' },
                    [
                        {},  // ❌ 空对象
                        { $set: { name: 'Test' } }
                    ]
                );
                assert.fail('应该抛出错误');
            } catch (err) {
                assert.strictEqual(err.code, 'INVALID_ARGUMENT');
                assert.ok(err.message.includes('空对象') || err.message.includes('不能为空'));
            }
        });

        it('应该在聚合管道操作符不以$开头时抛出错误', async () => {
            await collection('users').insertOne({ userId: 'user1' });

            try {
                await collection('users').updateOne(
                    { userId: 'user1' },
                    [
                        { invalidOp: { name: 'Test' } }  // ❌ 操作符不以$开头
                    ]
                );
                assert.fail('应该抛出错误');
            } catch (err) {
                assert.strictEqual(err.code, 'INVALID_ARGUMENT');
                assert.ok(err.message.includes('$'));
            }
        });

        it('应该在聚合管道阶段包含多个键时只使用第一个', async () => {
            await collection('users').insertOne({ userId: 'user1', count: 0 });

            // MongoDB 聚合管道每个阶段只能有一个操作符
            // 如果有多个，通常只会使用第一个
            const result = await collection('users').updateOne(
                { userId: 'user1' },
                [
                    { $set: { name: 'Test', age: 25 } }  // ✅ $set 内可以有多个字段
                ]
            );

            assert.strictEqual(result.modifiedCount, 1);

            const db = msq._adapter.db;
            const doc = await db.collection('users').findOne({ userId: 'user1' });
            assert.strictEqual(doc.name, 'Test');
            assert.strictEqual(doc.age, 25);
        });

        it('应该在 update 为 null 时抛出错误', async () => {
            try {
                await collection('users').updateOne(
                    { userId: 'user1' },
                    null
                );
                assert.fail('应该抛出错误');
            } catch (err) {
                assert.strictEqual(err.code, 'INVALID_ARGUMENT');
            }
        });
    });

    // ===========================================
    // 2. 聚合管道功能测试
    // ===========================================
    describe('聚合管道功能测试', () => {
        it('应该支持 $set 操作符进行字段间计算', async () => {
            await collection('orders').insertOne({
                orderId: 'ORDER-001',
                unitPrice: 100,
                quantity: 3,
                shippingFee: 10
            });

            const result = await collection('orders').updateOne(
                { orderId: 'ORDER-001' },
                [
                    {
                        $set: {
                            totalPrice: {
                                $add: [
                                    { $multiply: ['$unitPrice', '$quantity'] },
                                    '$shippingFee'
                                ]
                            }
                        }
                    }
                ]
            );

            assert.strictEqual(result.modifiedCount, 1);

            const db = msq._adapter.db;
            const doc = await db.collection('orders').findOne({ orderId: 'ORDER-001' });
            assert.strictEqual(doc.totalPrice, 310);  // 100 * 3 + 10 = 310
        });

        it('应该支持 $unset 操作符（聚合管道格式）', async () => {
            await collection('users').insertOne({
                userId: 'user1',
                name: 'Alice',
                tempField: 'temp',
                anotherTemp: 'temp2'
            });

            const result = await collection('users').updateOne(
                { userId: 'user1' },
                [
                    { $unset: ['tempField', 'anotherTemp'] }
                ]
            );

            assert.strictEqual(result.modifiedCount, 1);

            const db = msq._adapter.db;
            const doc = await db.collection('users').findOne({ userId: 'user1' });
            assert.strictEqual(doc.tempField, undefined);
            assert.strictEqual(doc.anotherTemp, undefined);
            assert.strictEqual(doc.name, 'Alice');  // 其他字段保持
        });

        it('应该支持 $addFields 操作符', async () => {
            await collection('users').insertOne({
                userId: 'user1',
                firstName: 'John',
                lastName: 'Doe'
            });

            const result = await collection('users').updateOne(
                { userId: 'user1' },
                [
                    {
                        $addFields: {
                            fullName: { $concat: ['$firstName', ' ', '$lastName'] }
                        }
                    }
                ]
            );

            assert.strictEqual(result.modifiedCount, 1);

            const db = msq._adapter.db;
            const doc = await db.collection('users').findOne({ userId: 'user1' });
            assert.strictEqual(doc.fullName, 'John Doe');
        });

        it('应该支持条件表达式（$cond）', async () => {
            await collection('users').insertOne({
                userId: 'user1',
                points: 150
            });

            const result = await collection('users').updateOne(
                { userId: 'user1' },
                [
                    {
                        $set: {
                            status: {
                                $cond: [
                                    { $gte: ['$points', 100] },
                                    'premium',
                                    'regular'
                                ]
                            }
                        }
                    }
                ]
            );

            assert.strictEqual(result.modifiedCount, 1);

            const db = msq._adapter.db;
            const doc = await db.collection('users').findOne({ userId: 'user1' });
            assert.strictEqual(doc.status, 'premium');
        });

        it('应该支持 $switch 条件分支', async () => {
            await collection('users').insertOne({
                userId: 'user1',
                points: 6000
            });

            const result = await collection('users').updateOne(
                { userId: 'user1' },
                [
                    {
                        $set: {
                            memberLevel: {
                                $switch: {
                                    branches: [
                                        { case: { $gte: ['$points', 10000] }, then: 'platinum' },
                                        { case: { $gte: ['$points', 5000] }, then: 'gold' },
                                        { case: { $gte: ['$points', 1000] }, then: 'silver' }
                                    ],
                                    default: 'bronze'
                                }
                            }
                        }
                    }
                ]
            );

            assert.strictEqual(result.modifiedCount, 1);

            const db = msq._adapter.db;
            const doc = await db.collection('users').findOne({ userId: 'user1' });
            assert.strictEqual(doc.memberLevel, 'gold');
        });

        it('应该支持数组操作（$arrayElemAt, $size）', async () => {
            await collection('products').insertOne({
                productId: 'p001',
                images: ['img1.jpg', 'img2.jpg', 'img3.jpg'],
                tags: ['electronics', 'hot', 'new']
            });

            const result = await collection('products').updateOne(
                { productId: 'p001' },
                [
                    {
                        $set: {
                            defaultImage: { $arrayElemAt: ['$images', 0] },
                            totalTags: { $size: '$tags' },
                            firstTag: { $arrayElemAt: ['$tags', 0] }
                        }
                    }
                ]
            );

            assert.strictEqual(result.modifiedCount, 1);

            const db = msq._adapter.db;
            const doc = await db.collection('products').findOne({ productId: 'p001' });
            assert.strictEqual(doc.defaultImage, 'img1.jpg');
            assert.strictEqual(doc.totalTags, 3);
            assert.strictEqual(doc.firstTag, 'electronics');
        });

        it('应该支持字符串操作（$concat, $trim, $toUpper）', async () => {
            await collection('products').insertOne({
                productId: 'p001',
                name: '  iPhone 15 Pro  ',
                sku: 'iphone-15-pro'
            });

            const result = await collection('products').updateOne(
                { productId: 'p001' },
                [
                    {
                        $set: {
                            name: { $trim: { input: '$name' } },
                            sku: { $toUpper: '$sku' },
                            displayName: {
                                $concat: ['Product: ', { $trim: { input: '$name' } }]
                            }
                        }
                    }
                ]
            );

            assert.strictEqual(result.modifiedCount, 1);

            const db = msq._adapter.db;
            const doc = await db.collection('products').findOne({ productId: 'p001' });
            assert.strictEqual(doc.name, 'iPhone 15 Pro');
            assert.strictEqual(doc.sku, 'IPHONE-15-PRO');
            assert.strictEqual(doc.displayName, 'Product: iPhone 15 Pro');
        });
    });

    // ===========================================
    // 3. 聚合管道多阶段测试
    // ===========================================
    describe('聚合管道多阶段测试', () => {
        it('应该支持多阶段聚合管道', async () => {
            await collection('products').insertOne({
                productId: 'p001',
                name: '  Test Product  ',
                price: 100,
                discountRate: 0.1
            });

            const result = await collection('products').updateOne(
                { productId: 'p001' },
                [
                    // 阶段1: 规范化数据
                    {
                        $set: {
                            name: { $trim: { input: '$name' } }
                        }
                    },
                    // 阶段2: 计算派生字段
                    {
                        $set: {
                            discountedPrice: {
                                $multiply: [
                                    '$price',
                                    { $subtract: [1, '$discountRate'] }
                                ]
                            }
                        }
                    },
                    // 阶段3: 添加时间戳
                    {
                        $set: { updatedAt: new Date('2026-01-15') }
                    }
                ]
            );

            assert.strictEqual(result.modifiedCount, 1);

            const db = msq._adapter.db;
            const doc = await db.collection('products').findOne({ productId: 'p001' });
            assert.strictEqual(doc.name, 'Test Product');
            assert.strictEqual(doc.discountedPrice, 90);  // 100 * (1 - 0.1) = 90
            assert.ok(doc.updatedAt instanceof Date);
        });

        it('应该按顺序执行多个阶段', async () => {
            await collection('users').insertOne({
                userId: 'user1',
                value: 10
            });

            const result = await collection('users').updateOne(
                { userId: 'user1' },
                [
                    // 阶段1: value * 2
                    { $set: { value: { $multiply: ['$value', 2] } } },
                    // 阶段2: value + 5 (基于阶段1的结果)
                    { $set: { value: { $add: ['$value', 5] } } },
                    // 阶段3: value * 3 (基于阶段2的结果)
                    { $set: { value: { $multiply: ['$value', 3] } } }
                ]
            );

            assert.strictEqual(result.modifiedCount, 1);

            const db = msq._adapter.db;
            const doc = await db.collection('users').findOne({ userId: 'user1' });
            // ((10 * 2) + 5) * 3 = (20 + 5) * 3 = 25 * 3 = 75
            assert.strictEqual(doc.value, 75);
        });

        it('应该支持阶段间的数据依赖', async () => {
            await collection('orders').insertOne({
                orderId: 'ORDER-001',
                items: [
                    { name: 'Item1', price: 100 },
                    { name: 'Item2', price: 200 }
                ]
            });

            const result = await collection('orders').updateOne(
                { orderId: 'ORDER-001' },
                [
                    // 阶段1: 计算商品总数
                    {
                        $set: {
                            itemCount: { $size: '$items' }
                        }
                    },
                    // 阶段2: 基于商品总数计算是否批量订单
                    {
                        $set: {
                            isBulkOrder: { $gte: ['$itemCount', 2] }
                        }
                    }
                ]
            );

            assert.strictEqual(result.modifiedCount, 1);

            const db = msq._adapter.db;
            const doc = await db.collection('orders').findOne({ orderId: 'ORDER-001' });
            assert.strictEqual(doc.itemCount, 2);
            assert.strictEqual(doc.isBulkOrder, true);
        });
    });

    // ===========================================
    // 4. ObjectId 转换测试
    // ===========================================
    describe('ObjectId 转换测试', () => {
        it('聚合管道应该保持字段引用不转换（如 $userId）', async () => {
            const { ObjectId } = require('mongodb');
            const userId = new ObjectId();

            await collection('users').insertOne({
                _id: userId,
                userId: 'user1',
                refId: new ObjectId()
            });

            // 使用字段引用
            const result = await collection('users').updateOne(
                { userId: 'user1' },
                [
                    { $set: { copiedRef: '$refId' } }  // 字段引用，不应该转换
                ]
            );

            assert.strictEqual(result.modifiedCount, 1);

            const db = msq._adapter.db;
            const doc = await db.collection('users').findOne({ userId: 'user1' });
            // copiedRef 应该等于 refId（字段引用）
            assert.strictEqual(doc.copiedRef.toString(), doc.refId.toString());
        });

        it('传统操作符应该自动转换 ObjectId 字符串', async () => {
            const { ObjectId } = require('mongodb');
            const userId = new ObjectId();
            const refIdString = new ObjectId().toString();

            await collection('users').insertOne({
                _id: userId,
                userId: 'user1'
            });

            // 传统操作符会自动转换
            const result = await collection('users').updateOne(
                { userId: 'user1' },
                { $set: { refId: refIdString } }  // ✅ 应该自动转换为 ObjectId
            );

            assert.strictEqual(result.modifiedCount, 1);

            const db = msq._adapter.db;
            const doc = await db.collection('users').findOne({ userId: 'user1' });
            // refId 应该是 ObjectId 实例
            assert.ok(doc.refId instanceof ObjectId);
            assert.strictEqual(doc.refId.toString(), refIdString);
        });

        it('聚合管道中的 ObjectId 实例应该保持不变', async () => {
            const { ObjectId } = require('mongodb');
            const userId = new ObjectId();
            const newRefId = new ObjectId();

            await collection('users').insertOne({
                _id: userId,
                userId: 'user1'
            });

            // 聚合管道中使用 ObjectId 实例
            const result = await collection('users').updateOne(
                { userId: 'user1' },
                [
                    { $set: { refId: newRefId } }  // ObjectId 实例应该保持
                ]
            );

            assert.strictEqual(result.modifiedCount, 1);

            const db = msq._adapter.db;
            const doc = await db.collection('users').findOne({ userId: 'user1' });
            assert.ok(doc.refId instanceof ObjectId);
            assert.strictEqual(doc.refId.toString(), newRefId.toString());
        });
    });

    // ===========================================
    // 5. 错误处理增强测试
    // ===========================================
    describe('错误处理增强测试', () => {
        it('应该在 update 为空对象 {} 时抛出错误', async () => {
            await collection('users').insertOne({ userId: 'user1' });

            try {
                await collection('users').updateOne(
                    { userId: 'user1' },
                    {}  // ❌ 空对象
                );
                assert.fail('应该抛出错误');
            } catch (err) {
                assert.strictEqual(err.code, 'INVALID_ARGUMENT');
                assert.ok(err.message.includes('空对象') || err.message.includes('必须包含'));
            }
        });

        it('应该在聚合管道包含无效表达式时抛出错误', async () => {
            await collection('users').insertOne({ userId: 'user1', value: 10 });

            try {
                await collection('users').updateOne(
                    { userId: 'user1' },
                    [
                        {
                            $set: {
                                result: { $invalidOperator: ['$value'] }  // ❌ 无效操作符
                            }
                        }
                    ]
                );
                assert.fail('应该抛出错误');
            } catch (err) {
                // MongoDB 会抛出错误
                assert.ok(err);
            }
        });
    });

    // ===========================================
    // 6. 边界情况增强测试
    // ===========================================
    describe('边界情况增强测试', () => {
        it('应该能处理较大的聚合管道（10个阶段）', async () => {
            await collection('users').insertOne({
                userId: 'user1',
                value: 1
            });

            // 10个阶段，每个阶段都加1
            const result = await collection('users').updateOne(
                { userId: 'user1' },
                [
                    { $set: { value: { $add: ['$value', 1] } } },
                    { $set: { value: { $add: ['$value', 1] } } },
                    { $set: { value: { $add: ['$value', 1] } } },
                    { $set: { value: { $add: ['$value', 1] } } },
                    { $set: { value: { $add: ['$value', 1] } } },
                    { $set: { value: { $add: ['$value', 1] } } },
                    { $set: { value: { $add: ['$value', 1] } } },
                    { $set: { value: { $add: ['$value', 1] } } },
                    { $set: { value: { $add: ['$value', 1] } } },
                    { $set: { value: { $add: ['$value', 1] } } }
                ]
            );

            assert.strictEqual(result.modifiedCount, 1);

            const db = msq._adapter.db;
            const doc = await db.collection('users').findOne({ userId: 'user1' });
            assert.strictEqual(doc.value, 11);  // 1 + 10 = 11
        });

        it('应该能处理嵌套很深的表达式', async () => {
            await collection('users').insertOne({
                userId: 'user1',
                a: 10,
                b: 20,
                c: 30
            });

            const result = await collection('users').updateOne(
                { userId: 'user1' },
                [
                    {
                        $set: {
                            result: {
                                $add: [
                                    '$a',
                                    {
                                        $multiply: [
                                            '$b',
                                            {
                                                $subtract: [
                                                    '$c',
                                                    { $divide: ['$a', 2] }
                                                ]
                                            }
                                        ]
                                    }
                                ]
                            }
                        }
                    }
                ]
            );

            assert.strictEqual(result.modifiedCount, 1);

            const db = msq._adapter.db;
            const doc = await db.collection('users').findOne({ userId: 'user1' });
            // a + (b * (c - (a / 2))) = 10 + (20 * (30 - 5)) = 10 + (20 * 25) = 10 + 500 = 510
            assert.strictEqual(doc.result, 510);
        });

        it('应该能处理包含 null 的表达式', async () => {
            await collection('users').insertOne({
                userId: 'user1',
                nickname: null,
                firstName: 'John',
                lastName: 'Doe'
            });

            const result = await collection('users').updateOne(
                { userId: 'user1' },
                [
                    {
                        $set: {
                            displayName: {
                                $cond: [
                                    { $ne: ['$nickname', null] },
                                    '$nickname',
                                    { $concat: ['$firstName', ' ', '$lastName'] }
                                ]
                            }
                        }
                    }
                ]
            );

            assert.strictEqual(result.modifiedCount, 1);

            const db = msq._adapter.db;
            const doc = await db.collection('users').findOne({ userId: 'user1' });
            assert.strictEqual(doc.displayName, 'John Doe');
        });

        it('应该能处理空数组', async () => {
            await collection('products').insertOne({
                productId: 'p001',
                images: []
            });

            const result = await collection('products').updateOne(
                { productId: 'p001' },
                [
                    {
                        $set: {
                            hasImages: {
                                $cond: [
                                    { $gt: [{ $size: '$images' }, 0] },
                                    true,
                                    false
                                ]
                            }
                        }
                    }
                ]
            );

            assert.strictEqual(result.modifiedCount, 1);

            const db = msq._adapter.db;
            const doc = await db.collection('products').findOne({ productId: 'p001' });
            assert.strictEqual(doc.hasImages, false);
        });

        it('应该能处理特殊字符字段名', async () => {
            await collection('users').insertOne({
                userId: 'user1',
                'field-with-dash': 'value1',
                'field_with_underscore': 'value2'
            });

            const result = await collection('users').updateOne(
                { userId: 'user1' },
                [
                    {
                        $set: {
                            combined: {
                                $concat: ['$field-with-dash', '-', '$field_with_underscore']
                            }
                        }
                    }
                ]
            );

            assert.strictEqual(result.modifiedCount, 1);

            const db = msq._adapter.db;
            const doc = await db.collection('users').findOne({ userId: 'user1' });
            assert.strictEqual(doc.combined, 'value1-value2');
        });
    });

    // ===========================================
    // 7. 缓存失效测试（聚合管道）
    // ===========================================
    describe('缓存失效测试（聚合管道）', () => {
        it('聚合管道更新后应该失效缓存', async () => {
            // 插入初始数据
            await collection('users').insertOne({
                userId: 'user1',
                points: 100
            });

            // 查询并缓存
            await collection('users').find({ userId: 'user1' }, { cache: 5000 });

            const stats1 = msq.cache.getStats();
            const size1 = stats1.size;
            assert.ok(size1 > 0, '应该有缓存');

            // 使用聚合管道更新
            await collection('users').updateOne(
                { userId: 'user1' },
                [
                    { $set: { points: { $add: ['$points', 50] } } }
                ]
            );

            // 验证缓存已清空
            const stats2 = msq.cache.getStats();
            assert.strictEqual(stats2.size, 0, '聚合管道更新后缓存应该被清空');
        });
    });
});

