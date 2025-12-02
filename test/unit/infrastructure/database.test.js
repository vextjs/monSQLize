/**
 * 数据库操作测试
 * 测试 listDatabases, dropDatabase 方法
 */

const assert = require('assert');
const MonSQLize = require('../../../lib/index');

describe('Database Operations', function() {
    this.timeout(10000);

    let db;
    let adapter;

    before(async function() {
        db = new MonSQLize({
            type: 'mongodb',
            config: {
                uri: process.env.MONGODB_URI || 'mongodb://localhost:27017/test_database_ops'
            }
        });
        await db.connect();
        adapter = db._adapter;
    });

    after(async function() {
        if (db) {
            await db.close();
        }
    });

    describe('listDatabases()', function() {
        it('应该返回数据库列表数组', async function() {
            const databases = await adapter.listDatabases();
            assert.ok(Array.isArray(databases));
            assert.ok(databases.length > 0);
        });

        it('应该包含数据库详细信息', async function() {
            const databases = await adapter.listDatabases();
            const db = databases[0];
            assert.ok(db.name);
            assert.ok(typeof db.sizeOnDisk === 'number');
            assert.ok(typeof db.empty === 'boolean');
        });

        it('应该包含 admin 数据库', async function() {
            const databases = await adapter.listDatabases();
            const hasAdmin = databases.some(db => db.name === 'admin');
            assert.ok(hasAdmin);
        });

        it('应该支持 nameOnly 选项', async function() {
            const databases = await adapter.listDatabases({ nameOnly: true });
            assert.ok(Array.isArray(databases));
            assert.ok(typeof databases[0] === 'string');
        });

        it('nameOnly 应该返回数据库名称数组', async function() {
            const databases = await adapter.listDatabases({ nameOnly: true });
            assert.ok(databases.includes('admin'));
            databases.forEach(name => {
                assert.strictEqual(typeof name, 'string');
            });
        });
    });

    describe('dropDatabase()', function() {
        const testDbName = 'test_drop_database_temp';
        let testAdapter;

        beforeEach(async function() {
            // 创建测试数据库，使用独立的 adapter
            const testDb = new MonSQLize({
                type: 'mongodb',
                config: {
                    uri: `mongodb://localhost:27017/${testDbName}`
                }
            });
            await testDb.connect();
            testAdapter = testDb._adapter; // 保存 adapter 用于删除
            const { collection } = await testDb.connect();
            const coll = collection('test_collection');
            await coll.insertOne({ test: 'data' });
            // 不关闭连接，保持 adapter 可用
        });

        it('应该要求显式确认', async function() {
            try {
                await adapter.dropDatabase(testDbName);
                assert.fail('应该抛出确认错误');
            } catch (error) {
                assert.ok(error.message.includes('confirmation'));
                assert.strictEqual(error.code, 'CONFIRMATION_REQUIRED');
            }
        });

        it('应该在生产环境禁止操作', async function() {
            const originalEnv = process.env.NODE_ENV;
            process.env.NODE_ENV = 'production';

            try {
                await adapter.dropDatabase(testDbName, { confirm: true });
                assert.fail('应该抛出生产环境错误');
            } catch (error) {
                assert.ok(error.message.includes('production'));
                assert.strictEqual(error.code, 'PRODUCTION_BLOCKED');
            } finally {
                process.env.NODE_ENV = originalEnv;
            }
        });

        it('应该成功删除数据库（带确认）', async function() {
            const result = await testAdapter.dropDatabase(testDbName, {
                confirm: true,
                user: 'test@example.com'
            });

            assert.ok(result.dropped);
            assert.strictEqual(result.database, testDbName);
            assert.ok(result.timestamp);
        });

        it('应该验证数据库名称', async function() {
            try {
                await adapter.dropDatabase('', { confirm: true });
                assert.fail('应该抛出验证错误');
            } catch (error) {
                assert.ok(error.message.includes('name'));
            }
        });

        it('应该验证数据库名称类型', async function() {
            try {
                await adapter.dropDatabase(123, { confirm: true });
                assert.fail('应该抛出验证错误');
            } catch (error) {
                assert.ok(error.message.includes('string'));
            }
        });

        it('应该允许在生产环境删除（带额外确认）', async function() {
            const originalEnv = process.env.NODE_ENV;
            process.env.NODE_ENV = 'production';

            // 重新创建测试数据库
            const testDb = new MonSQLize({
                type: 'mongodb',
                config: {
                    uri: `mongodb://localhost:27017/${testDbName}_prod`
                }
            });
            await testDb.connect();
            const prodAdapter = testDb._adapter;
            const { collection } = await testDb.connect();
            const coll = collection('test_collection');
            await coll.insertOne({ test: 'data' });

            try {
                const result = await prodAdapter.dropDatabase(`${testDbName}_prod`, {
                    confirm: true,
                    allowProduction: true,
                    user: 'admin@example.com'
                });

                assert.ok(result.dropped);
                assert.strictEqual(result.database, `${testDbName}_prod`);
            } finally {
                await testDb.close();
                process.env.NODE_ENV = originalEnv;
            }
        });

        it('删除后应该验证数据库不存在', async function() {
            // 创建并删除测试数据库
            const tempDbName = 'test_verify_drop';
            const testDb = new MonSQLize({
                type: 'mongodb',
                config: {
                    uri: `mongodb://localhost:27017/${tempDbName}`
                }
            });
            await testDb.connect();
            const tempAdapter = testDb._adapter;
            const { collection } = await testDb.connect();
            const coll = collection('test_collection');
            await coll.insertOne({ test: 'data' });

            // 删除数据库
            await tempAdapter.dropDatabase(tempDbName, {
                confirm: true,
                user: 'test@example.com'
            });

            // 验证不存在
            const databases = await adapter.listDatabases({ nameOnly: true });
            assert.ok(!databases.includes(tempDbName));
        });
    });

    describe('listCollections()', function() {
        before(async function() {
            // 创建测试集合
            const { collection } = await db.connect();
            const test1 = collection('test_collection_1');
            const test2 = collection('test_collection_2');
            await test1.insertOne({ test: 1 });
            await test2.insertOne({ test: 2 });
        });

        after(async function() {
            // 清理测试集合
            try {
                const { collection } = await db.connect();
                const test1 = collection('test_collection_1');
                const test2 = collection('test_collection_2');
                await test1.dropCollection().catch(() => {});
                await test2.dropCollection().catch(() => {});
            } catch (error) {
                // 忽略清理错误
            }
        });

        it('应该返回集合列表数组', async function() {
            const collections = await adapter.listCollections();
            assert.ok(Array.isArray(collections));
        });

        it('应该包含集合详细信息', async function() {
            const collections = await adapter.listCollections();
            if (collections.length > 0) {
                const coll = collections[0];
                assert.ok(coll.name);
                assert.ok(coll.type);
            }
        });

        it('应该支持 nameOnly 选项', async function() {
            const collections = await adapter.listCollections({ nameOnly: true });
            assert.ok(Array.isArray(collections));
            collections.forEach(name => {
                assert.strictEqual(typeof name, 'string');
            });
        });

        it('应该包含测试集合', async function() {
            const collections = await adapter.listCollections({ nameOnly: true });
            assert.ok(collections.includes('test_collection_1'));
            assert.ok(collections.includes('test_collection_2'));
        });
    });

    describe('runCommand()', function() {
        it('应该执行 ping 命令', async function() {
            const result = await adapter.runCommand({ ping: 1 });
            assert.strictEqual(result.ok, 1);
        });

        it('应该执行 dbStats 命令', async function() {
            const result = await adapter.runCommand({ dbStats: 1 });
            assert.strictEqual(result.ok, 1);
            assert.ok(result.db);
            assert.ok(typeof result.collections === 'number');
        });

        it('应该验证命令参数', async function() {
            try {
                await adapter.runCommand(null);
                assert.fail('应该抛出验证错误');
            } catch (error) {
                // 接受两种错误消息："Command" 或 "command"
                const hasCommandKeyword = error.message.includes('Command') ||
                                         error.message.includes('command') ||
                                         error.message.includes('object');
                assert.ok(hasCommandKeyword, `错误消息应包含 'Command' 或 'command'，实际: ${error.message}`);
            }
        });

        it('应该验证命令类型', async function() {
            try {
                await adapter.runCommand('invalid');
                assert.fail('应该抛出验证错误');
            } catch (error) {
                assert.ok(error.message.includes('object'));
            }
        });
    });
});

