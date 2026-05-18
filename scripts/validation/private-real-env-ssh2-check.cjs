'use strict';

const net = require('node:net');
const { MongoClient } = require('mongodb');
const { Client } = require('ssh2');
const { loadPrivateRealEnvConfig, redactMongoUri } = require('./private-real-env-config.cjs');

function runSsh2PrivateRealEnvCheck() {
    const config = loadPrivateRealEnvConfig();
    const sshClient = new Client();

    return new Promise((resolve, reject) => {
        let server;

        sshClient.on('ready', () => {
            console.log('\n[private-real-env] ssh2 tunnel check');
            console.log(`[private-real-env] SSH target: ${config.ssh.host}:${config.ssh.port}`);

            server = net.createServer((socket) => {
                sshClient.forwardOut(
                    socket.remoteAddress || '127.0.0.1',
                    socket.remotePort || 0,
                    config.remoteHost,
                    config.remotePort,
                    (error, stream) => {
                        if (error) {
                            socket.destroy(error);
                            return;
                        }
                        socket.pipe(stream).pipe(socket);
                    },
                );
            });

            server.listen(0, '127.0.0.1', async () => {
                const address = server.address();
                const localPort = typeof address === 'object' && address ? address.port : 0;
                const uri = new URL(config.mongoUri);
                uri.hostname = '127.0.0.1';
                uri.port = String(localPort);
                if (!uri.pathname || uri.pathname === '/') {
                    uri.pathname = '/admin';
                }
                uri.searchParams.set('directConnection', String(config.directConnection));

                console.log(`[private-real-env] Local port: ${localPort}`);
                console.log(`[private-real-env] Mongo URI: ${redactMongoUri(uri.toString())}`);

                const client = new MongoClient(uri.toString(), {
                    serverSelectionTimeoutMS: config.serverSelectionTimeoutMS,
                    connectTimeoutMS: config.connectTimeoutMS,
                });

                try {
                    await client.connect();
                    const ping = await client.db('admin').admin().ping();
                    console.log(`[private-real-env] Ping ok: ${ping.ok === 1}`);
                    const dbs = await client.db('admin').admin().listDatabases();
                    console.log(`[private-real-env] Databases visible: ${dbs.databases.length}`);
                    await client.close();
                    resolve();
                } catch (error) {
                    reject(error);
                } finally {
                    sshClient.end();
                    server.close();
                }
            });
        });

        sshClient.on('error', (error) => {
            reject(error);
        });

        sshClient.connect({
            host: config.ssh.host,
            port: config.ssh.port,
            username: config.ssh.username,
            password: config.ssh.password,
            readyTimeout: config.connectTimeoutMS,
        });
    });
}

if (require.main === module) {
    runSsh2PrivateRealEnvCheck().catch((error) => {
        console.error('[private-real-env] ❌ ssh2 tunnel check failed');
        console.error(error instanceof Error ? error.message : error);
        process.exit(1);
    });
}

module.exports = {
    runSsh2PrivateRealEnvCheck,
};
