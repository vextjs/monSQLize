/**
 * 验证功能测试
 * 测试 setValidator, setValidationLevel, setValidationAction, getValidator 方法
 */

const assert = require('assert');
const MonSQLize = require('../../../lib/index');

describe('Validation Operations', function() {
    this.timeout(10000);

    let db;
    let collection;
    const collectionName = 'test_validation';

    before(async function() {
        db = new MonSQLize({
            type: 'mongodb',
            config: {
                uri: process.env.MONGODB_URI || 'mongodb://localhost:27017/test_validation_ops'
            }
        });
        await db.connect();
        const { collection: getCollection } = await db.connect();
        collection = getCollection(collectionName);

        // 确保集合存在
        await collection.insertOne({ test: 'init' }).catch(() => {});
    });

    after(async function() {
        // 清理
        try {
            await collection.dropCollection();
        } catch (error) {
            // 忽略错误
        }
        if (db) {
            await db.close();
        }
    });

    describe('setValidator()', function() {
        afterEach(async function() {
            // 清除验证规则
            try {
                await collection.setValidator({});
            } catch (error) {
                // 忽略错误
            }
        });

        it('应该设置 JSON Schema 验证规则', async function() {
            const result = await collection.setValidator({
                $jsonSchema: {
                    bsonType: 'object',
                    required: ['name', 'email'],
                    properties: {
                        name: { bsonType: 'string' },
                        email: { bsonType: 'string' }
                    }
                }
            });

            assert.ok(result.ok);
            assert.strictEqual(result.collection, collectionName);
        });

        it('应该设置查询表达式验证规则', async function() {
            const result = await collection.setValidator({
                $and: [
                    { name: { $type: 'string' } },
                    { email: { $regex: /@/ } }
                ]
            });

            assert.ok(result.ok);
        });

        it('应该同时设置验证级别和行为', async function() {
            const result = await collection.setValidator({
                $jsonSchema: {
                    bsonType: 'object',
                    required: ['name']
                }
            }, {
                validationLevel: 'moderate',
                validationAction: 'warn'
            });

            assert.ok(result.ok);
        });

        it('应该验证 validator 参数', async function() {
            try {
                await collection.setValidator(null);
                assert.fail('应该抛出验证错误');
            } catch (error) {
                assert.ok(error.message.includes('Validator'));
            }
        });

        it('应该验证 validator 类型', async function() {
            try {
                await collection.setValidator('invalid');
                assert.fail('应该抛出验证错误');
            } catch (error) {
                assert.ok(error.message.includes('object'));
            }
        });

        it('设置后应该生效（插入无效数据应失败）', async function() {
            await collection.setValidator({
                $jsonSchema: {
                    bsonType: 'object',
                    required: ['name'],
                    properties: {
                        name: { bsonType: 'string' }
                    }
                }
            });

            try {
                await collection.insertOne({ age: 25 }); // 缺少 name
                assert.fail('应该抛出验证错误');
            } catch (error) {
                assert.ok(error.message.includes('validation') || error.code === 121);
            }
        });
    });

    describe('setValidationLevel()', function() {
        it('应该设置验证级别为 strict', async function() {
            const result = await collection.setValidationLevel('strict');
            assert.ok(result.ok);
            assert.strictEqual(result.validationLevel, 'strict');
        });

        it('应该设置验证级别为 moderate', async function() {
            const result = await collection.setValidationLevel('moderate');
            assert.ok(result.ok);
            assert.strictEqual(result.validationLevel, 'moderate');
        });

        it('应该设置验证级别为 off', async function() {
            const result = await collection.setValidationLevel('off');
            assert.ok(result.ok);
            assert.strictEqual(result.validationLevel, 'off');
        });

        it('应该拒绝无效的验证级别', async function() {
            try {
                await collection.setValidationLevel('invalid');
                assert.fail('应该抛出验证错误');
            } catch (error) {
                assert.ok(error.message.includes('Invalid validation level'));
            }
        });

        it('应该验证参数类型', async function() {
            try {
                await collection.setValidationLevel(123);
                assert.fail('应该抛出验证错误');
            } catch (error) {
                assert.ok(error.message.includes('validation level'));
            }
        });
    });

    describe('setValidationAction()', function() {
        it('应该设置验证行为为 error', async function() {
            const result = await collection.setValidationAction('error');
            assert.ok(result.ok);
            assert.strictEqual(result.validationAction, 'error');
        });

        it('应该设置验证行为为 warn', async function() {
            const result = await collection.setValidationAction('warn');
            assert.ok(result.ok);
            assert.strictEqual(result.validationAction, 'warn');
        });

        it('应该拒绝无效的验证行为', async function() {
            try {
                await collection.setValidationAction('invalid');
                assert.fail('应该抛出验证错误');
            } catch (error) {
                assert.ok(error.message.includes('Invalid validation action'));
            }
        });

        it('应该验证参数类型', async function() {
            try {
                await collection.setValidationAction(true);
                assert.fail('应该抛出验证错误');
            } catch (error) {
                assert.ok(error.message.includes('validation action'));
            }
        });
    });

    describe('getValidator()', function() {
        beforeEach(async function() {
            // 清除验证规则
            try {
                await collection.setValidator({});
            } catch (error) {
                // 忽略错误
            }
        });

        it('应该返回验证配置', async function() {
            const validation = await collection.getValidator();
            assert.ok(validation);
            assert.ok('validator' in validation);
            assert.ok('validationLevel' in validation);
            assert.ok('validationAction' in validation);
        });

        it('应该返回默认值（无验证规则时）', async function() {
            const validation = await collection.getValidator();
            assert.strictEqual(validation.validator, null);
            assert.strictEqual(validation.validationLevel, 'strict');
            assert.strictEqual(validation.validationAction, 'error');
        });

        it('应该返回已设置的验证规则', async function() {
            const validator = {
                $jsonSchema: {
                    bsonType: 'object',
                    required: ['name']
                }
            };

            await collection.setValidator(validator);
            const validation = await collection.getValidator();

            assert.ok(validation.validator);
            assert.deepStrictEqual(validation.validator, validator);
        });

        it('应该返回已设置的验证级别', async function() {
            await collection.setValidationLevel('moderate');
            const validation = await collection.getValidator();
            assert.strictEqual(validation.validationLevel, 'moderate');
        });

        it('应该返回已设置的验证行为', async function() {
            await collection.setValidationAction('warn');
            const validation = await collection.getValidator();
            assert.strictEqual(validation.validationAction, 'warn');
        });
    });

    describe('验证规则集成测试', function() {
        beforeEach(async function() {
            // 清除集合
            try {
                await collection.dropCollection();
            } catch (error) {
                // 忽略错误
            }
            // 重新创建集合
            const { collection: getCollection } = await db.connect();
            collection = getCollection(collectionName);
            await collection.insertOne({ test: 'init' });
        });

        it('应该完整的验证流程工作正常', async function() {
            // 1. 设置验证规则
            await collection.setValidator({
                $jsonSchema: {
                    bsonType: 'object',
                    required: ['name', 'age'],
                    properties: {
                        name: { bsonType: 'string' },
                        age: { bsonType: 'int', minimum: 0, maximum: 120 }
                    }
                }
            });

            // 2. 设置验证级别
            await collection.setValidationLevel('strict');

            // 3. 设置验证行为
            await collection.setValidationAction('error');

            // 4. 验证配置生效
            const validation = await collection.getValidator();
            assert.ok(validation.validator);
            assert.strictEqual(validation.validationLevel, 'strict');
            assert.strictEqual(validation.validationAction, 'error');

            // 5. 插入有效数据应该成功
            const result = await collection.insertOne({
                name: 'Alice',
                age: 30
            });
            assert.ok(result.insertedId);

            // 6. 插入无效数据应该失败
            try {
                await collection.insertOne({
                    name: 'Bob'
                    // 缺少 age
                });
                assert.fail('应该抛出验证错误');
            } catch (error) {
                assert.ok(error.code === 121 || error.message.includes('validation'));
            }
        });

        it('warn 模式应该允许无效数据但记录警告', async function() {
            // 设置验证规则
            await collection.setValidator({
                $jsonSchema: {
                    bsonType: 'object',
                    required: ['name']
                }
            });

            // 设置为 warn 模式
            await collection.setValidationAction('warn');

            // 插入无效数据应该成功（但会有警告）
            const result = await collection.insertOne({
                age: 25
                // 缺少 name，但应该成功
            });
            assert.ok(result.insertedId);
        });
    });
});

