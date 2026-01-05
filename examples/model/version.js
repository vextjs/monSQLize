/**
 * Model - 乐观锁版本控制（Version）使用示例
 *
 * 本示例展示如何使用乐观锁版本控制功能：
 * 1. 基础配置和使用
 * 2. 并发冲突检测
 * 3. 与其他功能协同
 * 4. 最佳实践
 *
 * 运行示例：
 * ```bash
 * node examples/model/version.js
 * ```
 */

const MonSQLize = require('../../lib/index');
const { Model } = MonSQLize;

// ========== 1. 基础配置 ==========

console.log('\n========== 1. 基础配置 ==========\n');

// 定义 Model（启用版本控制）
Model.define('users', {
    schema: (dsl) => dsl({
        username: 'string!',
        email: 'string!',
        status: 'string'
    }),
    options: {
        version: true  // 启用版本控制（默认字段名 version）
    }
});

// 定义 Model（自定义字段名）
Model.define('products', {
    schema: (dsl) => dsl({
        name: 'string!',
        price: 'number!'
    }),
    options: {
        version: {
            enabled: true,
            field: '__v'  // 自定义字段名
        }
    }
});

// 定义 Model（所有功能协同）
Model.define('posts', {
    schema: (dsl) => dsl({
        title: 'string!',
        content: 'string!'
    }),
    options: {
        timestamps: true,  // 自动时间戳
        softDelete: true,  // 软删除
        version: true      // 版本控制
    }
});

// ========== 2. 插入时自动初始化 ==========

async function example1_basicUsage() {
    console.log('\n========== 2. 插入时自动初始化 ==========\n');

    const msq = new MonSQLize({
        type: 'mongodb',
        databaseName: 'test_version_example',
        config: { useMemoryServer: true }
    });

    try {
        await msq.connect();
        const User = msq.model('users');

        // 插入文档
        console.log('插入用户...');
        const result = await User.insertOne({
            username: 'john',
            email: 'john@example.com',
            status: 'active'
        });

        // 查询文档
        const user = await User.findOne({ _id: result.insertedId });
        console.log('插入后的文档:', {
            _id: user._id.toString(),
            username: user.username,
            email: user.email,
            version: user.version  // 自动初始化为 0
        });

        console.log('✅ 版本号已自动初始化为 0');

        return user._id;
    } finally {
        await msq.close();
        Model._clear();
    }
}

// ========== 3. 更新时自动递增 ==========

async function example2_autoIncrement() {
    console.log('\n========== 3. 更新时自动递增 ==========\n');

    // 重新定义 Model
    Model.define('users', {
        schema: (dsl) => dsl({
            username: 'string!',
            email: 'string!',
            status: 'string'
        }),
        options: {
            version: true
        }
    });

    const msq = new MonSQLize({
        type: 'mongodb',
        databaseName: 'test_version_example',
        config: { useMemoryServer: true }
    });

    try {
        await msq.connect();
        const User = msq.model('users');

        // 插入用户
        const result = await User.insertOne({
            username: 'jane',
            email: 'jane@example.com',
            status: 'pending'
        });
        const userId = result.insertedId;

        // 第一次更新
        console.log('第一次更新...');
        await User.updateOne({ _id: userId }, { $set: { status: 'active' } });
        let user = await User.findOne({ _id: userId });
        console.log('第一次更新后 version:', user.version);  // 1

        // 第二次更新
        console.log('第二次更新...');
        await User.updateOne({ _id: userId }, { $set: { status: 'verified' } });
        user = await User.findOne({ _id: userId });
        console.log('第二次更新后 version:', user.version);  // 2

        // 第三次更新
        console.log('第三次更新...');
        await User.updateOne({ _id: userId }, { $set: { status: 'premium' } });
        user = await User.findOne({ _id: userId });
        console.log('第三次更新后 version:', user.version);  // 3

        console.log('✅ 版本号每次更新自动递增');
    } finally {
        await msq.close();
        Model._clear();
    }
}

// ========== 4. 并发冲突检测 ==========

async function example3_concurrencyControl() {
    console.log('\n========== 4. 并发冲突检测 ==========\n');

    // 重新定义 Model
    Model.define('users', {
        schema: (dsl) => dsl({
            username: 'string!',
            email: 'string!',
            status: 'string'
        }),
        options: {
            version: true
        }
    });

    const msq = new MonSQLize({
        type: 'mongodb',
        databaseName: 'test_version_example',
        config: { useMemoryServer: true }
    });

    try {
        await msq.connect();
        const User = msq.model('users');

        // 插入用户
        const result = await User.insertOne({
            username: 'alice',
            email: 'alice@example.com',
            status: 'pending'
        });
        const userId = result.insertedId;

        console.log('模拟并发场景：两个用户同时读取数据...\n');

        // 用户 A 读取数据
        const userA = await User.findOne({ _id: userId });
        console.log('用户 A 读取到的 version:', userA.version);  // 0

        // 用户 B 读取数据
        const userB = await User.findOne({ _id: userId });
        console.log('用户 B 读取到的 version:', userB.version);  // 0

        console.log('\n用户 A 先更新...');
        // 用户 A 先更新（带版本号）
        const resultA = await User.updateOne(
            { _id: userId, version: userA.version },
            { $set: { status: 'active' } }
        );
        console.log('用户 A 更新结果:', {
            modifiedCount: resultA.modifiedCount,
            status: resultA.modifiedCount > 0 ? '✅ 成功' : '❌ 失败'
        });

        console.log('\n用户 B 尝试更新（使用旧版本号）...');
        // 用户 B 尝试更新（版本号已过期）
        const resultB = await User.updateOne(
            { _id: userId, version: userB.version },  // 版本号 0 已过期
            { $set: { status: 'inactive' } }
        );
        console.log('用户 B 更新结果:', {
            modifiedCount: resultB.modifiedCount,
            status: resultB.modifiedCount > 0 ? '✅ 成功' : '❌ 失败（版本号冲突）'
        });

        // 查看最终状态
        const finalUser = await User.findOne({ _id: userId });
        console.log('\n最终状态:', {
            status: finalUser.status,  // 'active' (用户 A 的更新)
            version: finalUser.version  // 1
        });

        console.log('\n✅ 并发冲突检测成功，用户 B 的更新被阻止');

        // 用户 B 重新读取并重试
        console.log('\n用户 B 重新读取并重试...');
        const latestUser = await User.findOne({ _id: userId });
        const resultB2 = await User.updateOne(
            { _id: userId, version: latestUser.version },  // 使用最新版本号
            { $set: { status: 'inactive' } }
        );
        console.log('用户 B 重试结果:', {
            modifiedCount: resultB2.modifiedCount,
            status: resultB2.modifiedCount > 0 ? '✅ 成功' : '❌ 失败'
        });

        console.log('✅ 使用最新版本号后更新成功');
    } finally {
        await msq.close();
        Model._clear();
    }
}

// ========== 5. 与其他功能协同 ==========

async function example4_featureIntegration() {
    console.log('\n========== 5. 与其他功能协同 ==========\n');

    // 重新定义 Model
    Model.define('posts', {
        schema: (dsl) => dsl({
            title: 'string!',
            content: 'string!'
        }),
        options: {
            timestamps: true,
            softDelete: true,
            version: true
        }
    });

    const msq = new MonSQLize({
        type: 'mongodb',
        databaseName: 'test_version_example',
        config: { useMemoryServer: true }
    });

    try {
        await msq.connect();
        const Post = msq.model('posts');

        // 插入文章（timestamps + version）
        console.log('插入文章...');
        const result = await Post.insertOne({
            title: 'Hello World',
            content: 'This is my first post'
        });
        const postId = result.insertedId;

        let post = await Post.findOne({ _id: postId });
        console.log('插入后的文档:', {
            _id: post._id.toString(),
            title: post.title,
            version: post.version,  // 0
            createdAt: post.createdAt.toISOString(),
            updatedAt: post.updatedAt.toISOString()
        });

        // 更新文章
        console.log('\n更新文章...');
        await new Promise(resolve => setTimeout(resolve, 100));
        await Post.updateOne({ _id: postId }, { $set: { title: 'Hello monSQLize' } });

        post = await Post.findOne({ _id: postId });
        console.log('更新后的文档:', {
            title: post.title,
            version: post.version,  // 1（递增）
            updatedAt: post.updatedAt.toISOString()  // 已更新
        });

        // 软删除文章
        console.log('\n软删除文章...');
        await Post.deleteOne({ _id: postId, version: post.version });

        post = await Post.findOneWithDeleted({ _id: postId });
        console.log('软删除后的文档:', {
            title: post.title,
            version: post.version,  // 2（软删除也递增）
            deletedAt: post.deletedAt.toISOString()
        });

        console.log('✅ 所有功能协同工作正常');
    } finally {
        await msq.close();
        Model._clear();
    }
}

// ========== 6. 最佳实践：并发更新重试机制 ==========

async function example5_retryMechanism() {
    console.log('\n========== 6. 最佳实践：并发更新重试机制 ==========\n');

    // 重新定义 Model
    Model.define('users', {
        schema: (dsl) => dsl({
            username: 'string!',
            email: 'string!',
            status: 'string'
        }),
        options: {
            version: true
        }
    });

    const msq = new MonSQLize({
        type: 'mongodb',
        databaseName: 'test_version_example',
        config: { useMemoryServer: true }
    });

    try {
        await msq.connect();
        const User = msq.model('users');

        // 插入用户
        const result = await User.insertOne({
            username: 'bob',
            email: 'bob@example.com',
            status: 'pending'
        });
        const userId = result.insertedId;

        // 定义带重试的更新函数
        async function updateUserStatus(userId, newStatus, maxRetries = 3) {
            for (let i = 0; i < maxRetries; i++) {
                // 读取最新数据
                const user = await User.findOne({ _id: userId });
                if (!user) throw new Error('User not found');

                console.log(`尝试 ${i + 1}/${maxRetries}: 当前版本号 ${user.version}`);

                // 带版本号更新
                const result = await User.updateOne(
                    { _id: userId, version: user.version },
                    { $set: { status: newStatus } }
                );

                if (result.modifiedCount > 0) {
                    console.log('✅ 更新成功');
                    return { success: true, retries: i };
                }

                // 版本号冲突，重试
                console.log('❌ 版本号冲突，重试...');
                await new Promise(resolve => setTimeout(resolve, 10));
            }

            throw new Error('Update failed due to concurrent modification');
        }

        // 模拟并发更新
        console.log('启动并发更新测试...\n');

        const promises = [
            updateUserStatus(userId, 'active'),
            updateUserStatus(userId, 'verified'),
            updateUserStatus(userId, 'premium')
        ];

        const results = await Promise.allSettled(promises);

        console.log('\n并发更新结果:');
        results.forEach((result, index) => {
            if (result.status === 'fulfilled') {
                console.log(`任务 ${index + 1}: ✅ 成功，重试次数 ${result.value.retries}`);
            } else {
                console.log(`任务 ${index + 1}: ❌ 失败，${result.reason.message}`);
            }
        });

        const finalUser = await User.findOne({ _id: userId });
        console.log('\n最终状态:', {
            status: finalUser.status,
            version: finalUser.version
        });

        console.log('\n✅ 重试机制确保了数据一致性');
    } finally {
        await msq.close();
        Model._clear();
    }
}

// ========== 7. 批量操作 ==========

async function example6_batchOperations() {
    console.log('\n========== 7. 批量操作 ==========\n');

    // 重新定义 Model
    Model.define('users', {
        schema: (dsl) => dsl({
            username: 'string!',
            email: 'string!',
            status: 'string'
        }),
        options: {
            version: true
        }
    });

    const msq = new MonSQLize({
        type: 'mongodb',
        databaseName: 'test_version_example',
        config: { useMemoryServer: true }
    });

    try {
        await msq.connect();
        const User = msq.model('users');

        // 批量插入
        console.log('批量插入用户...');
        await User.insertMany([
            { username: 'user1', email: 'user1@example.com', status: 'pending' },
            { username: 'user2', email: 'user2@example.com', status: 'pending' },
            { username: 'user3', email: 'user3@example.com', status: 'pending' }
        ]);

        let users = await User.find({});
        console.log('插入后的版本号:', users.map(u => ({ username: u.username, version: u.version })));

        // 批量更新
        console.log('\n批量更新状态...');
        await User.updateMany(
            { status: 'pending' },
            { $set: { status: 'active' } }
        );

        users = await User.find({});
        console.log('更新后的版本号:', users.map(u => ({ username: u.username, version: u.version })));

        console.log('✅ 批量操作时所有文档的版本号都会递增');
    } finally {
        await msq.close();
        Model._clear();
    }
}

// ========== 8. 自定义字段名 ==========

async function example7_customFieldName() {
    console.log('\n========== 8. 自定义字段名 ==========\n');

    // 重新定义 Model
    Model.define('products', {
        schema: (dsl) => dsl({
            name: 'string!',
            price: 'number!'
        }),
        options: {
            version: {
                enabled: true,
                field: '__v'
            }
        }
    });

    const msq = new MonSQLize({
        type: 'mongodb',
        databaseName: 'test_version_example',
        config: { useMemoryServer: true }
    });

    try {
        await msq.connect();
        const Product = msq.model('products');

        // 插入产品
        console.log('插入产品（使用 __v 作为版本字段）...');
        const result = await Product.insertOne({
            name: 'iPhone',
            price: 999
        });

        const product = await Product.findOne({ _id: result.insertedId });
        console.log('插入后的文档:', {
            _id: product._id.toString(),
            name: product.name,
            price: product.price,
            __v: product.__v  // 自定义字段名
        });

        // 更新时使用自定义字段名
        console.log('\n更新产品（使用 __v 检测冲突）...');
        await Product.updateOne(
            { _id: result.insertedId, __v: 0 },
            { $set: { price: 1099 } }
        );

        const updated = await Product.findOne({ _id: result.insertedId });
        console.log('更新后的文档:', {
            price: updated.price,
            __v: updated.__v
        });

        console.log('✅ 自定义字段名工作正常');
    } finally {
        await msq.close();
        Model._clear();
    }
}

// ========== 运行所有示例 ==========

async function runAllExamples() {
    console.log('\n');
    console.log('='.repeat(60));
    console.log('Model - 乐观锁版本控制（Version）完整示例');
    console.log('='.repeat(60));

    try {
        await example1_basicUsage();
        await example2_autoIncrement();
        await example3_concurrencyControl();
        await example4_featureIntegration();
        await example5_retryMechanism();
        await example6_batchOperations();
        await example7_customFieldName();

        console.log('\n' + '='.repeat(60));
        console.log('✅ 所有示例运行完成');
        console.log('='.repeat(60) + '\n');
    } catch (error) {
        console.error('❌ 示例运行失败:', error);
        process.exit(1);
    }
}

// 如果直接运行此文件
if (require.main === module) {
    runAllExamples().catch(console.error);
}

module.exports = {
    example1_basicUsage,
    example2_autoIncrement,
    example3_concurrencyControl,
    example4_featureIntegration,
    example5_retryMechanism,
    example6_batchOperations,
    example7_customFieldName
};

