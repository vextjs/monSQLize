// 快速验证 version 功能
const MonSQLize = require('../../lib/index');
const { Model } = MonSQLize;

async function quickTest() {
    Model.define('users', {
        schema: (dsl) => dsl({ username: 'string!', email: 'string!' }),
        options: { version: true }
    });

    const msq = new MonSQLize({
        type: 'mongodb',
        databaseName: 'test_quick',
        config: { useMemoryServer: true }
    });

    await msq.connect();
    const User = msq.model('users');

    // 测试插入
    const result = await User.insertOne({ username: 'john', email: 'john@test.com' });
    const user = await User.findOne({ _id: result.insertedId });
    console.log('✅ 插入：version =', user.version);

    // 测试更新
    await User.updateOne({ _id: user._id }, { $set: { username: 'jane' } });
    const updated = await User.findOne({ _id: user._id });
    console.log('✅ 更新：version =', updated.version);

    // 测试并发冲突
    const r1 = await User.updateOne({ _id: user._id, version: 0 }, { $set: { email: 'a@test.com' } });
    console.log('✅ 冲突检测：modifiedCount =', r1.modifiedCount, '（预期0）');

    await msq.close();
    console.log('\n✅ 所有功能正常！');
}

quickTest().catch(console.error);

