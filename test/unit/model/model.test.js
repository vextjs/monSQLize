/**
 * Model 基础功能单元测试
 *
 * 测试范围：
 * 1. Model.define() 注册机制
 * 2. Model.get/has/list 方法
 * 3. 参数验证
 * 4. 错误处理
 *
 * @module test/unit/model/model.test.js
 */

const assert = require('assert');
const { Model } = require('../../../lib/index');

describe('Model - 基础功能', function() {

    // 每次测试前清空注册表
    beforeEach(function() {
        Model._clear();
    });

    describe('Model.define()', function() {

        it('应该成功注册一个基本的 Model', function() {
            Model.define('users', {
                schema: (dsl) => dsl({ username: 'string!' })
            });

            assert.strictEqual(Model.has('users'), true);
            assert.deepStrictEqual(Model.list(), ['users']);
        });

        it('应该支持完整的 Model 定义', function() {
            const definition = {
                enums: {
                    role: 'admin|user'
                },
                schema: function(dsl) {
                    return dsl({
                        username: 'string:3-32!',
                        role: this.enums.role
                    });
                },
                methods: (model) => ({
                    instance: {
                        test() { return 'instance'; }
                    },
                    static: {
                        test() { return 'static'; }
                    }
                }),
                hooks: (model) => ({
                    find: {
                        before: (ctx, options) => {},
                        after: (ctx, result) => {}
                    }
                }),
                indexes: [
                    { key: { username: 1 }, unique: true }
                ],
                relations: {
                    posts: {
                        from: 'posts',
                        localField: '_id',
                        foreignField: 'userId',
                        single: false
                    }
                }
            };

            Model.define('users', definition);

            const modelDef = Model.get('users');
            assert.ok(modelDef);
            assert.deepStrictEqual(modelDef.definition.enums, definition.enums);
            assert.strictEqual(modelDef.definition.schema, definition.schema);
        });

        it('应该拒绝空的集合名称', function() {
            try {
                Model.define('', { schema: (dsl) => dsl({}) });
                assert.fail('应该抛出错误');
            } catch (err) {
                assert.ok(err.message.includes('Collection name must be a non-empty string'));
            }
        });

        it('应该拒绝非字符串的集合名称', function() {
            try {
                Model.define(123, { schema: (dsl) => dsl({}) });
                assert.fail('应该抛出错误');
            } catch (err) {
                assert.ok(err.message.includes('Collection name must be a non-empty string'));
            }
        });

        it('应该拒绝空的 definition', function() {
            try {
                Model.define('users', null);
                assert.fail('应该抛出错误');
            } catch (err) {
                assert.ok(err.message.includes('Model definition must be an object'));
            }
        });

        it('应该拒绝没有 schema 的 definition', function() {
            try {
                Model.define('users', {});
                assert.fail('应该抛出错误');
            } catch (err) {
                assert.ok(err.message.includes('Model definition must include a schema property'));
            }
        });

        it('应该拒绝无效的 schema 类型', function() {
            try {
                Model.define('users', { schema: 'invalid' });
                assert.fail('应该抛出错误');
            } catch (err) {
                assert.ok(err.message.includes('Schema must be a function or object'));
            }
        });

        it('应该拒绝重复注册同名 Model', function() {
            Model.define('users', {
                schema: (dsl) => dsl({ username: 'string!' })
            });

            try {
                Model.define('users', {
                    schema: (dsl) => dsl({ email: 'email!' })
                });
                assert.fail('应该抛出错误');
            } catch (err) {
                assert.ok(err.message.includes("Model 'users' is already defined"));
            }
        });

        it('错误应该包含正确的 code 属性', function() {
            try {
                Model.define('', { schema: (dsl) => dsl({}) });
                assert.fail('应该抛出错误');
            } catch (err) {
                assert.strictEqual(err.code, 'INVALID_COLLECTION_NAME');
            }

            try {
                Model.define('users', {});
                assert.fail('应该抛出错误');
            } catch (err) {
                assert.strictEqual(err.code, 'MISSING_SCHEMA');
            }

            Model.define('users', { schema: (dsl) => dsl({}) });
            try {
                Model.define('users', { schema: (dsl) => dsl({}) });
                assert.fail('应该抛出错误');
            } catch (err) {
                assert.strictEqual(err.code, 'MODEL_ALREADY_EXISTS');
            }
        });

        it('应该拒绝包含特殊字符的集合名称', function() {
            const invalidNames = [
                'user$name',  // 包含 $
                'user.name',  // 包含 .
                'user name',  // 包含空格
                'user\nname', // 包含换行
                'user\0name'  // 包含 null 字符
            ];

            invalidNames.forEach(name => {
                try {
                    Model.define(name, { schema: (dsl) => dsl({}) });
                    assert.fail(`应该拒绝集合名: ${name}`);
                } catch (err) {
                    assert.ok(
                        err.message.includes('Invalid collection name') ||
                        err.message.includes('special characters'),
                        `错误消息应该提到特殊字符，实际: ${err.message}`
                    );
                }
            });
        });

    });

    describe('并发场景', function() {

        it('应该支持并发注册多个不同的 Model', async function() {
            const promises = Array.from({ length: 10 }, (_, i) =>
                Promise.resolve(Model.define(`model_${i}`, {
                    schema: (dsl) => dsl({ name: 'string!' })
                }))
            );

            await Promise.all(promises);
            assert.strictEqual(Model.list().length, 10);
        });

    });

    describe('Model.get()', function() {

        it('应该返回已注册的 Model 定义', function() {
            const definition = {
                schema: (dsl) => dsl({ username: 'string!' })
            };
            Model.define('users', definition);

            const modelDef = Model.get('users');
            assert.ok(modelDef);
            assert.strictEqual(modelDef.collectionName, 'users');
            assert.strictEqual(modelDef.definition.schema, definition.schema);
        });

        it('应该返回 undefined 如果 Model 不存在', function() {
            const modelDef = Model.get('nonexistent');
            assert.strictEqual(modelDef, undefined);
        });

    });

    describe('Model.has()', function() {

        it('应该返回 true 如果 Model 已注册', function() {
            Model.define('users', {
                schema: (dsl) => dsl({ username: 'string!' })
            });

            assert.strictEqual(Model.has('users'), true);
        });

        it('应该返回 false 如果 Model 未注册', function() {
            assert.strictEqual(Model.has('nonexistent'), false);
        });

    });

    describe('Model.list()', function() {

        it('应该返回空数组如果没有注册任何 Model', function() {
            assert.deepStrictEqual(Model.list(), []);
        });

        it('应该返回所有已注册的 Model 名称', function() {
            Model.define('users', { schema: (dsl) => dsl({}) });
            Model.define('posts', { schema: (dsl) => dsl({}) });
            Model.define('comments', { schema: (dsl) => dsl({}) });

            const list = Model.list();
            assert.strictEqual(list.length, 3);
            assert.ok(list.includes('users'));
            assert.ok(list.includes('posts'));
            assert.ok(list.includes('comments'));
        });

    });

    describe('Model._clear()', function() {

        it('应该清空所有已注册的 Model', function() {
            Model.define('users', { schema: (dsl) => dsl({}) });
            Model.define('posts', { schema: (dsl) => dsl({}) });

            assert.strictEqual(Model.list().length, 2);

            Model._clear();

            assert.strictEqual(Model.list().length, 0);
            assert.strictEqual(Model.has('users'), false);
            assert.strictEqual(Model.has('posts'), false);
        });

    });

});

