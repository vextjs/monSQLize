/**
 * Model 虚拟字段和默认值测试
 *
 * 测试内容：
 * 1. 虚拟字段功能（5 个测试）
 * 2. 默认值功能（5 个测试）
 */

const { expect } = require('chai');
const MonSQLize = require('../../../lib/index');
const { Model } = MonSQLize;

describe('Model 虚拟字段和默认值测试', () => {
    let msq;

    before(async function() {
        this.timeout(30000);

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
        Model._clear();
    });

    // ========== 1. 虚拟字段功能（5 个） ==========

    describe('1. 虚拟字段功能', () => {
        let User;

        beforeEach(async () => {
            Model.define('virt_users', {
                schema: (dsl) => dsl({
                    firstName: 'string!',
                    lastName: 'string!',
                    age: 'number'  // ✅ 可选字段不需要 ? 后缀
                }),
                virtuals: {
                    fullName: {
                        get: function() {
                            return `${this.firstName} ${this.lastName}`;
                        },
                        set: function(value) {
                            const parts = value.split(' ');
                            this.firstName = parts[0];
                            this.lastName = parts[1];
                        }
                    },
                    isAdult: {
                        get: function() {
                            return this.age >= 18;
                        }
                    }
                }
            });

            User = msq.model('virt_users');
            await User.deleteMany({});
        });

        it('应该正确计算虚拟字段（getter）', async () => {
            await User.insertOne({
                firstName: 'John',
                lastName: 'Doe',
                age: 25
            });

            const user = await User.findOne({ firstName: 'John' });

            expect(user).to.be.an('object');
            expect(user.fullName).to.equal('John Doe');
            expect(user.isAdult).to.be.true;
        });

        it('应该在数组结果中应用虚拟字段', async () => {
            await User.insertMany([
                { firstName: 'John', lastName: 'Doe', age: 25 },
                { firstName: 'Jane', lastName: 'Smith', age: 30 }
            ]);

            const users = await User.find({});

            expect(users).to.be.an('array');
            expect(users).to.have.lengthOf(2);
            expect(users[0].fullName).to.equal('John Doe');
            expect(users[1].fullName).to.equal('Jane Smith');
        });

        it('虚拟字段应该在 JSON.stringify 中可见', async () => {
            await User.insertOne({
                firstName: 'John',
                lastName: 'Doe',
                age: 25
            });

            const user = await User.findOne({ firstName: 'John' });
            const json = JSON.parse(JSON.stringify(user));

            expect(json.fullName).to.equal('John Doe');
            expect(json.isAdult).to.be.true;
        });

        it('虚拟字段 setter 应该正确工作', async () => {
            await User.insertOne({
                firstName: 'John',
                lastName: 'Doe',
                age: 25
            });

            const user = await User.findOne({ firstName: 'John' });

            // 使用 setter
            user.fullName = 'Jane Smith';

            expect(user.firstName).to.equal('Jane');
            expect(user.lastName).to.equal('Smith');
            expect(user.fullName).to.equal('Jane Smith');
        });

        it('虚拟字段不应该保存到数据库', async () => {
            const result = await User.insertOne({
                firstName: 'John',
                lastName: 'Doe',
                age: 25
            });

            // 直接从数据库读取（不通过 Model）
            // 使用 msq.dbInstance.collection 直接访问
            const rawDoc = await msq.dbInstance.collection('virt_users').findOne({ _id: result.insertedId });

            // 虚拟字段不应该存在
            expect(rawDoc).to.not.have.property('fullName');
            expect(rawDoc).to.not.have.property('isAdult');
        });
    });

    // ========== 2. 默认值功能（5 个） ==========

    describe('2. 默认值功能', () => {
        let Post;

        beforeEach(async () => {
            Model.define('def_posts', {
                schema: (dsl) => dsl({
                    title: 'string!',
                    content: 'string',    // ✅ 可选字段
                    status: 'string',     // ✅ 可选字段
                    views: 'number',      // ✅ 可选字段
                    tags: 'array',        // ✅ 可选字段
                    createdAt: 'any'      // ✅ 使用 any 类型接受 Date 对象
                }),
                defaults: {
                    status: 'draft',
                    views: 0,
                    tags: () => [],
                    createdAt: () => new Date()
                }
            });

            Post = msq.model('def_posts');
            await Post.deleteMany({});
        });

        it('应该应用静态默认值', async () => {
            const result = await Post.insertOne({
                title: 'My Post',
                content: 'Hello World'
            });

            const post = await Post.findOne({ _id: result.insertedId });

            expect(post.status).to.equal('draft');
            expect(post.views).to.equal(0);
        });

        it('应该应用函数默认值', async () => {
            const before = new Date();

            const result = await Post.insertOne({
                title: 'My Post',
                content: 'Hello World'
            });

            const after = new Date();
            const post = await Post.findOne({ _id: result.insertedId });

            expect(post.createdAt).to.be.instanceOf(Date);
            expect(post.createdAt.getTime()).to.be.at.least(before.getTime());
            expect(post.createdAt.getTime()).to.be.at.most(after.getTime());
        });

        it('应该应用函数默认值（数组）', async () => {
            const result = await Post.insertOne({
                title: 'My Post',
                content: 'Hello World'
            });

            const post = await Post.findOne({ _id: result.insertedId });

            expect(post.tags).to.be.an('array');
            expect(post.tags).to.have.lengthOf(0);
        });

        it('用户提供的值应该覆盖默认值', async () => {
            const result = await Post.insertOne({
                title: 'My Post',
                content: 'Hello World',
                status: 'published',
                views: 100
            });

            const post = await Post.findOne({ _id: result.insertedId });

            expect(post.status).to.equal('published');
            expect(post.views).to.equal(100);
        });

        it('应该在批量插入中应用默认值', async () => {
            const result = await Post.insertMany([
                { title: 'Post 1', content: 'Content 1' },
                { title: 'Post 2', content: 'Content 2', status: 'published' }
            ]);

            const posts = await Post.find({});

            expect(posts).to.have.lengthOf(2);

            // 第一篇使用默认值
            expect(posts[0].status).to.equal('draft');
            expect(posts[0].views).to.equal(0);

            // 第二篇覆盖默认值
            expect(posts[1].status).to.equal('published');
            expect(posts[1].views).to.equal(0);
        });
    });
});

