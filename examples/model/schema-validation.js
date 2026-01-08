/**
 * Schema 验证示例
 *
 * 演示 v1.0.7 默认启用的 Schema 验证功能
 *
 * @since v1.0.7
 */

const MonSQLize = require('../../lib/index');
const { Model } = MonSQLize;

(async () => {
    console.log('========================================');
    console.log('  Schema 验证示例 (v1.0.7)');
    console.log('========================================\n');

    const msq = new MonSQLize({
        type: 'mongodb',
        databaseName: 'test_schema',
        config: { useMemoryServer: true }
    });

    await msq.connect();

    // 示例1: 基本验证
    console.log('示例1: 基本验证\n');

    Model.define('users', {
        schema: (dsl) => dsl({
            username: 'string:3-32!',
            email: 'email!',
            age: 'number:0-120'
        })
    });

    const User = msq.model('users');

    // ✅ 正确数据
    const user1 = await User.insertOne({
        username: 'john',
        email: 'john@example.com',
        age: 25
    });
    console.log('✅ 插入成功:', user1.username);

    // ❌ 验证失败 - 用户名太短
    try {
        await User.insertOne({
            username: 'ab',  // 太短（< 3 字符）
            email: 'test@example.com',
            age: 25
        });
    } catch (err) {
        console.log('❌ 验证失败（预期）:', err.message);
        console.log('   错误码:', err.code);
    }

    // ❌ 验证失败 - 邮箱格式错误
    try {
        await User.insertOne({
            username: 'alice',
            email: 'invalid-email',  // 邮箱格式错误
            age: 25
        });
    } catch (err) {
        console.log('❌ 验证失败（预期）:', err.message);
    }

    // ❌ 验证失败 - 年龄超出范围
    try {
        await User.insertOne({
            username: 'bob',
            email: 'bob@example.com',
            age: 150  // 超出范围（> 120）
        });
    } catch (err) {
        console.log('❌ 验证失败（预期）:', err.message);
    }

    console.log('\n示例2: 验证错误详情\n');

    // 多个字段验证失败
    try {
        await User.insertOne({
            username: 'ab',
            email: 'invalid',
            age: 150
        });
    } catch (err) {
        console.log('❌ 多个字段验证失败:');
        console.log('   错误码:', err.code);
        console.log('   错误详情:', JSON.stringify(err.errors, null, 2));
    }

    console.log('\n示例3: 可选字段\n');

    Model.define('products', {
        schema: (dsl) => dsl({
            name: 'string:1-100!',    // 必需
            price: 'number:0-!',      // 必需
            description: 'string?'    // 可选
        })
    });

    const Product = msq.model('products');

    // ✅ 不提供可选字段
    const product1 = await Product.insertOne({
        name: 'Product A',
        price: 99.99
    });
    console.log('✅ 未提供可选字段:', product1.name);

    // ✅ 提供可选字段
    const product2 = await Product.insertOne({
        name: 'Product B',
        price: 149.99,
        description: 'A great product'
    });
    console.log('✅ 提供可选字段:', product2.name);

    console.log('\n示例4: 跳过验证\n');

    // 全局禁用验证
    Model.define('logs', {
        schema: (dsl) => dsl({
            message: 'string:1-200!'
        }),
        options: { validate: false }  // 全局禁用
    });

    const Log = msq.model('logs');

    // 验证不生效，任何数据都能插入
    const log1 = await Log.insertOne({
        message: '',  // 空字符串（验证禁用）
        extra: 'any data'
    });
    console.log('✅ 全局禁用验证，插入成功');

    // 单次操作跳过验证
    const user2 = await User.insertOne(
        {
            username: 'x',  // 太短，但跳过验证
            email: 'invalid',
            age: 200
        },
        { skipValidation: true }
    );
    console.log('✅ 单次跳过验证，插入成功');

    console.log('\n示例5: 嵌套对象验证\n');

    Model.define('profiles', {
        schema: (dsl) => dsl({
            username: 'string!',
            profile: dsl({
                age: 'number!',
                email: 'email!'
            })
        })
    });

    const Profile = msq.model('profiles');

    // ✅ 正确的嵌套对象
    const profile1 = await Profile.insertOne({
        username: 'john',
        profile: {
            age: 25,
            email: 'john@example.com'
        }
    });
    console.log('✅ 嵌套对象验证通过:', profile1.username);

    // ❌ 嵌套对象验证失败
    try {
        await Profile.insertOne({
            username: 'alice',
            profile: {
                age: 'not-a-number',  // 类型错误
                email: 'invalid'  // 邮箱格式错误
            }
        });
    } catch (err) {
        console.log('❌ 嵌套对象验证失败:', err.message);
    }

    await msq.close();

    console.log('\n========================================');
    console.log('  示例执行完成');
    console.log('========================================');
})().catch(err => {
    console.error('示例执行失败:', err);
    process.exit(1);
});

