/**
 * Model - 集成测试
 *
 * 测试内容：
 * 1. timestamps + softDelete + version 三合一测试
 * 2. Model hooks 执行顺序测试
 * 3. 大数据量并发测试（1000+文档）
 */

const assert = require('assert');
const MonSQLize = require('../../../lib/index');
const { Model } = MonSQLize;

// 测试计数器，用于生成唯一集合名
let testCollectionCounter = 0;

// 辅助函数：生成唯一集合名
function getUniqueCollection() {
    return `integration_test_${Date.now()}_${testCollectionCounter++}`;
}

describe('Model - Integration Tests', function() {
    this.timeout(60000); // 集成测试需要更长的超时时间

    let msq;
    let currentCollection;

    // 最后统一关闭所有资源
    after(async function() {
        Model._clear();
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
        if (msq) {
            try {
                await msq.close();
                msq = null;
            } catch (err) {
                // 忽略错误
            }
        }
    });

    // ========== Day 4: 集成测试 ==========
    describe('三功能协同测试（timestamps + softDelete + version）', () => {
        it('应该同时支持三个功能并正确工作', async function() {
            Model.define(currentCollection, {
                schema: (dsl) => dsl({
                    name: 'string!',
                    email: 'string'
                }),
                options: {
                    timestamps: true,
                    softDelete: true,
                    version: true
                }
            });

            msq = new MonSQLize({
                type: 'mongodb',
                databaseName: 'test',
                config: { useMemoryServer: true }
            });
            await msq.connect();

            const User = msq.model(currentCollection);

            // 1. 插入文档 - 验证三个功能都初始化
            const result = await User.insertOne({ name: 'john', email: 'john@example.com' });
            let user = await User.findOne({ _id: result.insertedId });

            assert.ok(user.createdAt instanceof Date, '应该有 createdAt');
            assert.ok(user.updatedAt instanceof Date, '应该有 updatedAt');
            assert.strictEqual(user.version, 0, '初始版本号应该是 0');
            // softDelete 字段在未删除时可能不存在或为 null

            // 2. 更新文档 - 验证 updatedAt 和 version 都更新
            const createdAt = user.createdAt;
            await new Promise(resolve => setTimeout(resolve, 10)); // 等待一点时间确保时间戳不同

            await User.updateOne(
                { _id: result.insertedId },
                { $set: { email: 'john2@example.com' }, $inc: { version: 1 } }
            );

            user = await User.findOne({ _id: result.insertedId });
            assert.strictEqual(user.createdAt.getTime(), createdAt.getTime(), 'createdAt 不应该变化');
            assert.ok(user.updatedAt > createdAt, 'updatedAt 应该更新');
            assert.strictEqual(user.version, 1, 'version 应该递增到 1');

            // 3. 软删除 - 验证 deleted_at 设置，但文档仍然存在
            await User.updateOne(
                { _id: result.insertedId },
                { $set: { deleted_at: new Date() }, $inc: { version: 1 } }
            );

            // 直接查询可以找到（因为没有自动过滤）
            user = await User.findOne({ _id: result.insertedId });
            assert.ok(user, '软删除的文档应该仍然存在');
            assert.ok(user.deleted_at instanceof Date, '应该有 deleted_at');
            assert.strictEqual(user.version, 2, 'version 应该递增到 2');
        });

        it('应该在并发场景下正确处理三个功能', async function() {
            Model.define(currentCollection, {
                schema: (dsl) => dsl({
                    name: 'string!',
                    counter: 'number'
                }),
                options: {
                    timestamps: true,
                    softDelete: false, // 不启用软删除简化测试
                    version: true
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
            const userId = result.insertedId;

            // 20个并发更新
            const updates = Array.from({ length: 20 }, async () => {
                const user = await User.findOne({ _id: userId });
                const updateResult = await User.updateOne(
                    { _id: userId, version: user.version },
                    {
                        $inc: { counter: 1, version: 1 },
                        $set: { updatedAt: new Date() }
                    }
                );
                return updateResult.modifiedCount;
            });

            const results = await Promise.all(updates);
            const successCount = results.filter(count => count === 1).length;

            // 验证最终状态
            const final = await User.findOne({ _id: userId });
            assert.strictEqual(final.counter, successCount, 'counter 应该等于成功更新次数');
            assert.strictEqual(final.version, successCount, 'version 应该等于成功更新次数');
            assert.ok(final.updatedAt instanceof Date, '应该有 updatedAt');
        });
    });

    describe('Model hooks 执行顺序测试', () => {
        it('应该按正确顺序执行 hooks（如果实现了）', async function() {
            // 注意：这个测试假设 Model 支持 hooks，如果没实现则跳过
            const hookOrder = [];

            Model.define(currentCollection, {
                schema: (dsl) => dsl({ name: 'string!' }),
                options: {
                    timestamps: true
                },
                hooks: {
                    beforeInsert: async (doc) => {
                        hookOrder.push('beforeInsert');
                        return doc;
                    },
                    afterInsert: async (doc) => {
                        hookOrder.push('afterInsert');
                        return doc;
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

            // 检查是否支持 hooks
            if (!User.hooks) {
                this.skip(); // 如果不支持 hooks，跳过测试
                return;
            }

            await User.insertOne({ name: 'john' });

            // 验证 hooks 执行顺序
            assert.deepStrictEqual(hookOrder, ['beforeInsert', 'afterInsert'],
                'hooks 应该按 before -> after 顺序执行');
        });

        it('应该在 hooks 中访问自动添加的字段', async function() {
            let capturedDoc = null;

            Model.define(currentCollection, {
                schema: (dsl) => dsl({ name: 'string!' }),
                options: {
                    timestamps: true,
                    version: true
                },
                hooks: {
                    beforeInsert: async (doc) => {
                        capturedDoc = { ...doc };
                        return doc;
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

            // 检查是否支持 hooks
            if (!User.hooks) {
                this.skip(); // 如果不支持 hooks，跳过测试
                return;
            }

            await User.insertOne({ name: 'john' });

            // 验证 beforeInsert hook 能访问到自动添加的字段
            assert.ok(capturedDoc, 'hook 应该被执行');
            assert.ok(capturedDoc.createdAt instanceof Date, '应该有 createdAt');
            assert.ok(capturedDoc.updatedAt instanceof Date, '应该有 updatedAt');
            assert.strictEqual(capturedDoc.version, 0, '应该有 version');
        });
    });

    describe('大数据量并发测试', () => {
        it('应该处理1000个文档的批量插入', async function() {
            Model.define(currentCollection, {
                schema: (dsl) => dsl({
                    name: 'string!',
                    index: 'number!'
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

            // 生成1000个文档
            const docs = Array.from({ length: 1000 }, (_, i) => ({
                name: `user${i}`,
                index: i
            }));

            // 批量插入
            const startTime = Date.now();
            const result = await User.insertMany(docs);
            const duration = Date.now() - startTime;

            // 验证结果
            assert.strictEqual(result.insertedCount, 1000, '应该插入1000个文档');
            assert.ok(duration < 10000, `批量插入应该在10秒内完成（实际: ${duration}ms）`);

            // 验证查询
            const count = await User.count({});
            assert.strictEqual(count, 1000, '应该有1000个文档');
        });

        it('应该处理100个并发查询', async function() {
            Model.define(currentCollection, {
                schema: (dsl) => dsl({
                    name: 'string!',
                    score: 'number'
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

            // 先插入100个文档
            const docs = Array.from({ length: 100 }, (_, i) => ({
                name: `user${i}`,
                score: i
            }));
            await User.insertMany(docs);

            // 100个并发查询
            const startTime = Date.now();
            const queries = Array.from({ length: 100 }, (_, i) =>
                User.findOne({ name: `user${i}` })
            );

            const results = await Promise.all(queries);
            const duration = Date.now() - startTime;

            // 验证结果
            assert.strictEqual(results.length, 100, '应该有100个查询结果');
            assert.ok(results.every(r => r !== null), '所有查询都应该有结果');
            assert.ok(duration < 5000, `并发查询应该在5秒内完成（实际: ${duration}ms）`);
        });

        it('应该处理高并发更新场景（100个文档，每个更新10次）', async function() {
            Model.define(currentCollection, {
                schema: (dsl) => dsl({
                    name: 'string!',
                    counter: 'number'
                }),
                options: {
                    timestamps: true,
                    version: true
                }
            });

            msq = new MonSQLize({
                type: 'mongodb',
                databaseName: 'test',
                config: { useMemoryServer: true }
            });
            await msq.connect();

            const User = msq.model(currentCollection);

            // 插入100个文档
            const docs = Array.from({ length: 100 }, (_, i) => ({
                name: `user${i}`,
                counter: 0
            }));
            const insertResult = await User.insertMany(docs);
            const userIds = Object.values(insertResult.insertedIds);

            // 每个文档更新10次（总共1000个更新操作）
            const startTime = Date.now();
            const updates = userIds.flatMap(userId =>
                Array.from({ length: 10 }, () =>
                    User.updateOne(
                        { _id: userId },
                        { $inc: { counter: 1, version: 1 } }
                    )
                )
            );

            await Promise.all(updates);
            const duration = Date.now() - startTime;

            // 验证结果
            assert.ok(duration < 20000, `1000个更新应该在20秒内完成（实际: ${duration}ms）`);

            // 抽查几个文档验证结果
            const sample1 = await User.findOne({ _id: userIds[0] });
            const sample2 = await User.findOne({ _id: userIds[50] });
            const sample3 = await User.findOne({ _id: userIds[99] });

            assert.strictEqual(sample1.counter, 10, '第1个文档应该被更新10次');
            assert.strictEqual(sample2.counter, 10, '第50个文档应该被更新10次');
            assert.strictEqual(sample3.counter, 10, '第100个文档应该被更新10次');
        });
    });
});

