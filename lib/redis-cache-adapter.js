/**
 * Redis 缓存适配器：将 Redis 封装为 CacheLike 接口
 * 支持直接传入 Redis URL 字符串或 ioredis 实例
 *
 * @example
 * const { createRedisCacheAdapter } = require('monsqlize/lib/redis-cache-adapter');
 *
 * // 方式 1：传入 URL 字符串（推荐）
 * const cache = createRedisCacheAdapter('redis://localhost:6379/0');
 *
 * // 方式 2：传入 ioredis 实例
 * const Redis = require('ioredis');
 * const redis = new Redis('redis://localhost:6379/0');
 * const cache = createRedisCacheAdapter(redis);
 */

/**
 * 创建 Redis 缓存适配器
 * @param {string|Object} redisUrlOrInstance - Redis URL 字符串或 ioredis 实例
 * @returns {Object} 实现了 CacheLike 接口的缓存对象
 */
function createRedisCacheAdapter(redisUrlOrInstance) {
    let redis;
    let shouldCloseOnDestroy = false;

    // 如果传入的是字符串，自动创建 Redis 实例
    if (typeof redisUrlOrInstance === 'string') {
        try {
            const IORedis = require('ioredis');
            redis = new IORedis(redisUrlOrInstance);
            shouldCloseOnDestroy = true;
        } catch (error) {
            throw new Error(
                'ioredis 未安装。请运行: npm install ioredis\n' +
                '或传入已创建的 ioredis 实例'
            );
        }
    } else if (redisUrlOrInstance && typeof redisUrlOrInstance === 'object') {
        // 传入的是 ioredis 实例
        redis = redisUrlOrInstance;
        shouldCloseOnDestroy = false;
    } else {
        throw new Error('redisUrlOrInstance 必须是 Redis URL 字符串或 ioredis 实例');
    }

    // 实现 CacheLike 接口的 10 个方法
    return {
        /**
         * 获取单个缓存值
         * @param {string} key
         * @returns {Promise<any>}
         */
        async get(key) {
            try {
                const val = await redis.get(key);
                return val ? JSON.parse(val) : undefined;
            } catch (error) {
                // 解析失败返回 undefined
                return undefined;
            }
        },

        /**
         * 设置单个缓存值
         * @param {string} key
         * @param {any} val
         * @param {number} ttl - TTL（毫秒）
         * @returns {Promise<void>}
         */
        async set(key, val, ttl = 0) {
            const str = JSON.stringify(val);
            if (ttl > 0) {
                await redis.psetex(key, ttl, str);
            } else {
                await redis.set(key, str);
            }
        },

        /**
         * 删除单个缓存项
         * @param {string} key
         * @returns {Promise<boolean>}
         */
        async del(key) {
            const result = await redis.del(key);
            return result > 0;
        },

        /**
         * 检查键是否存在
         * @param {string} key
         * @returns {Promise<boolean>}
         */
        async exists(key) {
            const result = await redis.exists(key);
            return result > 0;
        },

        /**
         * 批量获取
         * @param {string[]} keys
         * @returns {Promise<Object>}
         */
        async getMany(keys) {
            if (!keys || keys.length === 0) return {};

            const values = await redis.mget(keys);
            const result = {};

            keys.forEach((key, i) => {
                if (values[i]) {
                    try {
                        result[key] = JSON.parse(values[i]);
                    } catch {
                        // 解析失败跳过
                    }
                }
            });

            return result;
        },

        /**
         * 批量设置
         * @param {Object} obj - 键值对对象
         * @param {number} ttl - TTL（毫秒）
         * @returns {Promise<boolean>}
         */
        async setMany(obj, ttl = 0) {
            if (!obj || Object.keys(obj).length === 0) return true;

            const pipeline = redis.pipeline();

            for (const [key, val] of Object.entries(obj)) {
                const str = JSON.stringify(val);
                if (ttl > 0) {
                    pipeline.psetex(key, ttl, str);
                } else {
                    pipeline.set(key, str);
                }
            }

            await pipeline.exec();
            return true;
        },

        /**
         * 批量删除
         * @param {string[]} keys
         * @returns {Promise<number>}
         */
        async delMany(keys) {
            if (!keys || keys.length === 0) return 0;
            return await redis.del(...keys);
        },

        /**
         * 按模式删除（支持通配符 *）
         * @param {string} pattern
         * @returns {Promise<number>}
         */
        async delPattern(pattern) {
            // 使用 SCAN 避免阻塞（生产环境推荐）
            let cursor = '0';
            let deletedCount = 0;

            do {
                const [nextCursor, keys] = await redis.scan(
                    cursor,
                    'MATCH', pattern,
                    'COUNT', 100
                );
                cursor = nextCursor;

                if (keys.length > 0) {
                    deletedCount += await redis.del(...keys);
                }
            } while (cursor !== '0');

            return deletedCount;
        },

        /**
         * 清空所有缓存（谨慎使用）
         * @returns {Promise<void>}
         */
        async clear() {
            await redis.flushdb();
        },

        /**
         * 获取所有键（可选模式匹配）
         * @param {string} pattern
         * @returns {Promise<string[]>}
         */
        async keys(pattern = '*') {
            // 使用 SCAN 避免阻塞
            const allKeys = [];
            let cursor = '0';

            do {
                const [nextCursor, keys] = await redis.scan(
                    cursor,
                    'MATCH', pattern,
                    'COUNT', 100
                );
                cursor = nextCursor;
                allKeys.push(...keys);
            } while (cursor !== '0');

            return allKeys;
        },

        /**
         * 关闭 Redis 连接（仅当自动创建时才会关闭）
         * @returns {Promise<void>}
         */
        async close() {
            if (shouldCloseOnDestroy && redis) {
                try {
                    await redis.quit();
                } catch {
                    // 忽略关闭错误
                }
            }
        },

        /**
         * 获取底层 Redis 实例（用于高级操作）
         */
        getRedisInstance() {
            return redis;
        }
    };
}

module.exports = { createRedisCacheAdapter };

