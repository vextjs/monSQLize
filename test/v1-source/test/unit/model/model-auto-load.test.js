/**
 * Model Auto-Load 测试
 * 测试 v1.0.7 新增的 Model 自动加载功能
 *
 * @since v1.0.7
 */

const assert = require('assert');
const path = require('path');
const fs = require('fs');
const MonSQLize = require('../../../lib/index');
const { Model } = MonSQLize;

describe('Model Auto-Load - 自动加载功能', function() {
    this.timeout(30000);

    let msq;
    let testModelsDir;

    // 准备测试目录和文件
    before(async function() {
        // 创建临时测试目录
        testModelsDir = path.join(__dirname, 'test-models-' + Date.now());
        fs.mkdirSync(testModelsDir, { recursive: true });

        // 创建子目录
        const adminDir = path.join(testModelsDir, 'admin');
        fs.mkdirSync(adminDir, { recursive: true });

        // 创建测试 Model 文件
        // 1. 正常的 user.model.js
        fs.writeFileSync(
            path.join(testModelsDir, 'user.model.js'),
            `module.exports = {
                name: 'users',
                schema: (dsl) => dsl({ username: 'string!' })
            };`
        );

        // 2. 正常的 post.model.js
        fs.writeFileSync(
            path.join(testModelsDir, 'post.model.js'),
            `module.exports = {
                name: 'posts',
                schema: (dsl) => dsl({ title: 'string!' })
            };`
        );

        // 3. 子目录中的 role.model.js
        fs.writeFileSync(
            path.join(adminDir, 'role.model.js'),
            `module.exports = {
                name: 'roles',
                schema: (dsl) => dsl({ name: 'string!' })
            };`
        );

        // 4. 错误文件：缺少 name
        fs.writeFileSync(
            path.join(testModelsDir, 'no-name.model.js'),
            `module.exports = {
                schema: (dsl) => dsl({ field: 'string!' })
            };`
        );

        // 5. 错误文件：name 为空字符串
        fs.writeFileSync(
            path.join(testModelsDir, 'empty-name.model.js'),
            `module.exports = {
                name: '',
                schema: (dsl) => dsl({ field: 'string!' })
            };`
        );

        // 6. 错误文件：export 为 null
        fs.writeFileSync(
            path.join(testModelsDir, 'null-export.model.js'),
            `module.exports = null;`
        );

        // 7. .mjs 文件（ES Module）
        fs.writeFileSync(
            path.join(testModelsDir, 'comment.model.mjs'),
            `export default {
                name: 'comments',
                schema: (dsl) => dsl({ content: 'string!' })
            };`
        );

        // 8. .cjs 文件（CommonJS 显式）
        fs.writeFileSync(
            path.join(testModelsDir, 'tag.model.cjs'),
            `module.exports = {
                name: 'tags',
                schema: (dsl) => dsl({ name: 'string!' })
            };`
        );

        // 9. 非 .model.* 文件（应该被忽略）
        fs.writeFileSync(
            path.join(testModelsDir, 'helper.js'),
            `module.exports = { utility: true };`
        );
    });

    // 清理测试文件
    after(async function() {
        Model._clear();
        if (msq) {
            try {
                await msq.close();
            } catch (err) {
                // 忽略错误
            }
        }

        // 删除测试目录
        if (testModelsDir && fs.existsSync(testModelsDir)) {
            fs.rmSync(testModelsDir, { recursive: true, force: true });
        }
    });

    // 每个测试前清理 Model 注册表
    beforeEach(function() {
        Model._clear();
    });

    describe('简化配置', function() {
        it('应该支持字符串路径配置', async function() {
            msq = new MonSQLize({
                type: 'mongodb',
                databaseName: 'test_auto_load',
                config: { useMemoryServer: true },
                models: testModelsDir  // 简化配置
            });

            await msq.connect();

            // 验证 Model 已加载
            assert.ok(Model.has('users'));
            assert.ok(Model.has('posts'));
        });

        it('应该使用默认 pattern (*.model.{js,ts,mjs,cjs})', async function() {
            msq = new MonSQLize({
                type: 'mongodb',
                databaseName: 'test_auto_load',
                config: { useMemoryServer: true },
                models: testModelsDir
            });

            await msq.connect();

            // .js 文件应该被加载
            assert.ok(Model.has('users'));
            // .cjs 文件应该被加载
            assert.ok(Model.has('tags'));
            // 非 .model.* 文件不应该被加载
            assert.ok(!Model.has('helper'));
        });

        it('应该不递归扫描（默认）', async function() {
            msq = new MonSQLize({
                type: 'mongodb',
                databaseName: 'test_auto_load',
                config: { useMemoryServer: true },
                models: testModelsDir
            });

            await msq.connect();

            // 主目录的文件应该被加载
            assert.ok(Model.has('users'));
            // 子目录的文件不应该被加载（默认不递归）
            assert.ok(!Model.has('roles'));
        });
    });

    describe('完整配置', function() {
        it('应该支持自定义 pattern', async function() {
            msq = new MonSQLize({
                type: 'mongodb',
                databaseName: 'test_auto_load',
                config: { useMemoryServer: true },
                models: {
                    path: testModelsDir,
                    pattern: 'user.model.js'  // 只加载 user.model.js
                }
            });

            await msq.connect();

            // 只有匹配的文件被加载
            assert.ok(Model.has('users'));
            assert.ok(!Model.has('posts'));
        });

        it('应该支持递归扫描', async function() {
            msq = new MonSQLize({
                type: 'mongodb',
                databaseName: 'test_auto_load',
                config: { useMemoryServer: true },
                models: {
                    path: testModelsDir,
                    pattern: '*.model.js',
                    recursive: true  // 启用递归
                }
            });

            await msq.connect();

            // 主目录和子目录的文件都应该被加载
            assert.ok(Model.has('users'));
            assert.ok(Model.has('posts'));
            assert.ok(Model.has('roles'));  // 来自 admin/ 子目录
        });

        it('应该支持多种文件格式', async function() {
            msq = new MonSQLize({
                type: 'mongodb',
                databaseName: 'test_auto_load',
                config: { useMemoryServer: true },
                models: {
                    path: testModelsDir,
                    pattern: '*.model.{js,cjs}'  // js 和 cjs
                }
            });

            await msq.connect();

            // .js 文件
            assert.ok(Model.has('users'));
            // .cjs 文件
            assert.ok(Model.has('tags'));
        });
    });

    describe('文件格式验证', function() {
        it('应该加载正确格式的 Model 文件', async function() {
            msq = new MonSQLize({
                type: 'mongodb',
                databaseName: 'test_auto_load',
                config: { useMemoryServer: true },
                models: testModelsDir
            });

            await msq.connect();

            const User = msq.model('users');
            assert.ok(User);
            assert.ok(User.collection);
        });

        it('应该跳过缺少 name 的文件', async function() {
            msq = new MonSQLize({
                type: 'mongodb',
                databaseName: 'test_auto_load',
                config: { useMemoryServer: true },
                models: testModelsDir
            });

            await msq.connect();

            // no-name.model.js 应该被跳过
            const allModels = Model.list();
            assert.ok(!allModels.includes(undefined));
            assert.ok(!allModels.includes(null));
        });

        it('应该跳过 name 为空字符串的文件', async function() {
            msq = new MonSQLize({
                type: 'mongodb',
                databaseName: 'test_auto_load',
                config: { useMemoryServer: true },
                models: testModelsDir
            });

            await msq.connect();

            // empty-name.model.js 应该被跳过
            const allModels = Model.list();
            assert.ok(!allModels.includes(''));
        });

        it('应该跳过 export 为 null 的文件', async function() {
            msq = new MonSQLize({
                type: 'mongodb',
                databaseName: 'test_auto_load',
                config: { useMemoryServer: true },
                models: testModelsDir
            });

            await msq.connect();

            // null-export.model.js 应该被跳过
            // 不应该抛出错误，只是跳过
            assert.ok(Model.has('users'));  // 其他文件正常加载
        });
    });

    describe('错误处理', function() {
        it('应该处理目录不存在的情况', async function() {
            const nonExistentDir = path.join(__dirname, 'non-existent-dir');

            msq = new MonSQLize({
                type: 'mongodb',
                databaseName: 'test_auto_load',
                config: { useMemoryServer: true },
                models: nonExistentDir
            });

            // 不应该抛出错误
            await msq.connect();

            // 没有 Model 被加载
            const allModels = Model.list();
            assert.strictEqual(allModels.length, 0);
        });

        it('应该处理文件加载失败', async function() {
            // 创建语法错误的文件
            const syntaxErrorFile = path.join(testModelsDir, 'syntax-error.model.js');
            fs.writeFileSync(syntaxErrorFile, `module.exports = { invalid syntax`);

            msq = new MonSQLize({
                type: 'mongodb',
                databaseName: 'test_auto_load',
                config: { useMemoryServer: true },
                models: testModelsDir
            });

            // 不应该抛出错误，只是跳过失败的文件
            await msq.connect();

            // 其他正常文件仍然被加载
            assert.ok(Model.has('users'));

            // 清理
            fs.unlinkSync(syntaxErrorFile);
        });

        it('应该防止重复注册', async function() {
            // 先手动注册一个 Model
            Model.define('users', {
                schema: (dsl) => dsl({ field: 'string!' })
            });

            msq = new MonSQLize({
                type: 'mongodb',
                databaseName: 'test_auto_load',
                config: { useMemoryServer: true },
                models: testModelsDir
            });

            // 应该跳过已注册的 Model
            await msq.connect();

            // Model 只注册一次
            const allModels = Model.list();
            const userModels = allModels.filter(m => m === 'users');
            assert.strictEqual(userModels.length, 1);
        });

        it('应该处理无效配置', async function() {
            // 配置为 null
            msq = new MonSQLize({
                type: 'mongodb',
                databaseName: 'test_auto_load',
                config: { useMemoryServer: true },
                models: null
            });

            // 不应该抛出错误
            await msq.connect();

            // 配置为数字
            Model._clear();
            msq = new MonSQLize({
                type: 'mongodb',
                databaseName: 'test_auto_load',
                config: { useMemoryServer: true },
                models: 123
            });

            await msq.connect();
        });
    });

    describe('集成测试', function() {
        it('应该在 connect() 后可用', async function() {
            msq = new MonSQLize({
                type: 'mongodb',
                databaseName: 'test_auto_load',
                config: { useMemoryServer: true },
                models: testModelsDir
            });

            await msq.connect();

            // Model 应该立即可用
            const User = msq.model('users');
            assert.ok(User);

            // 应该可以执行操作
            const result = await User.insertOne({ username: 'test' });
            assert.ok(result.acknowledged);
        });

        it('应该支持 Schema 验证', async function() {
            msq = new MonSQLize({
                type: 'mongodb',
                databaseName: 'test_auto_load',
                config: { useMemoryServer: true },
                models: testModelsDir
            });

            await msq.connect();

            const User = msq.model('users');

            // Schema 验证应该生效（v1.0.7 默认启用）
            try {
                await User.insertOne({ username: 123 });  // 类型错误
                assert.fail('应该抛出验证错误');
            } catch (err) {
                assert.strictEqual(err.code, 'VALIDATION_ERROR');
            }
        });

        it('应该支持自定义方法', async function() {
            // 创建带自定义方法的 Model 文件
            const methodFile = path.join(testModelsDir, 'method.model.js');
            fs.writeFileSync(
                methodFile,
                `module.exports = {
                    name: 'methods',
                    schema: (dsl) => dsl({ name: 'string!' }),
                    methods: (model) => ({
                        static: {
                            async findByName(name) {
                                return await model.findOne({ name });
                            }
                        },
                        instance: {
                            greet() {
                                return 'Hello, ' + this.name;
                            }
                        }
                    })
                };`
            );

            Model._clear();
            msq = new MonSQLize({
                type: 'mongodb',
                databaseName: 'test_auto_load',
                config: { useMemoryServer: true },
                models: testModelsDir
            });

            await msq.connect();

            const Methods = msq.model('methods');

            // static 方法应该可用
            assert.ok(typeof Methods.findByName === 'function');

            // instance 方法应该可用
            await Methods.insertOne({ name: 'John' });
            const doc = await Methods.findOne({ name: 'John' });
            assert.strictEqual(doc.greet(), 'Hello, John');

            // 清理
            fs.unlinkSync(methodFile);
        });

        it('应该支持 Hooks', async function() {
            // 创建带 hooks 的 Model 文件
            const hookFile = path.join(testModelsDir, 'hook.model.js');
            fs.writeFileSync(
                hookFile,
                `module.exports = {
                    name: 'hooks',
                    schema: (dsl) => dsl({ name: 'string!' }),
                    hooks: (model) => ({
                        insert: {
                            before: async (ctx, doc) => {
                                doc.timestamp = Date.now();
                                return doc;
                            }
                        }
                    })
                };`
            );

            Model._clear();
            msq = new MonSQLize({
                type: 'mongodb',
                databaseName: 'test_auto_load',
                config: { useMemoryServer: true },
                models: testModelsDir
            });

            await msq.connect();

            const Hooks = msq.model('hooks');

            // Hook 应该自动执行
            const result = await Hooks.insertOne({ name: 'Test' });
            assert.ok(result.acknowledged);

            // 从数据库查询验证 Hook 添加的字段
            const doc = await Hooks.findOne({ _id: result.insertedId });
            assert.ok(doc.timestamp);

            // 清理
            fs.unlinkSync(hookFile);
        });
    });

    describe('日志验证（手动检查）', function() {
        it('应该输出扫描信息（手动检查日志）', async function() {
            // 这个测试需要手动检查日志输出
            msq = new MonSQLize({
                type: 'mongodb',
                databaseName: 'test_auto_load',
                config: { useMemoryServer: true },
                models: testModelsDir
            });

            await msq.connect();

            // 预期日志:
            // [Model] Scanning models from: ...
            // [Model] ✅ Loaded: users from ...
            // [Model] Auto-load complete...
        });
    });
});

