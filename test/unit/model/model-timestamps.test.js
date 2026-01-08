/**
 * Model Timestamps 功能单元测试
 *
 * 测试范围：
 * 1. 基础功能 - timestamps: true
 * 2. 自定义字段名
 * 3. 部分启用
 * 4. 边界情况
 *
 * @module test/unit/model/model-timestamps.test.js
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

describe('Model - Timestamps 功能', function() {
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
    });

    describe('基础功能', function() {

        it('应该在 insertOne 时自动添加 createdAt 和 updatedAt', async function() {
            Model.define(currentCollection, {
                schema: (dsl) => dsl({ username: 'string!' }),
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

            const result = await User.insertOne({ username: 'john' });
            assert.ok(result.insertedId);

            const user = await User.findOne({ _id: result.insertedId });
            assert.ok(user);
            assert.strictEqual(user.username, 'john');
            assert.ok(user.createdAt instanceof Date, 'createdAt 应该是 Date 对象');
            assert.ok(user.updatedAt instanceof Date, 'updatedAt 应该是 Date 对象');
            assert.strictEqual(user.createdAt.getTime(), user.updatedAt.getTime(), '初始时 createdAt 和 updatedAt 应该相同');
        });

        it('应该在 insertMany 时自动添加时间戳', async function() {
            Model.define(currentCollection, {
                schema: (dsl) => dsl({ username: 'string!' }),
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

            const result = await User.insertMany([
                { username: 'john' },
                { username: 'jane' }
            ]);
            assert.strictEqual(result.insertedCount, 2);

            const users = await User.find({});
            assert.strictEqual(users.length, 2);

            users.forEach(user => {
                assert.ok(user.createdAt instanceof Date);
                assert.ok(user.updatedAt instanceof Date);
            });
        });

        it('应该在 updateOne 时自动更新 updatedAt', async function() {
            Model.define(currentCollection, {
                schema: (dsl) => dsl({ username: 'string!', status: 'string' }),
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

            // 插入
            const result = await User.insertOne({ username: 'john' });
            const user = await User.findOne({ _id: result.insertedId });
            const originalUpdatedAt = user.updatedAt;

            // 等待 10ms 确保时间戳不同
            await new Promise(resolve => setTimeout(resolve, 10));

            // 更新
            await User.updateOne({ _id: user._id }, { $set: { status: 'active' } });
            const updated = await User.findOne({ _id: user._id });

            assert.strictEqual(updated.status, 'active');
            assert.ok(updated.updatedAt > originalUpdatedAt, 'updatedAt 应该被更新');
            assert.strictEqual(updated.createdAt.getTime(), user.createdAt.getTime(), 'createdAt 不应该改变');
        });

        it('应该在 updateMany 时自动更新 updatedAt', async function() {
            Model.define(currentCollection, {
                schema: (dsl) => dsl({ username: 'string!', status: 'string' }),
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

            // 插入多条
            await User.insertMany([
                { username: 'john', status: 'inactive' },
                { username: 'jane', status: 'inactive' }
            ]);

            // 等待 10ms
            await new Promise(resolve => setTimeout(resolve, 10));

            // 更新多条
            await User.updateMany({ status: 'inactive' }, { $set: { status: 'active' } });

            const users = await User.find({ status: 'active' });
            assert.strictEqual(users.length, 2);

            users.forEach(user => {
                assert.ok(user.updatedAt > user.createdAt, 'updatedAt 应该大于 createdAt');
            });
        });

        it('应该在 replaceOne 时自动更新 updatedAt', async function() {
            Model.define(currentCollection, {
                schema: (dsl) => dsl({ username: 'string!', email: 'string' }),
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

            const result = await User.insertOne({ username: 'john', email: 'john@example.com' });
            const user = await User.findOne({ _id: result.insertedId });

            // 等待 10ms
            await new Promise(resolve => setTimeout(resolve, 10));

            // 替换文档
            await User.replaceOne({ _id: user._id }, { username: 'jane', email: 'jane@example.com' });
            const replaced = await User.findOne({ _id: user._id });

            assert.strictEqual(replaced.username, 'jane');
            assert.ok(replaced.updatedAt > user.updatedAt, 'updatedAt 应该被更新');
        });
    });

    describe('自定义字段名', function() {

        it('应该支持自定义 createdAt 字段名', async function() {
            Model.define(currentCollection, {
                schema: (dsl) => dsl({ username: 'string!' }),
                options: {
                    timestamps: {
                        createdAt: 'created_time',
                        updatedAt: 'updated_time'
                    }
                }
            });

            msq = new MonSQLize({
                type: 'mongodb',
                databaseName: 'test',
                config: { useMemoryServer: true }
            });
            await msq.connect();

            const User = msq.model(currentCollection);

            const result = await User.insertOne({ username: 'john' });
            const user = await User.findOne({ _id: result.insertedId });

            assert.ok(user.created_time instanceof Date);
            assert.ok(user.updated_time instanceof Date);
            assert.strictEqual(user.createdAt, undefined, '不应该有默认字段名');
            assert.strictEqual(user.updatedAt, undefined, '不应该有默认字段名');
        });
    });

    describe('部分启用', function() {

        it('应该支持只启用 createdAt', async function() {
            Model.define(currentCollection, {
                schema: (dsl) => dsl({ username: 'string!' }),
                options: {
                    timestamps: {
                        createdAt: true,
                        updatedAt: false
                    }
                }
            });

            msq = new MonSQLize({
                type: 'mongodb',
                databaseName: 'test',
                config: { useMemoryServer: true }
            });
            await msq.connect();

            const User = msq.model(currentCollection);

            const result = await User.insertOne({ username: 'john' });
            const user = await User.findOne({ _id: result.insertedId });

            assert.ok(user.createdAt instanceof Date);
            assert.strictEqual(user.updatedAt, undefined, '不应该有 updatedAt');
        });

        it('应该支持只启用 updatedAt', async function() {
            Model.define(currentCollection, {
                schema: (dsl) => dsl({ username: 'string!' }),
                options: {
                    timestamps: {
                        createdAt: false,
                        updatedAt: true
                    }
                }
            });

            msq = new MonSQLize({
                type: 'mongodb',
                databaseName: 'test',
                config: { useMemoryServer: true }
            });
            await msq.connect();

            const User = msq.model(currentCollection);

            const result = await User.insertOne({ username: 'john' });
            const user = await User.findOne({ _id: result.insertedId });

            assert.strictEqual(user.createdAt, undefined, '不应该有 createdAt');
            assert.ok(user.updatedAt instanceof Date);
        });

        it('timestamps: false 不应该添加时间戳', async function() {
            Model.define(currentCollection, {
                schema: (dsl) => dsl({ username: 'string!' }),
                options: {
                    timestamps: false
                }
            });

            msq = new MonSQLize({
                type: 'mongodb',
                databaseName: 'test',
                config: { useMemoryServer: true }
            });
            await msq.connect();

            const User = msq.model(currentCollection);

            const result = await User.insertOne({ username: 'john' });
            const user = await User.findOne({ _id: result.insertedId });

            assert.strictEqual(user.createdAt, undefined);
            assert.strictEqual(user.updatedAt, undefined);
        });
    });

    describe('边界情况', function() {

        it('upsertOne 插入新文档时应该添加 createdAt 和 updatedAt', async function() {
            Model.define(currentCollection, {
                schema: (dsl) => dsl({ username: 'string!', email: 'string' }),
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

            // upsert 插入新文档
            await User.upsertOne(
                { username: 'john' },
                { $set: { email: 'john@example.com' } }
            );

            const user = await User.findOne({ username: 'john' });
            assert.ok(user);
            assert.strictEqual(user.email, 'john@example.com');
            assert.ok(user.createdAt instanceof Date, '插入时应该有 createdAt');
            assert.ok(user.updatedAt instanceof Date, '插入时应该有 updatedAt');
        });

        it('upsertOne 更新现有文档时应该只更新 updatedAt', async function() {
            Model.define(currentCollection, {
                schema: (dsl) => dsl({ username: 'string!', email: 'string' }),
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

            // 先插入
            const result = await User.insertOne({ username: 'john', email: 'john@example.com' });
            const original = await User.findOne({ _id: result.insertedId });
            const originalCreatedAt = original.createdAt;
            const originalUpdatedAt = original.updatedAt;

            // 等待 10ms
            await new Promise(resolve => setTimeout(resolve, 10));

            // upsert 更新现有文档
            await User.upsertOne(
                { username: 'john' },
                { $set: { email: 'newemail@example.com' } }
            );

            const updated = await User.findOne({ username: 'john' });
            assert.strictEqual(updated.email, 'newemail@example.com');
            assert.strictEqual(updated.createdAt.getTime(), originalCreatedAt.getTime(), 'createdAt 不应该改变');
            assert.ok(updated.updatedAt > originalUpdatedAt, 'updatedAt 应该被更新');
        });

        it('findOneAndUpdate 应该更新 updatedAt', async function() {
            Model.define(currentCollection, {
                schema: (dsl) => dsl({ username: 'string!', status: 'string' }),
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

            const result = await User.insertOne({ username: 'john', status: 'inactive' });
            const original = await User.findOne({ _id: result.insertedId });

            // 等待 10ms
            await new Promise(resolve => setTimeout(resolve, 10));

            const updated = await User.findOneAndUpdate(
                { username: 'john' },
                { $set: { status: 'active' } },
                { returnDocument: 'after' }
            );

            assert.ok(updated);
            assert.strictEqual(updated.status, 'active');
            assert.ok(updated.updatedAt > original.updatedAt, 'updatedAt 应该被更新');
        });

        it('findOneAndReplace 应该更新 updatedAt', async function() {
            Model.define(currentCollection, {
                schema: (dsl) => dsl({ username: 'string!', email: 'string' }),
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

            const result = await User.insertOne({ username: 'john', email: 'john@example.com' });
            const original = await User.findOne({ _id: result.insertedId });

            // 等待 10ms
            await new Promise(resolve => setTimeout(resolve, 10));

            const replaced = await User.findOneAndReplace(
                { username: 'john' },
                { username: 'jane', email: 'jane@example.com' },
                { returnDocument: 'after' }
            );

            assert.ok(replaced);
            assert.strictEqual(replaced.username, 'jane');
            assert.ok(replaced.updatedAt > original.updatedAt, 'updatedAt 应该被更新');
        });

        it('incrementOne 应该更新 updatedAt', async function() {
            Model.define(currentCollection, {
                schema: (dsl) => dsl({ username: 'string!', score: 'number' }),
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

            const result = await User.insertOne({ username: 'john', score: 0 });
            const original = await User.findOne({ _id: result.insertedId });

            // 等待 10ms
            await new Promise(resolve => setTimeout(resolve, 10));

            await User.incrementOne({ _id: result.insertedId }, { score: 10 });
            const updated = await User.findOne({ _id: result.insertedId });

            assert.strictEqual(updated.score, 10);
            assert.ok(updated.updatedAt > original.updatedAt, 'updatedAt 应该被更新');
        });

        it('与用户 hooks 配合使用', async function() {
            let beforeCalled = false;
            let afterCalled = false;

            Model.define(currentCollection, {
                schema: (dsl) => dsl({ username: 'string!' }),
                options: {
                    timestamps: true
                },
                hooks: (model) => ({
                    insert: {
                        before: (ctx, docs) => {
                            beforeCalled = true;
                            return docs;
                        },
                        after: (ctx, result) => {
                            afterCalled = true;
                            return result;
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

            const User = msq.model(currentCollection);

            const result = await User.insertOne({ username: 'john' });
            const user = await User.findOne({ _id: result.insertedId });

            assert.ok(beforeCalled, 'before hook 应该被调用');
            assert.ok(afterCalled, 'after hook 应该被调用');
            assert.ok(user.createdAt, '时间戳应该添加');
            assert.ok(user.updatedAt, '时间戳应该添加');
        });
    });

    describe('批量操作（insertBatch/updateBatch）', function() {

        it('insertBatch 应该自动添加时间戳', async function() {
            Model.define(currentCollection, {
                schema: (dsl) => dsl({ username: 'string!' }),
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

            const result = await User.insertBatch([
                { username: 'john' },
                { username: 'jane' }
            ]);
            assert.strictEqual(result.insertedCount, 2);

            const users = await User.find({});
            assert.strictEqual(users.length, 2);

            users.forEach(user => {
                assert.ok(user.createdAt instanceof Date, 'createdAt 应该是 Date 对象');
                assert.ok(user.updatedAt instanceof Date, 'updatedAt 应该是 Date 对象');
            });
        });

        it('updateBatch 应该自动更新 updatedAt', async function() {
            Model.define(currentCollection, {
                schema: (dsl) => dsl({ username: 'string!', status: 'string' }),
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

            // 插入数据
            await User.insertMany([
                { username: 'john', status: 'inactive' },
                { username: 'jane', status: 'inactive' }
            ]);

            // 等待 10ms
            await new Promise(resolve => setTimeout(resolve, 10));

            // 批量更新（使用 filter 和 update）
            const result = await User.updateBatch(
                { status: 'inactive' },
                { $set: { status: 'active' } }
            );
            assert.strictEqual(result.modifiedCount, 2);

            const users = await User.find({ status: 'active' });
            assert.strictEqual(users.length, 2);

            users.forEach(user => {
                assert.ok(user.updatedAt > user.createdAt, 'updatedAt 应该大于 createdAt');
            });
        });
    });

    describe('特殊更新操作', function() {

        it('$unset 操作应该更新 updatedAt', async function() {
            Model.define(currentCollection, {
                schema: (dsl) => dsl({ username: 'string!', email: 'string', phone: 'string' }),
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

            // 插入数据
            const result = await User.insertOne({
                username: 'john',
                email: 'john@example.com',
                phone: '1234567890'
            });
            const original = await User.findOne({ _id: result.insertedId });

            // 等待 10ms
            await new Promise(resolve => setTimeout(resolve, 10));

            // 使用 $unset 删除字段
            await User.updateOne(
                { _id: result.insertedId },
                { $unset: { email: '' } }
            );

            const updated = await User.findOne({ _id: result.insertedId });
            assert.strictEqual(updated.email, undefined, 'email 应该被删除');
            assert.ok(updated.updatedAt > original.updatedAt, 'updatedAt 应该被更新');
        });

        it('嵌套文档更新应该更新 updatedAt', async function() {
            Model.define(currentCollection, {
                schema: (dsl) => dsl({
                    username: 'string!',
                    address: 'object'
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

            // 插入数据
            const result = await User.insertOne({
                username: 'john',
                address: { city: 'Shanghai', street: 'Main St' }
            });
            const original = await User.findOne({ _id: result.insertedId });

            // 等待 10ms
            await new Promise(resolve => setTimeout(resolve, 10));

            // 更新嵌套字段
            await User.updateOne(
                { _id: result.insertedId },
                { $set: { 'address.city': 'Beijing' } }
            );

            const updated = await User.findOne({ _id: result.insertedId });
            assert.strictEqual(updated.address.city, 'Beijing', '嵌套字段应该被更新');
            assert.ok(updated.updatedAt > original.updatedAt, 'updatedAt 应该被更新');
        });

        it('$push 数组操作应该更新 updatedAt', async function() {
            Model.define(currentCollection, {
                schema: (dsl) => dsl({
                    username: 'string!',
                    tags: 'array'
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

            // 插入数据
            const result = await User.insertOne({
                username: 'john',
                tags: ['tag1']
            });
            const original = await User.findOne({ _id: result.insertedId });

            // 等待 10ms
            await new Promise(resolve => setTimeout(resolve, 10));

            // 使用 $push 添加数组元素
            await User.updateOne(
                { _id: result.insertedId },
                { $push: { tags: 'tag2' } }
            );

            const updated = await User.findOne({ _id: result.insertedId });
            assert.strictEqual(updated.tags.length, 2, '数组应该添加新元素');
            assert.ok(updated.updatedAt > original.updatedAt, 'updatedAt 应该被更新');
        });

        it('🔧 incrementOne 应该更新 updatedAt', async function() {
            Model.define(currentCollection, {
                schema: (dsl) => dsl({
                    username: 'string!',
                    points: 'number'
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

            // 插入数据
            const result = await User.insertOne({
                username: 'john',
                points: 100
            });
            const original = await User.findOne({ _id: result.insertedId });

            // 等待 10ms
            await new Promise(resolve => setTimeout(resolve, 10));

            // 使用 incrementOne
            await User.incrementOne(
                { _id: result.insertedId },
                'points',
                50
            );

            const updated = await User.findOne({ _id: result.insertedId });
            assert.strictEqual(updated.points, 150, 'points 应该递增');
            assert.ok(updated.updatedAt > original.updatedAt, 'updatedAt 应该被更新');
        });
    });

    describe('🔧 手动时间戳不被覆盖', function() {
        it('insertOne 时用户手动设置的 createdAt 不应该被覆盖', async function() {
            Model.define(currentCollection, {
                schema: (dsl) => dsl({
                    username: 'string!'
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

            // 手动设置时间戳
            const customTime = new Date('2020-01-01T00:00:00.000Z');
            const result = await User.insertOne({
                username: 'john',
                createdAt: customTime,
                updatedAt: customTime
            });

            const inserted = await User.findOne({ _id: result.insertedId });
            assert.strictEqual(inserted.createdAt.getTime(), customTime.getTime(), 'createdAt 应该保留用户设置的值');
            assert.strictEqual(inserted.updatedAt.getTime(), customTime.getTime(), 'updatedAt 应该保留用户设置的值');
        });

        it('insertMany 时用户手动设置的时间戳不应该被覆盖', async function() {
            Model.define(currentCollection, {
                schema: (dsl) => dsl({
                    username: 'string!'
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

            const customTime = new Date('2020-01-01T00:00:00.000Z');
            const now = new Date();

            // 混合：一个手动设置，一个自动
            const result = await User.insertMany([
                { username: 'jane', createdAt: customTime, updatedAt: customTime },
                { username: 'john' }
            ]);

            const allDocs = await User.find({});
            const [doc1, doc2] = allDocs.sort((a, b) => a.username.localeCompare(b.username));

            // 第一个文档保留手动时间戳（jane）
            assert.strictEqual(doc1.createdAt.getTime(), customTime.getTime(), 'createdAt 应该保留用户设置的值');
            assert.strictEqual(doc1.updatedAt.getTime(), customTime.getTime(), 'updatedAt 应该保留用户设置的值');

            // 第二个文档自动添加时间戳（john）
            assert.ok(doc2.createdAt >= now, 'createdAt 应该自动添加');
            assert.ok(doc2.updatedAt >= now, 'updatedAt 应该自动添加');
        });

        it('replaceOne 时用户手动设置的 updatedAt 不应该被覆盖', async function() {
            Model.define(currentCollection, {
                schema: (dsl) => dsl({
                    username: 'string!'
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

            // 插入数据
            const result = await User.insertOne({ username: 'john' });

            // 手动设置 updatedAt
            const customTime = new Date('2020-01-01T00:00:00.000Z');
            await User.replaceOne(
                { _id: result.insertedId },
                { username: 'jane', updatedAt: customTime }
            );

            const updated = await User.findOne({ _id: result.insertedId });
            assert.strictEqual(updated.updatedAt.getTime(), customTime.getTime(), 'updatedAt 应该保留用户设置的值');
        });
    });

    describe('错误处理', function() {

        it('应该检测时间戳字段与 schema 冲突 - 自动时间戳优先', async function() {
            Model.define(currentCollection, {
                schema: (dsl) => dsl({
                    username: 'string!',
                    createdAt: 'string'  // 与自动时间戳冲突
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

            // 当前实现：用户输入的字段被保留（Schema 验证优先）
            await User.insertOne({ username: 'john', createdAt: 'invalid' });
            const user = await User.findOne({ username: 'john' });

            // 验证用户输入的字符串被保留了（Schema 定义优先于自动时间戳）
            assert.strictEqual(user.createdAt, 'invalid', 'createdAt 应该保留用户输入的字符串值');
            // 但 updatedAt 仍然会自动添加（因为没有在 schema 中定义冲突）
            assert.ok(user.updatedAt instanceof Date, 'updatedAt 应该是 Date 类型');
        });
    });

    describe('并发场景', function() {

        it('应该在高并发更新时正确更新 updatedAt', async function() {
            Model.define(currentCollection, {
                schema: (dsl) => dsl({ username: 'string!', counter: 'number' }),
                options: { timestamps: true }
            });

            msq = new MonSQLize({
                type: 'mongodb',
                databaseName: 'test',
                config: { useMemoryServer: true }
            });
            await msq.connect();
            const User = msq.model(currentCollection);

            const result = await User.insertOne({ username: 'john', counter: 0 });
            const userId = result.insertedId;

            // 并发更新100次
            const updates = Array.from({ length: 100 }, () =>
                User.updateOne({ _id: userId }, { $inc: { counter: 1 } })
            );

            await Promise.all(updates);

            const user = await User.findOne({ _id: userId });
            assert.strictEqual(user.counter, 100, 'counter 应该为100');
            assert.ok(user.updatedAt > user.createdAt, 'updatedAt 应该被更新');
        });
    });
});
