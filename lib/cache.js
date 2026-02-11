/**
 * 缓存工厂类，提供默认缓存实现
 */

// 简单的内存缓存实现
class Cache {
    constructor(options = {}) {
        this.cache = new Map(); // Map<key, { value, size, expireAt|null }>
        this.timers = new Map(); // 保留字段（兼容），但采用惰性过期不再使用定时器
        this.options = {
            maxSize: options.maxSize || 100000,         // 最大缓存条目数
            maxMemory: options.maxMemory || 0,          // 最大内存使用量(字节)，0表示无限制
            enableStats: options.enableStats !== false, // 启用统计信息
            ...options
        };

        // 统计信息
        this.stats = {
            hits: 0,
            misses: 0,
            sets: 0,
            deletes: 0,
            evictions: 0,
            memoryUsage: 0
        };

        // 缓存锁管理器（由 TransactionManager 设置）
        this.lockManager = null;
    }

    /**
     * 设置缓存锁管理器
     * @param {CacheLockManager} lockManager
     */
    setLockManager(lockManager) {
        this.lockManager = lockManager;
    }

    /**
     * 获取缓存锁管理器
     * @returns {CacheLockManager|null}
     */
    getLockManager() {
        return this.lockManager;
    }

    async set(key, value, ttl = 0) {
        // 检查缓存锁：如果该键被锁定，拒绝写入
        if (this.lockManager && this.lockManager.isLocked(key)) {
            // 事务期间该缓存键被锁定，跳过写入
            return;
        }

        // 估算内存使用量
        const memorySize = this._estimateSize(key, value);

        // 如果存在旧值，准确回退内存
        const existedEntry = this.cache.get(key);
        if (existedEntry) {
            this.stats.memoryUsage -= existedEntry.size;
            // 移除后续会重建以刷新 LRU 顺序
            this.cache.delete(key);
        }

        const expireAt = ttl > 0 ? Date.now() + ttl : null;
        const entry = { value, size: memorySize, expireAt };
        // 插入到 Map 尾部（最新），形成 LRU 结构
        this.cache.set(key, entry);
        this.stats.sets++;
        this.stats.memoryUsage += memorySize;

        // 采用惰性过期，无需定时器（避免阻止事件循环退出）

        // 强制执行大小与内存限制（可能触发 LRU 淘汰）
        this._enforceLimits();
    }

    async get(key) {
        const entry = this.cache.get(key);
        if (!entry) {
            this.stats.misses++;
            return undefined;
        }
        // 惰性过期判断
        if (entry.expireAt && entry.expireAt <= Date.now()) {
            // 过期：删除并计为未命中
            this._deleteInternal(key);
            this.stats.misses++;
            return undefined;
        }
        // 命中：LRU 刷新（移动到尾部）
        this.cache.delete(key);
        this.cache.set(key, entry);
        this.stats.hits++;
        return entry.value;
    }

    async del(key) {
        return this._deleteInternal(key);
    }

    async exists(key) {
        const entry = this.cache.get(key);
        if (!entry) return false;
        if (entry.expireAt && entry.expireAt <= Date.now()) {
            this._deleteInternal(key);
            return false;
        }
        return true;
    }

    // 批量操作
    async getMany(keys) {
        const results = {};
        for (const key of keys) {
            results[key] = await this.get(key);
        }
        return results;
    }

    async setMany(keyValuePairs, ttl = 0) {
        // 批量设置后再统一执行限制检查，减少多次淘汰
        for (const [key, value] of Object.entries(keyValuePairs)) {
            await this.set(key, value, ttl);
        }
        // set() 已经会调用 _enforceLimits，这里无需重复
        return true;
    }

    async delMany(keys) {
        let deleted = 0;
        for (const key of keys) {
            if (await this.del(key)) {
                deleted++;
            }
        }
        return deleted;
    }

    // 模式匹配删除
    async delPattern(pattern) {
        const regex = this._patternToRegex(pattern);
        const keysToDelete = [];

        for (const key of this.cache.keys()) {
            if (regex.test(key)) {
                keysToDelete.push(key);
            }
        }


        return await this.delMany(keysToDelete);
    }

    // 清空所有缓存
    clear() {
        // 不再创建定时器，这里保持向后兼容的清理
        for (const timer of this.timers.values()) {
            if (timer && typeof timer.unref === 'function') timer.unref();
            clearTimeout(timer);
        }
        this.timers.clear();
        this.cache.clear();
        this.stats.memoryUsage = 0;
    }

    // 获取所有键
    keys(pattern = '*') {
        const keys = Array.from(this.cache.keys());
        if (pattern === '*') {
            return keys;
        }
        const regex = this._patternToRegex(pattern);
        return keys.filter(key => regex.test(key));
    }

    // 获取缓存统计信息
    getStats() {
        return {
            ...this.stats,
            size: this.cache.size,
            hitRate: this.stats.hits / (this.stats.hits + this.stats.misses) || 0,
            memoryUsageMB: this.stats.memoryUsage / (1024 * 1024)
        };
    }

    // 重置统计信息
    resetStats() {
        this.stats = {
            hits: 0,
            misses: 0,
            sets: 0,
            deletes: 0,
            evictions: 0,
            memoryUsage: this.stats.memoryUsage // 保持当前内存使用量
        };
    }

    // 内部删除方法
    _deleteInternal(key) {
        const entry = this.cache.get(key);
        if (!entry) return false;
        this.cache.delete(key);
        this.stats.deletes++;
        // 准确扣减内存
        this.stats.memoryUsage -= entry.size;
        return true;
    }

    // 执行大小/内存限制（LRU 淘汰）
    _enforceLimits() {
        // 先按条目数限制
        while (this.cache.size > this.options.maxSize) {
            const oldestKey = this.cache.keys().next().value;
            if (oldestKey === undefined) break;
            this._deleteInternal(oldestKey);
            this.stats.evictions++;
        }
        // 再按内存限制（0 表示无限制）
        if (this.options.maxMemory > 0) {
            while (this.stats.memoryUsage > this.options.maxMemory) {
                const oldestKey = this.cache.keys().next().value;
                if (oldestKey === undefined) break;
                this._deleteInternal(oldestKey);
                this.stats.evictions++;
            }
        }
    }

    // 估算内存使用量（简化版本）
    _estimateSize(key, value) {
        const keySize = typeof key === 'string' ? key.length * 2 : 8;
        let valueSize = 8; // 默认值

        if (typeof value === 'string') {
            valueSize = value.length * 2;
        } else if (typeof value === 'object' && value !== null) {
            try {
                valueSize = JSON.stringify(value).length * 2;
            } catch (e) {
                valueSize = 100; // 估算值
            }
        }

        return keySize + valueSize;
    }

    // 将通配符模式转换为安全正则（仅 * -> .*, 其他元字符转义）
    _patternToRegex(pattern = '*') {
        if (pattern === '*') return /.*/;
        const escaped = String(pattern).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const wildcarded = escaped.replace(/\\\*/g, '.*');
        return new RegExp(`^${wildcarded}$`);
    }
}

// 并发去重映射（缓存键 -> 正在进行的 Promise）
const __inflight = new Map();

module.exports = class CacheFactory {
    /**
     * 创建默认缓存实例
     * @param {Object} options - 缓存配置选项
     * @returns {Cache} 默认内存缓存实例
     */
    static createDefault(options = {}) {
        return new Cache(options);
    }

    /**
     * 验证缓存实例是否有效
     * @param {Object} cache - 缓存实例
     * @returns {boolean} 是否有效
     */
    static isValidCache(cache) {
        if (!cache || typeof cache !== 'object') {
            return false;
        }
        // 统一缓存接口要求的方法集合（确保行为一致）
        const requiredMethods = [
            'get', 'set', 'del', 'exists',
            'getMany', 'setMany', 'delMany',
            'delPattern', 'clear', 'keys'
        ];
        return requiredMethods.every(method => typeof cache[method] === 'function');
    }

    /**
     * 获取缓存实例，如果没有提供或无效则使用默认缓存
     * @param {Object} cache - 用户提供的缓存实例
     * @param {Object} options - 缓存配置选项
     * @returns {Object} 有效的缓存实例
     */
    static getOrCreateCache(cache, options = {}) {
        // 已是标准缓存实例（内存缓存接口）
        if (this.isValidCache(cache)) {
            return cache;
        }
        // 若传入的是配置对象，支持 multiLevel
        if (cache && typeof cache === 'object' && !Array.isArray(cache)) {
            try {
                if (cache.multiLevel) {
                    const MultiLevelCache = require('./multi-level-cache');
                    const local = this.createDefault({ ...options, ...(cache.local || {}) });
                    const remote = cache.remote && this.isValidCache(cache.remote)
                        ? cache.remote
                        : (cache.remote && typeof cache.remote === 'object' && !Array.isArray(cache.remote)
                            ? this.createDefault(cache.remote) // 简化：默认用内存实现代替远端；用户可注入真正远端实现
                            : undefined);
                    return new MultiLevelCache({
                        local,
                        remote,
                        policy: cache.policy || {},
                        remoteTimeoutMs: cache.remote?.timeoutMs || 50,
                        publish: cache.publish,
                    });
                }
            } catch (_) {
                // 忽略 multi-level 构建失败，回退为默认内存缓存
            }
            return this.createDefault({ ...options, ...cache });
        }
        // 未提供或不识别 -> 使用默认内存缓存
        return this.createDefault(options);
    }

    /**
     * 稳定序列化：确保相同结构对象序列化一致（用于缓存键）
     * - 对象键按字母排序
     * - 数组保序
     * - RegExp 转为 /pattern/flags 字符串
     */
    static stableStringify(value) {
        // 惰性加载 bson 以避免在非 Mongo 场景下的硬依赖
        let BSON;
        try { BSON = require('bson'); } catch (_) { BSON = null; }
        const isNaNNumber = (x) => typeof x === 'number' && Number.isNaN(x);
        const seen = new WeakSet();
        function stringify(v) {
            // 基本不可序列化类型处理
            if (typeof v === 'function' || typeof v === 'symbol') {
                return JSON.stringify('[UNSUPPORTED]');
            }
            if (isNaNNumber(v)) {
                return JSON.stringify('NaN');
            }
            if (v instanceof RegExp) {
                return JSON.stringify(v.toString()); // "/pattern/flags"
            }
            if (v instanceof Date) {
                return JSON.stringify(v.toISOString());
            }
            // BSON 常见类型支持
            if (BSON && v && typeof v === 'object' && v._bsontype) {
                try {
                    switch (v._bsontype) {
                        case 'ObjectId':
                            return JSON.stringify(`ObjectId(${v.toHexString()})`);
                        case 'Decimal128':
                            return JSON.stringify(`Decimal128(${v.toString()})`);
                        case 'Long':
                            return JSON.stringify(`Long(${v.toString()})`);
                        case 'UUID':
                            return JSON.stringify(`UUID(${v.toString()})`);
                        case 'Binary':
                            return JSON.stringify(`Binary(${v.sub_type},${Buffer.from(v.buffer).toString('hex')})`);
                        default:
                            // 其他 BSON 类型退化为其 toString 表达
                            return JSON.stringify(`${v._bsontype}(${String(v)})`);
                    }
                } catch (_) {
                    // 兜底
                    return JSON.stringify(`[BSON:${v._bsontype}]`);
                }
            }
            if (v === null || typeof v !== 'object') {
                return JSON.stringify(v);
            }
            if (Array.isArray(v)) {
                return '[' + v.map(x => stringify(x)).join(',') + ']';
            }
            if (seen.has(v)) {
                return JSON.stringify('[CIRCULAR]');
            }
            seen.add(v);
            const keys = Object.keys(v).sort();
            const out = '{' + keys.map(k => JSON.stringify(k) + ':' + stringify(v[k])).join(',') + '}';
            seen.delete(v);
            return out;
        }
        return stringify(value);
    }

    /**
     * 构造按 {iid, type, db, collection} 命名空间的通配前缀，便于批量失效
     * 仅用于内置 keys()/delPattern() 的简单匹配
     */
    static buildNamespacePattern({ iid, type, db, collection }) {
        const nsObj = { p: 'monSQLize', v: 1, iid, type, db, collection };
        // 匹配键字符串中稳定的 "ns":{...} 片段，前后加通配 *
        const nsStr = '"ns":' + this.stableStringify(nsObj);
        return `*${nsStr}*`;
    }

    /**
     * 构造按 {iid,type,db,collection} 且指定 op 的模式，便于只失效某操作
     */
    static buildNamespaceOpPattern({ iid, type, db, collection }, op) {
        const nsObj = { p: 'monSQLize', v: 1, iid, type, db, collection };
        const nsStr = '"ns":' + this.stableStringify(nsObj);
        const opStr = op ? `,"op":${JSON.stringify(op)}` : '';
        // 注意 buildCacheKey 的键顺序为 ns -> op -> base，因此这里匹配 ns 后立刻跟 op
        return `*${nsStr}${opStr}*`;
    }

    /**
     * 构建缓存键对象的统一外壳（便于命名空间与版本升级）
     * 传入 base（核心区分字段）与可选 extra。
     */
    /**
     * 规范化对象中的 ObjectId 为字符串
     * 用于确保缓存键的一致性，避免 ObjectId 实例与字符串不匹配
     * @param {*} obj - 待规范化的对象
     * @returns {*} 规范化后的对象
     * @private
     */
    static _normalizeObjectIds(obj) {
        if (!obj || typeof obj !== 'object') {
            return obj;
        }

        // 处理 ObjectId 实例
        try {
            const { ObjectId } = require('mongodb');
            if (obj instanceof ObjectId) {
                return obj.toString();
            }
        } catch (err) {
            // mongodb 包未安装或不可用，跳过
        }

        // 处理数组
        if (Array.isArray(obj)) {
            return obj.map(item => this._normalizeObjectIds(item));
        }

        // 处理普通对象
        const normalized = {};
        for (const [key, value] of Object.entries(obj)) {
            normalized[key] = this._normalizeObjectIds(value);
        }
        return normalized;
    }

    static buildCacheKey({ iid, type, db, collection, op, base = {} }) {
        // 🆕 v1.1.6: 规范化 base 中的 ObjectId 为字符串
        // 确保缓存键一致性，使精准失效能够正确匹配
        const normalizedBase = this._normalizeObjectIds(base);

        return {
            ns: { p: 'monSQLize', v: 1, iid, type, db, collection },
            op,
            ...normalizedBase,
        };
    }

    /**
     * 读穿缓存：
     * - ttl<=0 或未提供 cache 时直接执行 fetcher
     * - 优先查缓存；允许缓存 null（仅将 undefined 视为未命中）
     * - 并发去重：相同 key 的并发共享同一 Promise
     * @param {Object} cache - 缓存实例
     * @param {number} ttlMs - 过期毫秒
     * @param {Object} keyObj - 将用于生成缓存键的对象
     * @param {Function} fetcher - 未命中时的拉取函数，返回 Promise
     */
    static async readThrough(cache, ttlMs, keyObj, fetcher) {
        const ttl = Number(ttlMs || 0);
        if (!cache || ttl <= 0) {
            return await fetcher();
        }
        const key = this.stableStringify(keyObj);

        const cached = await cache.get(key);
        if (cached !== undefined) return cached;

        if (__inflight.has(key)) {
            try { return await __inflight.get(key); } catch (_) { /* 上次失败时继续 */ }
        }
        const p = (async () => {
            const fresh = await fetcher();
            try { await cache.set(key, fresh, ttl); } catch (_) { /* 忽略缓存写失败 */ }
            return fresh;
        })();
        __inflight.set(key, p);
        try {
            return await p;
        } finally {
            __inflight.delete(key);
        }
    }

    /**
     * 生成绑定上下文的读缓存助手
     * @param {Object} cache - 缓存实例
     * @param {{iid?:string, type:string, db:string, collection:string}} ctx - 键上下文
     * @returns {(op:string, base:Object, fetcher:Function)=>Promise<any>}
     */
    static createCachedReader(cache, ctx) {
        return (op, base = {}, fetcher) => {
            // 检查是否在事务中
            const inTransaction = base.session && base.session.__monSQLizeTransaction;

            // 事务内默认不缓存（除非显式指定 cache）
            let ttl = 0;
            if (inTransaction) {
                // 事务中：只有显式设置 cache 才启用缓存
                ttl = (base.cache !== undefined && base.cache !== null) ? Number(base.cache) : 0;
            } else {
                // 非事务：正常处理 cache 参数
                ttl = base.cache ? Number(base.cache) : 0;
            }

            // 使用浅拷贝构建用于键的对象，避免修改调用方入参
            const { cache: _cacheTTL, maxTimeMS: _maxTimeMS, session: _session, ...keyBase } = base || {};
            const key = this.buildCacheKey({ ...ctx, op, base: keyBase });
            return this.readThrough(cache, ttl, key, fetcher);
        };
    }
};
