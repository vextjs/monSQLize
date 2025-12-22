/**
 * SSH隧道真实环境测试（使用ssh2，支持密码认证）
 * 仅进行查询操作，不修改任何数据
 */

const MonSQLize = require('../../lib/index');

async function testSSH2RealEnvironment() {
    console.log('\n╔═══════════════════════════════════════════════════════╗');
    console.log('║    SSH隧道真实环境测试（ssh2实现，支持密码认证）      ║');
    console.log('╚═══════════════════════════════════════════════════════╝\n');

    const msq = new MonSQLize({
        type: 'mongodb',
        databaseName: 'test',
        config: {
            // ✅ SSH隧道配置（密码认证）
            ssh: {
                host: '47.84.66.151',
                port: 38449,
                username: 'huojianshi',
                password: 'EsgaUM9lGa07sQHP',  // ✅ ssh2支持密码认证
            },
            // MongoDB连接配置（远程服务器上的地址）
            uri: 'mongodb://huojianshi:KrHQtxTvmhdU==@127.0.0.1:28017/test?directConnection=true',
            remoteHost: '127.0.0.1',
            remotePort: 28017,
            options: {
                serverSelectionTimeoutMS: 10000,
                directConnection: true,  // 直接连接，不进行副本集发现
            }
        }
    });

    try {
        console.log('🔐 正在建立SSH隧道...');
        console.log('   SSH: huojianshi@47.84.66.151:38449');
        console.log('   目标: 127.0.0.1:28017 (MongoDB)\n');

        await msq.connect();
        console.log('✅ SSH隧道已建立，MongoDB已连接！\n');

        // 测试1: 列出所有数据库
        console.log('📋 测试1: 列出所有数据库');
        try {
            const databases = await msq._adapter.client.db().admin().listDatabases();
            console.log('数据库列表:');
            databases.databases.forEach(db => {
                console.log(`  - ${db.name} (${(db.sizeOnDisk / 1024 / 1024).toFixed(2)} MB)`);
            });
            console.log(`总计: ${databases.databases.length} 个数据库\n`);
        } catch (err) {
            console.log('⚠️  列出数据库失败（可能是权限限制）:', err.message, '\n');
        }

        // 测试2: 列出当前数据库的集合
        console.log('📋 测试2: 列出当前数据库的集合');
        try {
            const collections = await msq._adapter.db.listCollections().toArray();
            if (collections.length > 0) {
                console.log('集合列表:');
                collections.forEach(c => console.log(`  - ${c.name}`));
                console.log(`总计: ${collections.length} 个集合\n`);

                // 测试3: 查询第一个集合
                const firstCollection = collections[0].name;
                console.log(`📋 测试3: 查询集合 "${firstCollection}"`);

                const coll = msq.collection(firstCollection);
                const count = await coll.count({});
                console.log(`文档总数: ${count}`);

                // 测试4: 查询前3条文档（只读）
                if (count > 0) {
                    console.log('前3条文档:');
                    const docs = await coll.find({}, { limit: 3 });
                    docs.forEach((doc, idx) => {
                        console.log(`  ${idx + 1}. _id: ${doc._id}`);
                    });
                    console.log();
                }
            } else {
                console.log('当前数据库为空\n');
            }
        } catch (err) {
            console.log('⚠️  查询失败:', err.message, '\n');
        }

        // 测试5: Ping测试
        console.log('📋 测试4: Ping测试');
        try {
            const ping = await msq._adapter.client.db().admin().ping();
            console.log('Ping结果:', ping.ok === 1 ? '✅ 正常' : '❌ 异常');
        } catch (err) {
            console.log('⚠️  Ping失败:', err.message);
        }

        console.log('\n✅ 所有测试完成（仅查询，未修改任何数据）');

    } catch (err) {
        console.error('\n❌ 测试失败:', err.message);

        if (err.message.includes('Timed out')) {
            console.log('\n💡 可能的原因:');
            console.log('  1. SSH服务器连接超时');
            console.log('  2. 防火墙阻止了连接');
            console.log('  3. SSH端口不正确');
        } else if (err.message.includes('Authentication')) {
            console.log('\n💡 可能的原因:');
            console.log('  1. SSH用户名或密码错误');
            console.log('  2. SSH服务器不允许密码认证');
        } else if (err.message.includes('ECONNREFUSED')) {
            console.log('\n💡 可能的原因:');
            console.log('  1. MongoDB服务未运行');
            console.log('  2. MongoDB端口不正确');
            console.log('  3. MongoDB认证失败');
        }

        console.error('\n详细错误:', err);
    } finally {
        // 关闭连接（自动关闭SSH隧道）
        if (msq._adapter) {
            await msq._adapter.close();
            console.log('\n🔒 已关闭SSH隧道和MongoDB连接');
        }
    }
}

// 运行测试
if (require.main === module) {
    console.log('✅ 使用ssh2库，支持密码认证');
    console.log('准备开始测试...\n');

    testSSH2RealEnvironment().catch(console.error);
}

module.exports = { testSSH2RealEnvironment };

