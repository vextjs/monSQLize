const { MongoClient } = require('mongodb');
const CacheFactory = require('./cache');
const crypto = require('crypto');


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
        this.defaultOptions = {
            maxTimeMS: this.defaults.maxTimeMS ?? 2000, // 最大查询执行时间
            findLimit: (this.defaults.findLimit ?? 10),  // find 未传 limit 时使用；0 表示不限
        };
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
        const {uri, options = {}} = config;
        try {
            this.config = config;
            this.client = new MongoClient(uri, options);
            await this.client.connect();
            // 可选：持久化当前库句柄，便于默认库访问
            try { this.db = this.client.db(this.databaseName); } catch (_) { this.db = null; }
            // 统一成功日志上下文
            try {
                const scope = this.defaults?.namespace?.scope;
                const iid = (() => { try { return this.resolveInstanceId?.(this.databaseName); } catch (_) { return undefined; } })();
                const uriHost = (() => { try { return new URL(this.config?.uri || '').hostname; } catch (_) { return undefined; } })();
                this.logger.info('✅ MongoDB connected', JSON.stringify({ type: this.type, db: this.databaseName, iid, scope, uriHost }));
            } catch (_) {
                this.logger.info('✅ MongoDB connected');
            }
            return this.client;
        } catch (err) {
            this.client = null;
            this.db = null;
            try {
                const scope = this.defaults?.namespace?.scope;
                const iid = (() => { try { return this.resolveInstanceId?.(this.databaseName); } catch (_) { return undefined; } })();
                const uriHost = (() => { try { return new URL(this.config?.uri || '').hostname; } catch (_) { return undefined; } })();
                const context = { type: this.type, db: this.databaseName, iid, scope, uriHost };
                this.logger.error('❌ MongoDB connection failed', context, err);
            } catch (_) {
                // fallback logging
                this.logger.error('❌ MongoDB connection failed:', err);
            }
            throw err;
        }
    }

    /**
     * 规范化查询参数（投影/排序等）
     */
    normalize(param){
        if (!param) return undefined;

        // 数组转对象（投影用）
        if (Array.isArray(param)) {
            const obj = {};
            param.forEach(k => {
                if (typeof k === 'string') obj[k] = 1;
            });
            return Object.keys(obj).length ? obj : undefined;
        }

        // 对象直接返回
        return typeof param === 'object' ? param : undefined;
    };

    /**
     * 生成MongoDB实例唯一标识符
     * @description 基于数据库名称和URI生成唯一的实例ID，用于缓存命名空间等场景。
     * 优先使用显式ID，否则通过解析URI和数据库信息生成基于SHA1哈希的短标识符。
     * @param {string} databaseName - MongoDB数据库名称
     * @param {string} uri - MongoDB连接URI字符串
     * @param {string} [explicitId] - 可选的显式ID，如果提供则直接返回
     * @returns {string} 返回格式为 "mdb:xxxxx" 的唯一标识符，其中xxxxx是12位base64url编码的哈希值
     * @example
     * // 使用显式ID
     * genInstanceId('mydb', 'mongodb://localhost:27017', 'custom-id') // 返回: 'custom-id'
     *
     * // 基于URI和数据库名生成
     * genInstanceId('mydb', 'mongodb://localhost:27017/mydb') // 返回: 'mdb:Abc123Def456'
     *
     * // 处理复杂URI（包含副本集、认证等参数）
     * genInstanceId('prod', 'mongodb+srv://user:pass@cluster.mongodb.net/prod?replicaSet=rs0&authSource=admin&tls=true')
     */

    genInstanceId(databaseName, uri, explicitId) {
        if (explicitId) return String(explicitId);
        const safeDb = String(databaseName || '');
        try {
            const u = new URL(String(uri || ''));
            const proto = (u.protocol || '').replace(':', '');
            const host = u.hostname || '';
            const port = u.port || (proto === 'mongodb+srv' ? 'srv' : '27017');
            const rs = u.searchParams.get('replicaSet') || '';
            const authSource = u.searchParams.get('authSource') || '';
            const tls = u.searchParams.get('tls') || u.searchParams.get('ssl') || '';
            const safe = `${proto}://${host}:${port}/${safeDb}?rs=${rs}&auth=${authSource}&tls=${tls}`;
            const h = crypto.createHash('sha1').update(safe).digest('base64url').slice(0, 12);
            return `mdb:${h}`;
        } catch (_) {
            const h = crypto.createHash('sha1').update(String(uri || '') + '|' + safeDb).digest('base64url').slice(0, 12);
            return `mdb:${h}`;
        }
    }

    /**
     * 解析命名空间实例 id（iid）
     * 优先级：namespace.instanceId（固定） > scope='connection'（按初始库） > 默认/ 'database'（按访问库）
     * @param {string} dbName - 当前访问的数据库名
     * @returns {string} 解析后的 iid
     */
    resolveInstanceId(dbName) {
        const explicit = this.defaults?.namespace?.instanceId;
        if (explicit) return String(explicit);
        const scope = this.defaults?.namespace?.scope; // 'database' | 'connection'
        const uri = this.config?.uri;
        // scope === 'connection' 使用初始 databaseName；否则（默认）按访问库
        if (scope === 'connection') {
            return this.genInstanceId(this.databaseName, uri);
        }
        const effective = dbName || this.databaseName;
        return this.genInstanceId(effective, uri);
    }

    /** 获取慢查询阈值（毫秒） */
    _getSlowQueryThreshold() {
        const d = this.defaults || {};
        return (d.slowQueryMs && Number(d.slowQueryMs)) || 500;
    }

    /**
     * 从 options 构建“安全”的慢日志 extra 负载：仅记录非敏感元信息和查询形状
     */
    _buildSlowLogExtra(options) {
        const pick = (obj, fields) => Object.fromEntries(
            (fields || []).filter(k => obj && k in obj).map(k => [k, obj[k]])
        );
        const meta = pick(options || {}, ['limit', 'skip', 'maxTimeMS', 'cache']);

        // 仅输出查询形状：字段名与运算符名，不含具体值
        const shapeOf = (input, maxKeys = 30, maxDepth = 3) => {
            const walk = (v, depth) => {
                if (depth > maxDepth || v == null || typeof v !== 'object') return true; // 值用 true 表示
                if (Array.isArray(v)) return v.length ? [walk(v[0], depth + 1)] : [];
                const out = {};
                let count = 0;
                for (const k of Object.keys(v)) {
                    out[k] = k.startsWith('$') ? '$' : walk(v[k], depth + 1);
                    if (++count >= maxKeys) { out.__truncated__ = true; break; }
                }
                return out;
            };
            return walk(input, 0);
        };

        const extra = { ...meta };
        if (options?.query) extra.queryShape = shapeOf(options.query);
        if (options?.projection) {
            extra.projectionShape = Array.isArray(options.projection)
                ? options.projection.slice(0, 30)
                : Object.keys(options.projection).slice(0, 30);
        }
        if (options?.sort && typeof options.sort === 'object') {
            extra.sortShape = Object.fromEntries(
                Object.entries(options.sort).slice(0, 30).map(([k, v]) => [k, v === -1 ? -1 : 1])
            );
        }
        return extra;
    }

    /**
     * 包装执行并在超过阈值时输出慢查询日志
     * @param {string} op - 操作名：'findOne' | 'find' | 'count'
     * @param {{ db:string, coll:string }} ns - 命名空间（已绑定）
     * @param {object} options - 本次查询的 options（用于日志 shape）
     * @param {() => Promise<any>} fn - 实际执行函数
     */
    async _withSlowQueryLog(op, ns, options, fn) {
        const t0 = Date.now();
        const res = await fn();
        const ms = Date.now() - t0;
        const threshold = this._getSlowQueryThreshold();
        if (ms > threshold) {
            const extra = this._buildSlowLogExtra(options);
            // 解析上下文标识
            const scope = this.defaults?.namespace?.scope;
            const iid = (() => { try { return this.resolveInstanceId?.(ns.db); } catch (_) { return undefined; } })();
            const base = {
                // 稳定的机器可识别标识
                event: (this.defaults?.log?.slowQueryTag?.event) || 'slow_query',
                code:  (this.defaults?.log?.slowQueryTag?.code)  || 'SLOW_QUERY',
                category: 'performance',
                // 运行时上下文
                type: this.type,
                iid,
                scope,
                db: ns.db,
                coll: ns.coll,
                op,
                ms,
                threshold,
                ts: new Date().toISOString(),
                ...extra,
            };
            try {
                if (typeof this.defaults?.log?.formatSlowQuery === 'function') {
                    const formatted = this.defaults.log.formatSlowQuery(base) || base;
                    this.logger.warn('\u23f1\ufe0f Slow query', formatted);
                } else {
                    this.logger.warn('\u23f1\ufe0f Slow query', base);
                }
            } catch (_) { /* ignore logging error */ }
        }
        return res;
    }

    collection(databaseName, collectionName){
        if (!this.client) {
            throw new Error('MongoDB is not connected. Call connect() before accessing collections.');
        }
        const effectiveDbName = databaseName || this.databaseName;
        const db = this.client.db(effectiveDbName);
        const collection = db.collection(collectionName);

        // 生成实例唯一指纹（支持 scope 策略与显式覆盖）
        const instanceId = this.resolveInstanceId(effectiveDbName);
        const cached = CacheFactory.createCachedReader(this.cache, {
            iid: instanceId,
            type: this.type,
            db: effectiveDbName,
            collection: collection.collectionName,
        });
        const ns = { db: effectiveDbName, coll: collection.collectionName };
        const withSlow = (op, options, fn) => this._withSlowQueryLog(op, ns, options, fn);
        const run = (op, options, exec) => withSlow(op, options, () => cached(op, options, exec));
        return {
            /** 返回当前访问器的命名空间信息 */
            getNamespace: () => ({ iid: instanceId, type: this.type, db: effectiveDbName, collection: collection.collectionName }),

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
                options.projection = this.normalize(options.projection);
                const {
                    query = {},
                    projection,
                    sort,
                    maxTimeMS = this.defaultOptions.maxTimeMS
                } = options;

                return run(
                    'findOne',
                    options,
                    () => collection.findOne(query, { projection, sort, maxTimeMS })
                );
            },

            /**
             * 查询多条记录
             * @param {Object} [options={}] - { query, projection, sort, limit, skip, cache, maxTimeMS }
             * @returns {Promise<Array>} 记录数组
             */
            find: async (options = {}) => {
                options.projection = this.normalize(options.projection);
                const {
                    query = {},
                    projection,
                    sort,
                    limit = this.defaultOptions.findLimit,
                    skip,
                    maxTimeMS = this.defaultOptions.maxTimeMS
                } = options;

                const driverOpts = { projection, sort, skip, maxTimeMS };
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
                const { query = {}, maxTimeMS = this.defaultOptions.maxTimeMS } = options;
                return run(
                    'count',
                    options,
                    () => collection.countDocuments(query, { maxTimeMS })
                );
            },

            /**
             * 使该集合的缓存失效
             * @param {('find'|'findOne'|'count')} [op] - 可选：指定仅失效某操作
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
                        this.logger.info('🗑️ Cache invalidated', { ns, op, deleted });
                    } catch (_) { /* ignore logging error */ }
                    return deleted;
                } catch (_) {
                    try { this.logger.warn('🗑️ Cache invalidation failed', { ns, op }); } catch (_) {}
                    return 0;
                }
            },
        }
    }

    /**
     * 关闭连接并释放资源
     */
    async close() {
        if (this.client) {
            try { await this.client.close(); } catch (_) { /* ignore */ }
        }
        this.client = null;
        this.db = null;
        return true;
    }

}