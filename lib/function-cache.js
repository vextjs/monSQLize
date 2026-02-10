/**
 * 通用函数缓存装饰器
 *
 * 🆕 v1.1.4: 新增函数缓存功能
 * - 缓存任意异步函数的返回结果
 * - 支持 TTL 过期
 * - 支持自定义键生成
 * - 支持命名空间隔离
 * - 复用 monSQLize 缓存基础设施
 *
 * @module lib/function-cache
 */

const CacheFactory = require('./cache');
const crypto = require('crypto');

// 并发去重映射（防止缓存击穿）
// 使用 Map 存储正在执行的 Promise，带超时清理机制防止内存泄漏
const __inflightFunctions = new Map();

// 缓存未命中的特殊标记（使用 Symbol 确保唯一性）
const CACHE_MISS = Symbol('CACHE_MISS');

// 并发请求清理超时时间（毫秒）
const INFLIGHT_CLEANUP_TIMEOUT_MS = 300000; // 5分钟

// 🔧 v1.1.5: 全局 Map 大小限制和监控
const MAX_INFLIGHT_SIZE = 10000;

// 定期监控和清理机制
const monitorInterval = setInterval(() => {
    const currentSize = __inflightFunctions.size;

    if (currentSize > MAX_INFLIGHT_SIZE) {
        console.warn(`[FunctionCache] InflightMap size exceeded: ${currentSize}/${MAX_INFLIGHT_SIZE}`);

        // 清理最旧的 10% 条目
        const toDelete = Math.floor(currentSize * 0.1);
        let count = 0;
        for (const key of __inflightFunctions.keys()) {
            if (count++ >= toDelete) break;
            __inflightFunctions.delete(key);
        }

        console.warn(`[FunctionCache] Cleaned ${toDelete} entries, new size: ${__inflightFunctions.size}`);
    }
}, 60000); // 每分钟检查一次

// 防止阻止进程退出
monitorInterval.unref();

// 缓存键最大长度（字节）
const MAX_CACHE_KEY_LENGTH = 1024;

/**
 * 基础装饰器：为函数添加缓存能力
 *
 * @param {Function} fn - 要缓存的异步函数
 * @param {Object} options - 缓存配置
 * @param {number} [options.ttl=60000] - 缓存时间（毫秒）
 * @param {Function} [options.keyBuilder] - 自定义键生成函数
 * @param {Object} [options.cache] - 缓存实例（可选）
 * @param {string} [options.namespace='fn'] - 命名空间
 * @param {Function} [options.condition] - 条件缓存函数
 * @param {boolean} [options.enableStats=true] - 启用统计
 * @returns {Function} 包装后的函数
 *
 * @example
 * // 基础用法
 * const cachedFn = withCache(originalFn, { ttl: 60000 });
 * const result = await cachedFn('arg1', 'arg2');
 *
 * // 自定义键生成
 * const cachedFn = withCache(originalFn, {
 *   ttl: 300000,
 *   keyBuilder: (userId) => `user:${userId}`
 * });
 *
 * // 条件缓存（只缓存非空结果）
 * const cachedFn = withCache(originalFn, {
 *   ttl: 60000,
 *   condition: (result) => result && result.length > 0
 * });
 */
function withCache(fn, options = {}) {
    const {
        ttl = 60000,
        keyBuilder,
        cache,
        namespace = 'fn',
        condition,
        enableStats = true
    } = options;

    // 参数验证
    if (typeof fn !== 'function') {
        throw new Error('fn must be a function');
    }
    if (ttl !== undefined && (typeof ttl !== 'number' || ttl < 0)) {
        throw new Error('ttl must be a non-negative number');
    }
    if (keyBuilder !== undefined && typeof keyBuilder !== 'function') {
        throw new Error('keyBuilder must be a function');
    }
    if (condition !== undefined && typeof condition !== 'function') {
        throw new Error('condition must be a function');
    }

    // 使用全局缓存或自定义缓存
    const cacheInstance = cache || CacheFactory.createDefault();

    // 验证缓存实例
    if (!CacheFactory.isValidCache(cacheInstance)) {
        throw new Error('Invalid cache instance: must implement CacheLike interface');
    }

    // 统计信息
    // 注意：在极高并发场景下，统计可能不完全准确（这是性能与精确度的权衡）
    const stats = {
        hits: 0,
        misses: 0,
        errors: 0,
        totalTime: 0,
        calls: 0
    };

    // 返回包装后的函数
    const wrappedFn = async function(...args) {
        // 1. 生成缓存键
        let cacheKey;
        try {
            const baseKey = keyBuilder
                ? `${namespace}:${keyBuilder(...args)}`
                : `${namespace}:${fn.name}:${CacheFactory.stableStringify(args)}`;

            // 🔧 v1.1.5: 限制缓存键大小
            if (baseKey.length > MAX_CACHE_KEY_LENGTH) {
                const hash = crypto.createHash('sha256').update(baseKey).digest('hex');
                cacheKey = `${namespace}:${fn.name}:hash:${hash}`;
            } else {
                cacheKey = baseKey;
            }
        } catch (err) {
            // 键生成失败，直接执行原函数
            if (enableStats) stats.errors++;
            return await fn.apply(this, args);
        }

        // 2. 尝试从缓存读取
        const startTime = Date.now();
        let cached = CACHE_MISS;
        try {
            // 优化：使用特殊标记来区分"缓存未命中"和"缓存值是 undefined"
            const value = await cacheInstance.get(cacheKey);

            // 如果缓存返回 undefined，需要确认是否真的不存在
            if (value === undefined) {
                // 只在返回 undefined 时才调用 exists 检查
                const exists = await cacheInstance.exists(cacheKey);
                if (exists) {
                    cached = undefined; // 缓存的值就是 undefined
                }
                // 如果 exists 返回 false，cached 保持 CACHE_MISS
            } else {
                // 非 undefined 值，直接使用
                cached = value;
            }
        } catch (err) {
            if (enableStats) stats.errors++;
            // 🔧 v1.1.5: 添加错误日志
            console.warn('[FunctionCache] Cache get failed:', {
                key: cacheKey.substring(0, 100), // 截断避免日志过长
                error: err.message
            });
        }

        if (cached !== CACHE_MISS) {
            if (enableStats) {
                stats.hits++;
                stats.calls++;
                stats.totalTime += Date.now() - startTime;
            }
            return cached;
        }

        // 3. 并发控制（防止缓存击穿）
        if (__inflightFunctions.has(cacheKey)) {
            try {
                const result = await __inflightFunctions.get(cacheKey);
                if (enableStats) {
                    stats.hits++;
                    stats.calls++;
                }
                return result;
            } catch (err) {
                // 并发请求失败，继续执行
            }
        }

        // 4. 执行原函数
        const promise = (async () => {
            try {
                const result = await fn.apply(this, args);

                // 5. 条件缓存
                let shouldCache = true;
                if (condition) {
                    try {
                        shouldCache = condition(result);
                    } catch (err) {
                        // 条件函数失败，默认缓存
                        if (enableStats) stats.errors++;
                        shouldCache = true;
                    }
                }

                if (shouldCache) {
                    try {
                        await cacheInstance.set(cacheKey, result, ttl);
                    } catch (err) {
                        if (enableStats) stats.errors++;
                        // 🔧 v1.1.5: 添加错误日志
                        console.warn('[FunctionCache] Cache set failed:', {
                            key: cacheKey.substring(0, 100),
                            error: err.message
                        });
                    }
                }

                return result;
            } finally {
                __inflightFunctions.delete(cacheKey);
            }
        })();

        __inflightFunctions.set(cacheKey, promise);

        // 🔧 v1.1.4-hotfix: 超时清理机制防止内存泄漏
        // 如果 Promise 长时间未完成，自动清理
        const cleanupTimeout = setTimeout(() => {
            __inflightFunctions.delete(cacheKey);
        }, INFLIGHT_CLEANUP_TIMEOUT_MS);

        // Promise 完成后清除定时器
        promise.finally(() => {
            clearTimeout(cleanupTimeout);
        });

        try {
            const result = await promise;
            if (enableStats) {
                stats.misses++;
                stats.calls++;
                stats.totalTime += Date.now() - startTime;
            }
            return result;
        } catch (err) {
            if (enableStats) {
                stats.errors++;
                stats.calls++;
            }
            throw err;
        }
    };

    // 挂载统计方法
    wrappedFn.getCacheStats = () => ({
        ...stats,
        hitRate: stats.hits / (stats.hits + stats.misses) || 0,
        avgTime: stats.totalTime / stats.calls || 0
    });

    return wrappedFn;
}

/**
 * 函数缓存管理类
 *
 * @class FunctionCache
 *
 * @example
 * const fnCache = new FunctionCache(msq);
 *
 * // 注册函数
 * fnCache.register('getUserProfile', getUserProfileFn, { ttl: 300000 });
 *
 * // 执行函数
 * const profile = await fnCache.execute('getUserProfile', 'user123');
 *
 * // 失效缓存
 * await fnCache.invalidate('getUserProfile', 'user123');
 *
 * // 查看统计
 * const stats = fnCache.getStats('getUserProfile');
 */
class FunctionCache {
    /**
     * 构造函数
     * @param {Object} msq - MonSQLize 实例（可选）
     * @param {Object} options - 配置选项
     * @param {string} [options.namespace='action'] - 命名空间
     * @param {number} [options.defaultTTL=60000] - 默认 TTL（毫秒）
     * @param {boolean} [options.enableStats=true] - 启用统计
     */
    constructor(msq, options = {}) {
        // 参数验证
        if (options && typeof options !== 'object') {
            throw new Error('options must be an object');
        }

        this.cache = msq ? msq.getCache() : CacheFactory.createDefault();

        // 验证缓存实例
        if (!CacheFactory.isValidCache(this.cache)) {
            throw new Error('Invalid cache instance from MonSQLize');
        }

        this.functions = new Map();
        this.stats = new Map();
        this.options = {
            namespace: options.namespace || 'action',
            defaultTTL: options.defaultTTL || 60000,
            enableStats: options.enableStats !== false
        };

        // 参数验证
        if (typeof this.options.namespace !== 'string') {
            throw new Error('namespace must be a string');
        }
        if (typeof this.options.defaultTTL !== 'number' || this.options.defaultTTL < 0) {
            throw new Error('defaultTTL must be a non-negative number');
        }
    }

    /**
     * 注册函数
     * @param {string} name - 函数名称
     * @param {Function} fn - 函数实现
     * @param {Object} options - 缓存配置
     * @param {number} [options.ttl] - 缓存过期时间（毫秒）
     * @param {Function} [options.keyBuilder] - 自定义键生成函数
     * @param {Function} [options.condition] - 条件缓存函数
     */
    async register(name, fn, options = {}) {
        if (!name || typeof name !== 'string') {
            throw new Error('Function name must be a non-empty string');
        }
        if (typeof fn !== 'function') {
            throw new Error('fn must be a function');
        }
        if (options && typeof options !== 'object') {
            throw new Error('options must be an object');
        }

        const cachedFn = withCache(fn, {
            ...options,
            cache: this.cache,
            namespace: `${this.options.namespace}:${name}`,
            ttl: options.ttl !== undefined ? options.ttl : this.options.defaultTTL
        });

        this.functions.set(name, cachedFn);

        if (this.options.enableStats) {
            this.stats.set(name, {
                hits: 0,
                misses: 0,
                errors: 0,
                calls: 0,
                totalTime: 0
            });
        }
    }


    /**
     * 执行函数
     * @param {string} name - 函数名称
     * @param {...any} args - 函数参数
     * @returns {Promise<any>}
     */
    async execute(name, ...args) {
        const fn = this.functions.get(name);
        if (!fn) {
            throw new Error(`Function '${name}' not registered`);
        }

        const startTime = Date.now();
        try {
            const result = await fn(...args);

            if (this.options.enableStats) {
                const stats = this.stats.get(name);
                if (stats) {
                    stats.calls++;
                    stats.totalTime += Date.now() - startTime;
                }
            }

            return result;
        } catch (err) {
            if (this.options.enableStats) {
                const stats = this.stats.get(name);
                if (stats) {
                    stats.errors++;
                    stats.calls++;
                }
            }
            throw err;
        }
    }

    /**
     * 失效缓存
     * @param {string} name - 函数名称
     * @param {...any} args - 函数参数
     */
    async invalidate(name, ...args) {
        if (!name || typeof name !== 'string') {
            throw new Error('Function name must be a non-empty string');
        }

        const fn = this.functions.get(name);
        if (!fn) {
            throw new Error(`Function '${name}' not registered`);
        }

        // 获取原始函数（从缓存的函数中提取）
        const originalFn = fn;

        // 缓存键格式：${namespace}:${name}:${fnName}:${args}
        // 但是因为我们在 register 时已经将 name 加入 namespace，
        // withCache 会再拼接 fn.name，所以这里需要使用正确的完整键
        // 实际键格式：${this.options.namespace}:${name}:${fn.name}:${args}

        // 构建通配符模式来删除所有匹配的缓存
        const pattern = `${this.options.namespace}:${name}:*${CacheFactory.stableStringify(args)}*`;
        await this.cache.delPattern(pattern);
    }

    /**
     * 批量失效缓存
     * @param {string} pattern - 失效模式（支持通配符 *）
     * @returns {Promise<number>} 删除的缓存条目数
     */
    async invalidatePattern(pattern) {
        if (!pattern || typeof pattern !== 'string') {
            throw new Error('Pattern must be a non-empty string');
        }

        const fullPattern = `${this.options.namespace}:${pattern}`;
        return await this.cache.delPattern(fullPattern);
    }

    /**
     * 获取统计信息
     * @param {string} [name] - 函数名称（可选）
     * @returns {Object|null}
     */
    getStats(name) {
        if (name) {
            const stats = this.stats.get(name);
            if (!stats) return null;
            return {
                ...stats,
                hitRate: stats.hits / (stats.hits + stats.misses) || 0,
                avgTime: stats.totalTime / stats.calls || 0
            };
        }

        const allStats = {};
        for (const [fnName, stats] of this.stats.entries()) {
            allStats[fnName] = {
                ...stats,
                hitRate: stats.hits / (stats.hits + stats.misses) || 0,
                avgTime: stats.totalTime / stats.calls || 0
            };
        }
        return allStats;
    }

    /**
     * 列出所有已注册的函数
     * @returns {string[]}
     */
    list() {
        return Array.from(this.functions.keys());
    }

    /**
     * 重置统计信息
     * @param {string} [name] - 函数名称（可选）
     */
    resetStats(name) {
        if (name) {
            const stats = this.stats.get(name);
            if (stats) {
                Object.assign(stats, {
                    hits: 0,
                    misses: 0,
                    errors: 0,
                    calls: 0,
                    totalTime: 0
                });
            }
        } else {
            for (const stats of this.stats.values()) {
                Object.assign(stats, {
                    hits: 0,
                    misses: 0,
                    errors: 0,
                    calls: 0,
                    totalTime: 0
                });
            }
        }
    }

    /**
     * 清空所有已注册的函数
     */
    clear() {
        this.functions.clear();
        this.stats.clear();
    }
}

module.exports = {
    withCache,
    FunctionCache
};

