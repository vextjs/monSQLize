/**
 * 简单测试SSH隧道和MongoDB连接
 */

const { MongoClient } = require('mongodb');
const { Client } = require('ssh2');
const net = require('net');

async function simpleTest() {
    console.log('开始测试SSH隧道...\n');

    const sshClient = new Client();
    let server;
    let localPort;

    return new Promise((resolve, reject) => {
        sshClient.on('ready', () => {
            console.log('✅ SSH连接成功！');

            // 创建本地服务器
            server = net.createServer((sock) => {
                sshClient.forwardOut(
                    sock.remoteAddress,
                    sock.remotePort,
                    '127.0.0.1',
                    28017,
                    (err, stream) => {
                        if (err) {
                            console.error('转发错误:', err);
                            return sock.end();
                        }
                        sock.pipe(stream).pipe(sock);
                    }
                );
            });

            server.listen(0, 'localhost', async () => {
                localPort = server.address().port;
                console.log(`✅ 本地端口: ${localPort}`);
                console.log(`   转发到: 127.0.0.1:28017\n`);

                // 测试MongoDB连接
                console.log('尝试连接MongoDB...');
                const uri = `mongodb://huojianshi:KrHQtxTvmhdU%3D%3D@localhost:${localPort}/admin?authSource=admin&directConnection=true`;
                console.log('连接URI:', uri.replace(/:[^:@]+@/, ':***@'), '\n');

                const client = new MongoClient(uri, {
                    serverSelectionTimeoutMS: 15000,
                    connectTimeoutMS: 15000,
                });

                try {
                    await client.connect();
                    console.log('✅ MongoDB连接成功！\n');

                    const ping = await client.db('admin').admin().ping();
                    console.log('Ping结果:', ping);

                    const dbs = await client.db('admin').admin().listDatabases();
                    console.log('\n数据库列表:');
                    dbs.databases.forEach(db => {
                        console.log(`  - ${db.name}`);
                    });

                    await client.close();
                    console.log('\n✅ 测试完成！');
                    resolve();
                } catch (err) {
                    console.error('❌ MongoDB连接失败:', err.message);
                    reject(err);
                } finally {
                    sshClient.end();
                    server.close();
                }
            });
        });

        sshClient.on('error', (err) => {
            console.error('❌ SSH错误:', err.message);
            reject(err);
        });

        // 连接SSH
        console.log('连接到SSH服务器...');
        sshClient.connect({
            host: '47.84.66.151',
            port: 38449,
            username: 'huojianshi',
            password: 'EsgaUM9lGa07sQHP',
            readyTimeout: 20000,
        });
    });
}

simpleTest().catch(console.error);

