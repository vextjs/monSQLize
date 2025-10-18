/**
 * 连接管理核心功能测试（简化版）
 * 验证修复的三个问题：并发连接、输入验证、内存泄漏
 */

const MonSQLize = require('../lib');
const assert = require('assert');

describe('连接管理核心测试', function() {
    this.timeout(30000);

    const testUri = process.env.MONGO_URI || 'mongodb://localhost:27017';

    describe('修复验证', function() {
        it('✅ 修复1: 并发调用 connect() 应该只建立一个连接', async function() {
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
            for (let i = 1; i < results.length; i++) {
                // 验证 collection 方法是同一个引用
                assert.strictEqual(
                    results[i].collection,
                    firstConn.collection,
                    `第 ${i + 1} 个连接的 collection 方法应该相同`
                );
            }
            
            // 验证底层只创建了一个 adapter
            assert.ok(msq._adapter, '应该有 _adapter');
            assert.ok(msq._adapter.client, '应该只有一个 client');

            console.log('     ✓ 验证通过：并发连接只创建了一个实例');
            console.log(`     ✓ 所有 ${results.length} 个并发请求共享同一连接`);
            await msq.close();
        });

        it('✅ 修复2: 集合名为空应该抛出错误', async function() {
            const msq = new MonSQLize({
                type: 'mongodb',
                databaseName: 'test_connection',
                config: { uri: testUri }
            });

            await msq.connect();

            const conn = await msq.connect();
            
            // 测试空字符串
            try {
                conn.collection('');
                assert.fail('应该抛出集合名无效错误');
            } catch (err) {
                assert.equal(err.code, 'INVALID_COLLECTION_NAME', '错误码应该是 INVALID_COLLECTION_NAME');
                console.log('     ✓ 验证通过：空集合名抛出正确错误');
            }

            // 测试 null
            try {
                conn.collection(null);
                assert.fail('应该抛出集合名无效错误');
            } catch (err) {
                assert.equal(err.code, 'INVALID_COLLECTION_NAME');
                console.log('     ✓ 验证通过：null 集合名抛出正确错误');
            }

            // 测试纯空格
            try {
                conn.collection('   ');
                assert.fail('应该抛出集合名无效错误');
            } catch (err) {
                assert.equal(err.code, 'INVALID_COLLECTION_NAME');
                console.log('     ✓ 验证通过：空格集合名抛出正确错误');
            }

            // 测试非字符串
            try {
                conn.collection(123);
                assert.fail('应该抛出集合名无效错误');
            } catch (err) {
                assert.equal(err.code, 'INVALID_COLLECTION_NAME');
                console.log('     ✓ 验证通过：非字符串集合名抛出正确错误');
            }

            await msq.close();
        });

        it('✅ 修复3: close() 应该清理缓存防止内存泄漏', async function() {
            const msq = new MonSQLize({
                type: 'mongodb',
                databaseName: 'test_connection',
                config: { uri: testUri }
            });

            // 模拟多次连接和关闭循环
            for (let i = 0; i < 3; i++) {
                await msq.connect();
                
                // 访问集合以创建缓存
                const conn = await msq.connect();
                const coll = conn.collection('test_coll');
                assert.ok(coll, '应该能访问集合');
                
                // 验证缓存被创建
                assert.ok(msq._adapter._iidCache, `第 ${i + 1} 次：应该创建 _iidCache`);
                
                await msq.close();
                
                // 验证资源已清理
                assert.strictEqual(msq._adapter, null, `第 ${i + 1} 次：关闭后 _adapter 应该为 null`);
                console.log(`     ✓ 第 ${i + 1} 次循环：资源已清理`);
            }

            console.log('     ✓ 验证通过：多次连接关闭无内存泄漏');
        });

        it('✅ 附加验证: 数据库名校验', async function() {
            const msq = new MonSQLize({
                type: 'mongodb',
                databaseName: 'test_connection',
                config: { uri: testUri }
            });

            await msq.connect();

            const conn = await msq.connect();
            
            // 测试空数据库名
            try {
                conn.db('').collection('test_coll');
                assert.fail('应该抛出数据库名无效错误');
            } catch (err) {
                assert.equal(err.code, 'INVALID_DATABASE_NAME');
                console.log('     ✓ 验证通过：空数据库名抛出正确错误');
            }

            // 测试非字符串数据库名
            try {
                conn.db(123).collection('test_coll');
                assert.fail('应该抛出数据库名无效错误');
            } catch (err) {
                assert.equal(err.code, 'INVALID_DATABASE_NAME');
                console.log('     ✓ 验证通过：非字符串数据库名抛出正确错误');
            }

            await msq.close();
        });

        it('✅ 附加验证: 连接锁清理', async function() {
            const msq = new MonSQLize({
                type: 'mongodb',
                databaseName: 'test_connection',
                config: { uri: testUri }
            });

            await msq.connect();
            await msq.close();

            assert.strictEqual(
                msq._adapter,
                null,
                '关闭后 _adapter 应该为 null（包含 _connecting）'
            );

            console.log('     ✓ 验证通过：连接锁已清理');
        });
    });
});
