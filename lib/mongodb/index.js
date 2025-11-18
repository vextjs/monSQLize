// MongoDB connect/close moved to separate module for clarity
const { connectMongo, closeMongo } = require('./connect');
// Common runner and log shapers
const { createCachedRunner } = require('../common/runner');
const { genInstanceId } = require('./common/iid');
const { resolveInstanceId: resolveNS } = require('../common/namespace');
const { withSlowQueryLog } = require('../common/log');
const { mongoSlowLogShaper, mongoKeyBuilder } = require('./common/accessor-helpers');

// 模块化方法统一导入
const {
    createFindOps,
    createFindOneOps,
    createFindOneByIdOps,  // findOneById 快捷方法
    createFindByIdsOps,    // 新增：findByIds 快捷方法
    createCountOps,
    createAggregateOps,
    createDistinctOps,
    createFindPageOps  // 分页查询工厂函数
} = require('./queries');

const {
    createNamespaceOps,
    createCollectionOps,
    createCacheOps,
    createBookmarkOps,
    createIndexOps
} = require('./management');

const {
    createInsertOneOps,
    createInsertManyOps,
    createInsertBatchOps,
    createUpdateOneOps,
    createUpdateManyOps,
    createReplaceOneOps,
    createUpsertOneOps,  // 新增：upsertOne 便利方法
    createFindOneAndUpdateOps,
    createFindOneAndReplaceOps,
    createDeleteOneOps,
    createDeleteManyOps,
    createFindOneAndDeleteOps
} = require("./writes");

const { EventEmitter } = require('events');
module.exports = class {

    /**
     * 初始化MongoDB实例
     * @param {string} type - 数据库类型
     * @param {string} databaseName - MongoDB数据库名称
     * @param {Object} cache - 缓存实例,用于缓存查询结果
     * @param {Object} logger - 日志记录器对象,用于记录操作和错误信息
     * @param {Object} [defaults] - 统一默认配置（maxTimeMS、namespace.instanceId 等）
     */
    constructor(type, databaseName, cache, logger, defaults = {}) {
        this.type = type;
        this.cache = cache;
        this.logger = logger;
        this.databaseName = databaseName;
        this.defaults = defaults || {};
        // 事件：connected/closed/error/slow-query
        this._emitter = new EventEmitter();
        this.on = this._emitter.on.bind(this._emitter);
        this.once = this._emitter.once.bind(this._emitter);
        this.off = (this._emitter.off ? this._emitter.off.bind(this._emitter) : this._emitter.removeListener.bind(this._emitter));
        this.emit = this._emitter.emit.bind(this._emitter);
    }

    /**
 * 连接到MongoDB数据库
 * @param {Object} config - MongoDB连接配置
 * @param {string} config.uri - MongoDB连接URI
 * @param {Object} [config.options={}] - MongoDB连接选项
 * @returns {MongoClient} 返回MongoDB客户端连接实例
 * @throws {Error} 当连接失败时记录错误日志
 */
    async connect(config) {
        // 如果已有连接，直接返回
        if (this.client) {
            return this.client;
        }

        // 防止并发连接：使用连接锁
        if (this._connecting) {
            return this._connecting;
        }

        this.config = config;

        try {
            this._connecting = (async () => {
                const { client, db } = await connectMongo({
                    databaseName: this.databaseName,
                    config: this.config,
                    logger: this.logger,
                    defaults: this.defaults,
                    type: this.type,
                });
                this.client = client;
                this.db = db;
                try { this.emit && this.emit('connected', { type: this.type, db: this.databaseName, scope: this.defaults?.namespace?.scope }); } catch (_) { }
                return this.client;
            })();

            const result = await this._connecting;
            this._connecting = null;
            return result;
        } catch (err) {
            this._connecting = null;
            try { this.emit && this.emit('error', { type: this.type, db: this.databaseName, error: String(err && (err.message || err)) }); } catch (_) { }
            throw err;
        }
    }

    /**
     * 解析命名空间实例 id（iid）
     * 优先级：namespace.instanceId（固定） > scope='connection'（按初始库） > 默认/ 'database'（按访问库）
     * @param {string} dbName - 当前访问的数据库名
     * @returns {string} 解析后的 iid
     */
    resolveInstanceId(dbName) {
        return resolveNS(
            { genInstanceId },
            this.defaults,
            dbName,
            this.databaseName,
            this.config?.uri
        );
    }

    // 使用通用 withSlowQueryLog（保留方法名兼容测试），仅做薄代理
    async _withSlowQueryLog(op, ns, options, fn) {
        const iid = (() => {
            try {
                return this.resolveInstanceId?.(ns.db);
            } catch (_) {
                return undefined;
            }
        })();
        return withSlowQueryLog(
            this.logger,
            this.defaults,
            op,
            { db: ns.db, coll: ns.coll, iid, type: this.type },
            options,
            fn,
            mongoSlowLogShaper
        );
    }

    collection(databaseName, collectionName) {
        if (!this.client) {
            const err = new Error('MongoDB is not connected. Call connect() before accessing collections.');
            err.code = 'NOT_CONNECTED';
            throw err;
        }

        // 输入验证：集合名称必须是非空字符串
        if (!collectionName || typeof collectionName !== 'string' || collectionName.trim() === '') {
            const err = new Error('Collection name must be a non-empty string.');
            err.code = 'INVALID_COLLECTION_NAME';
            throw err;
        }

        // 输入验证：数据库名称如果提供，必须是非空字符串
        if (databaseName !== undefined && databaseName !== null && (typeof databaseName !== 'string' || databaseName.trim() === '')) {
            const err = new Error('Database name must be a non-empty string or null/undefined.');
            err.code = 'INVALID_DATABASE_NAME';
            throw err;
        }

        const effectiveDbName = databaseName || this.databaseName;
        const db = this.client.db(effectiveDbName);
        const collection = db.collection(collectionName);
        // 生成实例唯一指纹（支持 scope 策略与显式覆盖）
        this._iidCache = this._iidCache || new Map();
        let instanceId = this._iidCache.get(effectiveDbName);
        if (!instanceId) {
            instanceId = this.resolveInstanceId(effectiveDbName);
            this._iidCache.set(effectiveDbName, instanceId);
        }
        // 统一执行器：使用通用 runner + 键构造与慢日志去敏形状注入
        const run = createCachedRunner(this.cache, {
            iid: instanceId,
            type: this.type,
            db: effectiveDbName,
            collection: collection.collectionName,
        }, this.logger, this.defaults, {
            keyBuilder: mongoKeyBuilder,
            slowLogShaper: mongoSlowLogShaper,
            onSlowQueryEmit: (meta) => { try { this.emit && this.emit('slow-query', meta); } catch (_) { } },
            onQueryEmit: (meta) => { try { this.emit && this.emit('query', meta); } catch (_) { } }
        });

        // 保存 this 引用
        const self = this;

        // 准备模块化上下文（暂不包含 getCollectionMethods，稍后添加）
        const moduleContext = {
            collection,
            db,
            defaults: this.defaults,
            run,
            instanceId,
            effectiveDbName,
            logger: this.logger,
            emit: this.emit,
            mongoSlowLogShaper,
            type: this.type,
            cache: this.cache,
            getCache: () => this.cache  // 动态获取 cache（支持测试时的临时替换）
        };

        // ========================================
        // 集合访问器对象
        // ========================================
        const accessor = {
            // 命名空间与元数据
            ...createNamespaceOps(moduleContext),
            // 集合管理操作
            ...createCollectionOps(moduleContext),
            // 缓存管理
            ...createCacheOps(moduleContext),
            // 索引管理操作
            ...createIndexOps(moduleContext, effectiveDbName, collection.collectionName, collection),
            // 基础查询方法
            ...createFindOneOps(moduleContext),
            ...createFindOneByIdOps(moduleContext),  // findOneById 便利方法
            ...createFindByIdsOps(moduleContext),    // 新增：findByIds 便利方法
            ...createFindOps(moduleContext),
            // 聚合与统计方法
            ...createCountOps(moduleContext),
            ...createAggregateOps(moduleContext),
            ...createDistinctOps(moduleContext),
            // explain 功能已集成到 find() 的链式调用和 options 参数中
            // 分页查询
            ...createFindPageOps(moduleContext),
            // 写操作方法 - Insert
            ...createInsertOneOps(moduleContext),
            ...createInsertManyOps(moduleContext),
            // 写操作方法 - Update
            ...createUpdateOneOps(moduleContext),
            ...createUpdateManyOps(moduleContext),
            ...createReplaceOneOps(moduleContext),
            ...createUpsertOneOps(moduleContext),  // 新增：upsertOne 便利方法
            // 写操作方法 - Find and Modify
            ...createFindOneAndUpdateOps(moduleContext),
            ...createFindOneAndReplaceOps(moduleContext),
            // 写操作方法 - Delete
            ...createDeleteOneOps(moduleContext),
            ...createDeleteManyOps(moduleContext),
            ...createFindOneAndDeleteOps(moduleContext)
        };

        // 🔑 关键：insertBatch 依赖 insertMany，所以在 accessor 创建后添加
        const insertBatchOps = createInsertBatchOps({
            ...moduleContext,
            insertMany: accessor.insertMany  // 传入 insertMany 方法
        });
        Object.assign(accessor, insertBatchOps);

        // 🔑 关键：现在 accessor 已完整创建（包含 findPage），再创建依赖它的 bookmarkOps
        moduleContext.getCollectionMethods = () => accessor;
        const bookmarkOps = createBookmarkOps(moduleContext);

        // 将 bookmark 方法添加到 accessor
        Object.assign(accessor, bookmarkOps);

        return accessor;
    }

    /**
     * 健康检查：返回连接状态与默认/缓存摘要
     */
    async health() {
        const cache = this.cache;
        const cacheStats = (cache && typeof cache.getStats === 'function') ? cache.getStats() : undefined;
        return {
            status: this.client ? 'up' : 'down',
            connected: !!this.client,
            defaults: this.defaults,
            cache: cacheStats ? { ...cacheStats } : undefined,
            driver: { connected: !!this.client },
        };
    }

    /**
 * 关闭连接并释放资源
 */
    async close() {
        if (this.client) {
            await closeMongo(this.client, this.logger);
        }
        this.client = null;
        this.db = null;
        this._connecting = null;

        // 清理实例ID缓存，防止内存泄漏
        if (this._iidCache) {
            this._iidCache.clear();
            this._iidCache = null;
        }

        try { this.emit && this.emit('closed', { type: this.type, db: this.databaseName }); } catch (_) { }
        return true;
    }

}
