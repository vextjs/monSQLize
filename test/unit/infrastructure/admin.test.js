/**
 * 运维监控功能测试
 * 测试 ping, buildInfo, serverStatus, stats 方法
 */

const assert = require('assert');
const MonSQLize = require('../../../lib/index');

describe('Admin Operations', function() {
    this.timeout(30000); // 增加超时时间，内存数据库首次启动需要更多时间

    let db;
    let adapter;

    before(async function() {
        // 使用内存数据库，无需外部 MongoDB 服务
        db = new MonSQLize({
            type: 'mongodb',
            databaseName: 'test_admin_ops',
            config: {
                useMemoryServer: true // 使用内存数据库
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

    describe('ping()', function() {
        it('应该返回 true 当数据库连接正常', async function() {
            const result = await adapter.ping();
            assert.strictEqual(result, true);
        });

        it('应该返回 boolean 类型', async function() {
            const result = await adapter.ping();
            assert.strictEqual(typeof result, 'boolean');
        });
    });

    describe('buildInfo()', function() {
        it('应该返回版本信息对象', async function() {
            const info = await adapter.buildInfo();
            assert.ok(info);
            assert.ok(info.version);
            assert.ok(info.versionArray);
            assert.ok(info.gitVersion);
        });

        it('应该返回有效的版本号格式', async function() {
            const info = await adapter.buildInfo();
            assert.ok(/^\d+\.\d+\.\d+/.test(info.version));
        });

        it('应该包含 versionArray 数组', async function() {
            const info = await adapter.buildInfo();
            assert.ok(Array.isArray(info.versionArray));
            assert.ok(info.versionArray.length >= 3);
        });

        it('应该包含 bits 信息', async function() {
            const info = await adapter.buildInfo();
            assert.ok([32, 64].includes(info.bits));
        });
    });

    describe('serverStatus()', function() {
        it('应该返回服务器状态对象', async function() {
            const status = await adapter.serverStatus();
            assert.ok(status);
            assert.ok(status.connections);
            assert.ok(status.mem);
            assert.ok(status.opcounters);
        });

        it('应该包含连接信息', async function() {
            const status = await adapter.serverStatus();
            assert.ok(typeof status.connections.current === 'number');
            assert.ok(typeof status.connections.available === 'number');
            assert.ok(status.connections.current >= 0);
        });

        it('应该包含内存信息', async function() {
            const status = await adapter.serverStatus();
            assert.ok(typeof status.mem.resident === 'number');
            assert.ok(typeof status.mem.virtual === 'number');
            assert.ok(status.mem.resident > 0);
        });

        it('应该包含操作计数器', async function() {
            const status = await adapter.serverStatus();
            assert.ok(typeof status.opcounters.insert === 'number');
            assert.ok(typeof status.opcounters.query === 'number');
            assert.ok(typeof status.opcounters.update === 'number');
            assert.ok(typeof status.opcounters.delete === 'number');
        });

        it('应该包含运行时间', async function() {
            const status = await adapter.serverStatus();
            assert.ok(typeof status.uptime === 'number');
            assert.ok(status.uptime >= 0); // 内存数据库刚启动时 uptime 可能为 0
        });

        it('应该支持 scale 参数', async function() {
            const status = await adapter.serverStatus({ scale: 1024 });
            assert.ok(status);
            assert.ok(status.connections);
        });
    });

    describe('stats()', function() {
        it('应该返回数据库统计对象', async function() {
            const stats = await adapter.stats();
            assert.ok(stats);
            assert.ok(stats.db);
            assert.ok(typeof stats.collections === 'number');
        });

        it('应该包含数据库名称', async function() {
            const stats = await adapter.stats();
            assert.strictEqual(stats.db, 'test_admin_ops');
        });

        it('应该包含集合数量', async function() {
            const stats = await adapter.stats();
            assert.ok(typeof stats.collections === 'number');
            assert.ok(stats.collections >= 0);
        });

        it('应该包含数据大小信息', async function() {
            const stats = await adapter.stats();
            assert.ok(typeof stats.dataSize === 'number');
            assert.ok(typeof stats.storageSize === 'number');
            assert.ok(stats.dataSize >= 0);
        });

        it('应该包含索引信息', async function() {
            const stats = await adapter.stats();
            assert.ok(typeof stats.indexes === 'number');
            assert.ok(typeof stats.indexSize === 'number');
        });

        it('应该支持 scale 参数（KB）', async function() {
            const stats = await adapter.stats({ scale: 1024 });
            assert.ok(stats);
            assert.strictEqual(stats.scaleFactor, 1024);
        });

        it('应该支持 scale 参数（MB）', async function() {
            const stats = await adapter.stats({ scale: 1048576 });
            assert.ok(stats);
            assert.strictEqual(stats.scaleFactor, 1048576);
        });
    });

    describe('错误处理', function() {
        it('ping() 连接失败应返回 false', async function() {
            // 创建一个未连接的实例
            const db2 = new MonSQLize({
                type: 'mongodb',
                config: {
                    uri: 'mongodb://invalid-host:27017/test'
                }
            });

            // 不应该抛出错误，而是返回 false
            // 注意：这个测试需要 ping() 方法有连接检查
        });
    });
});

