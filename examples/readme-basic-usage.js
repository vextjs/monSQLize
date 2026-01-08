/**
 * README基础使用示例 - 完整可运行版本
 *
 * 使用方法：
 * 1. 确保MongoDB运行在 localhost:27017
 * 2. npm install monsqlize
 * 3. node examples/readme-basic-usage.js
 */

const MonSQLize = require('monsqlize');

async function main() {
    console.log('🚀 monSQLize 基础使用示例\n');

    // 1. 初始化
    console.log('1️⃣ 初始化连接...');
    const msq = new MonSQLize({
        type: 'mongodb',
        databaseName: 'test_monsqlize',  // 数据库名称
        config: { uri: 'mongodb://localhost:27017' },
        cache: {
            enabled: true,
            maxSize: 100000,
            ttl: 60000
        }
    });

    await msq.connect();
    console.log('✅ 连接成功\n');

    // 2. 获取集合
    console.log('2️⃣ 获取集合...');
    const users = msq.collection('users');
    const orders = msq.collection('orders');
    const inventory = msq.collection('inventory');
    console.log('✅ 集合获取完成\n');

    // 清理测试数据
    await users.deleteMany({});
    await orders.deleteMany({});
    await inventory.deleteMany({});

    // 插入测试数据
    console.log('3️⃣ 插入测试数据...');
    const testUser = await users.insertOne({
        email: 'test@example.com',
        username: 'testuser',
        balance: 1000,
        createdAt: new Date()
    });
    const userId = testUser.insertedId.toString();

    await inventory.insertOne({
        sku: 'SKU123',
        name: '测试商品',
        stock: 10,
        price: 100
    });
    console.log('✅ 测试数据插入完成\n');

    // 3. 基础查询（启用缓存）
    console.log('4️⃣ 基础查询（启用缓存）...');
    const user = await users.findOne({ email: 'test@example.com' }, { cache: 60000 });
    console.log('查询结果:', {
        _id: user._id.toString(),
        email: user.email,
        balance: user.balance
    });
    console.log('✅ 查询完成（已缓存）\n');

    // 4. 写操作（自动失效缓存）
    console.log('5️⃣ 更新用户最后登录时间...');
    await users.updateOne(
        { email: 'test@example.com' },
        { $set: { lastLogin: new Date() } }
    );
    console.log('✅ 更新完成（缓存已失效）\n');

    // 5. 便利方法（自动转换ObjectId）
    console.log('6️⃣ 便利方法测试...');
    const userById = await users.findOneById(userId);
    console.log('findOneById:', userById ? '✅ 成功' : '❌ 失败');

    const userList = await users.findByIds([userId]);
    console.log('findByIds:', userList.length > 0 ? '✅ 成功' : '❌ 失败');
    console.log('');

    // 6. 事务（自动管理）
    console.log('7️⃣ 事务测试（扣款+创建订单）...');
    console.log('   ⚠️  注意：事务需要MongoDB副本集环境');
    console.log('   当前环境：单机MongoDB');
    console.log('   ⏭️  跳过事务测试（如需测试，请使用副本集）');
    console.log('   💡 提示：生产环境请使用副本集\n');

    // 7. 业务锁（防止并发冲突）
    console.log('8️⃣ 业务锁测试（库存扣减）...');
    console.log('   ⚠️  注意：业务锁需要Redis支持');
    console.log('   当前环境：未配置Redis');
    console.log('   ⏭️  跳过业务锁测试（如需测试，请配置Redis）');
    console.log('   💡 提示：配置方法见 docs/business-lock.md\n');

    // 使用普通方式演示库存扣减
    console.log('   使用普通方式演示库存扣减...');
    const product = await inventory.findOne({ sku: 'SKU123' });
    console.log('  - 当前库存:', product.stock);

    if (product.stock >= 1) {
        await inventory.updateOne(
            { sku: 'SKU123' },
            { $inc: { stock: -1 } }
        );
        console.log('  - 扣减库存: ✅');
    }

    // 验证库存
    const updatedProduct = await inventory.findOne({ sku: 'SKU123' });
    console.log('  - 库存变化: 10 → ', updatedProduct.stock, '（应为9）');
    console.log('');

    // 8. 关闭连接
    console.log('9️⃣ 关闭连接...');
    await msq.close();
    console.log('✅ 连接已关闭\n');

    console.log('🎉 所有示例执行完成！');
}

// 运行示例
main().catch(error => {
    console.error('❌ 执行失败:', error);
    process.exit(1);
});

