const { MongoClient } = require('mongodb');

// 懒加载 MongoDB Memory Server（仅在需要时加载）
let MongoMemoryServer;
let memoryServerInstance; // 单例实例

function buildLogContext({ type, databaseName, defaults, config }) {
    const scope = defaults?.namespace?.scope;
    let uriHost;
    try { uriHost = new URL(config?.uri || '').hostname; } catch (_) { uriHost = undefined; }
    return { type, db: databaseName, scope, uriHost };
}

/**
 * 启动 MongoDB Memory Server（单例模式）
 * @param {Object} logger - 日志记录器
 * @returns {Promise<string>} 返回内存数据库的连接 URI
 */
async function startMemoryServer(logger) {
    if (memoryServerInstance) {
        const uri = memoryServerInstance.getUri();
        try { logger && logger.debug && logger.debug('📌 Using existing MongoDB Memory Server', { uri }); } catch (_) {}
        return uri;
    }

    try {
        // 懒加载 MongoDB Memory Server
        if (!MongoMemoryServer) {
            MongoMemoryServer = require('mongodb-memory-server').MongoMemoryServer;
        }

        try { logger && logger.info && logger.info('🚀 Starting MongoDB Memory Server...'); } catch (_) {}

        memoryServerInstance = await MongoMemoryServer.create({
            instance: {
                port: undefined, // 自动分配端口
                dbName: 'test_db',
                storageEngine: 'ephemeralForTest', // 使用临时存储引擎
            },
            binary: {
                version: '6.0.12', // 指定 MongoDB 版本
            },
        });

        const uri = memoryServerInstance.getUri();
        try { logger && logger.info && logger.info('✅ MongoDB Memory Server started', { uri }); } catch (_) {}
        return uri;
    } catch (err) {
        try { logger && logger.error && logger.error('❌ Failed to start MongoDB Memory Server', err); } catch (_) {}
        throw new Error(`Failed to start MongoDB Memory Server: ${err.message}`);
    }
}

/**
 * 停止 MongoDB Memory Server
 * @param {Object} logger - 日志记录器
 */
async function stopMemoryServer(logger) {
    if (!memoryServerInstance) {
        return;
    }

    try {
        try { logger && logger.info && logger.info('🛑 Stopping MongoDB Memory Server...'); } catch (_) {}
        await memoryServerInstance.stop();
        memoryServerInstance = null;
        try { logger && logger.info && logger.info('✅ MongoDB Memory Server stopped'); } catch (_) {}
    } catch (err) {
        try { logger && logger.warn && logger.warn('⚠️  Error stopping MongoDB Memory Server', err); } catch (_) {}
        memoryServerInstance = null;
    }
}

/**
 * 建立 MongoDB 连接（适配器内部使用）
 * @param {{ databaseName: string, config: { uri?: string, options?: object, useMemoryServer?: boolean }, logger: any, defaults: object, type?: string }} params
 * @returns {Promise<{ client: import('mongodb').MongoClient, db: any }>} 返回已连接的 client 与默认 db 句柄（若可用）
 */
async function connectMongo({ databaseName, config, logger, defaults, type = 'mongodb' }) {
    let { uri, options = {}, useMemoryServer } = config || {};

    // 🔑 根据 config.useMemoryServer 决定是否使用内存数据库
    if (useMemoryServer === true) {
        try {
            uri = await startMemoryServer(logger);
        } catch (err) {
            // 如果启动内存服务器失败，且没有提供 uri，抛出错误
            if (!uri) {
                throw new Error('Failed to start Memory Server and no URI provided');
            }
            try { logger && logger.warn && logger.warn('Failed to start Memory Server, using provided URI', { uri }); } catch (_) {}
        }
    }

    if (!uri) throw new Error('MongoDB connect requires config.uri or config.useMemoryServer');

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
 * @param {boolean} [stopMemory=false] - 是否同时停止内存服务器
 */
async function closeMongo(client, logger, stopMemory = false) {
    if (!client) return;
    try { await client.close(); } catch (e) { try { logger && logger.warn && logger.warn('MongoDB close error', e && (e.stack || e)); } catch(_) {} }

    // 如果指定停止内存服务器
    if (stopMemory) {
        await stopMemoryServer(logger);
    }
}

module.exports = { connectMongo, closeMongo, stopMemoryServer };
