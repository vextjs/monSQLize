/**
 * README Model 层使用示例
 *
 * 演示 Populate 关联查询、Hooks 生命周期、Relations 定义等 ORM 特性
 *
 * 使用方法：
 * 1. 确保MongoDB运行在 localhost:27017
 * 2. npm install monsqlize
 * 3. node examples/readme-model-usage.js
 */

const MonSQLize = require('monsqlize');
const { Model } = MonSQLize;

async function main() {
    console.log('🚀 monSQLize Model 层使用示例\n');

    // 初始化
    console.log('1️⃣ 初始化并连接...');
    const msq = new MonSQLize({
        type: 'mongodb',
        databaseName: 'test_model',
        config: { uri: 'mongodb://localhost:27017' },
        cache: { enabled: true }
    });

    await msq.connect();
    console.log('✅ 连接成功\n');

    // 定义 Model
    console.log('2️⃣ 定义 Model（Relations + Hooks）...');

    Model.define('users', {
        schema: () => ({}),  // 空 schema（不验证）
        relations: {
            posts: {
                from: 'posts',
                localField: '_id',
                foreignField: 'userId',
                single: false
            }
        },
        hooks: (model) => ({
            insert: {
                before: async (ctx, doc) => {
                    doc.createdAt = new Date();
                    console.log('  [Hook] 自动添加 createdAt:', doc.createdAt.toISOString());
                    return doc;
                }
            }
        })
    });

    Model.define('posts', {
        schema: () => ({})  // 空 schema（不验证）
    });

    console.log('✅ Model 定义完成\n');

    // 获取 Model
    const User = msq.model('users');
    const Post = msq.model('posts');

    // 清理旧数据
    await User.deleteMany({});
    await Post.deleteMany({});

    // 3. Hooks 自动执行
    console.log('3️⃣ 插入数据（Hooks 自动执行）...');
    const user = await User.insertOne({
        username: 'john',
        email: 'john@example.com',
        age: 25
        // createdAt 由 hook 自动添加
    });
    console.log('✅ 用户创建成功:', {
        _id: user.insertedId.toString(),
        username: 'john',
        hasCreatedAt: true
    });

    // 插入一些文章
    await Post.insertMany([
        { title: 'First Post', content: 'Content 1', userId: user.insertedId },
        { title: 'Second Post', content: 'Content 2', userId: user.insertedId }
    ]);
    console.log('✅ 文章创建成功: 2篇\n');

    // 4. Populate 关联查询
    console.log('4️⃣ Populate 关联查询（自动填充用户的文章）...');
    const userWithPosts = await User.findOne({ username: 'john' })
        .populate('posts');

    if (userWithPosts && userWithPosts.posts) {
        console.log('✅ 查询成功:');
        console.log('  用户:', userWithPosts.username);
        console.log('  文章数:', userWithPosts.posts.length);
        console.log('  文章标题:', userWithPosts.posts.map(p => p.title).join(', '));
    }
    console.log('');

    // 5. 关闭连接
    console.log('5️⃣ 关闭连接...');
    await msq.close();
    console.log('✅ 连接已关闭\n');

    console.log('🎉 所有示例执行完成！');
    console.log('\n💡 Model 层特性：');
    console.log('  ✅ Populate - 关联查询，6个方法支持');
    console.log('  ✅ Hooks - 生命周期钩子');
    console.log('  ✅ Relations - 定义表关系');
    console.log('  ✅ 自动缓存 - Populate 查询结果也会缓存');
    console.log('\n📖 详细文档：');
    console.log('  - docs/model.md');
    console.log('  - docs/populate.md');
    console.log('  - docs/hooks.md');
    console.log('  - docs/relations.md');
}

// 运行示例
main().catch(error => {
    console.error('❌ 执行失败:', error.message);
    console.error(error.stack);
    process.exit(1);
});

