'use strict';

const path = require('node:path');
const MonSQLize = require(path.resolve(__dirname, '..', '..', 'lib', 'index.js'));
const { loadPrivateRealEnvConfig, redactMongoUri } = require('./private-real-env-config.cjs');

async function runMonSQLizePrivateRealEnvCheck() {
    const config = loadPrivateRealEnvConfig();
    const msq = new MonSQLize({
        type: 'mongodb',
        databaseName: config.databaseName,
        config: {
            ssh: config.ssh,
            uri: config.mongoUri,
            remoteHost: config.remoteHost,
            remotePort: config.remotePort,
            options: {
                serverSelectionTimeoutMS: config.serverSelectionTimeoutMS,
                directConnection: config.directConnection,
            },
        },
    });

    try {
        console.log('\n[private-real-env] monSQLize SSH tunnel check');
        console.log(`[private-real-env] SSH target: ${config.ssh.host}:${config.ssh.port}`);
        console.log(`[private-real-env] Mongo URI: ${redactMongoUri(config.mongoUri)}`);

        await msq.connect();
        console.log('[private-real-env] ✅ monSQLize connect() succeeded');

        const databases = await msq._adapter.client.db().admin().listDatabases();
        console.log(`[private-real-env] Databases visible: ${databases.databases.length}`);

        const collections = await msq._adapter.db.listCollections().toArray();
        console.log(`[private-real-env] Collections visible: ${collections.length}`);

        if (collections.length > 0) {
            const firstCollection = collections[0].name;
            const count = await msq.collection(firstCollection).count({});
            console.log(`[private-real-env] Sample collection "${firstCollection}" count: ${count}`);
        }

        const ping = await msq._adapter.client.db().admin().ping();
        console.log(`[private-real-env] Ping ok: ${ping.ok === 1}`);
    } finally {
        if (typeof msq.close === 'function') {
            await msq.close();
        } else if (msq._adapter && typeof msq._adapter.close === 'function') {
            await msq._adapter.close();
        }
    }
}

if (require.main === module) {
    runMonSQLizePrivateRealEnvCheck().catch((error) => {
        console.error('[private-real-env] ❌ monSQLize SSH tunnel check failed');
        console.error(error instanceof Error ? error.message : error);
        process.exit(1);
    });
}

module.exports = {
    runMonSQLizePrivateRealEnvCheck,
};
