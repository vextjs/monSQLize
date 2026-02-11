const { MongoClient } = require('mongodb');
const { SSHTunnelManager } = require('../infrastructure/ssh-tunnel');
const { parseUri } = require('../infrastructure/uri-parser');

// 懒加载 MongoDB Memory Server（仅在需要时加载）
let MongoMemoryServer;
let MongoMemoryReplSet;
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
 * @param {Object} [memoryServerOptions] - Memory Server 配置选项
 * @returns {Promise<string>} 返回内存数据库的连接 URI
 */
async function startMemoryServer(logger, memoryServerOptions = {}) {
    if (memoryServerInstance) {
        const uri = memoryServerInstance.getUri();
        try { logger && logger.debug && logger.debug('📌 Using existing MongoDB Memory Server', { uri }); } catch (_) { }
        return uri;
    }

    try {
        // 检查是否需要副本集
        const needsReplSet = memoryServerOptions?.instance?.replSet;

        if (needsReplSet) {
            // 使用副本集模式
            if (!MongoMemoryReplSet) {
                MongoMemoryReplSet = require('mongodb-memory-server').MongoMemoryReplSet;
            }

            try { logger && logger.info && logger.info('🚀 Starting MongoDB Memory Server (Replica Set)...', { replSet: needsReplSet }); } catch (_) { }

            const replSetConfig = {
                replSet: {
                    name: needsReplSet,
                    count: 1, // 单节点副本集（足以支持事务）
                    storageEngine: 'wiredTiger'
                },
                binary: {
                    version: '6.0.12'
                }
            };

            memoryServerInstance = await MongoMemoryReplSet.create(replSetConfig);
            const uri = memoryServerInstance.getUri();
            try { logger && logger.info && logger.info('✅ MongoDB Memory Server (Replica Set) started', { uri, replSet: needsReplSet }); } catch (_) { }
            return uri;
        } else {
            // 使用单实例模式
            if (!MongoMemoryServer) {
                MongoMemoryServer = require('mongodb-memory-server').MongoMemoryServer;
            }

            try { logger && logger.info && logger.info('🚀 Starting MongoDB Memory Server...'); } catch (_) { }

            const defaultConfig = {
                instance: {
                    port: undefined,
                    dbName: 'test_db',
                    storageEngine: 'ephemeralForTest',
                },
                binary: {
                    version: '6.0.12',
                },
            };

            const config = {
                ...defaultConfig,
                ...memoryServerOptions,
                instance: {
                    ...defaultConfig.instance,
                    ...(memoryServerOptions.instance || {})
                },
                binary: {
                    ...defaultConfig.binary,
                    ...(memoryServerOptions.binary || {})
                }
            };

            memoryServerInstance = await MongoMemoryServer.create(config);
            const uri = memoryServerInstance.getUri();
            try { logger && logger.info && logger.info('✅ MongoDB Memory Server started', { uri }); } catch (_) { }
            return uri;
        }
    } catch (err) {
        try { logger && logger.error && logger.error('❌ Failed to start MongoDB Memory Server', err); } catch (_) { }
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
        try { logger && logger.info && logger.info('🛑 Stopping MongoDB Memory Server...'); } catch (_) { }
        await memoryServerInstance.stop();
        memoryServerInstance = null;
        try { logger && logger.info && logger.info('✅ MongoDB Memory Server stopped'); } catch (_) { }
    } catch (err) {
        try { logger && logger.warn && logger.warn('⚠️  Error stopping MongoDB Memory Server', err); } catch (_) { }
        memoryServerInstance = null;
    }
}

/**
 * 建立 MongoDB 连接（适配器内部使用）
 * @param {{ databaseName: string, config: { uri?: string, options?: object, useMemoryServer?: boolean, readPreference?: string, ssh?: object, remoteHost?: string, remotePort?: number, mongoHost?: string, mongoPort?: number }, logger: any, defaults: object, type?: string }} params
 * @returns {Promise<{ client: import('mongodb').MongoClient, db: any, sshTunnel?: any }>} 返回已连接的 client、默认 db 句柄（若可用）和 SSH 隧道实例（若使用）
 */
async function connectMongo({ databaseName, config, logger, defaults, type = 'mongodb' }) {
    let { uri, options = {}, useMemoryServer, memoryServerOptions, readPreference, ssh } = config || {};

    let sshTunnel = null;
    let effectiveUri = uri;

    // ===== SSH 隧道逻辑 =====
    if (ssh) {
        logger?.info?.('🔐 Establishing SSH tunnel for MongoDB...');

        // 解析MongoDB目标地址（优先级：显式配置 > URI解析）
        let remoteHost = config.remoteHost || config.mongoHost;
        let remotePort = config.remotePort || config.mongoPort;

        if (!remoteHost || !remotePort) {
            try {
                const parsed = parseUri(uri);
                remoteHost = parsed.host;
                remotePort = parsed.port;
            } catch (err) {
                throw new Error('SSH tunnel requires remoteHost and remotePort, or a valid MongoDB URI');
            }
        }

        // 使用SSH隧道管理器工厂
        sshTunnel = SSHTunnelManager.create(ssh, remoteHost, remotePort, {
            logger,
            name: 'MongoDB'
        });

        try {
            await sshTunnel.connect();

            // 使用隧道URI
            effectiveUri = sshTunnel.getTunnelUri('mongodb', uri);

            logger?.info?.(`✅ MongoDB will connect via SSH tunnel: ${sshTunnel.getLocalAddress()}`);
        } catch (err) {
            logger?.error?.('❌ SSH tunnel connection failed', err);
            throw err;
        }
    }
    // ===== Memory Server 逻辑 =====
    else if (useMemoryServer === true) {
        try {
            effectiveUri = await startMemoryServer(logger, memoryServerOptions);
        } catch (err) {
            // 如果启动内存服务器失败，且没有提供 uri，抛出错误
            if (!effectiveUri) {
                throw new Error('Failed to start Memory Server and no URI provided');
            }
            logger?.warn?.('Failed to start Memory Server, using provided URI', { uri: effectiveUri });
        }
    }

    if (!effectiveUri) throw new Error('MongoDB connect requires config.uri or config.useMemoryServer');

    // 🔑 合并 readPreference 到 MongoClient options
    const clientOptions = { ...options };
    if (readPreference) {
        clientOptions.readPreference = readPreference;
    }

    const client = new MongoClient(effectiveUri, clientOptions);
    try {
        await client.connect();
        let db = null;
        try { db = client.db(databaseName); } catch (_) { db = null; }
        const ctx = buildLogContext({ type, databaseName, defaults, config });
        // try { logger && logger.info && logger.info('✅ MongoDB connected', ctx); } catch (_) {}
        return { client, db, sshTunnel };
    } catch (err) {
        // 连接失败，清理SSH隧道
        if (sshTunnel) {
            await sshTunnel.close();
        }
        const ctx = buildLogContext({ type, databaseName, defaults, config });
        logger?.error?.('❌ MongoDB connection failed', ctx, err);
        throw err;
    }
}

/**
 * 关闭 MongoDB 连接
 * @param {import('mongodb').MongoClient} client
 * @param {any} logger
 * @param {boolean} [stopMemory=false] - 是否同时停止内存服务器
 * @param {any} [sshTunnel=null] - SSH隧道实例（如果使用）
 */
async function closeMongo(client, logger, stopMemory = false, sshTunnel = null) {
    if (!client) return;
    try { await client.close(); } catch (e) { try { logger && logger.warn && logger.warn('MongoDB close error', e && (e.stack || e)); } catch (_) { } }

    // 关闭SSH隧道
    if (sshTunnel) {
        try {
            await sshTunnel.close();
        } catch (e) {
            logger?.warn?.('SSH tunnel close error', e);
        }
    }

    // 如果指定停止内存服务器
    if (stopMemory) {
        await stopMemoryServer(logger);
    }
}

module.exports = { connectMongo, closeMongo, stopMemoryServer };

