/**
 * Relations 和 Populate 示例
 *
 * 演示如何使用 relations 定义集合之间的关系，并使用 populate 填充关联数据
 *
 * @example
 * node examples/model/relations.js
 */

const MonSQLize = require('../../lib/index');
const { Model } = MonSQLize;

async function main() {
    // 1. 连接数据库
    const msq = new MonSQLize({
        type: 'mongodb',
        databaseName: 'test_relations',
        config: { useMemoryServer: true }
    });

    await msq.connect();
    console.log('✅ 已连接到数据库（内存模式）');

    // 2. 定义 Model
    console.log('\n📝 定义 Model...');

    // User Model（用户）
    Model.define('users', {
        schema: (dsl) => dsl({
            username: 'string:3-32!',
            email: 'email!',
            profileId: 'objectId',
            createdAt: 'date'
        }),
        indexes: [
            { key: { username: 1 }, unique: true },
            { key: { profileId: 1 } }
        ],
        relations: {
            // one-to-one: 用户 → 个人资料
            profile: {
                from: 'profiles',
                localField: 'profileId',
                foreignField: '_id',
                single: true
            },
            // one-to-many: 用户 → 文章列表
            posts: {
                from: 'posts',
                localField: '_id',
                foreignField: 'authorId',
                single: false
            }
        }
    });

    // Profile Model（个人资料）
    Model.define('profiles', {
        schema: (dsl) => dsl({
            bio: 'string',
            avatar: 'string',
            location: 'string',
            website: 'string',
            createdAt: 'date'
        })
    });

    // Post Model（文章）
    Model.define('posts', {
        schema: (dsl) => dsl({
            title: 'string!',
            content: 'string!',
            authorId: 'objectId!',
            status: ['draft', 'published'],
            createdAt: 'date'
        }),
        indexes: [
            { key: { authorId: 1 } },
            { key: { status: 1, createdAt: -1 } }
        ],
        relations: {
            // many-to-one: 文章 → 作者
            author: {
                from: 'users',
                localField: 'authorId',
                foreignField: '_id',
                single: true
            }
        }
    });

    // 获取 Model 实例
    const User = msq.model('users');
    const Profile = msq.model('profiles');
    const Post = msq.model('posts');

    // 3. 清空测试数据
    console.log('\n🗑️  清空测试数据...');
    await User.deleteMany({});
    await Profile.deleteMany({});
    await Post.deleteMany({});

    // 4. 插入测试数据
    console.log('\n📝 插入测试数据...');

    // 插入个人资料
    const profile1 = await Profile.insertOne({
        bio: 'Software Engineer | Open Source Enthusiast',
        avatar: 'https://example.com/avatar/john.jpg',
        location: 'San Francisco, CA',
        website: 'https://johndoe.dev',
        createdAt: new Date()
    });

    const profile2 = await Profile.insertOne({
        bio: 'Full Stack Developer | Tech Blogger',
        avatar: 'https://example.com/avatar/jane.jpg',
        location: 'New York, NY',
        website: 'https://janesmith.com',
        createdAt: new Date()
    });

    console.log('✅ 已插入 2 个 profiles');

    // 插入用户
    const user1 = await User.insertOne({
        username: 'johndoe',
        email: 'john@example.com',
        profileId: profile1.insertedId,
        createdAt: new Date()
    });

    const user2 = await User.insertOne({
        username: 'janesmith',
        email: 'jane@example.com',
        profileId: profile2.insertedId,
        createdAt: new Date()
    });

    console.log('✅ 已插入 2 个 users');

    // 插入文章
    const postsData = [
        {
            title: 'Getting Started with MongoDB',
            content: 'MongoDB is a NoSQL database...',
            authorId: user1.insertedId,
            status: 'published',
            createdAt: new Date('2026-01-01')
        },
        {
            title: 'Advanced MongoDB Queries',
            content: 'In this tutorial, we will explore...',
            authorId: user1.insertedId,
            status: 'published',
            createdAt: new Date('2026-01-05')
        },
        {
            title: 'Draft: MongoDB Performance Tips',
            content: 'This is a draft article...',
            authorId: user1.insertedId,
            status: 'draft',
            createdAt: new Date('2026-01-06')
        },
        {
            title: 'JavaScript Best Practices',
            content: 'Clean code is essential...',
            authorId: user2.insertedId,
            status: 'published',
            createdAt: new Date('2026-01-03')
        }
    ];

    await Post.insertMany(postsData);
    console.log('✅ 已插入 4 个 posts');

    // 5. 示例 1: one-to-one populate
    console.log('\n\n=== 示例 1: one-to-one populate ===');
    console.log('查询用户并填充 profile...\n');

    // 注意：populate 需要在 await 之前调用
    const userWithProfile = await User.findOne({ username: 'johndoe' }).populate('profile');

    console.log('结果:');
    console.log(JSON.stringify({
        _id: userWithProfile._id.toString(),
        username: userWithProfile.username,
        email: userWithProfile.email,
        profileId: userWithProfile.profileId ? userWithProfile.profileId.toString() : null,
        profile: userWithProfile.profile ? {
            _id: userWithProfile.profile._id.toString(),
            bio: userWithProfile.profile.bio,
            avatar: userWithProfile.profile.avatar,
            location: userWithProfile.profile.location,
            website: userWithProfile.profile.website
        } : null
    }, null, 2));

    // 6. 示例 2: one-to-many populate
    console.log('\n\n=== 示例 2: one-to-many populate ===');
    console.log('查询用户并填充所有 posts...\n');

    const userWithPosts = await User.findOne({ username: 'johndoe' })
        .populate('posts');

    console.log('结果:');
    console.log(JSON.stringify({
        _id: userWithPosts._id.toString(),
        username: userWithPosts.username,
        posts: userWithPosts.posts.map(post => ({
            _id: post._id.toString(),
            title: post.title,
            status: post.status,
            createdAt: post.createdAt
        }))
    }, null, 2));

    // 7. 示例 3: 链式 populate
    console.log('\n\n=== 示例 3: 链式 populate ===');
    console.log('同时填充 profile 和 posts...\n');

    const userWithAll = await User.findOne({ username: 'johndoe' })
        .populate('profile')
        .populate('posts');

    console.log('结果:');
    console.log(JSON.stringify({
        _id: userWithAll._id.toString(),
        username: userWithAll.username,
        profile: userWithAll.profile ? {
            bio: userWithAll.profile.bio
        } : null,
        posts: userWithAll.posts.map(post => ({
            title: post.title,
            status: post.status
        }))
    }, null, 2));

    // 8. 示例 4: populate 选项 - select
    console.log('\n\n=== 示例 4: populate 选项 - select ===');
    console.log('只选择 profile 的部分字段...\n');

    const userWithSelectProfile = await User.findOne({ username: 'johndoe' })
        .populate('profile', { select: 'bio avatar' });

    console.log('结果:');
    console.log(JSON.stringify({
        _id: userWithSelectProfile._id.toString(),
        username: userWithSelectProfile.username,
        profile: userWithSelectProfile.profile ? {
            _id: userWithSelectProfile.profile._id.toString(),
            bio: userWithSelectProfile.profile.bio,
            avatar: userWithSelectProfile.profile.avatar,
            location: userWithSelectProfile.profile.location,  // undefined
            website: userWithSelectProfile.profile.website     // undefined
        } : null
    }, null, 2));

    // 9. 示例 5: populate 选项 - sort + limit
    console.log('\n\n=== 示例 5: populate 选项 - sort + limit ===');
    console.log('只返回最新的 2 篇文章...\n');

    const userWithSortedPosts = await User.findOne({ username: 'johndoe' })
        .populate('posts', {
            sort: { createdAt: -1 },
            limit: 2
        });

    console.log('结果:');
    console.log(JSON.stringify({
        _id: userWithSortedPosts._id.toString(),
        username: userWithSortedPosts.username,
        posts: userWithSortedPosts.posts.map(post => ({
            title: post.title,
            createdAt: post.createdAt
        }))
    }, null, 2));

    // 10. 示例 6: populate 选项 - match
    console.log('\n\n=== 示例 6: populate 选项 - match ===');
    console.log('只返回已发布的文章...\n');

    const userWithPublishedPosts = await User.findOne({ username: 'johndoe' })
        .populate('posts', {
            match: { status: 'published' },
            select: 'title status',
            sort: { createdAt: -1 }
        });

    console.log('结果:');
    console.log(JSON.stringify({
        _id: userWithPublishedPosts._id.toString(),
        username: userWithPublishedPosts.username,
        posts: userWithPublishedPosts.posts.map(post => ({
            title: post.title,
            status: post.status
        }))
    }, null, 2));

    // 11. 示例 7: many-to-one populate（反向）
    console.log('\n\n=== 示例 7: many-to-one populate（反向）===');
    console.log('查询文章并填充 author...\n');

    const postWithAuthor = await Post.findOne({ title: 'Getting Started with MongoDB' })
        .populate('author', { select: 'username email' });

    console.log('结果:');
    console.log(JSON.stringify({
        _id: postWithAuthor._id.toString(),
        title: postWithAuthor.title,
        authorId: postWithAuthor.authorId.toString(),
        author: postWithAuthor.author ? {
            _id: postWithAuthor.author._id.toString(),
            username: postWithAuthor.author.username,
            email: postWithAuthor.author.email
        } : null
    }, null, 2));

    // 12. 示例 8: 批量查询 + populate
    console.log('\n\n=== 示例 8: 批量查询 + populate ===');
    console.log('查询所有用户并填充 profile...\n');

    const allUsers = await User.find({}).populate('profile', { select: 'bio location' });

    console.log('结果:');
    console.log(JSON.stringify(allUsers.map(user => ({
        _id: user._id.toString(),
        username: user.username,
        profile: user.profile ? {
            bio: user.profile.bio,
            location: user.profile.location
        } : null
    })), null, 2));

    // 13. 示例 9: 外键为 null 的情况
    console.log('\n\n=== 示例 9: 外键为 null 的情况 ===');
    console.log('插入一个没有 profile 的用户...\n');

    await User.insertOne({
        username: 'noProfile',
        email: 'noprofile@example.com',
        profileId: null,
        createdAt: new Date()
    });

    const userNoProfile = await User.findOne({ username: 'noProfile' })
        .populate('profile');

    console.log('结果:');
    console.log(JSON.stringify({
        _id: userNoProfile._id.toString(),
        username: userNoProfile.username,
        profileId: userNoProfile.profileId,
        profile: userNoProfile.profile  // null
    }, null, 2));

    // 14. 总结
    console.log('\n\n=== ✅ 示例完成 ===');
    console.log('\n📊 性能统计:');
    console.log('- 查询用户 + populate profile: 2 次查询（users + profiles）');
    console.log('- 查询用户 + populate posts: 2 次查询（users + posts）');
    console.log('- 查询 N 个用户 + populate: 2 次查询（避免 N+1 问题）');

    console.log('\n💡 提示:');
    console.log('- 使用 select 只返回需要的字段');
    console.log('- 使用 match 过滤关联数据');
    console.log('- 使用 sort + limit 限制返回数量');
    console.log('- 为外键字段创建索引');

    // 关闭连接
    await msq.close();
    console.log('\n✅ 已关闭数据库连接');
}

// 运行示例
main().catch(console.error);

