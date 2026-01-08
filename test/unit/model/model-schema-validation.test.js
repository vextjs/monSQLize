/**
 * Model Schema Validation 测试
 * 测试 v1.0.7 新增的 Schema 验证默认启用功能
 *
 * @since v1.0.7
 */

const assert = require('assert');
const MonSQLize = require('../../../lib/index');
const { Model } = MonSQLize;

describe('Model Schema Validation - v1.0.7 默认启用', function() {
    this.timeout(30000);

    let msq;
    let testCollection;

    // 测试计数器
    let testCounter = 0;

    function getUniqueCollection() {
        return `test_schema_${Date.now()}_${testCounter++}`;
    }

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

    beforeEach(function() {
        testCollection = getUniqueCollection();
        Model._clear();
    });

    describe('默认行为（v1.0.7+）', function() {
        it('应该默认启用验证', async function() {
            Model.define(testCollection, {
                schema: (dsl) => dsl({
                    username: 'string:3-32!'
                })
            });

            msq = new MonSQLize({
                type: 'mongodb',
                databaseName: 'test_schema',
                config: { useMemoryServer: true }
            });

            await msq.connect();

            const TestModel = msq.model(testCollection);

            // 验证应该自动生效
            try {
                await TestModel.insertOne({ username: 'ab' });  // 太短
                assert.fail('应该抛出验证错误');
            } catch (err) {
                assert.strictEqual(err.code, 'VALIDATION_ERROR');
            }
        });

        it('应该在 insertOne 时验证', async function() {
            Model.define(testCollection, {
                schema: (dsl) => dsl({
                    username: 'string:3-32!',
                    email: 'email!'
                })
            });

            msq = new MonSQLize({
                type: 'mongodb',
                databaseName: 'test_schema',
                config: { useMemoryServer: true }
            });

            await msq.connect();

            const TestModel = msq.model(testCollection);

            // 验证失败
            try {
                await TestModel.insertOne({
                    username: 'ab',  // 太短
                    email: 'invalid-email'  // 邮箱格式错误
                });
                assert.fail('应该抛出验证错误');
            } catch (err) {
                assert.strictEqual(err.code, 'VALIDATION_ERROR');
                assert.ok(err.errors);
                assert.ok(Array.isArray(err.errors));
            }

            // 验证成功
            const result = await TestModel.insertOne({
                username: 'john',
                email: 'john@example.com'
            });
            assert.ok(result.acknowledged);
        });

        it('应该在 insertMany 时逐个验证', async function() {
            Model.define(testCollection, {
                schema: (dsl) => dsl({
                    username: 'string:3-32!'
                })
            });

            msq = new MonSQLize({
                type: 'mongodb',
                databaseName: 'test_schema',
                config: { useMemoryServer: true }
            });

            await msq.connect();

            const TestModel = msq.model(testCollection);

            // 第2个文档验证失败
            try {
                await TestModel.insertMany([
                    { username: 'john' },  // ✅ 正确
                    { username: 'ab' },    // ❌ 太短
                    { username: 'alice' }  // ✅ 正确
                ]);
                assert.fail('应该抛出验证错误');
            } catch (err) {
                assert.strictEqual(err.code, 'VALIDATION_ERROR');
                assert.strictEqual(err.index, 1);  // 第2个文档（索引1）
            }
        });
    });

    describe('验证错误详情', function() {
        it('应该返回详细的错误信息', async function() {
            Model.define(testCollection, {
                schema: (dsl) => dsl({
                    username: 'string:3-32!',
                    email: 'email!',
                    age: 'number:0-120'
                })
            });

            msq = new MonSQLize({
                type: 'mongodb',
                databaseName: 'test_schema',
                config: { useMemoryServer: true }
            });

            await msq.connect();

            const TestModel = msq.model(testCollection);

            try {
                await TestModel.insertOne({
                    username: 'ab',  // 太短
                    email: 'invalid',  // 邮箱格式错误
                    age: 150  // 超出范围
                });
                assert.fail('应该抛出验证错误');
            } catch (err) {
                assert.strictEqual(err.code, 'VALIDATION_ERROR');
                assert.ok(err.message.includes('Schema validation failed'));
                assert.ok(Array.isArray(err.errors));
                assert.ok(err.errors.length > 0);
            }
        });

        it('应该指示错误的字段名', async function() {
            Model.define(testCollection, {
                schema: (dsl) => dsl({
                    username: 'string:3-32!'
                })
            });

            msq = new MonSQLize({
                type: 'mongodb',
                databaseName: 'test_schema',
                config: { useMemoryServer: true }
            });

            await msq.connect();

            const TestModel = msq.model(testCollection);

            try {
                await TestModel.insertOne({ username: 'ab' });
                assert.fail('应该抛出验证错误');
            } catch (err) {
                assert.ok(err.message.includes('username'));
            }
        });

        it('应该指示错误类型', async function() {
            Model.define(testCollection, {
                schema: (dsl) => dsl({
                    username: 'string!',
                    age: 'number!'
                })
            });

            msq = new MonSQLize({
                type: 'mongodb',
                databaseName: 'test_schema',
                config: { useMemoryServer: true }
            });

            await msq.connect();

            const TestModel = msq.model(testCollection);

            // 类型错误
            try {
                await TestModel.insertOne({
                    username: 'john',
                    age: 'not-a-number'  // 类型错误
                });
                assert.fail('应该抛出验证错误');
            } catch (err) {
                assert.strictEqual(err.code, 'VALIDATION_ERROR');
                // 验证错误应该包含 age 字段相关的错误
                assert.ok(err.message.includes('age') || err.errors);
            }

            // 必填字段缺失
            try {
                await TestModel.insertOne({ username: 'john' });  // 缺少 age
                assert.fail('应该抛出验证错误');
            } catch (err) {
                assert.strictEqual(err.code, 'VALIDATION_ERROR');
                // 验证错误应该提示缺少必填字段
                assert.ok(err.message.includes('age') || err.message.includes('required'));
            }
        });

        it('应该在批量插入时指示错误索引', async function() {
            Model.define(testCollection, {
                schema: (dsl) => dsl({
                    username: 'string:3-32!'
                })
            });

            msq = new MonSQLize({
                type: 'mongodb',
                databaseName: 'test_schema',
                config: { useMemoryServer: true }
            });

            await msq.connect();

            const TestModel = msq.model(testCollection);

            try {
                await TestModel.insertMany([
                    { username: 'john' },
                    { username: 'alice' },
                    { username: 'ab' },  // 第3个文档错误
                    { username: 'bob' }
                ]);
                assert.fail('应该抛出验证错误');
            } catch (err) {
                assert.strictEqual(err.code, 'VALIDATION_ERROR');
                assert.strictEqual(err.index, 2);  // 索引 2
            }
        });
    });

    describe('禁用验证', function() {
        it('应该支持全局禁用', async function() {
            Model.define(testCollection, {
                schema: (dsl) => dsl({
                    username: 'string:3-32!'
                }),
                options: { validate: false }  // 全局禁用
            });

            msq = new MonSQLize({
                type: 'mongodb',
                databaseName: 'test_schema',
                config: { useMemoryServer: true }
            });

            await msq.connect();

            const TestModel = msq.model(testCollection);

            // 验证不生效，任何数据都能插入
            const result = await TestModel.insertOne({ username: 'ab' });
            assert.ok(result.acknowledged);
        });

        it('应该支持单次操作跳过', async function() {
            Model.define(testCollection, {
                schema: (dsl) => dsl({
                    username: 'string:3-32!'
                })
            });

            msq = new MonSQLize({
                type: 'mongodb',
                databaseName: 'test_schema',
                config: { useMemoryServer: true }
            });

            await msq.connect();

            const TestModel = msq.model(testCollection);

            // 正常情况下验证生效
            try {
                await TestModel.insertOne({ username: 'ab' });
                assert.fail('应该抛出验证错误');
            } catch (err) {
                assert.strictEqual(err.code, 'VALIDATION_ERROR');
            }

            // 跳过验证
            const result = await TestModel.insertOne(
                { username: 'ab' },
                { skipValidation: true }
            );
            assert.ok(result.acknowledged);
        });

        it('应该在跳过验证时仍然执行 hooks', async function() {
            let hookExecuted = false;

            Model.define(testCollection, {
                schema: (dsl) => dsl({
                    username: 'string:3-32!'
                }),
                hooks: (model) => ({
                    insert: {
                        before: async (ctx, doc) => {
                            hookExecuted = true;
                            doc.timestamp = Date.now();
                            return doc;
                        }
                    }
                })
            });

            msq = new MonSQLize({
                type: 'mongodb',
                databaseName: 'test_schema',
                config: { useMemoryServer: true }
            });

            await msq.connect();

            const TestModel = msq.model(testCollection);

            // 跳过验证
            const result = await TestModel.insertOne(
                { username: 'ab' },
                { skipValidation: true }
            );

            // Hook 应该仍然执行
            assert.ok(hookExecuted);

            // 从数据库查询验证 Hook 添加的字段
            const doc = await TestModel.findOne({ _id: result.insertedId });
            assert.ok(doc.timestamp);
        });
    });

    describe('兼容性测试', function() {
        it('应该对未定义 schema 的 Model 无影响', async function() {
            Model.define(testCollection, {
                schema: (dsl) => dsl({})  // 空 schema
            });

            msq = new MonSQLize({
                type: 'mongodb',
                databaseName: 'test_schema',
                config: { useMemoryServer: true }
            });

            await msq.connect();

            const TestModel = msq.model(testCollection);

            // 无验证，任意数据都能插入
            const result = await TestModel.insertOne({
                any: 'data',
                random: 123,
                nested: { field: true }
            });
            assert.ok(result.acknowledged);
        });

        it('应该对 v1.0.6 风格的配置兼容', async function() {
            Model.define(testCollection, {
                schema: (dsl) => dsl({
                    username: 'string:3-32!'
                }),
                options: { validate: true }  // 显式启用（v1.0.6 风格）
            });

            msq = new MonSQLize({
                type: 'mongodb',
                databaseName: 'test_schema',
                config: { useMemoryServer: true }
            });

            await msq.connect();

            const TestModel = msq.model(testCollection);

            // 应该正常验证
            try {
                await TestModel.insertOne({ username: 'ab' });
                assert.fail('应该抛出验证错误');
            } catch (err) {
                assert.strictEqual(err.code, 'VALIDATION_ERROR');
            }

            // 正确数据应该通过
            const result = await TestModel.insertOne({ username: 'john' });
            assert.ok(result.acknowledged);
        });

        it('应该对可选字段正确处理', async function() {
            Model.define(testCollection, {
                schema: (dsl) => dsl({
                    username: 'string:3-32!',  // 必需
                    age: 'number:0-120'        // 可选
                })
            });

            msq = new MonSQLize({
                type: 'mongodb',
                databaseName: 'test_schema',
                config: { useMemoryServer: true }
            });

            await msq.connect();

            const TestModel = msq.model(testCollection);

            // 不提供可选字段应该成功
            const result1 = await TestModel.insertOne({ username: 'john' });
            assert.ok(result1.acknowledged);

            // 提供可选字段应该成功
            const result2 = await TestModel.insertOne({
                username: 'alice',
                age: 25
            });
            assert.ok(result2.acknowledged);

            // 可选字段验证失败应该报错
            try {
                await TestModel.insertOne({
                    username: 'bob',
                    age: 150  // 超出范围
                });
                assert.fail('应该抛出验证错误');
            } catch (err) {
                assert.strictEqual(err.code, 'VALIDATION_ERROR');
            }
        });
    });

    describe('性能测试', function() {
        it('验证不应显著影响性能', async function() {
            this.timeout(60000);

            Model.define(testCollection, {
                schema: (dsl) => dsl({
                    username: 'string:3-32!',
                    email: 'email!'
                })
            });

            msq = new MonSQLize({
                type: 'mongodb',
                databaseName: 'test_schema',
                config: { useMemoryServer: true }
            });

            await msq.connect();

            const TestModel = msq.model(testCollection);

            const doc = {
                username: 'john',
                email: 'john@example.com'
            };

            const iterations = 1000;

            // 带验证的插入
            const startWithValidation = Date.now();
            for (let i = 0; i < iterations; i++) {
                await TestModel.insertOne({ ...doc, username: `user${i}` });
            }
            const durationWithValidation = Date.now() - startWithValidation;

            // 跳过验证的插入
            const startWithoutValidation = Date.now();
            for (let i = 0; i < iterations; i++) {
                await TestModel.insertOne(
                    { ...doc, username: `user_skip${i}` },
                    { skipValidation: true }
                );
            }
            const durationWithoutValidation = Date.now() - startWithoutValidation;

            // 验证开销应该小于 30%
            const overhead = (durationWithValidation - durationWithoutValidation) / durationWithoutValidation;
            console.log(`    验证性能开销: ${(overhead * 100).toFixed(2)}%`);
            assert.ok(overhead < 0.3, `验证开销过大: ${(overhead * 100).toFixed(2)}%`);
        });
    });

    describe('复杂 Schema 测试', function() {
        it('应该支持嵌套对象验证', async function() {
            Model.define(testCollection, {
                schema: (dsl) => dsl({
                    username: 'string!',
                    profile: 'object!'  // 简化为对象类型验证
                })
            });

            msq = new MonSQLize({
                type: 'mongodb',
                databaseName: 'test_schema',
                config: { useMemoryServer: true }
            });

            await msq.connect();

            const TestModel = msq.model(testCollection);

            // 正确的嵌套对象
            const result = await TestModel.insertOne({
                username: 'john',
                profile: {
                    age: 25,
                    email: 'john@example.com'
                }
            });
            assert.ok(result.acknowledged);

            // 嵌套对象验证失败
            try {
                await TestModel.insertOne({
                    username: 'alice',
                    profile: 'not-an-object'  // 类型错误：应该是对象
                });
                assert.fail('应该抛出验证错误');
            } catch (err) {
                assert.strictEqual(err.code, 'VALIDATION_ERROR');
                assert.ok(err.message.includes('profile'));
            }
        });

        it('应该支持数组验证', async function() {
            Model.define(testCollection, {
                schema: (dsl) => dsl({
                    username: 'string!',
                    tags: 'array'
                })
            });

            msq = new MonSQLize({
                type: 'mongodb',
                databaseName: 'test_schema',
                config: { useMemoryServer: true }
            });

            await msq.connect();

            const TestModel = msq.model(testCollection);

            // 数组类型正确
            const result = await TestModel.insertOne({
                username: 'john',
                tags: ['tag1', 'tag2']
            });
            assert.ok(result.acknowledged);
        });
    });
});

