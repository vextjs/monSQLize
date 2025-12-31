/**
 * Model 高级功能示例
 *
 * 演示：
 * - enums 枚举
 * - hooks 钩子
 * - 复杂 schema
 * - 关联查询
 */

const MonSQLize = require('../../lib/index');
const { Model } = MonSQLize;

// 定义 User Model（完整功能）
Model.define('users', {
    enums: {
        role: 'admin|user|guest',
        status: 'active|inactive|banned'
    },
    schema: function(dsl) {
        return dsl({
            username: 'string:3-32!',
            email: 'email!',
            password: 'string!'.pattern(/^[a-zA-Z0-9]{6,30}$/),
            role: this.enums.role.default('user'),
            status: this.enums.status.default('active'),
            loginCount: 'number'.default(0),
            lastLoginAt: 'date'
        });
    },
    options: {
        timestamps: true  // v1.0.3+: 自动管理 createdAt/updatedAt
    },
    methods: (model) => ({
        instance: {
            checkPassword(password) {
                return this.password === password;
            },
            isAdmin() {
                return this.role === 'admin';
            },
            async incrementLogin() {
                return await model.updateOne(
                    { _id: this._id },
                    {
                        $inc: { loginCount: 1 },
                        $set: { lastLoginAt: new Date() }
                    }
                );
            }
        },
        static: {
            async findByUsername(username) {
                return await model.findOne({ username });
            },
            async findAdmins() {
                return await model.find({ role: 'admin' });
            }
        }
    }),
    hooks: (model) => ({
        insert: {
            after: async (ctx, result) => {
                console.log('[Hook] 插入后 - 插入ID:', result.insertedId);
            }
        },
        find: {
            before: (ctx, options) => {
                console.log('[Hook] 查询前 - 查询条件:', JSON.stringify(options));
            },
            after: (ctx, result) => {
                console.log('[Hook] 查询后 - 结果数量:', Array.isArray(result) ? result.length : 1);
            }
        }
    }),
    indexes: [
        { key: { username: 1 }, unique: true },
        { key: { email: 1 }, unique: true }
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
    console.log('✅ 数据库已连接\n');

    const User = msq.model('users');

    // 1. 数据验证（含 enums）
    console.log('1. 数据验证示例');
    console.log('='.repeat(50));

    const validResult = User.validate({
        username: 'admin',
        email: 'admin@example.com',
        password: 'secret123',
        role: 'admin'
    });
    console.log('✅ 合法数据验证:', validResult.valid);

    const invalidResult = User.validate({
        username: 'ad',  // 太短
        email: 'invalid',  // 格式错误
        password: 'abc',  // 格式错误
        role: 'superadmin'  // 不在枚举中
    });
    console.log('❌ 非法数据验证:', invalidResult.valid);
    console.log('错误详情:', invalidResult.errors.map(e => e.message));

    // 2. 插入数据（触发 hooks）
    console.log('\n2. 插入数据（触发 hooks）');
    console.log('='.repeat(50));

    await User.insertOne({
        username: 'admin',
        email: 'admin@example.com',
        password: 'secret123',
        role: 'admin'
    });

    await User.insertOne({
        username: 'user1',
        email: 'user1@example.com',
        password: 'password123',
        role: 'user'
    });

    // 3. 使用静态方法查询（触发 hooks）
    console.log('\n3. 使用静态方法查询');
    console.log('='.repeat(50));

    const admin = await User.findByUsername('admin');
    console.log('管理员信息:', {
        username: admin.username,
        role: admin.role,
        createdAt: admin.createdAt
    });

    const admins = await User.findAdmins();
    console.log('管理员数量:', admins.length);

    // 4. 使用实例方法
    console.log('\n4. 使用实例方法');
    console.log('='.repeat(50));

    console.log('密码验证 (secret123):', admin.checkPassword('secret123') ? '✅ 正确' : '❌ 错误');
    console.log('密码验证 (wrong):', admin.checkPassword('wrong') ? '✅ 正确' : '❌ 错误');
    console.log('是否管理员:', admin.isAdmin() ? '✅ 是' : '❌ 否');

    // 5. 登录计数（实例方法 + 更新）
    console.log('\n5. 登录计数');
    console.log('='.repeat(50));

    console.log('初始登录次数:', admin.loginCount);
    await admin.incrementLogin();
    await admin.incrementLogin();

    const updated = await User.findByUsername('admin');
    console.log('更新后登录次数:', updated.loginCount);
    console.log('最后登录时间:', updated.lastLoginAt);

    // 6. hooks 中使用 ctx 传递数据
    console.log('\n6. hooks 上下文传递');
    console.log('='.repeat(50));

    Model.define('posts', {
        schema: (dsl) => dsl({
            title: 'string!',
            content: 'string!'
        }),
        hooks: (model) => ({
            insert: {
                before: async (ctx, docs) => {
                    ctx.timestamp = Date.now();
                    return docs;
                },
                after: async (ctx, result) => {
                    const duration = Date.now() - ctx.timestamp;
                    console.log(`插入耗时: ${duration}ms`);
                }
            }
        })
    });

    const Post = msq.model('posts');
    await Post.insertOne({
        title: '测试文章',
        content: '这是测试内容'
    });

    // 关闭连接
    await msq.close();
    console.log('\n✅ 高级示例执行完成');
    process.exit(0);
}

// 运行示例
main().catch((err) => {
    console.error(err);
    process.exit(1);
});

