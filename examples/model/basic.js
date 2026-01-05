/**
 * Model 基础使用示例
 *
 * 演示：
 * - Model 定义
 * - Schema 验证
 * - CRUD 操作
 * - 实例方法和静态方法
 * - timestamps 和 softDelete（v1.0.3+）
 */

const MonSQLize = require('../../lib/index');
const { Model } = MonSQLize;

// 定义 User Model
Model.define('users', {
    schema: (dsl) => dsl({
        username: 'string:3-32!',
        email: 'email!',
        age: 'number:0-120',
        status: 'string'.default('active')
    }),
    options: {
        timestamps: true,  // v1.0.3+: 自动管理 createdAt/updatedAt
        softDelete: true   // v1.0.3+: 软删除（标记删除，支持恢复）
    },
    methods: (model) => ({
        instance: {
            isActive() {
                return this.status === 'active';
            }
        },
        static: {
            async findByUsername(username) {
                return await model.findOne({ username });
            }
        }
    }),
    indexes: [
        { key: { username: 1 }, unique: true }
    ]
});

async function main() {
    // 连接数据库
    const msq = new MonSQLize({
        type: 'mongodb',
        databaseName: 'test',
        config: { useMemoryServer: true }
    });
    await msq.connect();
    console.log('✅ 数据库已连接');

    // 获取 Model 实例
    const User = msq.model('users');

    // 1. 数据验证
    console.log('\n1. 数据验证示例');
    const result = User.validate({
        username: 'testuser',
        email: 'test@example.com',
        age: 25
    });
    console.log('验证结果:', result.valid ? '✅ 通过' : '❌ 失败');

    // 2. 插入数据
    console.log('\n2. 插入数据');
    await User.insertOne({
        username: 'testuser',
        email: 'test@example.com',
        age: 25
    });
    console.log('✅ 数据已插入');

    // 3. 使用静态方法查询
    console.log('\n3. 使用静态方法查询');
    const user = await User.findByUsername('testuser');
    console.log('查询结果:', user);

    // 4. 使用实例方法
    console.log('\n4. 使用实例方法');
    if (user) {
        console.log('用户状态:', user.isActive() ? '活跃' : '非活跃');
    }

    // 5. 更新数据
    console.log('\n5. 更新数据');
    await User.updateOne(
        { username: 'testuser' },
        { $set: { age: 26 } }
    );
    console.log('✅ 数据已更新');

    // 6. 验证更新
    const updatedUser = await User.findByUsername('testuser');
    console.log('更新后年龄:', updatedUser.age);

    // 关闭连接
    await msq.close();
    console.log('\n✅ 示例执行完成');
    process.exit(0);
}

// 运行示例
main().catch((err) => {
    console.error(err);
    process.exit(1);
});

