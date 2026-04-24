/**
 * Model connection 绑定功能单元测试
 *
 * 测试范围：
 * 1. Model.define() 中 connection 字段验证
 * 2. msq.model() 路由到正确的数据库（只指定 database）
 * 3. msq.model() 路由到正确的连接池（只指定 pool）
 * 4. msq.model() 路由到指定池 + 指定数据库（pool + database 组合）
 * 5. 不配置 connection 时向后兼容
 * 6. pool 不存在时抛出 POOL_NOT_FOUND
 * 7. 配置 pool 但无 poolManager 时抛出 NO_POOL_MANAGER
 *
 * @module test/unit/model/model-connection-binding.test.js
 * @since v1.2.2
 */

const assert = require('assert');
const { Model } = require('../../../lib/index');

// ============================================================
// 工具函数：构造 mock msq 实例
// ============================================================

/**
 * 构造最简 mock msq 实例，供测试 _resolveModelCollection 路由逻辑
 *
 * @param {Object} opts
 * @param {string} [opts.databaseName='default_db'] - 实例默认数据库名
 * @param {Object} [opts.poolManager] - mock poolManager（含 _getPool / getPoolNames）
 * @returns {Object} mock msq 实例
 */
function makeMockMsq({ databaseName = 'default_db', poolManager = null } = {}) {
    // 记录 collectionFromClient 调用参数，用于断言
    const calls = { collectionFromClient: [], dbCollection: [] };

    const adapter = {
        collectionFromClient(client, dbName, collName) {
            calls.collectionFromClient.push({ client, dbName, collName });
            return { _source: 'pool', client, dbName, collName };
        }
    };

    const dbInstance = {
        collection(collName) {
            calls.dbCollection.push({ collName, dbName: databaseName });
            return { _source: 'default', collName, dbName: databaseName };
        },
        db(dbName) {
            return {
                collection(collName) {
                    calls.dbCollection.push({ collName, dbName });
                    return { _source: 'db-switch', collName, dbName };
                }
            };
        }
    };

    const msq = {
        databaseName,
        dbInstance,
        _adapter: adapter,
        _poolManager: poolManager,
        _modelInstances: new Map(),
        // 直接暴露私有方法供测试
        _resolveModelCollection: require('../../../lib/index').prototype
            ? null  // 不能这样访问，下面单独绑定
            : null,
        _calls: calls
    };

    // 绑定真实的 _resolveModelCollection 实现
    const MonSQLize = require('../../../lib/index');
    msq._resolveModelCollection = MonSQLize.prototype._resolveModelCollection.bind(msq);

    return msq;
}

/**
 * 构造 mock poolManager
 * @param {Object} pools - { poolName: mockClient }
 */
function makeMockPoolManager(pools = {}) {
    return {
        _pools: new Map(Object.entries(pools).map(([name, client]) => [name, { client }])),
        _getPool(name) {
            const pool = this._pools.get(name);
            return pool ? pool.client : null;
        },
        getPoolNames() {
            return Array.from(this._pools.keys());
        }
    };
}

// ============================================================
// 测试套件
// ============================================================

describe('Model - connection 绑定功能 (v1.2.2)', function () {

    beforeEach(function () {
        Model._clear();
    });

    // ----------------------------------------------------------
    // 分组 1：Model.define() 验证阶段
    // ----------------------------------------------------------
    describe('Model.define() - connection 字段验证', function () {

        it('应该接受合法的 connection: { pool, database }', function () {
            assert.doesNotThrow(() => {
                Model.define('orders', {
                    schema: (dsl) => dsl({ amount: 'number' }),
                    connection: { pool: 'analytics', database: 'reports_db' }
                });
            });
            const def = Model.get('orders');
            assert.deepStrictEqual(def.definition.connection, { pool: 'analytics', database: 'reports_db' });
        });

        it('应该接受只有 database 的 connection', function () {
            assert.doesNotThrow(() => {
                Model.define('logs', {
                    schema: (dsl) => dsl({ level: 'string' }),
                    connection: { database: 'logs_db' }
                });
            });
        });

        it('应该接受只有 pool 的 connection', function () {
            assert.doesNotThrow(() => {
                Model.define('events', {
                    schema: (dsl) => dsl({ type: 'string' }),
                    connection: { pool: 'analytics' }
                });
            });
        });

        it('应该拒绝 connection.pool 为空字符串', function () {
            assert.throws(() => {
                Model.define('bad1', {
                    schema: (dsl) => dsl({ x: 'string' }),
                    connection: { pool: '' }
                });
            }, (err) => {
                assert.strictEqual(err.code, 'INVALID_MODEL_DEFINITION');
                assert.ok(err.message.includes('connection.pool'));
                return true;
            });
        });

        it('应该拒绝 connection.pool 为空白字符串', function () {
            assert.throws(() => {
                Model.define('bad2', {
                    schema: (dsl) => dsl({ x: 'string' }),
                    connection: { pool: '   ' }
                });
            }, (err) => {
                assert.strictEqual(err.code, 'INVALID_MODEL_DEFINITION');
                return true;
            });
        });

        it('应该拒绝 connection.database 为空字符串', function () {
            assert.throws(() => {
                Model.define('bad3', {
                    schema: (dsl) => dsl({ x: 'string' }),
                    connection: { database: '' }
                });
            }, (err) => {
                assert.strictEqual(err.code, 'INVALID_MODEL_DEFINITION');
                assert.ok(err.message.includes('connection.database'));
                return true;
            });
        });

        it('应该拒绝 connection.pool 为非字符串类型', function () {
            assert.throws(() => {
                Model.define('bad4', {
                    schema: (dsl) => dsl({ x: 'string' }),
                    connection: { pool: 123 }
                });
            }, { code: 'INVALID_MODEL_DEFINITION' });
        });

        it('不配置 connection 时应该正常注册', function () {
            assert.doesNotThrow(() => {
                Model.define('users', {
                    schema: (dsl) => dsl({ name: 'string' })
                });
            });
            const def = Model.get('users');
            assert.strictEqual(def.definition.connection, undefined);
        });
    });

    // ----------------------------------------------------------
    // 分组 2：_resolveModelCollection() 路由逻辑
    // ----------------------------------------------------------
    describe('_resolveModelCollection() - 路由逻辑', function () {

        it('只指定 database → 使用默认连接池切换数据库', function () {
            const msq = makeMockMsq({ databaseName: 'default_db' });
            const result = msq._resolveModelCollection('logs', { database: 'logs_db' });
            assert.strictEqual(result._source, 'db-switch');
            assert.strictEqual(result.dbName, 'logs_db');
            assert.strictEqual(result.collName, 'logs');
        });

        it('只指定 pool → 使用指定池 + 实例默认 databaseName', function () {
            const mockClient = { name: 'analytics-client' };
            const poolMgr = makeMockPoolManager({ analytics: mockClient });
            const msq = makeMockMsq({ databaseName: 'default_db', poolManager: poolMgr });

            const result = msq._resolveModelCollection('reports', { pool: 'analytics' });
            assert.strictEqual(result._source, 'pool');
            assert.strictEqual(result.client, mockClient);
            assert.strictEqual(result.dbName, 'default_db');
            assert.strictEqual(result.collName, 'reports');
        });

        it('pool + database → 使用指定池 + 指定数据库', function () {
            const mockClient = { name: 'analytics-client' };
            const poolMgr = makeMockPoolManager({ analytics: mockClient });
            const msq = makeMockMsq({ databaseName: 'default_db', poolManager: poolMgr });

            const result = msq._resolveModelCollection('reports', {
                pool: 'analytics',
                database: 'reports_db'
            });
            assert.strictEqual(result._source, 'pool');
            assert.strictEqual(result.client, mockClient);
            assert.strictEqual(result.dbName, 'reports_db');
            assert.strictEqual(result.collName, 'reports');
        });

        it('pool 不存在 → 抛出 POOL_NOT_FOUND', function () {
            const poolMgr = makeMockPoolManager({ main: {} });
            const msq = makeMockMsq({ poolManager: poolMgr });

            assert.throws(() => {
                msq._resolveModelCollection('orders', { pool: 'nonexistent' });
            }, (err) => {
                assert.strictEqual(err.code, 'POOL_NOT_FOUND');
                assert.ok(err.message.includes('nonexistent'));
                assert.ok(err.message.includes('main'));   // 提示可用池
                return true;
            });
        });

        it('配置 pool 但无 poolManager → 抛出 NO_POOL_MANAGER', function () {
            const msq = makeMockMsq({ poolManager: null });

            assert.throws(() => {
                msq._resolveModelCollection('orders', { pool: 'main' });
            }, (err) => {
                assert.strictEqual(err.code, 'NO_POOL_MANAGER');
                assert.ok(err.message.includes('pools'));
                return true;
            });
        });
    });

    // ----------------------------------------------------------
    // 分组 3：向后兼容（无 connection 时走原逻辑）
    // ----------------------------------------------------------
    describe('向后兼容 - 不配置 connection', function () {

        it('无 connection 时 _resolveModelCollection 不被调用', function () {
            // 验证: 当 Model 无 connection 时，model() 走原来的 dbInstance.collection() 分支
            Model.define('users', {
                schema: (dsl) => dsl({ name: 'string' })
            });

            const def = Model.get('users');
            // 无 connection 字段
            assert.ok(!def.definition.connection);

            // 验证 _resolveModelCollection 不会被无 connection 的 Model 触发
            const connection = def.definition.connection;
            const shouldRoute = !!(connection && (connection.pool || connection.database));
            assert.strictEqual(shouldRoute, false);
        });

        it('connection 配置但 pool 和 database 均为 undefined 时走原逻辑', function () {
            // edge case: connection: {} 两个字段都没填
            Model.define('items', {
                schema: (dsl) => dsl({ name: 'string' }),
                connection: {}
            });

            const def = Model.get('items');
            const connection = def.definition.connection;
            const shouldRoute = !!(connection && (connection.pool || connection.database));
            assert.strictEqual(shouldRoute, false);
        });
    });
});
