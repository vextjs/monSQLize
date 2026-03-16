/**
 * Model 热重载功能测试
 *
 * 测试范围：
 * 1. Model.undefine() — 注销已注册的 Model 定义
 * 2. Model.redefine() — 重新定义已注册的 Model
 * 3. _loadModels({ reload: true }) — 自动加载 reload 模式
 * 4. 向后兼容性验证
 *
 * @module test/unit/model/model-hot-reload.test.js
 * @since 1.1.7
 */

const assert = require('assert');
const path = require('path');
const fs = require('fs');
const MonSQLize = require('../../../lib/index');
const { Model } = require('../../../lib/index');

describe('Model 热重载 - Hot Reload Support (v1.1.7)', function () {
    this.timeout(30000);

    // 每次测试前清空注册表
    beforeEach(function () {
        Model._clear();
    });

    // ========== Model.undefine() 测试 ==========

    describe('Model.undefine()', function () {

        it('应该成功移除已注册的 Model 并返回 true', function () {
            Model.define('users', {
                schema: (dsl) => dsl({ username: 'string!' })
            });

            assert.strictEqual(Model.has('users'), true);

            const result = Model.undefine('users');

            assert.strictEqual(result, true);
            assert.strictEqual(Model.has('users'), false);
            assert.strictEqual(Model.get('users'), undefined);
        });

        it('应该对不存在的 Model 返回 false，不抛错', function () {
            const result = Model.undefine('nonexistent');

            assert.strictEqual(result, false);
        });

        it('应该对 undefined/null 参数返回 false，不抛错', function () {
            assert.strictEqual(Model.undefine(undefined), false);
            assert.strictEqual(Model.undefine(null), false);
        });

        it('undefine 后 list() 不再包含被移除的 Model', function () {
            Model.define('users', {
                schema: (dsl) => dsl({ username: 'string!' })
            });
            Model.define('posts', {
                schema: (dsl) => dsl({ title: 'string!' })
            });

            assert.deepStrictEqual(Model.list(), ['users', 'posts']);

            Model.undefine('users');

            assert.deepStrictEqual(Model.list(), ['posts']);
        });

        it('undefine 后可以重新 define 同名 Model（不抛 MODEL_ALREADY_EXISTS）', function () {
            // 第一次定义
            Model.define('users', {
                schema: (dsl) => dsl({ username: 'string!' })
            });

            // 注销
            Model.undefine('users');

            // 重新定义（不应抛错）
            Model.define('users', {
                schema: (dsl) => dsl({ username: 'string!', email: 'string!' })
            });

            assert.strictEqual(Model.has('users'), true);
        });

        it('多次 undefine 同一 Model 应该是幂等的', function () {
            Model.define('users', {
                schema: (dsl) => dsl({ username: 'string!' })
            });

            assert.strictEqual(Model.undefine('users'), true);
            assert.strictEqual(Model.undefine('users'), false);
            assert.strictEqual(Model.undefine('users'), false);
        });

        it('undefine 不应影响其他已注册的 Model', function () {
            Model.define('users', {
                schema: (dsl) => dsl({ username: 'string!' })
            });
            Model.define('posts', {
                schema: (dsl) => dsl({ title: 'string!' })
            });
            Model.define('comments', {
                schema: (dsl) => dsl({ content: 'string!' })
            });

            Model.undefine('posts');

            assert.strictEqual(Model.has('users'), true);
            assert.strictEqual(Model.has('posts'), false);
            assert.strictEqual(Model.has('comments'), true);
            assert.deepStrictEqual(Model.list(), ['users', 'comments']);
        });
    });

    // ========== Model.redefine() 测试 ==========

    describe('Model.redefine()', function () {

        it('应该成功替换已有 Model 的定义', function () {
            // 初始定义
            Model.define('users', {
                schema: (dsl) => dsl({ username: 'string!' })
            });

            const originalDef = Model.get('users');
            assert.ok(originalDef);

            // 重新定义
            const newDefinition = {
                schema: (dsl) => dsl({ username: 'string!', email: 'string!' })
            };
            Model.redefine('users', newDefinition);

            const updatedDef = Model.get('users');
            assert.ok(updatedDef);
            assert.strictEqual(updatedDef.definition, newDefinition);
            assert.strictEqual(Model.has('users'), true);
        });

        it('对不存在的 Model 应等同于 define()（首次注册）', function () {
            assert.strictEqual(Model.has('newmodel'), false);

            Model.redefine('newmodel', {
                schema: (dsl) => dsl({ name: 'string!' })
            });

            assert.strictEqual(Model.has('newmodel'), true);
            assert.ok(Model.get('newmodel'));
        });

        it('参数校验失败时应该抛出错误（与 define 相同的校验）', function () {
            // 缺少 schema
            assert.throws(
                () => Model.redefine('users', {}),
                (err) => {
                    assert.strictEqual(err.code, 'MISSING_SCHEMA');
                    return true;
                }
            );

            // 无效的 definition
            assert.throws(
                () => Model.redefine('users', null),
                (err) => {
                    assert.strictEqual(err.code, 'INVALID_MODEL_DEFINITION');
                    return true;
                }
            );

            // 无效的集合名
            assert.throws(
                () => Model.redefine('', { schema: (dsl) => dsl({}) }),
                (err) => {
                    assert.strictEqual(err.code, 'INVALID_COLLECTION_NAME');
                    return true;
                }
            );
        });

        it('redefine 失败时旧定义应该被移除（设计行为）', function () {
            // 先定义一个有效的 Model
            Model.define('users', {
                schema: (dsl) => dsl({ username: 'string!' })
            });
            assert.strictEqual(Model.has('users'), true);

            // 用无效定义进行 redefine（应该抛错）
            assert.throws(
                () => Model.redefine('users', { /* 缺少 schema */ }),
                (err) => {
                    assert.strictEqual(err.code, 'MISSING_SCHEMA');
                    return true;
                }
            );

            // 旧定义应该已被移除（这是预期行为）
            assert.strictEqual(Model.has('users'), false);
        });

        it('应该支持多次连续 redefine（多轮热重载）', function () {
            // 第 1 轮
            Model.define('users', {
                schema: (dsl) => dsl({ username: 'string!' })
            });

            // 第 2 轮
            const def2 = { schema: (dsl) => dsl({ username: 'string!', email: 'string!' }) };
            Model.redefine('users', def2);
            assert.strictEqual(Model.get('users').definition, def2);

            // 第 3 轮
            const def3 = { schema: (dsl) => dsl({ username: 'string!', email: 'string!', age: 'number' }) };
            Model.redefine('users', def3);
            assert.strictEqual(Model.get('users').definition, def3);

            // 第 4 轮
            const def4 = { schema: (dsl) => dsl({ name: 'string!' }) };
            Model.redefine('users', def4);
            assert.strictEqual(Model.get('users').definition, def4);

            assert.strictEqual(Model.has('users'), true);
        });

        it('redefine 不应影响其他已注册的 Model', function () {
            Model.define('users', {
                schema: (dsl) => dsl({ username: 'string!' })
            });
            Model.define('posts', {
                schema: (dsl) => dsl({ title: 'string!' })
            });

            Model.redefine('users', {
                schema: (dsl) => dsl({ username: 'string!', email: 'string!' })
            });

            // posts 不受影响
            assert.strictEqual(Model.has('posts'), true);
            assert.deepStrictEqual(Model.list().sort(), ['posts', 'users']);
        });
    });

    // ========== _clear() 向后兼容验证 ==========

    describe('_clear() 向后兼容', function () {

        it('_clear() 行为不应受 undefine/redefine 影响', function () {
            Model.define('users', {
                schema: (dsl) => dsl({ username: 'string!' })
            });
            Model.define('posts', {
                schema: (dsl) => dsl({ title: 'string!' })
            });

            Model.undefine('users');
            Model.redefine('posts', {
                schema: (dsl) => dsl({ title: 'string!', content: 'string' })
            });

            // _clear 仍然应该清空全部
            Model._clear();

            assert.deepStrictEqual(Model.list(), []);
            assert.strictEqual(Model.has('posts'), false);
        });
    });

    // ========== 已实例化 ModelInstance 不受影响 ==========

    describe('undefine 不影响已实例化的 ModelInstance', function () {

        let msq;

        afterEach(async function () {
            if (msq) {
                await msq.close();
                msq = null;
            }
        });

        it('undefine 后已获取的 ModelInstance 应继续正常工作', async function () {
            // 定义 Model
            Model.define('hot_reload_test', {
                schema: (dsl) => dsl({ name: 'string!' })
            });

            // 创建连接
            msq = new MonSQLize({
                type: 'mongodb',
                databaseName: 'test_hot_reload',
                config: { useMemoryServer: true }
            });
            await msq.connect();

            // 获取 ModelInstance
            const TestModel = msq.model('hot_reload_test');

            // 插入数据验证可用
            const insertResult = await TestModel.insertOne({ name: 'before_undefine' });
            assert.ok(insertResult.insertedId);

            // 注销 Model 定义
            Model.undefine('hot_reload_test');

            // 已获取的 TestModel 应继续工作（因为它已经有自己的 collection 引用和 definition 副本）
            const findResult = await TestModel.findOne({ name: 'before_undefine' });
            assert.ok(findResult);
            assert.strictEqual(findResult.name, 'before_undefine');

            // 插入也应继续工作
            const insertResult2 = await TestModel.insertOne({ name: 'after_undefine' });
            assert.ok(insertResult2.insertedId);
        });

        it('undefine 后重新 define 并获取新 ModelInstance 应使用新定义', async function () {
            // 初始定义（无 hooks）
            Model.define('hot_reload_v2', {
                schema: (dsl) => dsl({ name: 'string!' })
            });

            msq = new MonSQLize({
                type: 'mongodb',
                databaseName: 'test_hot_reload_v2',
                config: { useMemoryServer: true }
            });
            await msq.connect();

            // 获取初始 ModelInstance
            const V1 = msq.model('hot_reload_v2');
            await V1.insertOne({ name: 'v1_data' });

            // 注销并重新定义（带 hooks）
            Model.undefine('hot_reload_v2');
            let hookCalled = false;
            Model.define('hot_reload_v2', {
                schema: (dsl) => dsl({ name: 'string!' }),
                hooks: () => ({
                    insert: {
                        before: (ctx, doc) => {
                            hookCalled = true;
                            doc.addedByHook = true;
                            return doc;
                        }
                    }
                })
            });

            // 获取新的 ModelInstance
            const V2 = msq.model('hot_reload_v2');
            await V2.insertOne({ name: 'v2_data' });

            // 新定义的 hook 应该生效
            assert.strictEqual(hookCalled, true);

            // V1 旧实例仍能查询（但不会触发新 hook）
            const v1Result = await V1.findOne({ name: 'v1_data' });
            assert.ok(v1Result);
        });
    });

    // ========== _loadModels() reload 模式 ==========

    describe('_loadModels() reload 模式', function () {

        let msq;
        let testModelsDir;

        before(function () {
            // 创建临时 model 目录
            testModelsDir = path.join(__dirname, '__temp_reload_models__');
            if (!fs.existsSync(testModelsDir)) {
                fs.mkdirSync(testModelsDir, { recursive: true });
            }
        });

        afterEach(async function () {
            if (msq) {
                await msq.close();
                msq = null;
            }
        });

        after(function () {
            // 清理临时目录
            if (fs.existsSync(testModelsDir)) {
                const files = fs.readdirSync(testModelsDir);
                for (const f of files) {
                    fs.unlinkSync(path.join(testModelsDir, f));
                }
                fs.rmdirSync(testModelsDir);
            }
        });

        it('reload=false（默认）应跳过已注册的 Model', async function () {
            // 写入临时 model 文件
            const modelFile = path.join(testModelsDir, 'item.model.js');
            fs.writeFileSync(modelFile, `
                module.exports = {
                    name: 'reload_items',
                    schema: (dsl) => dsl({ title: 'string!' })
                };
            `);

            // 预先注册
            Model.define('reload_items', {
                schema: (dsl) => dsl({ title: 'string!' })
            });
            const originalDef = Model.get('reload_items');

            // 创建连接
            msq = new MonSQLize({
                type: 'mongodb',
                databaseName: 'test_reload_default',
                config: { useMemoryServer: true },
                models: testModelsDir
            });
            await msq.connect();

            // connect 内部调用 _loadModels() 不传 reload，应跳过已注册的
            const currentDef = Model.get('reload_items');
            assert.strictEqual(currentDef, originalDef, '定义不应被替换');
        });

        it('reload=true 应替换已注册的 Model', async function () {
            // 写入临时 model 文件
            const modelFile = path.join(testModelsDir, 'product.model.js');
            fs.writeFileSync(modelFile, `
                module.exports = {
                    name: 'reload_products',
                    schema: (dsl) => dsl({ name: 'string!', price: 'number' })
                };
            `);

            // 预先注册旧定义
            Model.define('reload_products', {
                schema: (dsl) => dsl({ name: 'string!' })
            });
            const originalDef = Model.get('reload_products');

            // 创建连接
            msq = new MonSQLize({
                type: 'mongodb',
                databaseName: 'test_reload_true',
                config: { useMemoryServer: true },
                models: testModelsDir
            });
            await msq.connect();

            // 手动调用 reload 模式
            await msq._loadModels({ reload: true });

            // 定义应该被替换
            const currentDef = Model.get('reload_products');
            assert.notStrictEqual(currentDef, originalDef, '定义应被替换');
        });

        it('reload=true 对未注册的 Model 应正常注册（等同 define）', async function () {
            // 写入新的 model 文件
            const modelFile = path.join(testModelsDir, 'category.model.js');
            fs.writeFileSync(modelFile, `
                module.exports = {
                    name: 'reload_categories',
                    schema: (dsl) => dsl({ name: 'string!' })
                };
            `);

            // 不预先注册
            assert.strictEqual(Model.has('reload_categories'), false);

            msq = new MonSQLize({
                type: 'mongodb',
                databaseName: 'test_reload_new',
                config: { useMemoryServer: true },
                models: testModelsDir
            });
            await msq.connect();

            // 手动 reload 模式
            await msq._loadModels({ reload: true });

            // 应该被注册
            assert.strictEqual(Model.has('reload_categories'), true);
        });
    });

    // ========== define() 原有行为不变（回归测试）==========

    describe('define() 原有行为不变（回归）', function () {

        it('重复 define 仍然应该抛出 MODEL_ALREADY_EXISTS', function () {
            Model.define('users', {
                schema: (dsl) => dsl({ username: 'string!' })
            });

            assert.throws(
                () => Model.define('users', {
                    schema: (dsl) => dsl({ username: 'string!' })
                }),
                (err) => {
                    assert.strictEqual(err.code, 'MODEL_ALREADY_EXISTS');
                    return true;
                }
            );
        });

        it('无效参数的 define 仍然应该抛出正确的错误码', function () {
            // 空集合名
            assert.throws(
                () => Model.define('', { schema: (dsl) => dsl({}) }),
                (err) => {
                    assert.strictEqual(err.code, 'INVALID_COLLECTION_NAME');
                    return true;
                }
            );

            // 缺少 schema
            assert.throws(
                () => Model.define('test', {}),
                (err) => {
                    assert.strictEqual(err.code, 'MISSING_SCHEMA');
                    return true;
                }
            );

            // 无效 definition
            assert.throws(
                () => Model.define('test', null),
                (err) => {
                    assert.strictEqual(err.code, 'INVALID_MODEL_DEFINITION');
                    return true;
                }
            );
        });

        it('get/has/list 基本行为不变', function () {
            assert.strictEqual(Model.has('anything'), false);
            assert.strictEqual(Model.get('anything'), undefined);
            assert.deepStrictEqual(Model.list(), []);

            Model.define('users', {
                schema: (dsl) => dsl({ username: 'string!' })
            });

            assert.strictEqual(Model.has('users'), true);
            assert.ok(Model.get('users'));
            assert.deepStrictEqual(Model.list(), ['users']);
        });
    });
});
