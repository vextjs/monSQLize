/**
 * SSH 隧道真实环境测试
 * 仅进行查询操作，不修改任何数据
 */

const MonSQLize = require('../../lib/index');

async function testRealSSHTunnel() {
    console.log('\n╔═══════════════════════════════════════════════════════╗');
    console.log('║         SSH 隧道真实环境测试                          ║');
    console.log('╚═══════════════════════════════════════════════════════╝\n');

    const msq = new MonSQLize({
        type: 'mongodb',
        databaseName: 'test',  // 使用test数据库
        config: {
            // SSH 隧道配置（使用密码认证 - 注意：原生方案不支持）
            // 需要先手动建立SSH隧道
            // ssh: {
            //     host: '47.84.66.151',
            //     port: 38449,
            //     username: 'huojianshi',
            //     password: 'EsgaUM9lGa07sQHP',  // 密码认证不支持
            // },

            // MongoDB 连接配置（通过SSH隧道访问）
            uri: 'mongodb://huojianshi:KrHQtxTvmhdU==@127.0.0.1:28017/test',
            options: {
                serverSelectionTimeoutMS: 10000,
            }
        }
    });

    try {
        console.log('📡 正在连接 MongoDB...');
        await msq.connect();
        console.log('✅ 已连接到 MongoDB\n');

        // 测试1: 列出所有数据库
        console.log('📋 测试1: 列出所有数据库');
        try {
            const databases = await msq._adapter.client.db().admin().listDatabases();
            console.log('数据库列表:', databases.databases.map(db => db.name).join(', '));
            console.log(`总计: ${databases.databases.length} 个数据库\n`);
        } catch (err) {
            console.log('⚠️  列出数据库失败（可能是权限限制）:', err.message, '\n');
        }

        // 测试2: 列出当前数据库的集合
        console.log('📋 测试2: 列出当前数据库的集合');
        try {
            const collections = await msq._adapter.db.listCollections().toArray();
            if (collections.length > 0) {
                console.log('集合列表:', collections.map(c => c.name).join(', '));
                console.log(`总计: ${collections.length} 个集合\n`);
            } else {
                console.log('当前数据库为空\n');
            }

            // 测试3: 如果有集合，查询第一个集合的文档数量
            if (collections.length > 0) {
                const firstCollection = collections[0].name;
                console.log(`📋 测试3: 查询集合 "${firstCollection}" 的文档数量`);

                const coll = msq.collection(firstCollection);
                const count = await coll.count({});
                console.log(`文档总数: ${count}\n`);

                // 测试4: 查询前3条文档（只读）
                if (count > 0) {
                    console.log(`📋 测试4: 查询前3条文档（只读）`);
                    const docs = await coll.find({}, { limit: 3 });
                    console.log(`查询到 ${docs.length} 条文档`);
                    docs.forEach((doc, idx) => {
                        console.log(`  文档${idx + 1}:`, JSON.stringify(doc, null, 2).split('\n')[0] + '...');
                    });
                    console.log();
                }
            }
        } catch (err) {
            console.log('⚠️  查询失败:', err.message, '\n');
        }

        // 测试5: 测试连接健康状态
        console.log('📋 测试5: 测试连接健康状态');
        try {
            const ping = await msq._adapter.client.db().admin().ping();
            console.log('Ping 结果:', ping.ok === 1 ? '✅ 正常' : '❌ 异常');
        } catch (err) {
            console.log('⚠️  Ping 失败:', err.message);
        }

        console.log('\n✅ 所有测试完成（仅查询，未修改任何数据）');

    } catch (err) {
        console.error('❌ 测试失败:', err.message);
        console.error('错误详情:', err);
    } finally {
        // 关闭连接
        if (msq._adapter) {
            await msq._adapter.close();
            console.log('\n🔒 已关闭连接');
        }
    }
}

// 运行测试
if (require.main === module) {
    console.log('⚠️  注意：原生SSH隧道方案不支持密码认证');
    console.log('请先手动建立SSH隧道：');
    console.log('ssh -N -L 28017:127.0.0.1:28017 -p 38449 huojianshi@47.84.66.151\n');
    console.log('然后运行此脚本测试MongoDB连接\n');

    testRealSSHTunnel().catch(console.error);
}

module.exports = { testRealSSHTunnel };

