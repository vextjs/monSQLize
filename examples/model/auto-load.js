/**
 * Model 自动加载示例
 *
 * 演示如何使用自动加载功能，无需手动 Model.define()
 *
 * @since v1.0.7
 */

const MonSQLize = require('../../lib/index');
const path = require('path');

// Model 文件目录
const modelsDir = path.join(__dirname, 'models');

(async () => {
    console.log('========================================');
    console.log('  Model 自动加载示例 (v1.0.7)');
    console.log('========================================\n');

    // 示例1: 简化配置
    console.log('示例1: 简化配置\n');

    const msq1 = new MonSQLize({
        type: 'mongodb',
        databaseName: 'test_auto_load',
        config: { useMemoryServer: true },
        models: modelsDir  // ← 简化配置
    });

    await msq1.connect();

    // 自动加载完成，直接使用
    const User = msq1.model('users');
    const Post = msq1.model('posts');

    console.log('✅ User Model 加载成功');
    console.log('✅ Post Model 加载成功\n');

    // 使用 Model
    const user = await User.insertOne({
        username: 'john',
        email: 'john@example.com',
        age: 25
    });

    console.log('✅ 插入用户成功:', user.username);
    console.log('   createdAt:', user.createdAt, '(由 hook 自动添加)\n');

    await msq1.close();

    // 示例2: 完整配置（递归扫描）
    console.log('示例2: 完整配置（递归扫描）\n');

    const msq2 = new MonSQLize({
        type: 'mongodb',
        databaseName: 'test_auto_load',
        config: { useMemoryServer: true },
        models: {
            path: modelsDir,
            pattern: '*.model.js',
            recursive: true  // ← 递归扫描子目录
        }
    });

    await msq2.connect();

    // 子目录的 Model 也会被加载
    const Role = msq2.model('roles');  // 来自 models/admin/role.model.js

    console.log('✅ Role Model 加载成功（来自子目录）\n');

    await msq2.close();

    // 示例3: Schema 验证自动生效
    console.log('示例3: Schema 验证自动生效\n');

    const msq3 = new MonSQLize({
        type: 'mongodb',
        databaseName: 'test_auto_load',
        config: { useMemoryServer: true },
        models: modelsDir
    });

    await msq3.connect();

    const UserModel = msq3.model('users');

    // ❌ Schema 验证失败
    try {
        await UserModel.insertOne({
            username: 'jo',  // 太短，验证失败
            email: 'invalid'  // 邮箱格式错误
        });
    } catch (err) {
        console.log('❌ 验证失败（预期行为）:', err.message);
    }

    // ✅ 正确的数据
    const validUser = await UserModel.insertOne({
        username: 'alice',
        email: 'alice@example.com',
        age: 28
    });

    console.log('✅ 插入成功:', validUser.username);

    // 使用自定义方法
    const foundUser = await UserModel.findByUsername('alice');
    console.log('✅ 查询成功:', foundUser.greet());  // "Hello, alice!"

    await msq3.close();

    console.log('\n========================================');
    console.log('  示例执行完成');
    console.log('========================================');
})().catch(err => {
    console.error('示例执行失败:', err);
    process.exit(1);
});

