/**
 * 分布式缓存失效器
 * 基于 Redis Pub/Sub 实现跨实例的缓存失效通知
 *
 * @example
 * const invalidator = new DistributedCacheInvalidator({
 *   redisUrl: 'redis://localhost:6379',
 *   channel: 'monsqlize:cache:invalidate',
 *   cache: multiLevelCacheInstance
 * });
 *
 * // 广播失效消息
 * await invalidator.invalidate('user:*');
 */

class DistributedCacheInvalidator {
    /**
     * @param {Object} options
     * @param {string} [options.redisUrl] - Redis 连接 URL
     * @param {Object} [options.redis] - 已创建的 Redis 实例（与 redisUrl 二选一）
     * @param {string} [options.channel='monsqlize:cache:invalidate'] - Pub/Sub 频道
     * @param {string} [options.instanceId] - 实例 ID（自动生成）
     * @param {Object} options.cache - MultiLevelCache 实例
     * @param {Object} [options.logger] - 日志记录器
     */
    constructor(options = {}) {
        if (!options.cache) {
            throw new Error('DistributedCacheInvalidator requires a cache instance');
        }

        this.cache = options.cache;
        this.logger = options.logger;
        this.channel = options.channel || 'monsqlize:cache:invalidate';
        this.instanceId = options.instanceId || `instance-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

        // 初始化 Redis 连接
        this._initRedis(options);

        // 设置订阅
        this._setupSubscription();

        // 统计信息
        this.stats = {
            messagesSent: 0,
            messagesReceived: 0,
            invalidationsTriggered: 0,
            errors: 0
        };
    }

    /**
     * 初始化 Redis 连接
     * @private
     */
    _initRedis(options) {
        try {
            const Redis = require('ioredis');

            if (options.redis) {
                // 使用已有的 Redis 实例
                this.pub = options.redis;
                // 订阅需要单独的连接
                const redisConfig = options.redis.options || {};
                this.sub = new Redis({
                    ...redisConfig,
                    host: redisConfig.host || 'localhost',
                    port: redisConfig.port || 6379
                });
                this._ownsConnections = false;
            } else if (options.redisUrl) {
                // 创建新的 Redis 连接
                this.pub = new Redis(options.redisUrl);
                this.sub = new Redis(options.redisUrl);
                this._ownsConnections = true;
            } else {
                // 默认本地连接
                this.pub = new Redis('redis://localhost:6379');
                this.sub = new Redis('redis://localhost:6379');
                this._ownsConnections = true;
            }

            // 错误处理
            this.pub.on('error', (err) => {
                this.stats.errors++;
                if (this.logger) {
                    this.logger.error('[DistributedCacheInvalidator] Redis pub error:', err.message);
                }
            });

            this.sub.on('error', (err) => {
                this.stats.errors++;
                if (this.logger) {
                    this.logger.error('[DistributedCacheInvalidator] Redis sub error:', err.message);
                }
            });
        } catch (error) {
            throw new Error(
                'Failed to initialize Redis for DistributedCacheInvalidator. ' +
                'Please ensure ioredis is installed: npm install ioredis'
            );
        }
    }

    /**
     * 设置订阅处理
     * @private
     */
    _setupSubscription() {
        this.sub.subscribe(this.channel, (err) => {
            if (err) {
                this.stats.errors++;
                if (this.logger) {
                    this.logger.error('[DistributedCacheInvalidator] Subscribe error:', err.message);
                }
            } else {
                if (this.logger) {
                    this.logger.info(`[DistributedCacheInvalidator] Subscribed to channel: ${this.channel}`);
                }
            }
        });

        this.sub.on('message', (channel, message) => {
            if (channel !== this.channel) return;

            this.stats.messagesReceived++;

            try {
                const data = JSON.parse(message);

                // 忽略自己发送的消息（避免重复失效）
                if (data.instanceId === this.instanceId) {
                    return;
                }

                // 处理失效消息
                if (data.type === 'invalidate' && data.pattern) {
                    this._handleInvalidation(data.pattern);
                }
            } catch (error) {
                this.stats.errors++;
                if (this.logger) {
                    this.logger.error('[DistributedCacheInvalidator] Message parse error:', error.message);
                }
            }
        });
    }

    /**
     * 处理缓存失效
     * @private
     */
    async _handleInvalidation(pattern) {
        try {
            if (this.logger) {
                this.logger.debug(`[DistributedCacheInvalidator] Handling invalidation, pattern: ${pattern}`);
            }

            let deleted = 0;

            // 1. 失效本地缓存
            if (this.cache.local && typeof this.cache.local.delPattern === 'function') {
                deleted = await this.cache.local.delPattern(pattern);
                if (this.logger) {
                    this.logger.debug(`[DistributedCacheInvalidator] Invalidated local cache: ${pattern}, deleted: ${deleted} keys`);
                }
            }

            // 2. 失效远端缓存（Redis）
            if (this.cache.remote && typeof this.cache.remote.delPattern === 'function') {
                const remoteDeleted = await this.cache.remote.delPattern(pattern);
                deleted += remoteDeleted;
                if (this.logger) {
                    this.logger.debug(`[DistributedCacheInvalidator] Invalidated remote cache: ${pattern}, deleted: ${remoteDeleted} keys`);
                }
            }

            this.stats.invalidationsTriggered++;

            if (this.logger) {
                this.logger.info(`[DistributedCacheInvalidator] Total invalidated: ${pattern}, deleted: ${deleted} keys`);
            }
        } catch (error) {
            this.stats.errors++;
            if (this.logger) {
                this.logger.error('[DistributedCacheInvalidator] Invalidation error:', error.message);
            }
        }
    }

    /**
     * 广播缓存失效消息
     * @param {string} pattern - 缓存键模式（支持通配符 *）
     * @returns {Promise<void>}
     */
    async invalidate(pattern) {
        if (!pattern) return;

        const message = JSON.stringify({
            type: 'invalidate',
            pattern,
            instanceId: this.instanceId,
            timestamp: Date.now()
        });

        try {
            await this.pub.publish(this.channel, message);
            this.stats.messagesSent++;

            if (this.logger) {
                this.logger.debug(`[DistributedCacheInvalidator] Published invalidation: ${pattern}`);
            }
        } catch (error) {
            this.stats.errors++;
            if (this.logger) {
                this.logger.error('[DistributedCacheInvalidator] Publish error:', error.message);
            }
            throw error;
        }
    }

    /**
     * 获取统计信息
     * @returns {Object}
     */
    getStats() {
        return {
            ...this.stats,
            instanceId: this.instanceId,
            channel: this.channel
        };
    }

    /**
     * 关闭连接
     * @returns {Promise<void>}
     */
    async close() {
        try {
            // 取消订阅
            await this.sub.unsubscribe(this.channel);

            // 如果是自己创建的连接，才关闭
            if (this._ownsConnections) {
                await this.pub.quit();
                await this.sub.quit();
            }

            if (this.logger) {
                this.logger.info('[DistributedCacheInvalidator] Closed');
            }
        } catch (error) {
            if (this.logger) {
                this.logger.error('[DistributedCacheInvalidator] Close error:', error.message);
            }
        }
    }
}

module.exports = DistributedCacheInvalidator;

