/**
 * 简单MongoDB连接测试
 * 验证通过手动SSH隧道连接MongoDB
 *
 * 前提：先在终端运行
 * ssh -N -L 28017:127.0.0.1:28017 -p 38449 huojianshi@47.84.66.151
 * 密码: EsgaUM9lGa07sQHP
 */

const { MongoClient } = require('mongodb');

async function testSimpleMongoDB() {
    console.log('\n╔═══════════════════════════════════════════════════════╗');
    console.log('║         MongoDB 连接测试（通过SSH隧道）               ║');
    console.log('╚═══════════════════════════════════════════════════════╝\n');

    // MongoDB连接URI（假设SSH隧道已建立）
    const uri = 'mongodb://huojianshi:KrHQtxTvmhdU==@127.0.0.1:28017/admin';
    const client = new MongoClient(uri, {
        serverSelectionTimeoutMS: 10000,
    });

    try {
        console.log('📡 正在连接 MongoDB (127.0.0.1:28017)...');
        await client.connect();
        console.log('✅ MongoDB连接成功！\n');

        // 测试1: Ping
        console.log('📋 测试1: Ping');
        const pingResult = await client.db('admin').admin().ping();
        console.log('Ping结果:', pingResult.ok === 1 ? '✅ 正常' : '❌ 异常\n');

        // 测试2: 列出数据库
        console.log('📋 测试2: 列出所有数据库');
        try {
            const databases = await client.db('admin').admin().listDatabases();
            console.log('数据库列表:');
            databases.databases.forEach(db => {
                console.log(`  - ${db.name} (${(db.sizeOnDisk / 1024 / 1024).toFixed(2)} MB)`);
            });
            console.log(`总计: ${databases.databases.length} 个数据库\n`);
        } catch (err) {
            console.log('⚠️  列出数据库失败（可能是权限限制）:', err.message, '\n');
        }

        // 测试3: 访问test数据库
        console.log('📋 测试3: 访问test数据库');
        const db = client.db('test');
        const collections = await db.listCollections().toArray();

        if (collections.length > 0) {
            console.log('集合列表:');
            collections.forEach(c => console.log(`  - ${c.name}`));
            console.log(`总计: ${collections.length} 个集合\n`);

            // 测试4: 查询第一个集合
            const firstColl = collections[0].name;
            console.log(`📋 测试4: 查询集合 "${firstColl}"`);
            const coll = db.collection(firstColl);
            const count = await coll.countDocuments({});
            console.log(`文档总数: ${count}`);

            if (count > 0) {
                console.log('前3条文档:');
                const docs = await coll.find({}).limit(3).toArray();
                docs.forEach((doc, idx) => {
                    console.log(`  ${idx + 1}. _id: ${doc._id}`);
                });
            }
            console.log();
        } else {
            console.log('test数据库为空\n');
        }

        console.log('✅ 所有测试完成（仅查询，未修改任何数据）');

    } catch (err) {
        console.error('\n❌ 连接失败:', err.message);

        if (err.message.includes('ECONNREFUSED')) {
            console.log('\n💡 可能的原因:');
            console.log('  1. SSH隧道未建立');
            console.log('  2. 请先在新终端运行:');
            console.log('     ssh -N -L 28017:127.0.0.1:28017 -p 38449 huojianshi@47.84.66.151');
            console.log('     密码: EsgaUM9lGa07sQHP\n');
        }
    } finally {
        await client.close();
        console.log('🔒 已关闭连接\n');
    }
}

// 运行测试
if (require.main === module) {
    console.log('⚠️  前提条件：请先手动建立SSH隧道');
    console.log('命令: ssh -N -L 28017:127.0.0.1:28017 -p 38449 huojianshi@47.84.66.151');
    console.log('密码: EsgaUM9lGa07sQHP\n');
    console.log('按Ctrl+C取消，或等待3秒后自动开始测试...\n');

    setTimeout(() => {
        testSimpleMongoDB().catch(console.error);
    }, 3000);
}

module.exports = { testSimpleMongoDB };

