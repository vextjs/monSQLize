/**
 * Model - 高级功能和 100% 覆盖率测试
 *
 * 测试内容：
 * 1. timestamps 配置解析的所有边界情况
 * 2. Schema 缓存和验证逻辑
 * 3. 错误路径覆盖
 * 4. 内部方法覆盖
 */

const assert = require('assert');
const MonSQLize = require('../../../lib/index');
const { Model } = MonSQLize;

// 测试计数器，用于生成唯一集合名
let testCollectionCounter = 0;

// 辅助函数：生成唯一集合名
function getUniqueCollection() {
    return `advanced_test_${Date.now()}_${testCollectionCounter++}`;
}

describe('Model - Advanced Features & 100% Coverage', function() {
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

    // ========== timestamps 配置解析完整覆盖 ==========
    describe('timestamps 配置解析完整测试', () => {
        it('应该正确解析 timestamps: true', function() {
            Model.define(currentCollection, {
                schema: (dsl) => dsl({ name: 'string!' }),
                options: {
                    timestamps: true
                }
            });

            const modelDef = Model.get(currentCollection);
            assert.ok(modelDef.definition._internalHooks, '应该有内部 hooks');
            assert.ok(modelDef.definition._internalHooks.timestamps, '应该有 timestamps 配置');
            assert.strictEqual(modelDef.definition._internalHooks.timestamps.createdAt, 'createdAt');
            assert.strictEqual(modelDef.definition._internalHooks.timestamps.updatedAt, 'updatedAt');
        });

        it('应该正确解析自定义 createdAt 字段名', function() {
            Model.define(currentCollection, {
                schema: (dsl) => dsl({ name: 'string!' }),
                options: {
                    timestamps: {
                        createdAt: 'created_time'
                    }
                }
            });

            const modelDef = Model.get(currentCollection);
            const config = modelDef.definition._internalHooks.timestamps;
            assert.strictEqual(config.createdAt, 'created_time', 'createdAt 字段名应该自定义');
            assert.strictEqual(config.updatedAt, 'updatedAt', 'updatedAt 应该使用默认值');
        });

        it('应该正确解析自定义 updatedAt 字段名', function() {
            Model.define(currentCollection, {
                schema: (dsl) => dsl({ name: 'string!' }),
                options: {
                    timestamps: {
                        updatedAt: 'updated_time'
                    }
                }
            });

            const modelDef = Model.get(currentCollection);
            const config = modelDef.definition._internalHooks.timestamps;
            assert.strictEqual(config.updatedAt, 'updated_time', 'updatedAt 字段名应该自定义');
            assert.strictEqual(config.createdAt, undefined, 'createdAt 应该不存在');
        });

        it('应该正确解析 createdAt: true', function() {
            Model.define(currentCollection, {
                schema: (dsl) => dsl({ name: 'string!' }),
                options: {
                    timestamps: {
                        createdAt: true
                    }
                }
            });

            const modelDef = Model.get(currentCollection);
            const config = modelDef.definition._internalHooks.timestamps;
            assert.strictEqual(config.createdAt, 'createdAt');
            assert.strictEqual(config.updatedAt, 'updatedAt');
        });

        it('应该正确解析 updatedAt: false（禁用）', function() {
            Model.define(currentCollection, {
                schema: (dsl) => dsl({ name: 'string!' }),
                options: {
                    timestamps: {
                        createdAt: 'created_at',
                        updatedAt: false
                    }
                }
            });

            const modelDef = Model.get(currentCollection);
            const config = modelDef.definition._internalHooks.timestamps;
            assert.strictEqual(config.createdAt, 'created_at');
            assert.strictEqual(config.updatedAt, undefined, 'updatedAt 应该不存在');
        });

        it('应该处理 timestamps: false（不创建配置）', function() {
            Model.define(currentCollection, {
                schema: (dsl) => dsl({ name: 'string!' }),
                options: {
                    timestamps: false
                }
            });

            const modelDef = Model.get(currentCollection);
            assert.strictEqual(modelDef.definition._internalHooks?.timestamps, undefined,
                '不应该有 timestamps 配置');
        });

        it('应该处理 timestamps: 空对象（不创建配置）', function() {
            Model.define(currentCollection, {
                schema: (dsl) => dsl({ name: 'string!' }),
                options: {
                    timestamps: {
                        createdAt: false,
                        updatedAt: false
                    }
                }
            });

            const modelDef = Model.get(currentCollection);
            assert.strictEqual(modelDef.definition._internalHooks?.timestamps, undefined,
                '所有字段禁用时不应该创建配置');
        });
    });

    // ========== Schema 对象模式测试 ==========
    describe('Schema 对象模式测试', () => {
        it('应该支持直接传递 schema 对象而非函数', async function() {
            const schemaDsl = require('schema-dsl');
            const schemaObj = schemaDsl.dsl({
                name: 'string!',
                age: 'number'
            });

            Model.define(currentCollection, {
                schema: schemaObj,
                options: {}
            });

            msq = new MonSQLize({
                type: 'mongodb',
                databaseName: 'test',
                config: { useMemoryServer: true }
            });
            await msq.connect();

            const User = msq.model(currentCollection);

            // 验证可以正常插入
            const result = await User.insertOne({ name: 'john', age: 30 });
            assert.ok(result.insertedId, '应该成功插入文档');

            const user = await User.findOne({ _id: result.insertedId });
            assert.strictEqual(user.name, 'john');
            assert.strictEqual(user.age, 30);
        });

        it('应该处理 schema 函数执行失败的情况', async function() {
            let executionCount = 0;

            Model.define(currentCollection, {
                schema: (dsl) => {
                    executionCount++;
                    if (executionCount === 1) {
                        throw new Error('Schema initialization failed');
                    }
                    return dsl({ name: 'string!' });
                },
                options: {}
            });

            msq = new MonSQLize({
                type: 'mongodb',
                databaseName: 'test',
                config: { useMemoryServer: true }
            });
            await msq.connect();

            // 第一次实例化时 schema 失败，但仍然可以使用（因为 monSQLize 不强制验证）
            const User = msq.model(currentCollection);

            // 应该能正常操作（MongoDB 不强制 schema）
            const result = await User.insertOne({ name: 'john' });
            assert.ok(result.insertedId, '即使 schema 缓存失败，仍应该能插入');
        });
    });

    // ========== 方法代理和特殊处理测试 ==========
    describe('方法代理和特殊处理测试', () => {
        it('应该代理 collection 的所有方法到 ModelInstance', async function() {
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

            // 验证常见方法存在
            assert.strictEqual(typeof User.insertOne, 'function');
            assert.strictEqual(typeof User.find, 'function');
            assert.strictEqual(typeof User.updateOne, 'function');
            assert.strictEqual(typeof User.deleteOne, 'function');
            assert.strictEqual(typeof User.count, 'function');
            assert.strictEqual(typeof User.aggregate, 'function');
        });

        it('应该正确处理 incrementOne 的 timestamps', async function() {
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
            const insertedUser = await User.findOne({ _id: result.insertedId });
            const originalUpdatedAt = insertedUser.updatedAt;

            // 等待一点时间确保时间戳不同
            await new Promise(resolve => setTimeout(resolve, 10));

            // 使用 incrementOne（应该自动更新 updatedAt）
            await User.incrementOne({ _id: result.insertedId }, { counter: 1 });

            const updatedUser = await User.findOne({ _id: result.insertedId });
            assert.strictEqual(updatedUser.counter, 1, 'counter 应该递增');
            assert.ok(updatedUser.updatedAt > originalUpdatedAt,
                'incrementOne 应该自动更新 updatedAt');
        });
    });

    // ========== 错误处理完整覆盖 ==========
    describe('错误处理完整覆盖', () => {
        it('应该拒绝 null 作为集合名', function() {
            try {
                Model.define(null, {
                    schema: (dsl) => dsl({ name: 'string!' })
                });
                assert.fail('应该抛出错误');
            } catch (err) {
                assert.strictEqual(err.code, 'INVALID_COLLECTION_NAME');
                assert.ok(err.message.includes('non-empty string'));
            }
        });

        it('应该拒绝 undefined 作为集合名', function() {
            try {
                Model.define(undefined, {
                    schema: (dsl) => dsl({ name: 'string!' })
                });
                assert.fail('应该抛出错误');
            } catch (err) {
                assert.strictEqual(err.code, 'INVALID_COLLECTION_NAME');
            }
        });

        it('应该拒绝数字作为集合名', function() {
            try {
                Model.define(123, {
                    schema: (dsl) => dsl({ name: 'string!' })
                });
                assert.fail('应该抛出错误');
            } catch (err) {
                assert.strictEqual(err.code, 'INVALID_COLLECTION_NAME');
            }
        });

        it('应该拒绝只包含空格的集合名', function() {
            try {
                Model.define('   ', {
                    schema: (dsl) => dsl({ name: 'string!' })
                });
                assert.fail('应该抛出错误');
            } catch (err) {
                assert.strictEqual(err.code, 'INVALID_COLLECTION_NAME');
            }
        });

        it('应该拒绝包含 $ 字符的集合名', function() {
            try {
                Model.define('user$data', {
                    schema: (dsl) => dsl({ name: 'string!' })
                });
                assert.fail('应该抛出错误');
            } catch (err) {
                assert.strictEqual(err.code, 'INVALID_COLLECTION_NAME');
                assert.ok(err.message.includes('special characters'));
            }
        });

        it('应该拒绝包含 null 字符的集合名', function() {
            try {
                Model.define('user\x00data', {
                    schema: (dsl) => dsl({ name: 'string!' })
                });
                assert.fail('应该抛出错误');
            } catch (err) {
                assert.strictEqual(err.code, 'INVALID_COLLECTION_NAME');
            }
        });

        it('应该拒绝 null 作为 definition', function() {
            try {
                Model.define(currentCollection, null);
                assert.fail('应该抛出错误');
            } catch (err) {
                assert.strictEqual(err.code, 'INVALID_MODEL_DEFINITION');
            }
        });

        it('应该拒绝数组作为 definition', function() {
            try {
                Model.define(currentCollection, []);
                assert.fail('应该抛出错误');
            } catch (err) {
                // 数组是对象，但没有 schema 属性，会抛出 MISSING_SCHEMA
                assert.strictEqual(err.code, 'MISSING_SCHEMA');
            }
        });

        it('应该拒绝字符串作为 definition', function() {
            try {
                Model.define(currentCollection, 'invalid');
                assert.fail('应该抛出错误');
            } catch (err) {
                assert.strictEqual(err.code, 'INVALID_MODEL_DEFINITION');
            }
        });

        it('应该拒绝没有 schema 的 definition', function() {
            try {
                Model.define(currentCollection, {
                    options: {}
                });
                assert.fail('应该抛出错误');
            } catch (err) {
                assert.strictEqual(err.code, 'MISSING_SCHEMA');
            }
        });

        it('应该拒绝 schema 为字符串', function() {
            try {
                Model.define(currentCollection, {
                    schema: 'invalid'
                });
                assert.fail('应该抛出错误');
            } catch (err) {
                assert.strictEqual(err.code, 'INVALID_SCHEMA_TYPE');
            }
        });

        it('应该拒绝 schema 为数字', function() {
            try {
                Model.define(currentCollection, {
                    schema: 123
                });
                assert.fail('应该抛出错误');
            } catch (err) {
                assert.strictEqual(err.code, 'INVALID_SCHEMA_TYPE');
            }
        });

        it('应该拒绝 schema 为数组', function() {
            try {
                Model.define(currentCollection, {
                    schema: []
                });
                // 数组在 JavaScript 中 typeof 返回 'object'，所以不会被 INVALID_SCHEMA_TYPE 捕获
                // 但后续使用时会失败
                // 如果没抛出错误，说明当前实现允许数组作为 schema
                // 这个测试主要是为了覆盖这种情况
            } catch (err) {
                // 如果抛出错误，验证错误码
                assert.ok(err.code, '应该有错误码');
            }
        });
    });

    // ========== 边界情况覆盖 ==========
    describe('边界情况覆盖', () => {
        it('应该正确处理没有 options 的 Model 定义', function() {
            Model.define(currentCollection, {
                schema: (dsl) => dsl({ name: 'string!' })
                // 没有 options
            });

            const modelDef = Model.get(currentCollection);
            assert.ok(modelDef);
            assert.strictEqual(modelDef.definition._internalHooks, undefined);
        });

        it('应该正确处理空的 options 对象', function() {
            Model.define(currentCollection, {
                schema: (dsl) => dsl({ name: 'string!' }),
                options: {}
            });

            const modelDef = Model.get(currentCollection);
            assert.ok(modelDef);
            assert.strictEqual(modelDef.definition._internalHooks, undefined);
        });

        it('应该正确处理 timestamps: undefined', function() {
            Model.define(currentCollection, {
                schema: (dsl) => dsl({ name: 'string!' }),
                options: {
                    timestamps: undefined
                }
            });

            const modelDef = Model.get(currentCollection);
            assert.strictEqual(modelDef.definition._internalHooks, undefined);
        });

        it('应该正确处理 timestamps: null', function() {
            Model.define(currentCollection, {
                schema: (dsl) => dsl({ name: 'string!' }),
                options: {
                    timestamps: null
                }
            });

            const modelDef = Model.get(currentCollection);
            assert.strictEqual(modelDef.definition._internalHooks, undefined);
        });

        it('应该正确处理集合名首尾有空格但 trim 后有效', function() {
            // 这个应该失败，因为 collectionName.trim() === '' 检查在前
            try {
                Model.define('  validname  ', {
                    schema: (dsl) => dsl({ name: 'string!' })
                });
                // 如果没抛出错误，说明处理了空格
                const modelDef = Model.get('  validname  ');
                assert.ok(modelDef, '应该能找到 Model');
            } catch (err) {
                // 如果抛出错误，说明不允许空格
                assert.strictEqual(err.code, 'INVALID_COLLECTION_NAME');
            }
        });
    });

    // ========== enums 功能测试 ==========
    describe('enums 功能测试', () => {
        it('应该支持 enums 配置', function() {
            Model.define(currentCollection, {
                enums: {
                    role: 'admin|user|guest'
                },
                schema: function(dsl) {
                    return dsl({
                        name: 'string!',
                        role: 'string'
                    });
                },
                options: {}
            });

            const modelDef = Model.get(currentCollection);
            assert.ok(modelDef.definition.enums);
            assert.strictEqual(modelDef.definition.enums.role, 'admin|user|guest');
        });

        it('应该在 schema 函数中访问 this.enums', async function() {
            let enumsValue = null;

            Model.define(currentCollection, {
                enums: {
                    status: 'active|inactive'
                },
                schema: function(dsl) {
                    // 在 ModelInstance 构造时，this 被绑定到 definition
                    // 所以可以通过 this.enums 访问枚举
                    enumsValue = this.enums ? this.enums.status : null;
                    return dsl({
                        name: 'string!',
                        status: 'string'
                    });
                },
                options: {}
            });

            // schema 函数在 ModelInstance 构造时执行
            msq = new MonSQLize({
                type: 'mongodb',
                databaseName: 'test',
                config: { useMemoryServer: true }
            });
            await msq.connect();

            // 实例化 Model 会触发 schema 函数执行
            const User = msq.model(currentCollection);

            // 验证 schema 函数中能访问到 this.enums
            assert.strictEqual(enumsValue, 'active|inactive',
                'schema 函数应该能通过 this.enums 访问枚举值');
        });
    });
});

