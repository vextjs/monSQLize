/**
 * Model - 未覆盖代码路径测试（达到 100% 覆盖率）
 *
 * 测试内容：
 * 1. _createIndexes() 索引创建逻辑
 * 2. incrementOne 的不同参数组合
 * 3. getRelations() 和 getEnums() 方法
 * 4. 其他未覆盖的代码路径
 */

const assert = require('assert');
const MonSQLize = require('../../../lib/index');
const { Model } = MonSQLize;

// 测试计数器，用于生成唯一集合名
let testCollectionCounter = 0;

// 辅助函数：生成唯一集合名
function getUniqueCollection() {
    return `coverage_test_${Date.now()}_${testCollectionCounter++}`;
}

describe('Model - 100% Coverage Tests', function() {
    this.timeout(30000);

    let msq;
    let currentCollection;

    // 每次测试前生成唯一集合名
    beforeEach(function() {
        currentCollection = getUniqueCollection();
    });

    // 每次测试后清理
    afterEach(async function() {
        Model._clear();
        if (msq) {
            try {
                await msq.close();
                msq = null;
            } catch (err) {
                // 忽略错误
            }
        }
    });

    // 最后统一关闭所有资源
    after(async function() {
        Model._clear();
    });

    // ========== 索引创建测试 ==========
    describe('_createIndexes() 索引创建测试', () => {
        it('应该在 Model 实例化时创建索引', async function() {
            Model.define(currentCollection, {
                schema: (dsl) => dsl({
                    email: 'string!',
                    username: 'string!'
                }),
                indexes: [
                    { key: { email: 1 }, unique: true },
                    { key: { username: 1 } }
                ],
                options: {}
            });

            msq = new MonSQLize({
                type: 'mongodb',
                databaseName: 'test',
                config: { useMemoryServer: true }
            });
            await msq.connect();

            const User = msq.model(currentCollection);

            // 验证 Model 实例化成功（索引创建在后台进行）
            assert.ok(User, 'Model 应该成功实例化');

            // 验证索引定义已传递
            const modelDef = Model.get(currentCollection);
            assert.ok(modelDef.definition.indexes, '应该有索引定义');
            assert.strictEqual(modelDef.definition.indexes.length, 2, '应该有 2 个索引定义');
        });

        it('应该跳过空的索引定义', async function() {
            Model.define(currentCollection, {
                schema: (dsl) => dsl({ name: 'string!' }),
                indexes: [],
                options: {}
            });

            msq = new MonSQLize({
                type: 'mongodb',
                databaseName: 'test',
                config: { useMemoryServer: true }
            });
            await msq.connect();

            // 应该能正常实例化，即使索引为空
            const User = msq.model(currentCollection);
            assert.ok(User, 'Model 应该正常实例化');
        });

        it('应该处理无效的索引定义（没有 key）', async function() {
            Model.define(currentCollection, {
                schema: (dsl) => dsl({ name: 'string!' }),
                indexes: [
                    { unique: true } // 缺少 key
                ],
                options: {}
            });

            msq = new MonSQLize({
                type: 'mongodb',
                databaseName: 'test',
                config: { useMemoryServer: true }
            });
            await msq.connect();

            // 应该能正常实例化，忽略无效索引
            const User = msq.model(currentCollection);
            assert.ok(User, 'Model 应该正常实例化');
        });

        it('应该处理索引创建失败的情况', async function() {
            Model.define(currentCollection, {
                schema: (dsl) => dsl({ name: 'string!' }),
                indexes: [
                    { key: { name: 1 }, unique: true }
                ],
                options: {}
            });

            msq = new MonSQLize({
                type: 'mongodb',
                databaseName: 'test',
                config: { useMemoryServer: true }
            });
            await msq.connect();

            const User = msq.model(currentCollection);

            // 插入第一条数据
            await User.insertOne({ name: 'john' });

            // 🆕 等待索引创建完成（索引创建是异步的，使用setImmediate）
            // 等待足够的时间让唯一索引创建完成
            await new Promise(resolve => setTimeout(resolve, 200));

            // 尝试插入重复数据，应该抛出唯一索引冲突错误
            try {
                await User.insertOne({ name: 'john' });
                // 如果成功插入，说明测试失败（索引未生效）
                assert.fail('应该抛出唯一索引冲突错误');
            } catch (err) {
                // 验证是唯一索引冲突错误
                const isUniqueError = err.message.includes('duplicate') ||
                                     err.message.includes('E11000') ||
                                     err.message.includes('唯一性约束') ||
                                     err.code === 11000;
                assert.ok(isUniqueError,
                    `应该是唯一索引冲突错误，实际错误: ${err.message}`);
            }
        });
    });

    // ========== incrementOne 不同参数组合测试 ==========
    describe('incrementOne 不同参数组合测试', () => {
        it('应该处理 incrementOne 只传 filter 和 increment', async function() {
            Model.define(currentCollection, {
                schema: (dsl) => dsl({
                    name: 'string!',
                    counter: 'number'
                }),
                options: {
                    timestamps: true
                }
            });

            msq = new MonSQLize({
                type: 'mongodb',
                databaseName: 'test',
                config: { useMemoryServer: true }
            });
            await msq.connect();

            const User = msq.model(currentCollection);

            // 插入文档
            const result = await User.insertOne({ name: 'john', counter: 0 });
            const originalDoc = await User.findOne({ _id: result.insertedId });
            const originalUpdatedAt = originalDoc.updatedAt;

            // 等待一点时间
            await new Promise(resolve => setTimeout(resolve, 10));

            // incrementOne 只传两个参数
            await User.incrementOne({ _id: result.insertedId }, { counter: 1 });

            const updatedDoc = await User.findOne({ _id: result.insertedId });
            assert.strictEqual(updatedDoc.counter, 1, 'counter 应该递增');
            assert.ok(updatedDoc.updatedAt > originalUpdatedAt,
                'updatedAt 应该自动更新（options 参数在 args[3]）');
        });

        it('应该处理 incrementOne 传入 options 参数（在 args[2]）', async function() {
            Model.define(currentCollection, {
                schema: (dsl) => dsl({
                    name: 'string!',
                    counter: 'number'
                }),
                options: {
                    timestamps: true
                }
            });

            msq = new MonSQLize({
                type: 'mongodb',
                databaseName: 'test',
                config: { useMemoryServer: true }
            });
            await msq.connect();

            const User = msq.model(currentCollection);

            // 插入文档
            const result = await User.insertOne({ name: 'john', counter: 0 });

            // incrementOne 传入 options（会在 args[2]）
            // 注意：monSQLize 的 incrementOne 签名可能是 (filter, increment, options)
            await User.incrementOne(
                { _id: result.insertedId },
                { counter: 5 },
                { upsert: false }
            );

            const updatedDoc = await User.findOne({ _id: result.insertedId });
            assert.strictEqual(updatedDoc.counter, 5, 'counter 应该递增 5');
        });
    });

    // ========== getRelations 和 getEnums 测试 ==========
    describe('getRelations() 和 getEnums() 方法测试', () => {
        it('应该返回定义的 relations', async function() {
            Model.define(currentCollection, {
                schema: (dsl) => dsl({ name: 'string!' }),
                relations: {
                    posts: {
                        from: 'posts',
                        localField: '_id',
                        foreignField: 'userId',
                        single: false
                    },
                    profile: {
                        from: 'profiles',
                        localField: 'profileId',
                        foreignField: '_id',
                        single: true
                    }
                },
                options: {}
            });

            msq = new MonSQLize({
                type: 'mongodb',
                databaseName: 'test',
                config: { useMemoryServer: true }
            });
            await msq.connect();

            const User = msq.model(currentCollection);
            const relations = User.getRelations();

            assert.ok(relations.posts, '应该有 posts 关系');
            assert.strictEqual(relations.posts.from, 'posts');
            assert.ok(relations.profile, '应该有 profile 关系');
            assert.strictEqual(relations.profile.from, 'profiles');
        });

        it('应该返回空对象如果没有 relations', async function() {
            Model.define(currentCollection, {
                schema: (dsl) => dsl({ name: 'string!' }),
                options: {}
            });

            msq = new MonSQLize({
                type: 'mongodb',
                databaseName: 'test',
                config: { useMemoryServer: true }
            });
            await msq.connect();

            const User = msq.model(currentCollection);
            const relations = User.getRelations();

            assert.deepStrictEqual(relations, {}, '应该返回空对象');
        });

        it('应该返回定义的 enums', async function() {
            Model.define(currentCollection, {
                enums: {
                    role: 'admin|user|guest',
                    status: 'active|inactive'
                },
                schema: (dsl) => dsl({ name: 'string!' }),
                options: {}
            });

            msq = new MonSQLize({
                type: 'mongodb',
                databaseName: 'test',
                config: { useMemoryServer: true }
            });
            await msq.connect();

            const User = msq.model(currentCollection);
            const enums = User.getEnums();

            assert.strictEqual(enums.role, 'admin|user|guest');
            assert.strictEqual(enums.status, 'active|inactive');
        });

        it('应该返回空对象如果没有 enums', async function() {
            Model.define(currentCollection, {
                schema: (dsl) => dsl({ name: 'string!' }),
                options: {}
            });

            msq = new MonSQLize({
                type: 'mongodb',
                databaseName: 'test',
                config: { useMemoryServer: true }
            });
            await msq.connect();

            const User = msq.model(currentCollection);
            const enums = User.getEnums();

            assert.deepStrictEqual(enums, {}, '应该返回空对象');
        });
    });

    // ========== 其他未覆盖路径测试 ==========
    describe('其他未覆盖代码路径', () => {
        it('应该处理 indexes 为 undefined', async function() {
            Model.define(currentCollection, {
                schema: (dsl) => dsl({ name: 'string!' }),
                // 没有 indexes 字段
                options: {}
            });

            msq = new MonSQLize({
                type: 'mongodb',
                databaseName: 'test',
                config: { useMemoryServer: true }
            });
            await msq.connect();

            const User = msq.model(currentCollection);
            assert.ok(User, 'Model 应该正常实例化');
        });

        it('应该处理 indexes 为非数组', async function() {
            Model.define(currentCollection, {
                schema: (dsl) => dsl({ name: 'string!' }),
                indexes: 'invalid', // 非数组
                options: {}
            });

            msq = new MonSQLize({
                type: 'mongodb',
                databaseName: 'test',
                config: { useMemoryServer: true }
            });
            await msq.connect();

            const User = msq.model(currentCollection);
            assert.ok(User, 'Model 应该正常实例化');
        });

        it('应该处理索引的 key 为非对象', async function() {
            Model.define(currentCollection, {
                schema: (dsl) => dsl({ name: 'string!' }),
                indexes: [
                    { key: 'invalid' } // key 不是对象
                ],
                options: {}
            });

            msq = new MonSQLize({
                type: 'mongodb',
                databaseName: 'test',
                config: { useMemoryServer: true }
            });
            await msq.connect();

            const User = msq.model(currentCollection);
            assert.ok(User, 'Model 应该正常实例化，忽略无效索引');
        });
    });
});

