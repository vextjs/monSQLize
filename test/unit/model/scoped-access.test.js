/**
 * scopedCollection / scopedModel 单元测试
 *
 * 测试范围：
 *  1. scopedCollection — 无 opts / 只 database / 只 pool / pool+database
 *  2. scopedCollection — 连接未建立时抛出 NOT_CONNECTED
 *  3. scopedModel — 连接未建立时抛出 NOT_CONNECTED
 *  4. scopedModel — Model 未注册时抛出 MODEL_NOT_DEFINED
 *  5. scopedModel — connection 合并（opts 优先，definition.connection 作 fallback）
 *  6. scopedModel — pool + database 路由完整链路
 *  7. scopedModel — 无 opts 时退化到默认行为
 *  8. scopedModel — actualCollectionName 优先级（definition.collection > name > key）
 *
 * @module test/unit/model/scoped-access.test.js
 * @since v1.3.0
 */

const assert = require('assert');
const { Model } = require('../../../lib/index');
const MonSQLize = require('../../../lib/index');

// ============================================================
// 工具函数
// ============================================================

/**
 * 构造 mock msq 实例，绑定 scopedCollection / scopedModel 真实实现
 */
function makeMockMsq({ databaseName = 'default_db', poolManager = null, connected = true } = {}) {
    const calls = { collectionFromClient: [], dbCollection: [] };

    const adapter = {
        collectionFromClient(client, dbName, collName) {
            calls.collectionFromClient.push({ client, dbName, collName });
            return { _source: 'pool', client, dbName, collName };
        }
    };

    const dbInstance = connected ? {
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
    } : null;

    const msq = {
        databaseName,
        dbInstance,
        _adapter: adapter,
        _poolManager: poolManager,
        _calls: calls
    };

    msq._resolveModelCollection = MonSQLize.prototype._resolveModelCollection.bind(msq);
    msq.collection = MonSQLize.prototype.collection.bind(msq);
    msq.scopedCollection = MonSQLize.prototype.scopedCollection.bind(msq);
    msq.scopedModel = MonSQLize.prototype.scopedModel.bind(msq);
    msq.pool = MonSQLize.prototype.pool.bind(msq);
    msq.use = MonSQLize.prototype.use.bind(msq);

    return msq;
}

/**
 * 构造 mock poolManager
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

describe('scopedCollection / scopedModel 单元测试 (v1.3.0)', function () {

    beforeEach(function () {
        Model._clear();
    });

    // ----------------------------------------------------------
    // 分组 1：scopedCollection 路由逻辑
    // ----------------------------------------------------------
    describe('scopedCollection() — 路由逻辑', function () {

        it('无 opts → 退化为 collection()（默认连接池/库）', function () {
            const msq = makeMockMsq();
            const result = msq.scopedCollection('users');
            assert.strictEqual(result._source, 'default');
            assert.strictEqual(result.collName, 'users');
            assert.strictEqual(result.dbName, 'default_db');
        });

        it('opts 为空对象 → 退化为 collection()', function () {
            const msq = makeMockMsq();
            const result = msq.scopedCollection('users', {});
            assert.strictEqual(result._source, 'default');
            assert.strictEqual(result.collName, 'users');
        });

        it('只指定 database → 切换数据库，默认连接池', function () {
            const msq = makeMockMsq({ databaseName: 'main_db' });
            const result = msq.scopedCollection('invoices', { database: 'billing' });
            assert.strictEqual(result._source, 'db-switch');
            assert.strictEqual(result.dbName, 'billing');
            assert.strictEqual(result.collName, 'invoices');
        });

        it('只指定 pool → 使用指定池 + 实例默认 databaseName', function () {
            const mockClient = { name: 'cn-client' };
            const poolMgr = makeMockPoolManager({ cn: mockClient });
            const msq = makeMockMsq({ databaseName: 'main_db', poolManager: poolMgr });

            const result = msq.scopedCollection('orders', { pool: 'cn' });
            assert.strictEqual(result._source, 'pool');
            assert.strictEqual(result.client, mockClient);
            assert.strictEqual(result.dbName, 'main_db');
            assert.strictEqual(result.collName, 'orders');
        });

        it('pool + database → 使用指定池 + 指定库', function () {
            const mockClient = { name: 'cn-client' };
            const poolMgr = makeMockPoolManager({ cn: mockClient });
            const msq = makeMockMsq({ databaseName: 'main_db', poolManager: poolMgr });

            const result = msq.scopedCollection('invoices', { pool: 'cn', database: 'billing' });
            assert.strictEqual(result._source, 'pool');
            assert.strictEqual(result.client, mockClient);
            assert.strictEqual(result.dbName, 'billing');
            assert.strictEqual(result.collName, 'invoices');
        });

        it('连接未建立时抛出 NOT_CONNECTED', function () {
            const msq = makeMockMsq({ connected: false });
            assert.throws(
                () => msq.scopedCollection('users', { database: 'billing' }),
                (err) => {
                    assert.strictEqual(err.code, 'NOT_CONNECTED');
                    return true;
                }
            );
        });

        it('pool 不存在时抛出 POOL_NOT_FOUND', function () {
            const poolMgr = makeMockPoolManager({ main: {} });
            const msq = makeMockMsq({ poolManager: poolMgr });
            assert.throws(
                () => msq.scopedCollection('orders', { pool: 'missing' }),
                (err) => {
                    assert.strictEqual(err.code, 'POOL_NOT_FOUND');
                    assert.ok(err.message.includes('missing'));
                    return true;
                }
            );
        });
    });

    // ----------------------------------------------------------
    // 分组 2：scopedModel 错误处理
    // ----------------------------------------------------------
    describe('scopedModel() — 错误处理', function () {

        it('连接未建立时抛出 NOT_CONNECTED', function () {
            const msq = makeMockMsq({ connected: false });
            assert.throws(
                () => msq.scopedModel('User', { pool: 'cn' }),
                (err) => {
                    assert.strictEqual(err.code, 'NOT_CONNECTED');
                    return true;
                }
            );
        });

        it('Model 未注册时抛出 MODEL_NOT_DEFINED', function () {
            const msq = makeMockMsq();
            assert.throws(
                () => msq.scopedModel('NotExists'),
                (err) => {
                    assert.strictEqual(err.code, 'MODEL_NOT_DEFINED');
                    assert.ok(err.message.includes('NotExists'));
                    return true;
                }
            );
        });
    });

    // ----------------------------------------------------------
    // 分组 3：scopedModel connection 合并语义
    // ----------------------------------------------------------
    describe('scopedModel() — connection 合并（opts 优先，definition 作 fallback）', function () {

        it('无 opts + 无 definition.connection → 使用默认 collection()', function () {
            Model.define('User', {
                schema: (dsl) => dsl({ name: 'string' })
            });
            const msq = makeMockMsq({ databaseName: 'main_db' });
            const instance = msq.scopedModel('User');
            // ModelInstance 内部持有 collection，验证来自默认路径
            assert.ok(instance);
        });

        it('只有 definition.connection.database → 使用该 database', function () {
            Model.define('BillingInvoice', {
                schema: (dsl) => dsl({ amount: 'number' }),
                connection: { database: 'billing' }
            });
            const msq = makeMockMsq({ databaseName: 'main_db' });
            // 无 opts，合并后 = definition.connection = { database: 'billing' }
            msq.scopedModel('BillingInvoice');
            assert.strictEqual(msq._calls.dbCollection[0].dbName, 'billing');
        });

        it('opts.pool + definition.connection.database → 合并为 pool+database 路由', function () {
            // 核心场景：pool('cn').model('BillingInvoice') 自动携带 database='billing'
            Model.define('BillingInvoice', {
                schema: (dsl) => dsl({ amount: 'number' }),
                connection: { database: 'billing' }
            });
            const mockClient = { name: 'cn-client' };
            const poolMgr = makeMockPoolManager({ cn: mockClient });
            const msq = makeMockMsq({ databaseName: 'main_db', poolManager: poolMgr });

            msq.scopedModel('BillingInvoice', { pool: 'cn' });

            // 验证：路由到 cn 池 billing 库（合并结果）
            assert.strictEqual(msq._calls.collectionFromClient.length, 1);
            const call = msq._calls.collectionFromClient[0];
            assert.strictEqual(call.client, mockClient);
            assert.strictEqual(call.dbName, 'billing');
        });

        it('opts.pool + opts.database 均指定 → opts 完全覆盖 definition.connection', function () {
            Model.define('BillingInvoice', {
                schema: (dsl) => dsl({ amount: 'number' }),
                connection: { database: 'billing', pool: 'default' }
            });
            const mockCnClient = { name: 'cn-client' };
            const poolMgr = makeMockPoolManager({ cn: mockCnClient });
            const msq = makeMockMsq({ databaseName: 'main_db', poolManager: poolMgr });

            // opts 显式指定 pool=cn, database=archive —— 完全覆盖 definition.connection
            msq.scopedModel('BillingInvoice', { pool: 'cn', database: 'archive' });

            const call = msq._calls.collectionFromClient[0];
            assert.strictEqual(call.client, mockCnClient);
            assert.strictEqual(call.dbName, 'archive');
        });

        it('opts 为空对象 → 等效于无 opts，使用 definition.connection', function () {
            Model.define('BillingInvoice', {
                schema: (dsl) => dsl({ amount: 'number' }),
                connection: { database: 'billing' }
            });
            const msq = makeMockMsq({ databaseName: 'main_db' });
            msq.scopedModel('BillingInvoice', {});
            assert.strictEqual(msq._calls.dbCollection[0].dbName, 'billing');
        });
    });

    // ----------------------------------------------------------
    // 分组 4：scopedModel actualCollectionName 优先级
    // ----------------------------------------------------------
    describe('scopedModel() — actualCollectionName 优先级', function () {

        it('definition.collection 优先于 definition.name', function () {
            Model.define('UserProfile', {
                collection: 'user_profiles',
                schema: (dsl) => dsl({ name: 'string' })
            });
            const msq = makeMockMsq();
            msq.scopedModel('UserProfile');
            // collection 方法接收到的应是 'user_profiles'
            assert.strictEqual(msq._calls.dbCollection[0].collName, 'user_profiles');
        });

        it('无 collection 时使用 definition.name', function () {
            Model.define('OrderItem', {
                schema: (dsl) => dsl({ qty: 'number' })
                // 无 collection，name 由 key 推断（Model.define 的 key 即 'OrderItem'）
            });
            const msq = makeMockMsq();
            msq.scopedModel('OrderItem');
            // name 和 collection 都无，fallback 到 key 'OrderItem'
            assert.strictEqual(msq._calls.dbCollection[0].collName, 'OrderItem');
        });

        it('definition.collection 带 pool + database 时路由正确', function () {
            Model.define('Invoice', {
                collection: 'invoices',
                schema: (dsl) => dsl({ total: 'number' }),
                connection: { database: 'billing' }
            });
            const mockClient = { name: 'cn-client' };
            const poolMgr = makeMockPoolManager({ cn: mockClient });
            const msq = makeMockMsq({ poolManager: poolMgr });

            msq.scopedModel('Invoice', { pool: 'cn' });

            const call = msq._calls.collectionFromClient[0];
            assert.strictEqual(call.collName, 'invoices');  // 使用 collection 字段
            assert.strictEqual(call.dbName, 'billing');     // 使用 definition.connection.database
            assert.strictEqual(call.client, mockClient);    // 路由到 cn 池
        });
    });

    // ----------------------------------------------------------
    // 分组 5：scopedModel pool 不存在
    // ----------------------------------------------------------
    describe('scopedModel() — pool 不存在', function () {

        it('opts.pool 不存在 → 抛出 POOL_NOT_FOUND', function () {
            Model.define('User', {
                schema: (dsl) => dsl({ name: 'string' })
            });
            const poolMgr = makeMockPoolManager({ main: {} });
            const msq = makeMockMsq({ poolManager: poolMgr });

            assert.throws(
                () => msq.scopedModel('User', { pool: 'nonexistent' }),
                (err) => {
                    assert.strictEqual(err.code, 'POOL_NOT_FOUND');
                    assert.ok(err.message.includes('nonexistent'));
                    return true;
                }
            );
        });

        it('definition.connection.pool 存在但 poolManager 为 null → 抛出 NO_POOL_MANAGER', function () {
            Model.define('User', {
                schema: (dsl) => dsl({ name: 'string' }),
                connection: { pool: 'cn' }
            });
            const msq = makeMockMsq({ poolManager: null });

            assert.throws(
                () => msq.scopedModel('User'),
                (err) => {
                    assert.strictEqual(err.code, 'NO_POOL_MANAGER');
                    return true;
                }
            );
        });
    });

    // ----------------------------------------------------------
    // 分组 6：msq.use() 顶层访问器
    // ----------------------------------------------------------
    describe('use() — 顶层访问器', function () {

        it('连接未建立时抛出 NOT_CONNECTED', function () {
            const msq = makeMockMsq({ connected: false });
            assert.throws(
                () => msq.use('billing'),
                (err) => {
                    assert.strictEqual(err.code, 'NOT_CONNECTED');
                    return true;
                }
            );
        });

        it('use(dbName).collection(name) → 路由到指定库', function () {
            const msq = makeMockMsq({ databaseName: 'main_db' });
            const accessor = msq.use('billing');
            const result = accessor.collection('invoices');
            assert.strictEqual(result._source, 'db-switch');
            assert.strictEqual(result.dbName, 'billing');
            assert.strictEqual(result.collName, 'invoices');
        });

        it('use(dbName).model(key) → 以 database:dbName 调用 scopedModel', function () {
            Model.define('BillingInvoice', {
                schema: (dsl) => dsl({ amount: 'number' })
            });
            const msq = makeMockMsq({ databaseName: 'main_db' });
            const accessor = msq.use('billing');
            accessor.model('BillingInvoice');
            // 应路由到 billing 库（database: 'billing'）
            assert.strictEqual(msq._calls.dbCollection[0].dbName, 'billing');
        });

        it('返回值包含 collection 和 model 两个函数', function () {
            const msq = makeMockMsq();
            const accessor = msq.use('mydb');
            assert.strictEqual(typeof accessor.collection, 'function');
            assert.strictEqual(typeof accessor.model, 'function');
        });
    });

    // ----------------------------------------------------------
    // 分组 7：msq.pool() 顶层访问器
    // ----------------------------------------------------------
    describe('pool() — 顶层访问器', function () {

        it('连接未建立时抛出 NOT_CONNECTED', function () {
            const msq = makeMockMsq({ connected: false });
            assert.throws(
                () => msq.pool('cn'),
                (err) => {
                    assert.strictEqual(err.code, 'NOT_CONNECTED');
                    return true;
                }
            );
        });

        it('poolManager 未配置时抛出 NO_POOL_MANAGER', function () {
            const msq = makeMockMsq({ poolManager: null });
            assert.throws(
                () => msq.pool('cn'),
                (err) => {
                    assert.strictEqual(err.code, 'NO_POOL_MANAGER');
                    return true;
                }
            );
        });

        it('pool 不存在时抛出 POOL_NOT_FOUND，含可用列表', function () {
            const poolMgr = makeMockPoolManager({ main: {}, eu: {} });
            const msq = makeMockMsq({ poolManager: poolMgr });
            assert.throws(
                () => msq.pool('nonexistent'),
                (err) => {
                    assert.strictEqual(err.code, 'POOL_NOT_FOUND');
                    assert.ok(Array.isArray(err.available));
                    assert.ok(err.available.includes('main'));
                    assert.ok(err.available.includes('eu'));
                    return true;
                }
            );
        });

        it('pool(poolName).collection(name) → 路由到指定池', function () {
            const mockClient = { name: 'cn-client' };
            const poolMgr = makeMockPoolManager({ cn: mockClient });
            const msq = makeMockMsq({ databaseName: 'main_db', poolManager: poolMgr });

            const result = msq.pool('cn').collection('orders');
            assert.strictEqual(result._source, 'pool');
            assert.strictEqual(result.client, mockClient);
            assert.strictEqual(result.collName, 'orders');
        });

        it('pool(poolName).model(key) → 路由到指定池', function () {
            Model.define('Order', {
                schema: (dsl) => dsl({ qty: 'number' })
            });
            const mockClient = { name: 'cn-client' };
            const poolMgr = makeMockPoolManager({ cn: mockClient });
            const msq = makeMockMsq({ databaseName: 'main_db', poolManager: poolMgr });

            msq.pool('cn').model('Order');
            assert.strictEqual(msq._calls.collectionFromClient[0].client, mockClient);
        });

        it('pool(poolName).use(dbName).collection(name) → 路由到指定池+库', function () {
            const mockClient = { name: 'cn-client' };
            const poolMgr = makeMockPoolManager({ cn: mockClient });
            const msq = makeMockMsq({ databaseName: 'main_db', poolManager: poolMgr });

            const result = msq.pool('cn').use('billing').collection('invoices');
            assert.strictEqual(result._source, 'pool');
            assert.strictEqual(result.client, mockClient);
            assert.strictEqual(result.dbName, 'billing');
            assert.strictEqual(result.collName, 'invoices');
        });

        it('返回值包含 collection、model、use 三个函数', function () {
            const poolMgr = makeMockPoolManager({ cn: {} });
            const msq = makeMockMsq({ poolManager: poolMgr });
            const accessor = msq.pool('cn');
            assert.strictEqual(typeof accessor.collection, 'function');
            assert.strictEqual(typeof accessor.model, 'function');
            assert.strictEqual(typeof accessor.use, 'function');
        });
    });
});
