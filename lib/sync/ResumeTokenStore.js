/**
 * ResumeTokenStore - Resume Token 持久化存储
 *
 * 负责保存和加载 Change Stream Resume Token
 * 支持文件和 Redis 两种存储方式
 *
 * @module lib/sync/ResumeTokenStore
 * @since v1.0.8
 */

const fs = require('fs').promises;
const path = require('path');

/**
 * Resume Token 存储器
 */
class ResumeTokenStore {
    /**
     * 构造函数
     *
     * @param {Object} options - 配置选项
     * @param {string} options.storage - 存储类型 ('file' | 'redis')
     * @param {string} [options.path] - 文件路径（文件模式）
     * @param {Object} [options.redis] - Redis 实例（Redis 模式）
     * @param {Object} [options.logger] - 日志记录器
     */
    constructor(options = {}) {
        this.storage = options.storage || 'file';
        this.path = options.path || './.sync-resume-token';
        this.redis = options.redis;
        this.logger = options.logger || console;

        // Redis Key
        this.redisKey = 'monsqlize:sync:resume-token';
    }

    /**
     * 加载 Resume Token
     *
     * @returns {Promise<Object|null>} Resume Token 对象或 null
     */
    async load() {
        try {
            if (this.storage === 'redis' && this.redis) {
                return await this._loadFromRedis();
            } else {
                return await this._loadFromFile();
            }
        } catch (error) {
            this.logger.warn('[ResumeTokenStore] 加载 Token 失败', {
                storage: this.storage,
                error: error.message
            });
            return null;
        }
    }

    /**
     * 保存 Resume Token
     *
     * @param {Object} token - Resume Token 对象
     * @returns {Promise<void>}
     */
    async save(token) {
        try {
            if (this.storage === 'redis' && this.redis) {
                await this._saveToRedis(token);
            } else {
                await this._saveToFile(token);
            }
        } catch (error) {
            this.logger.error('[ResumeTokenStore] 保存 Token 失败', {
                storage: this.storage,
                error: error.message
            });
            // 不抛出错误，避免影响同步流程
        }
    }

    /**
     * 从文件加载
     *
     * @private
     * @returns {Promise<Object|null>}
     */
    async _loadFromFile() {
        try {
            const data = await fs.readFile(this.path, 'utf8');
            const token = JSON.parse(data);

            this.logger.debug('[ResumeTokenStore] 从文件加载 Token', {
                path: this.path
            });

            return token;
        } catch (error) {
            if (error.code === 'ENOENT') {
                // 文件不存在，返回 null
                this.logger.debug('[ResumeTokenStore] Token 文件不存在', {
                    path: this.path
                });
                return null;
            }
            throw error;
        }
    }

    /**
     * 保存到文件
     *
     * @private
     * @param {Object} token - Resume Token
     * @returns {Promise<void>}
     */
    async _saveToFile(token) {
        // 确保目录存在
        const dir = path.dirname(this.path);
        await fs.mkdir(dir, { recursive: true });

        // 写入文件
        await fs.writeFile(this.path, JSON.stringify(token, null, 2), 'utf8');

        this.logger.debug('[ResumeTokenStore] Token 已保存到文件', {
            path: this.path
        });
    }

    /**
     * 从 Redis 加载
     *
     * @private
     * @returns {Promise<Object|null>}
     */
    async _loadFromRedis() {
        const data = await this.redis.get(this.redisKey);

        if (!data) {
            this.logger.debug('[ResumeTokenStore] Redis 中无 Token');
            return null;
        }

        const token = JSON.parse(data);

        this.logger.debug('[ResumeTokenStore] 从 Redis 加载 Token', {
            key: this.redisKey
        });

        return token;
    }

    /**
     * 保存到 Redis
     *
     * @private
     * @param {Object} token - Resume Token
     * @returns {Promise<void>}
     */
    async _saveToRedis(token) {
        await this.redis.set(this.redisKey, JSON.stringify(token));

        this.logger.debug('[ResumeTokenStore] Token 已保存到 Redis', {
            key: this.redisKey
        });
    }

    /**
     * 清除 Resume Token
     *
     * @returns {Promise<void>}
     */
    async clear() {
        try {
            if (this.storage === 'redis' && this.redis) {
                await this.redis.del(this.redisKey);
                this.logger.info('[ResumeTokenStore] Redis Token 已清除');
            } else {
                await fs.unlink(this.path);
                this.logger.info('[ResumeTokenStore] 文件 Token 已清除');
            }
        } catch (error) {
            if (error.code !== 'ENOENT') {
                this.logger.warn('[ResumeTokenStore] 清除 Token 失败', {
                    error: error.message
                });
            }
        }
    }
}

module.exports = ResumeTokenStore;


