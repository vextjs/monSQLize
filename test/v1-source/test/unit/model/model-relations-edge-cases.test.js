/**
 * Model Relations 验证和 Populate 边界测试
 *
 * 目标：提升测试覆盖率，测试边界情况和错误处理
 *
 * 测试内容：
 * 1. Relations 验证错误（5 个测试）
 * 2. Populate 边界情况（5 个测试）
 * 3. 嵌套 Populate 错误处理（3 个测试）
 */

const { expect } = require('chai');
const MonSQLize = require('../../../lib/index');
const { Model } = MonSQLize;

describe('Model Relations 验证和 Populate 边界测试', () => {
    let msq;

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

    afterEach(() => {
        // 清理 Model 注册（测试隔离）
        Model._clear();
    });

    // ========== 1. Relations 验证错误测试（5 个） ==========

    describe('1. Relations 验证错误', () => {
        it('应该拒绝缺少 from 字段的关系定义', () => {
            expect(() => {
                Model.define('test_users', {
                    schema: (dsl) => dsl({ name: 'string!' }),
                    relations: {
                        posts: {
                            // 缺少 from
                            localField: '_id',
                            foreignField: 'userId'
                        }
                    }
                });
            }).to.throw('relations config is missing required field: from');
        });

        it('应该拒绝缺少 localField 字段的关系定义', () => {
            expect(() => {
                Model.define('test_users2', {
                    schema: (dsl) => dsl({ name: 'string!' }),
                    relations: {
                        posts: {
                            from: 'posts',
                            // 缺少 localField
                            foreignField: 'userId'
                        }
                    }
                });
            }).to.throw('relations config is missing required field: localField');
        });

        it('应该拒绝缺少 foreignField 字段的关系定义', () => {
            expect(() => {
                Model.define('test_users3', {
                    schema: (dsl) => dsl({ name: 'string!' }),
                    relations: {
                        posts: {
                            from: 'posts',
                            localField: '_id'
                            // 缺少 foreignField
                        }
                    }
                });
            }).to.throw('relations config is missing required field: foreignField');
        });

        it('应该拒绝 from 不是字符串', () => {
            expect(() => {
                Model.define('test_users4', {
                    schema: (dsl) => dsl({ name: 'string!' }),
                    relations: {
                        posts: {
                            from: 123,  // 不是字符串
                            localField: '_id',
                            foreignField: 'userId'
                        }
                    }
                });
            }).to.throw('relations.from must be a string');
        });

        it('应该拒绝 single 不是布尔值', () => {
            expect(() => {
                Model.define('test_users5', {
                    schema: (dsl) => dsl({ name: 'string!' }),
                    relations: {
                        profile: {
                            from: 'profiles',
                            localField: 'profileId',
                            foreignField: '_id',
                            single: 'yes'  // 不是布尔值
                        }
                    }
                });
            }).to.throw('relations.single must be a boolean');
        });
    });

    // ========== 2. Populate 边界情况测试（5 个） ==========

    describe('2. Populate 边界情况', () => {
        let User, Post, Comment;

        beforeEach(async () => {
            // 定义 Model
            Model.define('populate_users', {
                schema: (dsl) => dsl({
                    username: 'string!',
                    profileId: 'any'  // ✅ 使用 any 类型接受 null/undefined/ObjectId
                }),
                relations: {
                    posts: {
                        from: 'populate_posts',
                        localField: '_id',
                        foreignField: 'authorId',
                        single: false
                    },
                    profile: {
                        from: 'populate_profiles',
                        localField: 'profileId',
                        foreignField: '_id',
                        single: true
                    }
                }
            });

            Model.define('populate_posts', {
                schema: (dsl) => dsl({
                    title: 'string!',
                    authorId: 'any',      // ✅ 使用 any 接受 ObjectId 对象
                    status: 'string'       // ✅ 添加 status 字段
                }),
                relations: {
                    comments: {
                        from: 'populate_comments',
                        localField: '_id',
                        foreignField: 'postId',
                        single: false
                    }
                }
            });

            Model.define('populate_profiles', {
                schema: (dsl) => dsl({
                    bio: 'string'  // ✅ 可选（移除 ?）
                })
            });

            Model.define('populate_comments', {
                schema: (dsl) => dsl({
                    content: 'string!',
                    postId: 'any'         // ✅ 使用 any 接受 ObjectId 对象
                })
            });

            User = msq.model('populate_users');
            Post = msq.model('populate_posts');
            Comment = msq.model('populate_comments');
        });

        it('应该处理关联数据不存在的情况（外键指向不存在的文档）', async () => {
            // 插入用户（posts 关系为空，因为没有 posts）
            const user = await User.insertOne({ username: 'john' });

            // populate posts（应该返回空数组）
            const result = await User.findOne({ _id: user.insertedId }).populate('posts');

            expect(result).to.be.an('object');
            expect(result.username).to.equal('john');
            expect(result.posts).to.be.an('array');
            expect(result.posts).to.have.lengthOf(0);  // 空数组
        });

        it('应该处理外键为 null 的情况（one-to-one 关系）', async () => {
            // 插入用户，profileId 为 null
            const user = await User.insertOne({ username: 'john', profileId: null });

            // populate profile（应该返回 null）
            const result = await User.findOne({ _id: user.insertedId }).populate('profile');

            expect(result).to.be.an('object');
            expect(result.username).to.equal('john');
            expect(result.profile).to.be.null;  // null
        });

        it('应该处理外键为 undefined 的情况', async () => {
            // 插入用户，没有 profileId 字段
            const user = await User.insertOne({ username: 'john' });

            // populate profile（应该返回 null）
            const result = await User.findOne({ _id: user.insertedId }).populate('profile');

            expect(result).to.be.an('object');
            expect(result.username).to.equal('john');
            expect(result.profile).to.be.null;  // null
        });

        it('应该处理 match 过滤后无匹配数据的情况', async () => {
            // 插入数据
            const user = await User.insertOne({ username: 'john' });
            await Post.insertOne({ title: 'Draft Post', authorId: user.insertedId, status: 'draft' });
            await Post.insertOne({ title: 'Published Post', authorId: user.insertedId, status: 'published' });

            // populate posts，但 match 条件过滤掉所有数据
            const result = await User.findOne({ _id: user.insertedId }).populate({
                path: 'posts',
                match: { status: 'archived' }  // 没有 archived 状态的 post
            });

            expect(result).to.be.an('object');
            expect(result.posts).to.be.an('array');
            expect(result.posts).to.have.lengthOf(0);  // 空数组
        });

        it('应该处理 limit 为 0 的情况', async () => {
            // 插入数据
            const user = await User.insertOne({ username: 'john' });
            await Post.insertOne({ title: 'Post 1', authorId: user.insertedId });
            await Post.insertOne({ title: 'Post 2', authorId: user.insertedId });

            // populate posts，但 limit 为 0
            const result = await User.findOne({ _id: user.insertedId }).populate({
                path: 'posts',
                limit: 0
            });

            expect(result).to.be.an('object');
            expect(result.posts).to.be.an('array');
            expect(result.posts).to.have.lengthOf(0);  // 空数组
        });
    });

    // ========== 3. 嵌套 Populate 错误处理（3 个） ==========

    describe('3. 嵌套 Populate 错误处理', () => {
        let User, Post;

        beforeEach(async () => {
            Model.define('nested_users', {
                schema: (dsl) => dsl({
                    username: 'string!'
                }),
                relations: {
                    posts: {
                        from: 'nested_posts',
                        localField: '_id',
                        foreignField: 'authorId',
                        single: false
                    }
                }
            });

            Model.define('nested_posts', {
                schema: (dsl) => dsl({
                    title: 'string!',
                    authorId: 'any'       // ✅ 使用 any 接受 ObjectId 对象
                }),
                relations: {
                    comments: {
                        from: 'nested_comments',  // 这个集合没有定义 Model
                        localField: '_id',
                        foreignField: 'postId',
                        single: false
                    }
                }
            });

            User = msq.model('nested_users');
            Post = msq.model('nested_posts');
        });

        it('应该在嵌套 populate 的集合没有 Model 定义时填充空数组', async () => {
            // 插入数据
            const user = await User.insertOne({ username: 'john' });
            await Post.insertOne({ title: 'My Post', authorId: user.insertedId });

            // 嵌套 populate comments（集合没有定义 Model，但关系存在，应该填充空数组）
            const result = await User.findOne({ _id: user.insertedId }).populate({
                path: 'posts',
                populate: 'comments'
            });

            expect(result).to.be.an('object');
            expect(result.posts).to.be.an('array');
            expect(result.posts).to.have.lengthOf(1);

            // comments 字段存在且为空数组（因为目标集合没有数据）
            expect(result.posts[0]).to.have.property('comments');
            expect(result.posts[0].comments).to.be.an('array');
            expect(result.posts[0].comments).to.have.lengthOf(0);
        });

        it('应该在嵌套 populate 路径不存在时抛出错误', async () => {
            // 插入数据
            const user = await User.insertOne({ username: 'john' });
            // 🔴 重要：插入 post 数据，否则不会执行嵌套 populate
            await Post.insertOne({ title: 'Test Post', authorId: user.insertedId });

            // 嵌套 populate 不存在的路径
            try {
                await User.findOne({ _id: user.insertedId }).populate({
                    path: 'posts',
                    populate: 'invalidPath'  // posts Model 中没有定义这个关系
                });
                // 如果没有抛出错误，测试失败
                throw new Error('Expected error was not thrown');
            } catch (err) {
                // 验证是预期的错误
                expect(err.message).to.include('Undefined relation: invalidPath');
            }
        });

        it('应该在嵌套 populate 配置错误时抛出错误', async () => {
            // 插入数据
            const user = await User.insertOne({ username: 'john' });
            // 🔴 重要：插入 post 数据，否则不会执行嵌套 populate
            await Post.insertOne({ title: 'Test Post', authorId: user.insertedId });

            // 嵌套 populate 配置错误（path 为空对象）
            try {
                await User.findOne({ _id: user.insertedId }).populate({
                    path: 'posts',
                    populate: {}  // 缺少 path 字段
                });
                // 如果没有抛出错误，测试失败
                throw new Error('Expected error was not thrown');
            } catch (err) {
                // 验证是预期的错误
                expect(err.message).to.include('nested populate must be a string, array, or object');
            }
        });
    });
});

