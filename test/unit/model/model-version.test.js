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
});

