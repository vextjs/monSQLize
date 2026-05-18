/**
 * Model Populate 选项组合和特殊查询方法测试
 *
 * 目标：测试 Populate 的高级功能和边界情况
 *
 * 测试内容：
 * 1. Populate 选项组合（5 个测试）
 * 2. 特殊查询方法 populate 支持（3 个测试）
 */

const { expect } = require('chai');
const MonSQLize = require('../../../lib/index');
const { Model } = MonSQLize;

describe('Model Populate 选项组合和特殊查询方法测试', () => {
    let msq;
    let User, Post;

    before(async function() {
        this.timeout(30000);


        // 连接 monSQLize
        msq = new MonSQLize({
            type: 'mongodb',
            config: { useMemoryServer: true }
        });
        await msq.connect();
    });

    after(async function() {
        this.timeout(10000);

        if (msq) {
            await msq.close();
        }
    });

    beforeEach(async () => {
        // 清理 Model 注册
        Model._clear();

        // 定义 Model
        Model.define('combo_users', {
            schema: (dsl) => dsl({
                username: 'string!',
                email: 'string'     // ✅ 可选（移除 ?）
            }),
            relations: {
                posts: {
                    from: 'combo_posts',
                    localField: '_id',
                    foreignField: 'authorId',
                    single: false
                }
            }
        });

        Model.define('combo_posts', {
            schema: (dsl) => dsl({
                title: 'string!',
                content: 'string',     // ✅ 可选（移除 ?）
                status: 'string',      // ✅ 可选
                views: 'number',       // ✅ 可选
                authorId: 'any',       // ✅ 使用 any 接受 ObjectId 对象
                createdAt: 'any'       // ✅ 使用 any 类型接受 Date 对象
            })
        });

        User = msq.model('combo_users');
        Post = msq.model('combo_posts');

        // 清空集合
        await User.deleteMany({});
        await Post.deleteMany({});
    });

    // ========== 1. Populate 选项组合（5 个） ==========

    describe('1. Populate 选项组合', () => {
        it('应该同时支持 select + sort + limit', async () => {
            // 插入测试数据
            const user = await User.insertOne({ username: 'john', email: 'john@example.com' });
            const userId = user.insertedId;

            // 插入 5 篇文章
            for (let i = 1; i <= 5; i++) {
                await Post.insertOne({
                    title: `Post ${i}`,
                    content: `Content ${i}`,
                    status: 'published',
                    views: i * 100,
                    authorId: userId,
                    createdAt: new Date(2024, 0, i)  // 2024-01-01 到 2024-01-05
                });
            }

            // populate：select + sort + limit
            const result = await User.findOne({ _id: userId }).populate({
                path: 'posts',
                select: 'title views',  // 只选择 title 和 views
                sort: { views: -1 },    // 按 views 降序
                limit: 3                // 只取前 3 个
            });

            expect(result).to.be.an('object');
            expect(result.posts).to.be.an('array');
            expect(result.posts).to.have.lengthOf(3);

            // 验证字段选择
            expect(result.posts[0]).to.have.property('_id');
            expect(result.posts[0]).to.have.property('title');
            expect(result.posts[0]).to.have.property('views');
            expect(result.posts[0]).to.not.have.property('content');
            expect(result.posts[0]).to.not.have.property('status');

            // 验证排序
            expect(result.posts[0].views).to.equal(500);  // Post 5
            expect(result.posts[1].views).to.equal(400);  // Post 4
            expect(result.posts[2].views).to.equal(300);  // Post 3
        });

        it('应该在 match 过滤后应用 limit', async () => {
            // 插入测试数据
            const user = await User.insertOne({ username: 'john' });
            const userId = user.insertedId;

            // 插入不同状态的文章
            await Post.insertOne({ title: 'Draft 1', status: 'draft', authorId: userId });
            await Post.insertOne({ title: 'Published 1', status: 'published', authorId: userId });
            await Post.insertOne({ title: 'Published 2', status: 'published', authorId: userId });
            await Post.insertOne({ title: 'Published 3', status: 'published', authorId: userId });
            await Post.insertOne({ title: 'Draft 2', status: 'draft', authorId: userId });

            // populate：match + limit
            const result = await User.findOne({ _id: userId }).populate({
                path: 'posts',
                match: { status: 'published' },  // 过滤出 published 状态
                limit: 2                          // limit 应用在过滤后
            });

            expect(result).to.be.an('object');
            expect(result.posts).to.be.an('array');
            expect(result.posts).to.have.lengthOf(2);  // 过滤后有 3 篇，limit 2

            // 验证所有返回的 posts 都是 published 状态
            result.posts.forEach(post => {
                expect(post.status).to.equal('published');
            });
        });

        it('应该支持 skip + limit 分页', async () => {
            // 插入测试数据
            const user = await User.insertOne({ username: 'john' });
            const userId = user.insertedId;

            // 插入 10 篇文章
            for (let i = 1; i <= 10; i++) {
                await Post.insertOne({
                    title: `Post ${i}`,
                    authorId: userId,
                    createdAt: new Date(2024, 0, i)
                });
            }

            // 第 2 页（skip 3, limit 3）
            const result = await User.findOne({ _id: userId }).populate({
                path: 'posts',
                sort: { createdAt: 1 },  // 按日期升序
                skip: 3,                 // 跳过前 3 个
                limit: 3                 // 取 3 个
            });

            expect(result).to.be.an('object');
            expect(result.posts).to.be.an('array');
            expect(result.posts).to.have.lengthOf(3);

            // 验证是第 4、5、6 篇文章
            expect(result.posts[0].title).to.equal('Post 4');
            expect(result.posts[1].title).to.equal('Post 5');
            expect(result.posts[2].title).to.equal('Post 6');
        });

        it('应该在嵌套 populate 中正确传递所有选项', async () => {
            // 重新定义 Model 以包含 comments 关系
            Model._clear();

            Model.define('combo_users', {
                schema: (dsl) => dsl({
                    username: 'string!',
                    email: 'string?'
                }),
                relations: {
                    posts: {
                        from: 'combo_posts',
                        localField: '_id',
                        foreignField: 'authorId',
                        single: false
                    }
                }
            });

            Model.define('combo_posts', {
                schema: (dsl) => dsl({
                    title: 'string!',
                    content: 'string',
                    status: 'string',
                    views: 'number',
                    authorId: 'any',      // ✅ 使用 any 接受 ObjectId 对象
                    createdAt: 'any'      // ✅ 使用 any 接受 Date 对象
                }),
                relations: {
                    comments: {
                        from: 'combo_comments',
                        localField: '_id',
                        foreignField: 'postId',
                        single: false
                    }
                }
            });

            Model.define('combo_comments', {
                schema: (dsl) => dsl({
                    content: 'string!',
                    author: 'string',
                    likes: 'number',
                    postId: 'any'         // ✅ 使用 any 接受 ObjectId 对象
                })
            });

            User = msq.model('combo_users');
            Post = msq.model('combo_posts');
            const Comment = msq.model('combo_comments');

            // 插入测试数据
            const user = await User.insertOne({ username: 'john' });
            const userId = user.insertedId;

            const post = await Post.insertOne({ title: 'My Post', authorId: userId });
            const postId = post.insertedId;

            // 插入 5 条评论
            for (let i = 1; i <= 5; i++) {
                await Comment.insertOne({
                    content: `Comment ${i}`,
                    author: `User ${i}`,
                    likes: i * 10,
                    postId
                });
            }

            // 嵌套 populate 带所有选项
            const result = await User.findOne({ _id: userId }).populate({
                path: 'posts',
                populate: {
                    path: 'comments',
                    select: 'content likes',  // 只选择 content 和 likes
                    sort: { likes: -1 },      // 按 likes 降序
                    limit: 2                  // 只取前 2 个
                }
            });

            expect(result).to.be.an('object');
            expect(result.posts).to.be.an('array');
            expect(result.posts).to.have.lengthOf(1);

            const populatedPost = result.posts[0];
            expect(populatedPost.comments).to.be.an('array');
            expect(populatedPost.comments).to.have.lengthOf(2);

            // 验证字段选择
            expect(populatedPost.comments[0]).to.have.property('content');
            expect(populatedPost.comments[0]).to.have.property('likes');
            expect(populatedPost.comments[0]).to.not.have.property('author');

            // 验证排序
            expect(populatedPost.comments[0].likes).to.equal(50);  // Comment 5
            expect(populatedPost.comments[1].likes).to.equal(40);  // Comment 4
        });

        it('应该支持 sort 的多字段排序', async () => {
            // 插入测试数据
            const user = await User.insertOne({ username: 'john' });
            const userId = user.insertedId;

            // 插入文章（相同 status，不同 views）
            await Post.insertOne({ title: 'A1', status: 'published', views: 100, authorId: userId });
            await Post.insertOne({ title: 'A2', status: 'published', views: 200, authorId: userId });
            await Post.insertOne({ title: 'B1', status: 'draft', views: 150, authorId: userId });
            await Post.insertOne({ title: 'B2', status: 'draft', views: 250, authorId: userId });

            // 多字段排序：status 升序，views 降序
            const result = await User.findOne({ _id: userId }).populate({
                path: 'posts',
                sort: { status: 1, views: -1 }
            });

            expect(result).to.be.an('object');
            expect(result.posts).to.be.an('array');
            expect(result.posts).to.have.lengthOf(4);

            // 验证排序（draft < published，相同 status 内按 views 降序）
            expect(result.posts[0].title).to.equal('B2');  // draft, 250
            expect(result.posts[1].title).to.equal('B1');  // draft, 150
            expect(result.posts[2].title).to.equal('A2');  // published, 200
            expect(result.posts[3].title).to.equal('A1');  // published, 100
        });
    });

    // ========== 2. 特殊查询方法 populate 支持（3 个） ==========

    describe('2. 特殊查询方法 populate 支持', () => {
        beforeEach(async () => {
            // 插入测试数据
            const user1 = await User.insertOne({ username: 'john' });
            const user2 = await User.insertOne({ username: 'jane' });

            await Post.insertOne({ title: 'John Post 1', authorId: user1.insertedId });
            await Post.insertOne({ title: 'John Post 2', authorId: user1.insertedId });
            await Post.insertOne({ title: 'Jane Post 1', authorId: user2.insertedId });
        });

        it('findByIds 应该支持 populate', async () => {
            // 获取所有用户 ID
            const users = await User.find({});
            const userIds = users.map(u => u._id);

            // findByIds + populate
            const result = await User.findByIds(userIds).populate('posts');

            expect(result).to.be.an('array');
            expect(result).to.have.lengthOf(2);

            // 验证 populate
            const john = result.find(u => u.username === 'john');
            const jane = result.find(u => u.username === 'jane');

            expect(john.posts).to.be.an('array');
            expect(john.posts).to.have.lengthOf(2);

            expect(jane.posts).to.be.an('array');
            expect(jane.posts).to.have.lengthOf(1);
        });

        it('findAndCount 应该支持 populate', async () => {
            // findAndCount + populate
            const result = await User.findAndCount({}).populate('posts');

            expect(result).to.be.an('object');
            expect(result).to.have.property('data');
            expect(result).to.have.property('total');
            expect(result.total).to.equal(2);

            // 验证 populate
            const john = result.data.find(u => u.username === 'john');
            expect(john.posts).to.be.an('array');
            expect(john.posts).to.have.lengthOf(2);
        });

        it('findPage 应该支持 populate', async () => {
            // findPage + populate
            // 注意：findPage 需要 limit 参数，不是 pageSize
            const result = await User.findPage({ limit: 10, page: 1 }).populate('posts');

            expect(result).to.be.an('object');
            expect(result).to.have.property('items');  // findPage 返回 items，不是 data
            expect(result).to.have.property('pageInfo');  // findPage 返回 pageInfo，不是 pagination

            expect(result.items).to.be.an('array');
            expect(result.items).to.have.lengthOf(2);

            // 验证 populate
            const john = result.items.find(u => u.username === 'john');
            expect(john.posts).to.be.an('array');
            expect(john.posts).to.have.lengthOf(2);
        });
    });
});

