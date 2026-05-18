/**
 * Model - version (乐观锁版本控制) 单元测试
 *
 * 测试内容：
 * 1. 配置解析测试
 * 2. 插入时初始化版本号
 * 3. 更新时自动递增版本号
 * 4. 自定义字段名
 * 5. 与 timestamps 协同
 * 6. 与 softDelete 协同
 */

const assert = require('assert');
const { parseVersionConfig } = require('../../../lib/model/features/version');
const MonSQLize = require('../../../lib/index');
const { Model } = MonSQLize;

// 测试计数器，用于生成唯一集合名
let testCollectionCounter = 0;

// 辅助函数：生成唯一集合名
function getUniqueCollection() {
    return `version_test_${Date.now()}_${testCollectionCounter++}`;
}

describe('Model - version (Optimistic Locking)', function() {
    this.timeout(30000);

    // 最后统一关闭所有资源
    after(async function() {
        Model._clear();
    });

    // 每次测试后清理
    afterEach(async function() {
        Model._clear();
    });

    // ========== 配置解析测试 ==========
    describe('Configuration Parsing', () => {
        it('should parse version: true correctly', () => {
            const config = parseVersionConfig(true);
            assert.ok(config);
            assert.strictEqual(config.enabled, true);
            assert.strictEqual(config.field, 'version');
        });

        it('should parse full version config', () => {
            const config = parseVersionConfig({
                enabled: true,
                field: '__v'
            });
            assert.ok(config);
            assert.strictEqual(config.enabled, true);
            assert.strictEqual(config.field, '__v');
        });

        it('should return null for version: false', () => {
            const config = parseVersionConfig(false);
            assert.strictEqual(config, null);
        });

        it('should use default field name when not specified', () => {
            const config = parseVersionConfig({ enabled: true });
            assert.strictEqual(config.field, 'version');
        });
    });

    // ========== Model 定义测试 ==========
    describe('Model Definition', () => {
        it('should enable version with version: true', () => {
            const collName = getUniqueCollection();
            Model.define(collName, {
                schema: (dsl) => dsl({ name: 'string!' }),
                options: {
                    version: true
                }
            });

            const modelDef = Model.get(collName);
            assert.ok(modelDef);
            assert.strictEqual(modelDef.definition.options.version, true);
        });

        it('should enable version with full config', () => {
            const collName = getUniqueCollection();
            Model.define(collName, {
                schema: (dsl) => dsl({ name: 'string!' }),
                options: {
                    version: {
                        enabled: true,
                        field: '__v'
                    }
                }
            });

            const modelDef = Model.get(collName);
            const config = modelDef.definition.options.version;
            assert.strictEqual(config.enabled, true);
            assert.strictEqual(config.field, '__v');
        });

        it('should work without version config', () => {
            const collName = getUniqueCollection();
            Model.define(collName, {
                schema: (dsl) => dsl({ name: 'string!' })
            });

            const modelDef = Model.get(collName);
            assert.ok(modelDef);
            assert.strictEqual(modelDef.definition.options?.version, undefined);
        });
    });

    // ========== 与 timestamps 协同 ==========
    describe('Integration with Timestamps', () => {
        it('should work with timestamps feature', () => {
            const collName = getUniqueCollection();
            Model.define(collName, {
                schema: (dsl) => dsl({ name: 'string!' }),
                options: {
                    timestamps: true,
                    version: true
                }
            });

            const modelDef = Model.get(collName);
            assert.ok(modelDef);
            assert.strictEqual(modelDef.definition.options.timestamps, true);
            assert.strictEqual(modelDef.definition.options.version, true);
        });

        it('should work with custom field names', () => {
            const collName = getUniqueCollection();
            Model.define(collName, {
                schema: (dsl) => dsl({ name: 'string!' }),
                options: {
                    timestamps: {
                        createdAt: 'created_time',
                        updatedAt: 'updated_time'
                    },
                    version: {
                        enabled: true,
                        field: '__version'
                    }
                }
            });

            const modelDef = Model.get(collName);
            assert.ok(modelDef);
            assert.strictEqual(modelDef.definition.options.version.field, '__version');
        });
    });

    // ========== 与 softDelete 协同 ==========
    describe('Integration with SoftDelete', () => {
        it('should work with softDelete feature', () => {
            const collName = getUniqueCollection();
            Model.define(collName, {
                schema: (dsl) => dsl({ name: 'string!' }),
                options: {
                    softDelete: true,
                    version: true
                }
            });

            const modelDef = Model.get(collName);
            assert.ok(modelDef);
            assert.strictEqual(modelDef.definition.options.softDelete, true);
            assert.strictEqual(modelDef.definition.options.version, true);
        });

        it('should work with all features enabled', () => {
            const collName = getUniqueCollection();
            Model.define(collName, {
                schema: (dsl) => dsl({ name: 'string!' }),
                options: {
                    timestamps: true,
                    softDelete: true,
                    version: true
                }
            });

            const modelDef = Model.get(collName);
            assert.ok(modelDef);
            assert.strictEqual(modelDef.definition.options.timestamps, true);
            assert.strictEqual(modelDef.definition.options.softDelete, true);
            assert.strictEqual(modelDef.definition.options.version, true);
        });
    });

    // ========== Day 3: 乐观锁实际功能测试 ==========
    describe('乐观锁并发冲突检测', () => {
        it('应该检测并发更新冲突', async function() {
            const collName = getUniqueCollection();
            Model.define(collName, {
                schema: (dsl) => dsl({
                    name: 'string!',
                    score: 'number'
                }),
                options: {
                    version: true
                }
            });

            const msq = new MonSQLize({
                type: 'mongodb',
                databaseName: 'test',
                config: { useMemoryServer: true }
            });
            await msq.connect();

            const User = msq.model(collName);

            // 插入一个文档
            const result = await User.insertOne({ name: 'john', score: 100 });
            const userId = result.insertedId;

            // 第一个用户读取文档（version = 0）
            const user1 = await User.findOne({ _id: userId });

            // 第二个用户也读取文档（version = 0）
            const user2 = await User.findOne({ _id: userId });

            // 第一个用户更新成功（version 0 -> 1）
            const update1 = await User.updateOne(
                { _id: userId, version: user1.version },
                { $set: { score: 150 }, $inc: { version: 1 } }
            );
            assert.strictEqual(update1.modifiedCount, 1, '第一个更新应该成功');

            // 第二个用户尝试更新（version 仍然是 0，但数据库已经是 1）
            const update2 = await User.updateOne(
                { _id: userId, version: user2.version },
                { $set: { score: 200 }, $inc: { version: 1 } }
            );
            assert.strictEqual(update2.modifiedCount, 0, '第二个更新应该失败（乐观锁冲突）');

            // 验证最终结果是第一个用户的更新
            const final = await User.findOne({ _id: userId });
            assert.strictEqual(final.score, 150, '应该是第一个用户的值');
            assert.strictEqual(final.version, 1, 'version 应该是 1');

            await msq.close();
        });

        it('应该支持高并发场景下的版本冲突检测', async function() {
            const collName = getUniqueCollection();
            Model.define(collName, {
                schema: (dsl) => dsl({
                    name: 'string!',
                    counter: 'number'
                }),
                options: {
                    version: true
                }
            });

            const msq = new MonSQLize({
                type: 'mongodb',
                databaseName: 'test',
                config: { useMemoryServer: true }
            });
            await msq.connect();

            const User = msq.model(collName);

            // 插入一个文档
            const result = await User.insertOne({ name: 'john', counter: 0 });
            const userId = result.insertedId;

            // 模拟 50 个并发更新
            const updates = Array.from({ length: 50 }, async () => {
                // 读取当前版本
                const user = await User.findOne({ _id: userId });

                // 尝试更新（带版本检查）
                const updateResult = await User.updateOne(
                    { _id: userId, version: user.version },
                    { $inc: { counter: 1, version: 1 } }
                );

                return updateResult.modifiedCount;
            });

            const results = await Promise.all(updates);

            // 统计成功和失败的更新
            const successCount = results.filter(count => count === 1).length;
            const failCount = results.filter(count => count === 0).length;

            // 验证：只有部分更新成功（因为有版本冲突）
            assert.ok(successCount > 0, '应该有成功的更新');
            assert.ok(failCount > 0, '应该有失败的更新（版本冲突）');
            assert.strictEqual(successCount + failCount, 50, '总数应该是 50');

            // 验证最终 counter 值等于成功更新的次数
            const final = await User.findOne({ _id: userId });
            assert.strictEqual(final.counter, successCount,
                `counter 应该等于成功更新次数: ${successCount}`);

            await msq.close();
        });
    });

    describe('版本号自动递增验证', () => {
        it('应该在插入时初始化版本号为 0', async function() {
            const collName = getUniqueCollection();
            Model.define(collName, {
                schema: (dsl) => dsl({ name: 'string!' }),
                options: {
                    version: true
                }
            });

            const msq = new MonSQLize({
                type: 'mongodb',
                databaseName: 'test',
                config: { useMemoryServer: true }
            });
            await msq.connect();

            const User = msq.model(collName);

            // 插入文档
            const result = await User.insertOne({ name: 'john' });
            const user = await User.findOne({ _id: result.insertedId });

            // 验证初始版本号
            assert.strictEqual(user.version, 0, '初始版本号应该是 0');

            await msq.close();
        });

        it('应该在每次更新时自动递增版本号', async function() {
            const collName = getUniqueCollection();
            Model.define(collName, {
                schema: (dsl) => dsl({
                    name: 'string!',
                    email: 'string'
                }),
                options: {
                    version: true
                }
            });

            const msq = new MonSQLize({
                type: 'mongodb',
                databaseName: 'test',
                config: { useMemoryServer: true }
            });
            await msq.connect();

            const User = msq.model(collName);

            // 插入文档
            const result = await User.insertOne({ name: 'john' });
            const userId = result.insertedId;

            // 第一次更新
            await User.updateOne(
                { _id: userId },
                { $set: { email: 'john@example.com' }, $inc: { version: 1 } }
            );
            let user = await User.findOne({ _id: userId });
            assert.strictEqual(user.version, 1, 'version 应该是 1');

            // 第二次更新
            await User.updateOne(
                { _id: userId },
                { $set: { email: 'john2@example.com' }, $inc: { version: 1 } }
            );
            user = await User.findOne({ _id: userId });
            assert.strictEqual(user.version, 2, 'version 应该是 2');

            // 第三次更新
            await User.updateOne(
                { _id: userId },
                { $set: { email: 'john3@example.com' }, $inc: { version: 1 } }
            );
            user = await User.findOne({ _id: userId });
            assert.strictEqual(user.version, 3, 'version 应该是 3');

            await msq.close();
        });
    });

    describe('自定义版本字段名', () => {
        it('应该支持自定义版本字段名', async function() {
            const collName = getUniqueCollection();
            Model.define(collName, {
                schema: (dsl) => dsl({ name: 'string!' }),
                options: {
                    version: {
                        enabled: true,
                        field: '__v'
                    }
                }
            });

            const msq = new MonSQLize({
                type: 'mongodb',
                databaseName: 'test',
                config: { useMemoryServer: true }
            });
            await msq.connect();

            const User = msq.model(collName);

            // 插入文档
            const result = await User.insertOne({ name: 'john' });
            const user = await User.findOne({ _id: result.insertedId });

            // 验证使用自定义字段名
            assert.strictEqual(user.__v, 0, '自定义字段 __v 应该是 0');
            assert.strictEqual(user.version, undefined, '默认字段 version 不应该存在');

            await msq.close();
        });
    });

    describe('与其他功能协同测试（实际运行）', () => {
        it('应该与 timestamps 协同工作', async function() {
            const collName = getUniqueCollection();
            Model.define(collName, {
                schema: (dsl) => dsl({ name: 'string!' }),
                options: {
                    timestamps: true,
                    version: true
                }
            });

            const msq = new MonSQLize({
                type: 'mongodb',
                databaseName: 'test',
                config: { useMemoryServer: true }
            });
            await msq.connect();

            const User = msq.model(collName);

            // 插入文档
            const result = await User.insertOne({ name: 'john' });
            const user = await User.findOne({ _id: result.insertedId });

            // 验证同时有时间戳和版本号
            assert.ok(user.createdAt instanceof Date, '应该有 createdAt');
            assert.ok(user.updatedAt instanceof Date, '应该有 updatedAt');
            assert.strictEqual(user.version, 0, '应该有 version');

            await msq.close();
        });

        it('应该与 timestamps + softDelete 协同工作', async function() {
            const collName = getUniqueCollection();
            Model.define(collName, {
                schema: (dsl) => dsl({ name: 'string!' }),
                options: {
                    timestamps: true,
                    softDelete: true,
                    version: true
                }
            });

            const msq = new MonSQLize({
                type: 'mongodb',
                databaseName: 'test',
                config: { useMemoryServer: true }
            });
            await msq.connect();

            const User = msq.model(collName);

            // 插入文档
            const result = await User.insertOne({ name: 'john' });
            const user = await User.findOne({ _id: result.insertedId });

            // 验证所有功能都启用
            assert.ok(user.createdAt instanceof Date, '应该有 createdAt');
            assert.ok(user.updatedAt instanceof Date, '应该有 updatedAt');
            assert.strictEqual(user.version, 0, '应该有 version');
            // 注意：softDelete 字段在未删除时可能是 null 或不存在

            await msq.close();
        });
    });
});
