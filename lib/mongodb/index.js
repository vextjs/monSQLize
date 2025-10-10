// MongoDB connect/close moved to separate module for clarity
const {connectMongo, closeMongo} = require('./connect');
const CacheFactory = require('../cache');
// Pagination and aggregation helpers (moved to top-level requires for clarity and performance)
const {ensureStableSort, reverseSort, pickAnchor} = require('./common/sort');
const {buildPagePipelineA} = require('./common/agg-pipeline');
const {decodeCursor} = require('../common/cursor');
const {makePageResult} = require('../common/page-result');
const {normalizeProjection, normalizeSort} = require('../common/normalize');
const {validateLimitAfterBefore, assertCursorSortCompatible} = require('../common/validation');
// Common runner and log shapers
const {createCachedRunner} = require('../common/runner');
const {genInstanceId} = require('./common/iid');
const {resolveInstanceId: resolveNS} = require('../common/namespace');
const {withSlowQueryLog} = require('../common/log');
const {mongoSlowLogShaper, mongoKeyBuilder} = require('./common/accessor-helpers');
const { createFindPage } = require('./find-page');

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
        this.config = config;
        try {
            const {client, db} = await connectMongo({
                databaseName: this.databaseName,
                config: this.config,
                logger: this.logger,
                defaults: this.defaults,
                type: this.type,
            });
            this.client = client;
            this.db = db;
            try { this.emit && this.emit('connected', { type: this.type, db: this.databaseName, scope: this.defaults?.namespace?.scope }); } catch(_) {}
            return this.client;
        } catch (err) {
            try { this.emit && this.emit('error', { type: this.type, db: this.databaseName, error: String(err && (err.message || err)) }); } catch(_) {}
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
            {genInstanceId},
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
            {db: ns.db, coll: ns.coll, iid, type: this.type},
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
            onSlowQueryEmit: (meta) => { try { this.emit && this.emit('slow-query', meta); } catch(_) {} },
            onQueryEmit: (meta) => { try { this.emit && this.emit('query', meta); } catch(_) {} }
        });
        return {
            /** 返回当前访问器的命名空间信息 */
            getNamespace: () => ({
                iid: instanceId,
                type: this.type,
                db: effectiveDbName,
                collection: collection.collectionName
            }),

            /**
             * 删除集合
             * @returns {Promise<boolean>} 删除操作的结果
             */
            dropCollection: async () => {
                return await collection.drop();
            },

            /**
             * 创建集合
             * @param {string} [name] - 集合名称；省略则使用当前绑定的集合名
             * @param {Object} [options] - 创建集合的配置选项
             * @returns {Promise<boolean>} 创建成功返回true
             */
            createCollection: async (name, options = {}) => {
                const collName = name || collection.collectionName;
                await db.createCollection(collName, options);
                return true;
            },

            /**
             * 创建视图集合
             * @param {string} name - 视图名称
             * @param {string} source - 源集合名称
             * @param {Array} pipeline - 聚合管道数组
             * @returns {Promise<boolean>} 创建成功返回true
             */
            createView: async (name, source, pipeline = []) => {
                await db.createCollection(name, {
                    viewOn: source,
                    pipeline: pipeline || []
                });
                return true;
            },

            /**
             * 使该集合的缓存失效
             * @param {('find'|'findOne'|'count'|'findPage')} [op] - 可选：指定仅失效某操作
             * @returns {Promise<number>} 删除的键数量
             */
            invalidate: async (op) => {
                const ns = {
                    iid: instanceId,
                    type: this.type,
                    db: effectiveDbName,
                    collection: collection.collectionName,
                };
                const pattern = CacheFactory.buildNamespaceOpPattern(ns, op);
                try {
                    const deleted = await this.cache.delPattern(pattern);
                    try {
                        this.logger.info('🗑️ Cache invalidated', {ns, op, deleted});
                    } catch (_) { /* ignore logging error */
                    }
                    return deleted;
                } catch (_) {
                    try {
                        this.logger.warn('🗑️ Cache invalidation failed', {ns, op});
                    } catch (_) {
                    }
                    return 0;
                }
            },

            /**
             * 查询单条记录
             * @description 根据指定条件查询集合中的第一条匹配记录，支持投影、排序和缓存功能
             * @param {Object} [options={}] - 查询选项配置对象
             * @param {Object} [options.query={}] - 查询条件，使用MongoDB查询语法，如 {name: 'John', age: {$gt: 18}}
             * @param {Object|Array} [options.projection] - 字段投影配置，指定返回的字段
             * @param {Object} [options.sort] - 排序配置，如 {createdAt: -1, name: 1}，-1降序，1升序
             * @param {number} [options.cache=0] - 缓存时间（毫秒），0表示不缓存，>0时结果将被缓存指定时间
             * @param {number} [options.maxTimeMS] - 查询超时时间（毫秒），防止长时间查询阻塞
             * @returns {Promise<Object|null>} 返回匹配的第一条记录对象，未找到时返回null
             */
            findOne: async (options = {}) => {
                options.projection = normalizeProjection(options.projection);
                const {
                    query = {},
                    projection,
                    maxTimeMS = this.defaults.maxTimeMS
                } = options;
                const sort = normalizeSort(options.sort);

                return run(
                    'findOne',
                    options,
                    () => collection.findOne(query, {projection, sort, maxTimeMS, ...(options.hint ? { hint: options.hint } : {}), ...(options.collation ? { collation: options.collation } : {})})
                );
            },

            /**
             * 查询多条记录
             * @param {Object} [options={}] - { query, projection, sort, limit, skip, cache, maxTimeMS }
             * @returns {Promise<Array>} 记录数组
             */
            find: async (options = {}) => {
                options.projection = normalizeProjection(options.projection);
                const {
                    query = {},
                    projection,
                    limit = this.defaults.findLimit,
                    skip,
                    maxTimeMS = this.defaults.maxTimeMS
                } = options;
                const sort = normalizeSort(options.sort);

                const driverOpts = {projection, sort, skip, maxTimeMS, ...(options.hint ? { hint: options.hint } : {}), ...(options.collation ? { collation: options.collation } : {})};
                if (limit !== undefined) driverOpts.limit = limit;

                return run(
                    'find',
                    options,
                    async () => collection.find(query, driverOpts).toArray()
                );
            },

            /**
             * 统计条数
             * @param {Object} [options={}] - { query, cache, maxTimeMS }
             * @returns {Promise<number>} 匹配文档数
             */
            count: async (options = {}) => {
                const {query = {}, maxTimeMS = this.defaults.maxTimeMS} = options;

                // 性能优化：当没有查询条件时，使用 estimatedDocumentCount（基于元数据，速度快）
                const isEmptyQuery = !query || Object.keys(query).length === 0;

                return run(
                    'count',
                    options,
                    () => {
                        if (isEmptyQuery) {
                            // 空查询使用 estimatedDocumentCount（快速，基于集合元数据）
                            return collection.estimatedDocumentCount({ maxTimeMS });
                        } else {
                            // 有查询条件使用 countDocuments（精确，但较慢）
                            return collection.countDocuments(query, {
                                maxTimeMS,
                                ...(options.hint ? { hint: options.hint } : {}),
                                ...(options.collation ? { collation: options.collation } : {})
                            });
                        }
                    }
                );
            },

            /**
             * 聚合查询（MongoDB 聚合管道透传）
             * @param {Array} pipeline - 聚合管道数组，如 [{ $match: {...} }, { $group: {...} }]
             * @param {Object} [options={}] - 聚合选项
             * @param {number} [options.cache=0] - 缓存时间（毫秒），默认不缓存（聚合通常动态性强）
             * @param {number} [options.maxTimeMS] - 查询超时时间（毫秒）
             * @param {boolean} [options.allowDiskUse=false] - 是否允许使用磁盘（默认 false）
             * @param {Object} [options.collation] - 排序规则（可选）
             * @param {string|Object} [options.hint] - 索引提示（可选）
             * @param {string} [options.comment] - 查询注释（可选）
             * @param {boolean|Object} [options.meta] - 是否返回耗时元信息
             * @returns {Promise<Array>} 聚合结果数组
             */
            aggregate: async (pipeline = [], options = {}) => {
                const {
                    maxTimeMS = this.defaults.maxTimeMS,
                    allowDiskUse = false,
                    collation,
                    hint,
                    comment
                } = options;

                // 构建 MongoDB 聚合选项
                const aggOptions = { maxTimeMS, allowDiskUse };
                if (collation) aggOptions.collation = collation;
                if (hint) aggOptions.hint = hint;
                if (comment) aggOptions.comment = comment;

                return run(
                    'aggregate',
                    options,
                    async () => collection.aggregate(pipeline, aggOptions).toArray()
                );
            },

            /**
             * 深度分页（统一版：游标 after/before + 跳页 page + 可选 offset/totals）
             * @param {Object} [options={}] - 兼容原参数，并扩展 page/jump/offsetJump/totals
             */
            findPage: (() => {
                // 预构建 ns 字符串，确保书签键稳定
                const nsStr = `${instanceId}:${this.type}:${effectiveDbName}:${collection.collectionName}`;
                const findPageImpl = createFindPage({
                    collection,
                    getCache: () => this.cache,
                    getNamespace: () => ({ ns: nsStr, db: effectiveDbName, coll: collection.collectionName }),
                    defaults: this.defaults,
                    logger: this.logger,
                    databaseName: effectiveDbName,
                    collectionName: collection.collectionName,
                    run, // 注入统一执行器，用于缓存与慢日志
                });
                return async (options = {}) => findPageImpl(options);
            })(),

        }
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
        try { this.emit && this.emit('closed', { type: this.type, db: this.databaseName }); } catch(_) {}
        return true;
    }

}
