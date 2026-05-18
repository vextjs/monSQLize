/**
 * ModelInstance 功能单元测试
 *
 * 测试范围：
 * 1. msq.model() 获取实例
 * 2. validate() 数据验证
 * 3. CRUD 方法继承
 * 4. 自定义 methods
 * 5. hooks 拦截机制
 *
 * @module test/unit/model/model-instance.test.js
 */

const assert = require('assert');
const MonSQLize = require('../../../lib/index');
const { Model } = MonSQLize;

// 测试计数器，用于生成唯一集合名
let testCollectionCounter = 0;

// 辅助函数：生成唯一集合名
function getUniqueCollection() {
    return `users_test_${Date.now()}_${testCollectionCounter++}`;
}

describe('ModelInstance - 实例功能', function() {
    this.timeout(30000);

    let msq;
    let currentCollection; // 当前测试使用的集合名

    // 最后统一关闭所有资源
    after(async function() {
        Model._clear();
        // 确保最后的 msq 实例被关闭
        if (msq) {
            try {
                await msq.close();
            } catch (err) {
                // 忽略错误
            }
        }
    });

    // 每次测试前生成唯一集合名
    beforeEach(function() {
        currentCollection = getUniqueCollection();
    });

    // 每次测试后清理
    afterEach(async function() {
        Model._clear();

        // 不在 afterEach 中关闭连接，避免重复关闭
        // msq 会在所有测试结束后的 after 钩子中统一关闭
    });

    describe('msq.model()', function() {

        it('应该抛出错误如果数据库未连接', function() {
            msq = new MonSQLize({
                type: 'mongodb',
                databaseName: 'test',
                config: { useMemoryServer: true }
            });

            Model.define(currentCollection, {
                schema: (dsl) => dsl({ username: 'string!' })
            });

            try {
                msq.model(currentCollection);
                assert.fail('应该抛出错误');
            } catch (err) {
                assert.ok(err.message.includes('Database is not connected'));
            }
        });

        it('应该抛出错误如果 Model 未定义', async function() {
            msq = new MonSQLize({
                type: 'mongodb',
                databaseName: 'test',
                config: { useMemoryServer: true }
            });
            await msq.connect();

            try {
                msq.model('nonexistent');
                assert.fail('应该抛出错误');
            } catch (err) {
                assert.ok(err.message.includes("Model 'nonexistent' is not defined"));
            }
        });

        it('应该成功获取 Model 实例', async function() {
            Model.define(currentCollection, {
                schema: (dsl) => dsl({ username: 'string!' })
            });

            msq = new MonSQLize({
                type: 'mongodb',
                databaseName: 'test',
                config: { useMemoryServer: true }
            });
            await msq.connect();

            const User = msq.model(currentCollection);
            assert.ok(User);
            assert.ok(User.collection);
            assert.ok(User.definition);
        });

        it('错误应该包含正确的 code 属性', async function() {
            msq = new MonSQLize({
                type: 'mongodb',
                databaseName: 'test',
                config: { useMemoryServer: true }
            });
            await msq.connect();

            try {
                msq.model('nonexistent');
                assert.fail('应该抛出错误');
            } catch (err) {
                assert.strictEqual(err.code, 'MODEL_NOT_DEFINED');
            }
        });

    });

    describe('validate() 数据验证', function() {

        beforeEach(async function() {
            Model.define(currentCollection, {
                enums: {
                    role: 'admin|user|guest'
                },
                schema: function(dsl) {
                    return dsl({
                        username: 'string:3-32!',
                        email: 'email!',
                        age: 'number:0-120',
                        role: this.enums.role.default('user')
                    });
                }
            });

            msq = new MonSQLize({
                type: 'mongodb',
                databaseName: 'test',
                config: { useMemoryServer: true }
            });
            await msq.connect();
        });

        it('应该验证通过合法的数据', function() {
            const User = msq.model(currentCollection);
            const result = User.validate({
                username: 'testuser',
                email: 'test@example.com',
                age: 25
            });

            assert.strictEqual(result.valid, true);
            assert.ok(Array.isArray(result.errors));
            assert.strictEqual(result.errors.length, 0);
        });

        it('应该验证失败如果必填字段缺失', function() {
            const User = msq.model(currentCollection);
            const result = User.validate({
                age: 25
            });

            assert.strictEqual(result.valid, false);
            assert.ok(Array.isArray(result.errors));
            assert.ok(result.errors.length > 0);
        });

        it('应该验证失败如果字段类型错误', function() {
            const User = msq.model(currentCollection);
            const result = User.validate({
                username: 'testuser',
                email: 'invalid-email',
                age: 25
            });

            assert.strictEqual(result.valid, false);
            assert.ok(result.errors.length > 0);
        });

        it('应该验证失败如果字段超出范围', function() {
            const User = msq.model(currentCollection);
            const result = User.validate({
                username: 'ab', // 太短
                email: 'test@example.com',
                age: 150 // 超出范围
            });

            assert.strictEqual(result.valid, false);
            assert.ok(result.errors.length >= 2);
        });

        it('应该支持 schema 中访问 this.enums', function() {
            const User = msq.model(currentCollection);

            // 测试枚举验证
            const result1 = User.validate({
                username: 'testuser',
                email: 'test@example.com',
                role: 'admin'
            });
            assert.strictEqual(result1.valid, true);

            const result2 = User.validate({
                username: 'testuser',
                email: 'test@example.com',
                role: 'invalid'
            });
            assert.strictEqual(result2.valid, false);
        });

        it('应该缓存编译后的 schema（性能优化）', function() {
            const User = msq.model(currentCollection);

            // 首次验证
            const result1 = User.validate({
                username: 'testuser',
                email: 'test@example.com'
            });

            // 验证缓存存在
            assert.ok(User._schemaCache);

            // 第二次验证应该使用缓存
            const result2 = User.validate({
                username: 'testuser2',
                email: 'test2@example.com'
            });

            assert.strictEqual(result1.valid, true);
            assert.strictEqual(result2.valid, true);
        });

        it('应该处理 schema 执行失败的情况', function() {
            Model.define('invalid', {
                schema: () => {
                    throw new Error('Schema error');
                }
            });

            const InvalidModel = msq.model('invalid');
            const result = InvalidModel.validate({ test: 'data' });

            assert.strictEqual(result.valid, false);
            assert.ok(result.errors.length > 0);
            assert.strictEqual(result.errors[0].field, '_schema');
        });

    });

    describe('CRUD 方法继承', function() {

        beforeEach(async function() {
            Model.define(currentCollection, {
                schema: (dsl) => dsl({
                    username: 'string!',
                    age: 'number'
                })
            });

            msq = new MonSQLize({
                type: 'mongodb',
                databaseName: 'test',
                config: { useMemoryServer: true }
            });
            await msq.connect();
        });

        it('应该继承 collection 的 insertOne 方法', async function() {
            const User = msq.model(currentCollection);

            const result = await User.insertOne({
                username: 'testuser',
                age: 25
            });

            assert.ok(result);
            assert.ok(result.insertedId);
        });

        it('应该继承 collection 的 find 方法', async function() {
            const User = msq.model(currentCollection);

            await User.insertOne({ username: 'user1', age: 20 });
            await User.insertOne({ username: 'user2', age: 30 });

            const users = await User.find({});
            assert.ok(Array.isArray(users));
            assert.ok(users.length >= 2);
        });

        it('应该继承 collection 的 findOne 方法', async function() {
            const User = msq.model(currentCollection);

            await User.insertOne({ username: 'testuser', age: 25 });

            const user = await User.findOne({ username: 'testuser' });
            assert.ok(user);
            assert.strictEqual(user.username, 'testuser');
            assert.strictEqual(user.age, 25);
        });

        it('应该继承 collection 的 updateOne 方法', async function() {
            const User = msq.model(currentCollection);

            await User.insertOne({ username: 'testuser', age: 25 });

            const result = await User.updateOne(
                { username: 'testuser' },
                { $set: { age: 26 } }
            );

            assert.strictEqual(result.modifiedCount, 1);

            const user = await User.findOne({ username: 'testuser' });
            assert.strictEqual(user.age, 26);
        });

        it('应该继承 collection 的 deleteOne 方法', async function() {
            const User = msq.model(currentCollection);

            await User.insertOne({ username: 'testuser', age: 25 });

            const result = await User.deleteOne({ username: 'testuser' });
            assert.strictEqual(result.deletedCount, 1);

            // 验证数据已删除（count应该为0）
            const count = await User.count({ username: 'testuser' });
            assert.strictEqual(count, 0);
        });

        it('应该继承 collection 的 count 方法', async function() {
            const User = msq.model(currentCollection);

            await User.insertOne({ username: 'user1', age: 20 });
            await User.insertOne({ username: 'user2', age: 30 });

            const count = await User.count({});
            assert.ok(count >= 2);
        });

    });

    describe('自定义 methods', function() {

        beforeEach(async function() {
            Model.define(currentCollection, {
                schema: (dsl) => dsl({
                    username: 'string!',
                    password: 'string!'
                }),
                methods: (model) => ({
                    instance: {
                        checkPassword(password) {
                            return this.password === password;
                        },
                        async getPosts() {
                            // 模拟关联查询
                            return await model.find({ userId: this._id });
                        }
                    },
                    static: {
                        async findByUsername(username) {
                            return await model.findOne({ username });
                        },
                        getModelName() {
                            return 'User';
                        }
                    }
                })
            });

            msq = new MonSQLize({
                type: 'mongodb',
                databaseName: 'test',
                config: { useMemoryServer: true }
            });
            await msq.connect();
        });

        it('应该支持实例方法', async function() {
            const User = msq.model(currentCollection);

            await User.insertOne({
                username: 'testuser',
                password: 'secret123'
            });

            const user = await User.findOne({ username: 'testuser' });

            // 验证实例方法存在
            assert.strictEqual(typeof user.checkPassword, 'function');
            assert.strictEqual(user.checkPassword('secret123'), true);
            assert.strictEqual(user.checkPassword('wrong'), false);
        });

        it('应该支持静态方法', async function() {
            const User = msq.model(currentCollection);

            await User.insertOne({
                username: 'testuser',
                password: 'secret123'
            });

            // 验证静态方法已挂载到 Model 实例
            assert.strictEqual(typeof User.findByUsername, 'function');
            assert.strictEqual(typeof User.getModelName, 'function');

            // 测试静态方法
            const user = await User.findByUsername('testuser');
            assert.ok(user);
            assert.strictEqual(user.username, 'testuser');

            const modelName = User.getModelName();
            assert.strictEqual(modelName, 'User');
        });

    });

});


