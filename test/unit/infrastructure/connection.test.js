/**
 * 连接管理和基础功能测试套件
 * 测试 connect()、close()、collection() 方法
 */

const MonSQLize = require('../../../lib');
const assert = require('assert');

describe('连接管理测试套件', function() {
    this.timeout(30000);

    const testUri = process.env.MONGO_URI || 'mongodb://localhost:27017';

    describe('1. connect() 方法', function() {
        it('1.1 应该成功连接到 MongoDB', async function() {
            const msq = new MonSQLize({
                type: 'mongodb',
                databaseName: 'test_connection',
                config: { uri: testUri }
            });

            const conn = await msq.connect();
            assert.ok(conn, '应该返回连接对象');
            assert.ok(msq._adapter.client, '应该设置 client 属性');
            assert.ok(msq._adapter.db, '应该设置 db 属性');
            await msq.close();
        });

        it('1.2 多次调用 connect() 应该返回同一个连接', async function() {
            const msq = new MonSQLize({
                type: 'mongodb',
                databaseName: 'test_connection',
                config: { uri: testUri }
            });

            const conn1 = await msq.connect();
            const conn2 = await msq.connect();
            const conn3 = await msq.connect();

            assert.strictEqual(conn1, conn2, '第二次调用应该返回同一连接');
            assert.strictEqual(conn2, conn3, '第三次调用应该返回同一连接');
            await msq.close();
        });

        it('1.3 并发调用 connect() 应该只建立一个连接', async function() {
            const msq = new MonSQLize({
                type: 'mongodb',
                databaseName: 'test_connection',
                config: { uri: testUri }
            });

            // 模拟高并发场景：10 个并发连接请求
            const promises = Array(10).fill(null).map(() => msq.connect());
            const results = await Promise.all(promises);

            // 验证所有返回的都是同一个连接对象
            const firstConn = results[0];
            results.forEach((conn, index) => {
                assert.strictEqual(
                    conn,
                    firstConn,
                    `第 ${index + 1} 个连接应该与第一个相同`
                );
            });

            // 验证只创建了一个客户端
            assert.ok(msq._adapter.client, '应该只有一个 client');
            await msq.close();
        });

        // 注意：以下两个连接失败测试已移除，因为使用 invalid-host 会导致长时间 DNS 超时
        // - 1.4 连接失败应该抛出错误
        // - 1.6 连接失败应该触发 error 事件
        // 建议：使用 mock 或本地无效端口（如 127.0.0.1:9999 + 短超时）来测试连接失败场景

        it('1.5 连接成功应该触发 connected 事件', async function() {
            const msq = new MonSQLize({
                type: 'mongodb',
                databaseName: 'test_connection',
                config: { uri: testUri }
            });

            let eventFired = false;
            let eventData = null;

            const connPromise = new Promise((resolve) => {
                msq.on('connected', (data) => {
                    eventFired = true;
                    eventData = data;
                    resolve();
                });
            });

            await msq.connect();
            await connPromise;

            assert.ok(eventFired, '应该触发 connected 事件');
            assert.ok(eventData, '事件应该包含数据');
            assert.equal(eventData.type, 'mongodb', '事件数据应该包含类型');
            assert.equal(eventData.db, 'test_connection', '事件数据应该包含数据库名');
            await msq.close();
        });
    });

    describe('2. close() 方法', function() {
        it('2.1 应该成功关闭连接', async function() {
            const msq = new MonSQLize({
                type: 'mongodb',
                databaseName: 'test_connection',
                config: { uri: testUri }
            });

            await msq.connect();
            assert.ok(msq._adapter.client, '连接前应该有 client');

            const result = await msq.close();
            assert.strictEqual(result, true, '应该返回 true');
            assert.strictEqual(msq._adapter.client, null, '关闭后 client 应该为 null');
            assert.strictEqual(msq._adapter.db, null, '关闭后 db 应该为 null');
        });

        it('2.2 应该清理实例 ID 缓存（防止内存泄漏）', async function() {
            const msq = new MonSQLize({
                type: 'mongodb',
                databaseName: 'test_connection',
                config: { uri: testUri }
            });

            await msq.connect();
            
            // 访问集合会创建 _iidCache
            const coll = msq._adapter.collection(null, 'test_coll');
            assert.ok(msq._adapter._iidCache, '应该创建 _iidCache');

            await msq.close();
            
            // 验证缓存已清理
            assert.strictEqual(
                msq._adapter._iidCache,
                null,
                '关闭后 _iidCache 应该为 null'
            );
        });

        it('2.3 应该清理连接锁（_connecting）', async function() {
            const msq = new MonSQLize({
                type: 'mongodb',
                databaseName: 'test_connection',
                config: { uri: testUri }
            });

            await msq.connect();
            await msq.close();

            assert.strictEqual(
                msq._adapter._connecting,
                null,
                '关闭后 _connecting 应该为 null'
            );
        });

        it('2.4 多次调用 close() 应该安全', async function() {
            const msq = new MonSQLize({
                type: 'mongodb',
                databaseName: 'test_connection',
                config: { uri: testUri }
            });

            await msq.connect();
            
            const result1 = await msq.close();
            const result2 = await msq.close();
            const result3 = await msq.close();

            assert.strictEqual(result1, true, '第一次关闭应该成功');
            assert.strictEqual(result2, true, '第二次关闭应该返回 true');
            assert.strictEqual(result3, true, '第三次关闭应该返回 true');
        });

        it('2.5 关闭后应该触发 closed 事件', async function() {
            const msq = new MonSQLize({
                type: 'mongodb',
                databaseName: 'test_connection',
                config: { uri: testUri }
            });

            let closedEventFired = false;
            let closedEventData = null;

            await msq.connect();

            const closedPromise = new Promise((resolve) => {
                msq.on('closed', (data) => {
                    closedEventFired = true;
                    closedEventData = data;
                    resolve();
                });
            });

            await msq.close();
            await closedPromise;

            assert.ok(closedEventFired, '应该触发 closed 事件');
            assert.ok(closedEventData, '事件应该包含数据');
            assert.equal(closedEventData.type, 'mongodb', '事件数据应该包含类型');
            assert.equal(closedEventData.db, 'test_connection', '事件数据应该包含数据库名');
        });

        it('2.6 应该防止内存泄漏（多次连接和关闭）', async function() {
            const msq = new MonSQLize({
                type: 'mongodb',
                databaseName: 'test_connection',
                config: { uri: testUri }
            });

            // 模拟多次连接和关闭循环
            for (let i = 0; i < 5; i++) {
                await msq.connect();
                
                // 访问集合以创建缓存
                const coll = msq._adapter.collection(null, 'test_coll');
                assert.ok(coll, '应该能访问集合');
                
                await msq.close();
                
                // 验证资源已清理
                assert.strictEqual(msq._adapter.client, null, `第 ${i + 1} 次关闭后 client 应该为 null`);
                assert.strictEqual(msq._adapter._iidCache, null, `第 ${i + 1} 次关闭后缓存应该为 null`);
            }
        });
    });

    describe('3. collection() 方法', function() {
        let msq;

        before(async function() {
            msq = new MonSQLize({
                type: 'mongodb',
                databaseName: 'test_connection',
                config: { uri: testUri }
            });
            await msq.connect();
        });

        after(async function() {
            if (msq) {
                await msq.close();
            }
        });

        it('3.1 应该成功获取集合访问器', function() {
            const coll = msq._adapter.collection(null, 'test_coll');
            
            assert.ok(coll, '应该返回集合访问器');
            assert.ok(typeof coll.find === 'function', '应该有 find 方法');
            assert.ok(typeof coll.findOne === 'function', '应该有 findOne 方法');
            assert.ok(typeof coll.count === 'function', '应该有 count 方法');
            assert.ok(typeof coll.aggregate === 'function', '应该有 aggregate 方法');
        });

        it('3.2 应该正确使用默认数据库名', function() {
            const coll = msq._adapter.collection(null, 'test_coll');
            const ns = coll.getNamespace();
            
            assert.equal(ns.db, 'test_connection', '应该使用默认数据库名');
            assert.equal(ns.collection, 'test_coll', '应该使用指定的集合名');
        });

        it('3.3 应该支持指定不同的数据库名', function() {
            const coll = msq._adapter.collection('custom_db', 'test_coll');
            const ns = coll.getNamespace();
            
            assert.equal(ns.db, 'custom_db', '应该使用指定的数据库名');
            assert.equal(ns.collection, 'test_coll', '应该使用指定的集合名');
        });

        it('3.4 未连接时应该抛出错误', async function() {
            const msq2 = new MonSQLize({
                type: 'mongodb',
                databaseName: 'test_connection',
                config: { uri: testUri }
            });

            try {
                msq2._adapter.collection(null, 'test_coll');
                assert.fail('应该抛出未连接错误');
            } catch (err) {
                assert.ok(err, '应该捕获到错误');
                assert.equal(err.code, 'NOT_CONNECTED', '错误码应该是 NOT_CONNECTED');
                assert.ok(err.message.includes('not connected'), '错误消息应该包含未连接提示');
            }
        });

        it('3.5 集合名为空应该抛出错误', function() {
            try {
                msq._adapter.collection(null, '');
                assert.fail('应该抛出集合名无效错误');
            } catch (err) {
                assert.ok(err, '应该捕获到错误');
                assert.equal(err.code, 'INVALID_COLLECTION_NAME', '错误码应该是 INVALID_COLLECTION_NAME');
                assert.ok(err.message.includes('non-empty'), '错误消息应该提示非空');
            }
        });

        it('3.6 集合名为 null 应该抛出错误', function() {
            try {
                msq._adapter.collection(null, null);
                assert.fail('应该抛出集合名无效错误');
            } catch (err) {
                assert.ok(err, '应该捕获到错误');
                assert.equal(err.code, 'INVALID_COLLECTION_NAME', '错误码应该是 INVALID_COLLECTION_NAME');
            }
        });

        it('3.7 集合名为非字符串应该抛出错误', function() {
            try {
                msq._adapter.collection(null, 123);
                assert.fail('应该抛出集合名无效错误');
            } catch (err) {
                assert.ok(err, '应该捕获到错误');
                assert.equal(err.code, 'INVALID_COLLECTION_NAME', '错误码应该是 INVALID_COLLECTION_NAME');
            }
        });

        it('3.8 集合名为纯空格应该抛出错误', function() {
            try {
                msq._adapter.collection(null, '   ');
                assert.fail('应该抛出集合名无效错误');
            } catch (err) {
                assert.ok(err, '应该捕获到错误');
                assert.equal(err.code, 'INVALID_COLLECTION_NAME', '错误码应该是 INVALID_COLLECTION_NAME');
            }
        });

        it('3.9 数据库名为空字符串应该抛出错误', function() {
            try {
                msq._adapter.collection('', 'test_coll');
                assert.fail('应该抛出数据库名无效错误');
            } catch (err) {
                assert.ok(err, '应该捕获到错误');
                assert.equal(err.code, 'INVALID_DATABASE_NAME', '错误码应该是 INVALID_DATABASE_NAME');
            }
        });

        it('3.10 数据库名为纯空格应该抛出错误', function() {
            try {
                msq._adapter.collection('  ', 'test_coll');
                assert.fail('应该抛出数据库名无效错误');
            } catch (err) {
                assert.ok(err, '应该捕获到错误');
                assert.equal(err.code, 'INVALID_DATABASE_NAME', '错误码应该是 INVALID_DATABASE_NAME');
            }
        });

        it('3.11 数据库名为非字符串应该抛出错误', function() {
            try {
                msq._adapter.collection(123, 'test_coll');
                assert.fail('应该抛出数据库名无效错误');
            } catch (err) {
                assert.ok(err, '应该捕获到错误');
                assert.equal(err.code, 'INVALID_DATABASE_NAME', '错误码应该是 INVALID_DATABASE_NAME');
            }
        });

        it('3.12 应该缓存实例 ID', function() {
            const coll1 = msq._adapter.collection(null, 'test_coll1');
            const coll2 = msq._adapter.collection(null, 'test_coll2');
            
            const ns1 = coll1.getNamespace();
            const ns2 = coll2.getNamespace();
            
            // 同一数据库的不同集合应该共享相同的 iid
            assert.equal(ns1.iid, ns2.iid, '同一数据库应该有相同的实例 ID');
            assert.ok(msq._adapter._iidCache, '应该创建缓存');
            assert.ok(msq._adapter._iidCache.size > 0, '缓存应该有内容');
        });

        it('3.13 不同数据库应该有不同的实例 ID', function() {
            const coll1 = msq._adapter.collection('db1', 'test_coll');
            const coll2 = msq._adapter.collection('db2', 'test_coll');
            
            const ns1 = coll1.getNamespace();
            const ns2 = coll2.getNamespace();
            
            assert.notEqual(ns1.iid, ns2.iid, '不同数据库应该有不同的实例 ID');
        });
    });

    describe('4. 健康检查', function() {
        let msq;

        it('4.1 未连接时应该返回 down 状态', async function() {
            msq = new MonSQLize({
                type: 'mongodb',
                databaseName: 'test_connection',
                config: { uri: testUri }
            });

            const health = await msq.health();
            
            assert.equal(health.status, 'down', '状态应该是 down');
            assert.equal(health.connected, false, 'connected 应该是 false');
        });

        it('4.2 已连接时应该返回 up 状态', async function() {
            msq = new MonSQLize({
                type: 'mongodb',
                databaseName: 'test_connection',
                config: { uri: testUri }
            });

            await msq.connect();
            const health = await msq.health();
            
            assert.equal(health.status, 'up', '状态应该是 up');
            assert.equal(health.connected, true, 'connected 应该是 true');
            assert.ok(health.defaults, '应该包含 defaults 配置');
            assert.ok(health.driver, '应该包含 driver 信息');
            
            await msq.close();
        });

        it('4.3 关闭后应该返回 down 状态', async function() {
            msq = new MonSQLize({
                type: 'mongodb',
                databaseName: 'test_connection',
                config: { uri: testUri }
            });

            await msq.connect();
            await msq.close();
            
            const health = await msq.health();
            
            assert.equal(health.status, 'down', '状态应该是 down');
            assert.equal(health.connected, false, 'connected 应该是 false');
        });
    });
});
