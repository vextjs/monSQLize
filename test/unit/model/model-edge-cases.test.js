/**
 * Model - 边界情况测试
 *
 * 测试内容：
 * 1. 空 schema 定义测试
 * 2. 超大文档处理测试
 */

const assert = require('assert');
const MonSQLize = require('../../../lib/index');
const { Model } = MonSQLize;

// 测试计数器，用于生成唯一集合名
let testCollectionCounter = 0;

// 辅助函数：生成唯一集合名
function getUniqueCollection() {
    return `edgecase_test_${Date.now()}_${testCollectionCounter++}`;
}

describe('Model - Edge Cases', function() {
    this.timeout(60000);

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

    // ========== Day 5: 边界情况测试 ==========
    describe('空 schema 定义测试', () => {
        it('应该接受空 schema 定义（只使用 MongoDB 原生结构）', async function() {
            Model.define(currentCollection, {
                schema: (dsl) => dsl({}),
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

            // 插入任意结构的文档
            const result = await User.insertOne({
                name: 'john',
                age: 30,
                tags: ['developer', 'nodejs'],
                metadata: {
                    level: 5,
                    score: 100
                }
            });

            // 验证插入成功
            assert.ok(result.insertedId, '应该返回插入的 ID');

            // 查询文档
            const user = await User.findOne({ _id: result.insertedId });
            assert.strictEqual(user.name, 'john', '应该保留 name 字段');
            assert.strictEqual(user.age, 30, '应该保留 age 字段');
            assert.ok(Array.isArray(user.tags), '应该保留 tags 数组');
            assert.ok(user.metadata, '应该保留 metadata 对象');
            assert.ok(user.createdAt instanceof Date, '应该有 createdAt');
        });

        it('应该在空 schema 下支持所有功能', async function() {
            Model.define(currentCollection, {
                schema: (dsl) => dsl({}),
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

            // 插入文档
            const result = await User.insertOne({ customField: 'value' });
            let user = await User.findOne({ _id: result.insertedId });

            // 验证所有功能都正常工作
            assert.ok(user.createdAt instanceof Date, '应该有 createdAt');
            assert.ok(user.updatedAt instanceof Date, '应该有 updatedAt');
            assert.strictEqual(user.version, 0, '应该有 version');
            assert.strictEqual(user.customField, 'value', '应该保留自定义字段');
        });

        it('应该拒绝 undefined 或 null 的 schema', function() {
            try {
                Model.define(currentCollection, {
                    schema: undefined,
                    options: {}
                });
                assert.fail('应该抛出错误');
            } catch (err) {
                assert.ok(err.message.includes('schema') || err.message.includes('required'),
                    '错误消息应该提到 schema');
            }
        });
    });

    describe('超大文档处理测试', () => {
        it('应该处理接近 MongoDB 16MB 限制的大文档', async function() {
            Model.define(currentCollection, {
                schema: (dsl) => dsl({
                    name: 'string!',
                    data: 'string'
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

            // 生成一个 10MB 的字符串（MongoDB 限制是 16MB）
            const largeString = 'x'.repeat(10 * 1024 * 1024);

            // 插入大文档
            const result = await User.insertOne({
                name: 'large-doc',
                data: largeString
            });

            assert.ok(result.insertedId, '应该成功插入大文档');

            // 查询大文档
            const user = await User.findOne({ _id: result.insertedId });
            assert.strictEqual(user.name, 'large-doc', '应该能查询到大文档');
            assert.strictEqual(user.data.length, 10 * 1024 * 1024, '数据长度应该正确');
        });

        it('应该处理包含大量字段的文档', async function() {
            Model.define(currentCollection, {
                schema: (dsl) => dsl({}), // 空 schema 允许任意字段
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

            // 生成包含 1000 个字段的文档
            const doc = { name: 'many-fields' };
            for (let i = 0; i < 1000; i++) {
                doc[`field_${i}`] = `value_${i}`;
            }

            // 插入文档
            const result = await User.insertOne(doc);
            assert.ok(result.insertedId, '应该成功插入多字段文档');

            // 查询文档
            const user = await User.findOne({ _id: result.insertedId });
            assert.strictEqual(user.name, 'many-fields', '应该能查询到文档');
            
            // 验证字段数量（1000 + name + createdAt + updatedAt + _id）
            const fieldCount = Object.keys(user).length;
            assert.ok(fieldCount >= 1003, `应该至少有 1003 个字段（实际: ${fieldCount}）`);
        });

        it('应该处理深度嵌套的文档结构', async function() {
            Model.define(currentCollection, {
                schema: (dsl) => dsl({}),
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

            // 生成深度嵌套的对象（50层）
            let deepObj = { value: 'deep' };
            for (let i = 0; i < 50; i++) {
                deepObj = { nested: deepObj };
            }

            // 插入深度嵌套的文档
            const result = await User.insertOne({
                name: 'deep-nested',
                data: deepObj
            });

            assert.ok(result.insertedId, '应该成功插入深度嵌套文档');

            // 查询文档
            const user = await User.findOne({ _id: result.insertedId });
            assert.strictEqual(user.name, 'deep-nested', '应该能查询到文档');
            
            // 验证嵌套深度
            let current = user.data;
            let depth = 0;
            while (current.nested) {
                current = current.nested;
                depth++;
            }
            assert.strictEqual(depth, 50, '嵌套深度应该是 50');
            assert.strictEqual(current.value, 'deep', '最深层的值应该正确');
        });

        it('应该处理包含大数组的文档', async function() {
            Model.define(currentCollection, {
                schema: (dsl) => dsl({
                    name: 'string!',
                    items: 'array'
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

            // 生成包含 10000 个元素的数组
            const largeArray = Array.from({ length: 10000 }, (_, i) => ({
                id: i,
                value: `item_${i}`,
                timestamp: new Date()
            }));

            // 插入包含大数组的文档
            const result = await User.insertOne({
                name: 'large-array',
                items: largeArray
            });

            assert.ok(result.insertedId, '应该成功插入大数组文档');

            // 查询文档
            const user = await User.findOne({ _id: result.insertedId });
            assert.strictEqual(user.name, 'large-array', '应该能查询到文档');
            assert.strictEqual(user.items.length, 10000, '数组长度应该是 10000');
            assert.strictEqual(user.items[0].id, 0, '第一个元素应该正确');
            assert.strictEqual(user.items[9999].id, 9999, '最后一个元素应该正确');
        });
    });
});

