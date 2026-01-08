/**
 * README基础使用示例 - 简化版
 *
 * 只演示最核心的功能，不包含复杂的高级特性
 *
 * 使用方法：
 * 1. 确保MongoDB运行在 localhost:27017
 * 2. npm install monsqlize
 * 3. node examples/readme-basic-simple.js
 */

const MonSQLize = require('monsqlize');

async function main() {
    console.log('🚀 monSQLize 基础使用示例（简化版）\n');

    // 1. 初始化并连接
    console.log('1️⃣ 初始化并连接...');
    const msq = new MonSQLize({
        type: 'mongodb',
        databaseName: 'test_simple',
        config: { uri: 'mongodb://localhost:27017' },
        cache: { enabled: true, ttl: 60000 }
    });

    await msq.connect();
    console.log('✅ 连接成功\n');

    // 2. 获取集合
    console.log('2️⃣ 获取集合...');
    const users = msq.collection('users');
    console.log('✅ 集合获取完成\n');

    // 清理旧数据
    await users.deleteMany({});

    // 3. 插入数据
    console.log('3️⃣ 插入数据...');
    await users.insertOne({
        username: 'john',
        email: 'john@example.com',
        createdAt: new Date()
    });
    console.log('✅ 插入完成\n');

    // 4. 查询数据（自动缓存）
    console.log('4️⃣ 查询数据（自动缓存）...');
    const user = await users.findOne({ email: 'john@example.com' });
    console.log('查询结果:', {
        username: user.username,
        email: user.email
    });
    console.log('✅ 查询完成（已缓存）\n');

    // 5. 更新数据（自动清除缓存）
    console.log('5️⃣ 更新数据（自动清除缓存）...');
    await users.updateOne(
        { email: 'john@example.com' },
        { $set: { lastLogin: new Date() } }
    );
    console.log('✅ 更新完成（缓存已失效）\n');

    // 6. 便利方法（自动转换ObjectId）
    console.log('6️⃣ 便利方法测试...');
    const userId = user._id.toString();
    const userById = await users.findOneById(userId);
    console.log('findOneById:', userById ? '✅ 成功' : '❌ 失败');
    console.log('');

    // 7. 关闭连接
    console.log('7️⃣ 关闭连接...');
    await msq.close();
    console.log('✅ 连接已关闭\n');

    console.log('🎉 所有示例执行完成！');
    console.log('\n💡 提示：');
    console.log('  - 缓存自动工作，无需手动管理');
    console.log('  - 写操作自动清除相关缓存');
    console.log('  - API完全兼容MongoDB原生驱动');
}

// 运行示例
main().catch(error => {
    console.error('❌ 执行失败:', error.message);
    process.exit(1);
});

