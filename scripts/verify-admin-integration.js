/**
 * Admin/Management 功能集成验证脚本
 *
 * 用途: 快速验证新添加的管理方法是否正确集成
 * 运行: node scripts/verify-admin-integration.js
 */

const MonSQLize = require('../lib/index');

async function verifyAdminIntegration() {
    console.log('📋 开始验证 Admin/Management 功能集成...\n');

    let db;
    let testsPassed = 0;
    let testsFailed = 0;

    try {
        // 1. 创建实例
        console.log('1️⃣  创建 MonSQLize 实例...');
        db = new MonSQLize({
            type: 'mongodb',
            config: {
                uri: process.env.MONGODB_URI || 'mongodb://localhost:27017/test'
            }
        });
        console.log('   ✅ 实例创建成功\n');
        testsPassed++;

        // 2. 连接数据库
        console.log('2️⃣  连接数据库...');
        await db.connect();
        console.log('   ✅ 数据库连接成功\n');
        testsPassed++;

        // 3. 测试 ping()
        console.log('3️⃣  测试 ping() 方法...');
        const adapter = db._adapter;
        if (typeof adapter.ping === 'function') {
            const isAlive = await adapter.ping();
            console.log(`   ✅ ping() 方法存在`);
            console.log(`   📊 结果: ${isAlive}\n`);
            testsPassed++;
        } else {
            console.log('   ❌ ping() 方法不存在\n');
            testsFailed++;
        }

        // 4. 测试 buildInfo()
        console.log('4️⃣  测试 buildInfo() 方法...');
        if (typeof adapter.buildInfo === 'function') {
            const info = await adapter.buildInfo();
            console.log(`   ✅ buildInfo() 方法存在`);
            console.log(`   📊 MongoDB 版本: ${info.version}\n`);
            testsPassed++;
        } else {
            console.log('   ❌ buildInfo() 方法不存在\n');
            testsFailed++;
        }

        // 5. 测试 serverStatus()
        console.log('5️⃣  测试 serverStatus() 方法...');
        if (typeof adapter.serverStatus === 'function') {
            const status = await adapter.serverStatus();
            console.log(`   ✅ serverStatus() 方法存在`);
            console.log(`   📊 当前连接数: ${status.connections.current}`);
            console.log(`   📊 内存使用: ${status.mem.resident} MB\n`);
            testsPassed++;
        } else {
            console.log('   ❌ serverStatus() 方法不存在\n');
            testsFailed++;
        }

        // 6. 测试 stats()
        console.log('6️⃣  测试 stats() 方法...');
        if (typeof adapter.stats === 'function') {
            const stats = await adapter.stats();
            console.log(`   ✅ stats() 方法存在`);
            console.log(`   📊 数据库: ${stats.db}`);
            console.log(`   📊 集合数: ${stats.collections}\n`);
            testsPassed++;
        } else {
            console.log('   ❌ stats() 方法不存在\n');
            testsFailed++;
        }

        // 7. 测试 listDatabases()
        console.log('7️⃣  测试 listDatabases() 方法...');
        if (typeof adapter.listDatabases === 'function') {
            const databases = await adapter.listDatabases({ nameOnly: true });
            console.log(`   ✅ listDatabases() 方法存在`);
            console.log(`   📊 数据库列表: ${databases.join(', ')}\n`);
            testsPassed++;
        } else {
            console.log('   ❌ listDatabases() 方法不存在\n');
            testsFailed++;
        }

        // 8. 测试 listCollections()
        console.log('8️⃣  测试 listCollections() 方法...');
        if (typeof adapter.listCollections === 'function') {
            const collections = await adapter.listCollections({ nameOnly: true });
            console.log(`   ✅ listCollections() 方法存在`);
            console.log(`   📊 集合列表: ${collections.join(', ') || '(空)'}\n`);
            testsPassed++;
        } else {
            console.log('   ❌ listCollections() 方法不存在\n');
            testsFailed++;
        }

        // 9. 测试 collection 级别的方法
        console.log('9️⃣  测试 collection 级别的方法...');
        const { collection } = await db.connect();
        const coll = collection('test_collection');

        // 9.1 测试 stats()
        if (typeof coll.stats === 'function') {
            console.log('   ✅ collection.stats() 方法存在');
            testsPassed++;
        } else {
            console.log('   ❌ collection.stats() 方法不存在');
            testsFailed++;
        }

        // 9.2 测试 setValidator()
        if (typeof coll.setValidator === 'function') {
            console.log('   ✅ collection.setValidator() 方法存在');
            testsPassed++;
        } else {
            console.log('   ❌ collection.setValidator() 方法不存在');
            testsFailed++;
        }

        // 9.3 测试 setValidationLevel()
        if (typeof coll.setValidationLevel === 'function') {
            console.log('   ✅ collection.setValidationLevel() 方法存在');
            testsPassed++;
        } else {
            console.log('   ❌ collection.setValidationLevel() 方法不存在');
            testsFailed++;
        }

        // 9.4 测试 setValidationAction()
        if (typeof coll.setValidationAction === 'function') {
            console.log('   ✅ collection.setValidationAction() 方法存在');
            testsPassed++;
        } else {
            console.log('   ❌ collection.setValidationAction() 方法不存在');
            testsFailed++;
        }

        // 9.5 测试 getValidator()
        if (typeof coll.getValidator === 'function') {
            console.log('   ✅ collection.getValidator() 方法存在');
            testsPassed++;
        } else {
            console.log('   ❌ collection.getValidator() 方法不存在');
            testsFailed++;
        }

        // 9.6 测试 renameCollection()
        if (typeof coll.renameCollection === 'function') {
            console.log('   ✅ collection.renameCollection() 方法存在');
            testsPassed++;
        } else {
            console.log('   ❌ collection.renameCollection() 方法不存在');
            testsFailed++;
        }

        // 9.7 测试 collMod()
        if (typeof coll.collMod === 'function') {
            console.log('   ✅ collection.collMod() 方法存在');
            testsPassed++;
        } else {
            console.log('   ❌ collection.collMod() 方法不存在');
            testsFailed++;
        }

        // 9.8 测试 convertToCapped()
        if (typeof coll.convertToCapped === 'function') {
            console.log('   ✅ collection.convertToCapped() 方法存在');
            testsPassed++;
        } else {
            console.log('   ❌ collection.convertToCapped() 方法不存在');
            testsFailed++;
        }

        console.log('');

        // 10. 测试 dropDatabase() 安全机制
        console.log('🔟 测试 dropDatabase() 安全机制...');
        if (typeof adapter.dropDatabase === 'function') {
            console.log('   ✅ dropDatabase() 方法存在');

            // 测试未确认调用（应该抛出错误）
            try {
                await adapter.dropDatabase('test_db');
                console.log('   ❌ 安全机制失效：未确认调用应该抛出错误');
                testsFailed++;
            } catch (error) {
                if (error.code === 'CONFIRMATION_REQUIRED') {
                    console.log('   ✅ 安全机制正常：未确认调用正确抛出错误');
                    testsPassed++;
                } else {
                    console.log(`   ⚠️  意外错误: ${error.message}`);
                }
            }
        } else {
            console.log('   ❌ dropDatabase() 方法不存在\n');
            testsFailed++;
        }

        console.log('');

    } catch (error) {
        console.error('❌ 验证过程中出现错误:', error.message);
        console.error(error.stack);
        testsFailed++;
    } finally {
        // 关闭连接
        if (db) {
            try {
                await db.close();
                console.log('✅ 数据库连接已关闭\n');
            } catch (error) {
                console.error('❌ 关闭连接失败:', error.message);
            }
        }
    }

    // 输出总结
    console.log('═'.repeat(60));
    console.log('📊 验证结果总结');
    console.log('═'.repeat(60));
    console.log(`✅ 通过测试: ${testsPassed}`);
    console.log(`❌ 失败测试: ${testsFailed}`);
    console.log(`📊 总计测试: ${testsPassed + testsFailed}`);
    console.log(`📈 成功率: ${((testsPassed / (testsPassed + testsFailed)) * 100).toFixed(2)}%`);
    console.log('═'.repeat(60));

    if (testsFailed === 0) {
        console.log('\n🎉 所有测试通过！Admin/Management 功能集成成功！\n');
        process.exit(0);
    } else {
        console.log(`\n⚠️  有 ${testsFailed} 个测试失败，请检查代码。\n`);
        process.exit(1);
    }
}

// 运行验证
verifyAdminIntegration().catch(error => {
    console.error('💥 验证脚本执行失败:', error);
    process.exit(1);
});

