/**
 * 测试 Model timestamps 对 incrementOne 的支持
 */

const MonSQLize = require('../../lib');
const { Model } = MonSQLize;

(async () => {
    console.log('🧪 测试 incrementOne timestamps 支持\n');

    // 定义 Model
    Model.define('users', {
        schema: (dsl) => dsl({
            username: 'string!',
            points: 'number'
        }),
        options: {
            timestamps: true  // 启用时间戳
        }
    });

    const msq = new MonSQLize({
        type: 'mongodb',
        databaseName: 'test_increment_timestamps',
        config: { uri: 'mongodb://localhost:27017' },
        logger: { level: 'debug' }
    });

    try {
        await msq.connect();
        console.log('✅ 数据库连接成功\n');

        const User = msq.model('users');

        // 1. 插入测试数据
        console.log('=== 1. 插入测试数据 ===');
        const insertResult = await User.insertOne({
            username: 'testuser',
            points: 100
        });
        console.log('插入的文档:', insertResult.value);
        console.log(`createdAt: ${insertResult.value.createdAt}`);
        console.log(`updatedAt: ${insertResult.value.updatedAt}`);

        const userId = insertResult.value._id;

        // 等待 1 秒，确保时间戳会变化
        await new Promise(resolve => setTimeout(resolve, 1000));

        // 2. 使用 incrementOne
        console.log('\n=== 2. 测试 incrementOne ===');
        const incrementResult = await User.incrementOne(
            { _id: userId },
            'points',
            50
        );
        console.log('incrementOne 结果:', incrementResult.value);
        console.log(`更新后 points: ${incrementResult.value.points}`);
        console.log(`更新后 updatedAt: ${incrementResult.value.updatedAt}`);

        // 3. 验证时间戳是否更新
        console.log('\n=== 3. 验证时间戳 ===');
        const finalDoc = await User.findOne({ _id: userId });
        console.log('最终文档:', finalDoc);
        console.log(`createdAt 未变化: ${finalDoc.createdAt.getTime() === insertResult.value.createdAt.getTime()}`);
        console.log(`updatedAt 已更新: ${finalDoc.updatedAt.getTime() > insertResult.value.createdAt.getTime()}`);

        // 4. 测试手动时间戳不被覆盖
        console.log('\n=== 4. 测试手动时间戳不被覆盖 ===');
        const customTime = new Date('2020-01-01');
        const manualInsertResult = await User.insertOne({
            username: 'manual_user',
            points: 50,
            createdAt: customTime,
            updatedAt: customTime
        });
        console.log('手动设置时间戳:', manualInsertResult.value);
        console.log(`createdAt 保留: ${manualInsertResult.value.createdAt.getTime() === customTime.getTime()}`);
        console.log(`updatedAt 保留: ${manualInsertResult.value.updatedAt.getTime() === customTime.getTime()}`);

        console.log('\n✅ 所有测试通过！');

    } catch (error) {
        console.error('❌ 测试失败:', error.message);
        console.error(error.stack);
    } finally {
        // 清理测试数据
        try {
            await msq.db().dropDatabase();
            console.log('\n🗑️  测试数据库已删除');
        } catch (e) {
            // 忽略清理错误
        }
        await msq.close();
        console.log('✅ 连接已关闭');
    }
})();

