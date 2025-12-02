/**
 * Admin/Management 功能完整示例
 *
 * 演示所有管理方法的使用
 */

const MonSQLize = require('../lib/index');

// ============================================
// 1. 运维监控示例
// ============================================

async function adminMonitoringExamples() {
    console.log('\n=== 运维监控示例 ===\n');

    const db = new MonSQLize({
        type: 'mongodb',
        config: {
            uri: process.env.MONGODB_URI || 'mongodb://localhost:27017/admin_examples'
        }
    });

    await db.connect();
    const adapter = db._adapter;

    // 1.1 健康检查
    console.log('1. 健康检查');
    const isAlive = await adapter.ping();
    console.log('   数据库状态:', isAlive ? '✅ 正常' : '❌ 异常');

    // 1.2 版本信息
    console.log('\n2. 版本信息');
    const info = await adapter.buildInfo();
    console.log('   MongoDB 版本:', info.version);
    console.log('   系统位数:', info.bits, 'bit');

    // 1.3 服务器状态
    console.log('\n3. 服务器状态');
    const status = await adapter.serverStatus();
    console.log('   当前连接数:', status.connections.current);
    console.log('   可用连接数:', status.connections.available);
    console.log('   内存使用:', status.mem.resident, 'MB');
    console.log('   运行时间:', Math.floor(status.uptime / 3600), '小时');

    // 1.4 数据库统计
    console.log('\n4. 数据库统计');
    const stats = await adapter.stats({ scale: 1048576 }); // MB
    console.log('   数据库名:', stats.db);
    console.log('   集合数:', stats.collections);
    console.log('   文档总数:', stats.objects);
    console.log('   数据大小:', stats.dataSize.toFixed(2), 'MB');
    console.log('   索引大小:', stats.indexSize.toFixed(2), 'MB');

    await db.close();
}

// ============================================
// 2. 数据库操作示例
// ============================================

async function databaseOperationsExamples() {
    console.log('\n=== 数据库操作示例 ===\n');

    const db = new MonSQLize({
        type: 'mongodb',
        config: {
            uri: process.env.MONGODB_URI || 'mongodb://localhost:27017/admin_examples'
        }
    });

    await db.connect();
    const adapter = db._adapter;

    // 2.1 列出所有数据库
    console.log('1. 列出所有数据库');
    const databases = await adapter.listDatabases();
    console.log('   数据库列表:');
    databases.slice(0, 5).forEach(db => {
        console.log(`   - ${db.name}: ${(db.sizeOnDisk / 1048576).toFixed(2)} MB`);
    });

    // 2.2 列出所有集合
    console.log('\n2. 列出当前数据库的所有集合');
    const collections = await adapter.listCollections({ nameOnly: true });
    console.log('   集合列表:', collections.join(', ') || '(空)');

    // 2.3 执行任意命令
    console.log('\n3. 执行任意命令');
    const ping = await adapter.runCommand({ ping: 1 });
    console.log('   Ping 结果:', ping.ok === 1 ? '成功' : '失败');

    await db.close();
}

// ============================================
// 3. Schema 验证示例
// ============================================

async function validationExamples() {
    console.log('\n=== Schema 验证示例 ===\n');

    const db = new MonSQLize({
        type: 'mongodb',
        config: {
            uri: process.env.MONGODB_URI || 'mongodb://localhost:27017/admin_examples'
        }
    });

    await db.connect();
    const { collection } = await db.connect();
    const users = collection('validation_demo');

    // 3.1 设置验证规则
    console.log('1. 设置验证规则');
    await users.setValidator({
        $jsonSchema: {
            bsonType: 'object',
            required: ['username', 'email', 'age'],
            properties: {
                username: {
                    bsonType: 'string',
                    minLength: 3,
                    maxLength: 30,
                    description: '用户名：3-30个字符'
                },
                email: {
                    bsonType: 'string',
                    pattern: '^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}$',
                    description: '有效的邮箱地址'
                },
                age: {
                    bsonType: 'int',
                    minimum: 18,
                    maximum: 120,
                    description: '年龄：18-120'
                },
                role: {
                    enum: ['user', 'admin', 'moderator'],
                    description: '角色：user/admin/moderator'
                }
            }
        }
    }, {
        validationLevel: 'strict',
        validationAction: 'error'
    });
    console.log('   ✅ 验证规则已设置');

    // 3.2 测试插入有效数据
    console.log('\n2. 插入有效数据');
    try {
        const result = await users.insertOne({
            username: 'alice',
            email: 'alice@example.com',
            age: 25,
            role: 'user'
        });
        console.log('   ✅ 插入成功:', result.insertedId);
    } catch (error) {
        console.log('   ❌ 插入失败:', error.message);
    }

    // 3.3 测试插入无效数据
    console.log('\n3. 插入无效数据（应该失败）');
    try {
        await users.insertOne({
            username: 'ab', // 太短
            email: 'invalid-email', // 格式错误
            age: 15 // 太小
        });
        console.log('   ❌ 意外成功（验证未生效）');
    } catch (error) {
        console.log('   ✅ 验证成功拦截:', error.message.substring(0, 50) + '...');
    }

    // 3.4 获取验证配置
    console.log('\n4. 获取当前验证配置');
    const validation = await users.getValidator();
    console.log('   验证级别:', validation.validationLevel);
    console.log('   验证行为:', validation.validationAction);

    // 清理
    await users.dropCollection().catch(() => {});
    await db.close();
}

// ============================================
// 4. 集合管理示例
// ============================================

async function collectionManagementExamples() {
    console.log('\n=== 集合管理示例 ===\n');

    const db = new MonSQLize({
        type: 'mongodb',
        config: {
            uri: process.env.MONGODB_URI || 'mongodb://localhost:27017/admin_examples'
        }
    });

    await db.connect();
    const { collection } = await db.connect();
    const demo = collection('mgmt_demo');

    // 插入测试数据
    await demo.insertMany([
        { name: 'Alice', age: 25, city: 'Beijing' },
        { name: 'Bob', age: 30, city: 'Shanghai' },
        { name: 'Carol', age: 28, city: 'Guangzhou' }
    ]);

    // 4.1 获取集合统计
    console.log('1. 集合统计');
    const stats = await demo.stats({ scale: 1024 }); // KB
    console.log('   文档数:', stats.count);
    console.log('   数据大小:', stats.size.toFixed(2), 'KB');
    console.log('   平均文档大小:', stats.avgObjSize, 'bytes');
    console.log('   索引数:', stats.nindexes);

    // 4.2 修改集合属性
    console.log('\n2. 修改集合属性');
    await demo.collMod({
        validationLevel: 'moderate'
    });
    console.log('   ✅ 验证级别已更新为 moderate');

    // 4.3 创建固定大小集合
    console.log('\n3. 创建固定大小集合');
    const adapter = db._adapter;
    try {
        await adapter.db.createCollection('logs_demo', {
            capped: true,
            size: 10485760,  // 10MB
            max: 1000
        });
        console.log('   ✅ 固定大小集合已创建');

        // 插入日志数据
        const logs = collection('logs_demo');
        await logs.insertOne({
            timestamp: new Date(),
            level: 'INFO',
            message: 'Application started'
        });
        console.log('   ✅ 日志已写入');

        // 清理
        await logs.dropCollection().catch(() => {});
    } catch (error) {
        console.log('   ⚠️', error.message);
    }

    // 清理
    await demo.dropCollection().catch(() => {});
    await db.close();
}

// ============================================
// 5. 综合监控示例
// ============================================

async function comprehensiveMonitoring() {
    console.log('\n=== 综合监控示例 ===\n');

    const db = new MonSQLize({
        type: 'mongodb',
        config: {
            uri: process.env.MONGODB_URI || 'mongodb://localhost:27017/admin_examples'
        }
    });

    await db.connect();
    const adapter = db._adapter;

    // 生成监控报告
    const report = {
        timestamp: new Date(),
        health: await adapter.ping(),
        version: (await adapter.buildInfo()).version,
        server: await adapter.serverStatus({ scale: 1048576 }), // MB
        database: await adapter.stats({ scale: 1048576 }) // MB
    };

    console.log('📊 监控报告');
    console.log('━'.repeat(50));
    console.log('时间:', report.timestamp.toISOString());
    console.log('状态:', report.health ? '✅ 正常' : '❌ 异常');
    console.log('版本:', report.version);
    console.log('\n连接:');
    console.log('  当前:', report.server.connections.current);
    console.log('  可用:', report.server.connections.available);
    console.log('\n内存:');
    console.log('  常驻:', report.server.mem.resident, 'MB');
    console.log('  虚拟:', report.server.mem.virtual, 'MB');
    console.log('\n数据库:');
    console.log('  名称:', report.database.db);
    console.log('  集合数:', report.database.collections);
    console.log('  文档数:', report.database.objects);
    console.log('  数据大小:', report.database.dataSize.toFixed(2), 'MB');
    console.log('  索引大小:', report.database.indexSize.toFixed(2), 'MB');
    console.log('━'.repeat(50));

    await db.close();
}

// ============================================
// 运行所有示例
// ============================================

async function runAllExamples() {
    console.log('╔═══════════════════════════════════════════╗');
    console.log('║  Admin/Management 功能完整示例           ║');
    console.log('╚═══════════════════════════════════════════╝');

    try {
        await adminMonitoringExamples();
        await databaseOperationsExamples();
        await validationExamples();
        await collectionManagementExamples();
        await comprehensiveMonitoring();

        console.log('\n✅ 所有示例执行完成！\n');
    } catch (error) {
        console.error('\n❌ 示例执行失败:', error.message);
        console.error(error.stack);
        process.exit(1);
    }
}

// 如果直接运行此文件
if (require.main === module) {
    runAllExamples().catch(console.error);
}

module.exports = {
    adminMonitoringExamples,
    databaseOperationsExamples,
    validationExamples,
    collectionManagementExamples,
    comprehensiveMonitoring
};

