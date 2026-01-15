/**
 * Update 聚合管道示例
 * 展示 7 个常见场景的聚合管道用法
 *
 * @since v1.0.8
 */

const MonSQLize = require('monsqlize');

async function runExamples() {
    // 初始化 monSQLize
    const msq = new MonSQLize({
        type: 'mongodb',
        config: {
            uri: process.env.MONGODB_URI || 'mongodb://localhost:27017/examples'
        },
        logger: console  // 输出调试日志
    });

    await msq.connect();
    const { collection } = msq;

    console.log('='.repeat(80));
    console.log('Update 聚合管道示例 - 7个常见场景');
    console.log('='.repeat(80));

    // ========================================
    // 场景1: 字段间计算 - 订单总价计算
    // ========================================
    console.log('\n[场景1] 字段间计算 - 订单总价计算');
    console.log('-'.repeat(80));

    // 准备测试数据
    await collection('orders').insertOne({
        orderId: 'ORDER-123',
        unitPrice: 99.99,
        quantity: 3,
        shippingFee: 10.00
    });

    // 使用聚合管道计算总价
    const result1 = await collection('orders').updateOne(
        { orderId: 'ORDER-123' },
        [
            {
                $set: {
                    totalPrice: {
                        $add: [
                            { $multiply: ['$unitPrice', '$quantity'] },
                            '$shippingFee'
                        ]
                    },
                    updatedAt: new Date()
                }
            }
        ]
    );

    console.log(`✅ 更新成功: ${result1.modifiedCount} 个文档`);
    console.log(`   公式: 总价 = 单价(${99.99}) × 数量(3) + 运费(${10.00}) = ${99.99 * 3 + 10.00}`);

    // 验证结果
    const order1 = await collection('orders').findOne({ orderId: 'ORDER-123' });
    console.log(`   实际结果: totalPrice = ${order1.totalPrice}`);

    // ========================================
    // 场景2: 条件赋值 - 自动设置会员等级
    // ========================================
    console.log('\n[场景2] 条件赋值 - 自动设置会员等级');
    console.log('-'.repeat(80));

    // 准备测试数据
    await collection('users').insertMany([
        { userId: 'user1', points: 12000 },
        { userId: 'user2', points: 6000 },
        { userId: 'user3', points: 2000 },
        { userId: 'user4', points: 500 }
    ]);

    // 使用聚合管道根据积分设置等级
    const result2 = await collection('users').updateMany(
        {},
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

    console.log(`✅ 更新成功: ${result2.modifiedCount} 个文档`);
    console.log('   等级规则:');
    console.log('   - 积分 ≥ 10000 → platinum');
    console.log('   - 积分 ≥  5000 → gold');
    console.log('   - 积分 ≥  1000 → silver');
    console.log('   - 其他         → bronze');

    // 验证结果
    const users = await collection('users').find({}).sort({ points: -1 });
    console.log('   实际结果:');
    users.forEach(user => {
        console.log(`   - ${user.userId}: ${user.points} 积分 → ${user.memberLevel}`);
    });

    // ========================================
    // 场景3: 数组操作 - 提取第一个元素
    // ========================================
    console.log('\n[场景3] 数组操作 - 提取第一个元素');
    console.log('-'.repeat(80));

    // 准备测试数据
    await collection('products').insertOne({
        productId: 'p123',
        images: ['image1.jpg', 'image2.jpg', 'image3.jpg'],
        tags: ['电子产品', '热销', '新品']
    });

    // 使用聚合管道提取数组元素
    const result3 = await collection('products').updateOne(
        { productId: 'p123' },
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

    console.log(`✅ 更新成功: ${result3.modifiedCount} 个文档`);

    // 验证结果
    const product = await collection('products').findOne({ productId: 'p123' });
    console.log(`   defaultImage: ${product.defaultImage}`);
    console.log(`   totalTags: ${product.totalTags}`);
    console.log(`   firstTag: ${product.firstTag}`);

    // ========================================
    // 场景4: 字符串拼接 - 生成全名
    // ========================================
    console.log('\n[场景4] 字符串拼接 - 生成全名');
    console.log('-'.repeat(80));

    // 准备测试数据
    await collection('contacts').insertOne({
        userId: 'user2',
        firstName: 'John',
        lastName: 'Doe',
        nickname: null
    });

    // 使用聚合管道拼接字符串
    const result4 = await collection('contacts').updateOne(
        { userId: 'user2' },
        [
            {
                $set: {
                    fullName: {
                        $concat: ['$firstName', ' ', '$lastName']
                    },
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

    console.log(`✅ 更新成功: ${result4.modifiedCount} 个文档`);

    // 验证结果
    const contact = await collection('contacts').findOne({ userId: 'user2' });
    console.log(`   fullName: ${contact.fullName}`);
    console.log(`   displayName: ${contact.displayName}`);

    // ========================================
    // 场景5: 日期计算 - 设置过期时间
    // ========================================
    console.log('\n[场景5] 日期计算 - 设置过期时间');
    console.log('-'.repeat(80));

    // 准备测试数据
    const now = new Date();
    await collection('subscriptions').insertOne({
        subscriptionId: 'sub123',
        createdAt: now
    });

    // 使用聚合管道计算过期时间（+30天）
    const result5 = await collection('subscriptions').updateOne(
        { subscriptionId: 'sub123' },
        [
            {
                $set: {
                    expiresAt: {
                        $add: ['$createdAt', 30 * 24 * 60 * 60 * 1000]  // +30天（毫秒）
                    }
                }
            }
        ]
    );

    console.log(`✅ 更新成功: ${result5.modifiedCount} 个文档`);

    // 验证结果
    const subscription = await collection('subscriptions').findOne({ subscriptionId: 'sub123' });
    console.log(`   createdAt: ${subscription.createdAt.toISOString()}`);
    console.log(`   expiresAt: ${subscription.expiresAt.toISOString()}`);
    console.log(`   有效期: 30 天`);

    // ========================================
    // 场景6: 多阶段转换 - 数据清洗
    // ========================================
    console.log('\n[场景6] 多阶段转换 - 数据清洗');
    console.log('-'.repeat(80));

    // 准备测试数据（含脏数据）
    await collection('dirty_products').insertOne({
        productId: 'p789',
        name: '  iPhone 15 Pro  ',  // 含空格
        sku: 'iphone-15-pro',        // 小写
        price: 999.99,
        discountRate: 0.1
    });

    // 使用多阶段聚合管道清洗数据
    const result6 = await collection('dirty_products').updateOne(
        { productId: 'p789' },
        [
            // 阶段1: 数据规范化
            {
                $set: {
                    name: { $trim: { input: '$name' } },
                    sku: { $toUpper: '$sku' }
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
            // 阶段3: 更新时间戳
            {
                $set: { updatedAt: new Date() }
            }
        ]
    );

    console.log(`✅ 更新成功: ${result6.modifiedCount} 个文档`);
    console.log('   执行了3个阶段:');
    console.log('   1. 规范化: 去空格、转大写');
    console.log('   2. 计算: discountedPrice = price × (1 - discountRate)');
    console.log('   3. 时间戳: 更新 updatedAt');

    // 验证结果
    const cleanProduct = await collection('dirty_products').findOne({ productId: 'p789' });
    console.log('   结果:');
    console.log(`   - name: "${cleanProduct.name}" (已去空格)`);
    console.log(`   - sku: "${cleanProduct.sku}" (已转大写)`);
    console.log(`   - discountedPrice: ${cleanProduct.discountedPrice}`);

    // ========================================
    // 场景7: 复杂业务逻辑 - 订单状态流转
    // ========================================
    console.log('\n[场景7] 复杂业务逻辑 - 订单状态流转');
    console.log('-'.repeat(80));

    // 准备测试数据
    await collection('complex_orders').insertMany([
        {
            orderId: 'ORDER-456',
            paymentStatus: 'paid',
            inventoryStatus: 'reserved'
        },
        {
            orderId: 'ORDER-457',
            paymentStatus: 'paid',
            inventoryStatus: 'pending'
        },
        {
            orderId: 'ORDER-458',
            paymentStatus: 'pending',
            inventoryStatus: 'reserved'
        }
    ]);

    // 使用聚合管道自动流转状态
    const result7 = await collection('complex_orders').updateMany(
        {},
        [
            {
                $set: {
                    status: {
                        $cond: [
                            { $eq: ['$paymentStatus', 'paid'] },
                            {
                                $cond: [
                                    { $eq: ['$inventoryStatus', 'reserved'] },
                                    'processing',
                                    'pending-inventory'
                                ]
                            },
                            'pending-payment'
                        ]
                    },
                    updatedAt: new Date()
                }
            }
        ]
    );

    console.log(`✅ 更新成功: ${result7.modifiedCount} 个文档`);
    console.log('   状态流转规则:');
    console.log('   - paid + reserved → processing');
    console.log('   - paid + pending  → pending-inventory');
    console.log('   - pending + *     → pending-payment');

    // 验证结果
    const complexOrders = await collection('complex_orders').find({});
    console.log('   实际结果:');
    complexOrders.forEach(order => {
        console.log(`   - ${order.orderId}: ${order.paymentStatus} + ${order.inventoryStatus} → ${order.status}`);
    });

    // ========================================
    // 完成
    // ========================================
    console.log('\n' + '='.repeat(80));
    console.log('所有示例执行完成！');
    console.log('='.repeat(80));
    console.log('\n提示: 这些示例展示了聚合管道的强大功能');
    console.log('  - 字段间计算');
    console.log('  - 条件赋值');
    console.log('  - 数组操作');
    console.log('  - 字符串拼接');
    console.log('  - 日期计算');
    console.log('  - 多阶段转换');
    console.log('  - 复杂业务逻辑');
    console.log('\n详细文档: docs/update-operations.md');

    await msq.close();
}

// 执行示例
if (require.main === module) {
    runExamples().catch(error => {
        console.error('❌ 示例执行失败:', error);
        process.exit(1);
    });
}

module.exports = { runExamples };

