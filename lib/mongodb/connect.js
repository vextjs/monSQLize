const { MongoClient } = require('mongodb');

function buildLogContext({ type, databaseName, defaults, config }) {
    const scope = defaults?.namespace?.scope;
    let uriHost;
    try { uriHost = new URL(config?.uri || '').hostname; } catch (_) { uriHost = undefined; }
    return { type, db: databaseName, scope, uriHost };
}

/**
 * 建立 MongoDB 连接（适配器内部使用）
 * @param {{ databaseName: string, config: { uri: string, options?: object }, logger: any, defaults: object, type?: string }} params
 * @returns {Promise<{ client: import('mongodb').MongoClient, db: any }>} 返回已连接的 client 与默认 db 句柄（若可用）
 */
async function connectMongo({ databaseName, config, logger, defaults, type = 'mongodb' }) {
    const { uri, options = {} } = config || {};
    if (!uri) throw new Error('MongoDB connect requires config.uri');
    const client = new MongoClient(uri, options);
    try {
        await client.connect();
        let db = null;
        try { db = client.db(databaseName); } catch (_) { db = null; }
        const ctx = buildLogContext({ type, databaseName, defaults, config });
        // try { logger && logger.info && logger.info('✅ MongoDB connected', ctx); } catch (_) {}
        return { client, db };
    } catch (err) {
        const ctx = buildLogContext({ type, databaseName, defaults, config });
        try { logger && logger.error && logger.error('❌ MongoDB connection failed', ctx, err); } catch (_) {}
        throw err;
    }
}

/**
 * 关闭 MongoDB 连接
 * @param {import('mongodb').MongoClient} client
 * @param {any} logger
 */
async function closeMongo(client, logger) {
    if (!client) return;
    try { await client.close(); } catch (e) { try { logger && logger.warn && logger.warn('MongoDB close error', e && (e.stack || e)); } catch(_) {} }
}

module.exports = { connectMongo, closeMongo };
