/**
 * watch 查询模块 - MongoDB Change Streams 封装
 * @description 提供实时数据监听功能，支持自动重连、断点续传、智能缓存失效
 */

const { EventEmitter } = require('events');

/**
 * ChangeStream 包装类
 * 提供自动重连、resumeToken 管理、智能缓存失效等功能
 */
class ChangeStreamWrapper {
    /**
     * @param {Object} changeStream - MongoDB ChangeStream 实例
     * @param {Object} collection - MongoDB Collection 实例
     * @param {Array} pipeline - 聚合管道
     * @param {Object} options - 配置选项
     * @param {Object} context - 上下文对象
     */
    constructor(changeStream, collection, pipeline, options, context) {
        this._stream = changeStream;
        this._collection = collection;
        this._pipeline = pipeline;
        this._options = options;
        this._context = context;

        // 状态管理
        this._closed = false;
        this._reconnecting = false;
        this._reconnectAttempts = 0;
        this._lastResumeToken = null;

        // 统计信息
        this._stats = {
            totalChanges: 0,
            reconnectAttempts: 0,
            lastReconnectTime: null,
            startTime: Date.now(),
            cacheInvalidations: 0,
            errors: 0
        };

        // 事件发射器
        this._emitter = new EventEmitter();

        // 设置事件监听
        this._setupListeners();
    }

    /**
     * 设置 MongoDB ChangeStream 事件监听
     * @private
     */
    _setupListeners() {
        if (!this._stream) return;

        // 监听变更事件
        this._stream.on('change', (change) => {
            this._lastResumeToken = change._id;
            this._stats.totalChanges++;
            this._handleChange(change);
        });

        // 监听错误事件
        this._stream.on('error', (error) => {
            this._stats.errors++;
            this._handleError(error);
        });

        // 监听关闭事件
        this._stream.on('close', () => {
            if (!this._closed) {
                this._handleClose();
            }
        });

        // 监听结束事件
        this._stream.on('end', () => {
            if (!this._closed) {
                this._handleClose();
            }
        });
    }

    /**
     * 处理变更事件
     * @private
     */
    async _handleChange(change) {
        try {
            // 触发用户事件
            this._emitter.emit('change', change);

            // 自动缓存失效
            if (this._options.autoInvalidateCache !== false) {
                await this._invalidateCache(change);
            }
        } catch (error) {
            if (this._context.logger) {
                this._context.logger.error('[Watch] Error handling change:', error);
            }
        }
    }

    /**
     * 处理错误事件
     * @private
     */
    _handleError(error) {
        const errorType = this._classifyError(error);

        if (this._context.logger) {
            this._context.logger.warn(`[Watch] Error (${errorType}):`, error.message);
        }

        if (errorType === 'transient') {
            // 瞬态错误：自动重连，不触发用户事件
            this._reconnect();
        } else if (errorType === 'resumable') {
            // 持久性错误：清除 token，重新开始，触发用户事件
            this._lastResumeToken = null;
            this._reconnect();
            this._emitter.emit('error', error);
        } else {
            // 致命错误：触发 fatal 事件，然后停止监听
            this._emitter.emit('fatal', error);
            // 使用 setImmediate 确保 fatal 事件处理器先执行完成
            // 避免在事件处理器中访问已关闭的资源
            setImmediate(() => this.close());
        }
    }

    /**
     * 处理关闭事件
     * @private
     */
    _handleClose() {
        if (this._options.autoReconnect !== false && !this._closed) {
            // 自动重连
            this._reconnect();
        } else {
            this._emitter.emit('close');
        }
    }

    /**
     * 分类错误类型
     * @private
     * @param {Error} error - 错误对象
     * @returns {string} 'transient' | 'resumable' | 'fatal'
     */
    _classifyError(error) {
        const code = error.code;
        const message = error.message || '';

        // 瞬态错误（自动重试，不通知用户）
        if (code === 'ECONNRESET' ||
            code === 'ETIMEDOUT' ||
            code === 'EPIPE' ||
            message.includes('interrupted') ||
            message.includes('connection') ||
            message.includes('network') ||
            message.includes('timeout')) {
            return 'transient';
        }

        // 持久性错误（清除 token，通知用户）
        if (message.includes('resume token') ||
            message.includes('change stream history lost') ||
            message.includes('ChangeStreamHistoryLost')) {
            return 'resumable';
        }

        // 致命错误（停止监听）
        if (message.includes('collection dropped') ||
            message.includes('database dropped') ||
            message.includes('ns not found') ||
            message.includes('Unauthorized')) {
            return 'fatal';
        }

        // 默认为瞬态错误（尝试重连）
        return 'transient';
    }

    /**
     * 自动重连
     * @private
     */
    async _reconnect() {
        if (this._closed) return;

        // 如果已经在重连，记录并跳过
        if (this._reconnecting) {
            if (this._context.logger) {
                this._context.logger.debug('[Watch] Reconnect already in progress, skipping');
            }
            return;
        }

        this._reconnecting = true;

        try {
            this._reconnectAttempts++;
            this._stats.reconnectAttempts++;

            // 指数退避
            const baseInterval = this._options.reconnectInterval || 1000;
            const maxDelay = this._options.maxReconnectDelay || 60000;
            const delay = Math.min(
                baseInterval * Math.pow(2, this._reconnectAttempts - 1),
                maxDelay
            );

            this._stats.lastReconnectTime = new Date().toISOString();

            this._emitter.emit('reconnect', {
                attempt: this._reconnectAttempts,
                delay,
                lastError: this._stats.lastError
            });

            if (this._context.logger) {
                this._context.logger.info(
                    `[Watch] Reconnecting... attempt ${this._reconnectAttempts}, delay ${delay}ms`
                );
            }

            await new Promise(resolve => setTimeout(resolve, delay));

            // 关闭旧的 stream
            if (this._stream) {
                try {
                    await this._stream.close();
                } catch (_) {}
            }

            // 构建新的选项
            const watchOptions = { ...this._options };

            // 移除 monSQLize 扩展选项
            delete watchOptions.autoReconnect;
            delete watchOptions.reconnectInterval;
            delete watchOptions.maxReconnectDelay;
            delete watchOptions.autoInvalidateCache;

            // 添加 resumeToken
            if (this._lastResumeToken) {
                watchOptions.resumeAfter = this._lastResumeToken;
            }

            // 重建 changeStream
            this._stream = this._collection.watch(this._pipeline, watchOptions);

            // 重新设置监听
            this._setupListeners();

            // 重置状态
            this._reconnectAttempts = 0;

            this._emitter.emit('resume', this._lastResumeToken);

            if (this._context.logger) {
                this._context.logger.info('[Watch] Reconnected successfully');
            }
        } catch (error) {
            this._stats.lastError = error.message;

            if (this._context.logger) {
                this._context.logger.error('[Watch] Reconnect failed:', error.message);
            }

            // 使用 setTimeout 避免同步递归调用 _handleError
            // 确保当前调用栈完成后再触发下一次重连
            setTimeout(() => {
                if (!this._closed) {
                    this._handleError(error);
                }
            }, 0);
        } finally {
            // 确保无论成功失败都重置标志
            this._reconnecting = false;
        }
    }

    /**
     * 智能缓存失效
     * @private
     * @param {Object} change - Change event
     */
    async _invalidateCache(change) {
        const { operationType, documentKey, ns } = change;
        const collectionName = ns.coll;
        const patterns = [];

        // 根据操作类型构建失效模式
        switch (operationType) {
            case 'insert':
                // 失效列表查询和计数
                patterns.push(`*:${collectionName}:find:*`);
                patterns.push(`*:${collectionName}:findPage:*`);
                patterns.push(`*:${collectionName}:count:*`);
                patterns.push(`*:${collectionName}:findAndCount:*`);
                break;

            case 'update':
            case 'replace':
                // 失效单个文档和列表查询
                if (documentKey?._id) {
                    patterns.push(`*:${collectionName}:findOne:*${documentKey._id}*`);
                    patterns.push(`*:${collectionName}:findOneById:${documentKey._id}*`);
                }
                patterns.push(`*:${collectionName}:find:*`);
                patterns.push(`*:${collectionName}:findPage:*`);
                patterns.push(`*:${collectionName}:findAndCount:*`);
                break;

            case 'delete':
                // 失效单个文档和列表查询
                if (documentKey?._id) {
                    patterns.push(`*:${collectionName}:findOne:*${documentKey._id}*`);
                    patterns.push(`*:${collectionName}:findOneById:${documentKey._id}*`);
                }
                patterns.push(`*:${collectionName}:find:*`);
                patterns.push(`*:${collectionName}:findPage:*`);
                patterns.push(`*:${collectionName}:count:*`);
                patterns.push(`*:${collectionName}:findAndCount:*`);
                break;

            case 'drop':
            case 'rename':
            case 'dropDatabase':
                // 失效整个集合
                patterns.push(`*:${collectionName}:*`);
                break;

            default:
                // 其他操作类型，不失效缓存
                return;
        }

        // 执行失效
        for (const pattern of patterns) {
            try {
                // 直接调用 cache.delPattern()
                // 自动触发 DistributedCacheInvalidator.invalidate()
                // 自动广播到其他实例
                const cache = this._context.cache;
                if (cache && typeof cache.delPattern === 'function') {
                    await cache.delPattern(pattern);
                    this._stats.cacheInvalidations++;

                    if (this._context.logger) {
                        this._context.logger.debug(
                            `[Watch] Invalidated cache: ${pattern}`
                        );
                    }
                }
            } catch (error) {
                if (this._context.logger) {
                    this._context.logger.error(
                        `[Watch] Cache invalidation failed: ${error.message}`
                    );
                }
            }
        }
    }

    // ============================================
    // 公共 API
    // ============================================

    /**
     * 监听事件
     * @param {string} event - 事件名称
     * @param {Function} handler - 事件处理函数
     * @returns {ChangeStreamWrapper} 返回自身，支持链式调用
     */
    on(event, handler) {
        this._emitter.on(event, handler);
        return this;
    }

    /**
     * 监听事件（一次性）
     * @param {string} event - 事件名称
     * @param {Function} handler - 事件处理函数
     * @returns {ChangeStreamWrapper} 返回自身，支持链式调用
     */
    once(event, handler) {
        this._emitter.once(event, handler);
        return this;
    }

    /**
     * 移除事件监听
     * @param {string} event - 事件名称
     * @param {Function} handler - 事件处理函数
     * @returns {ChangeStreamWrapper} 返回自身，支持链式调用
     */
    off(event, handler) {
        if (this._emitter.off) {
            this._emitter.off(event, handler);
        } else {
            this._emitter.removeListener(event, handler);
        }
        return this;
    }

    /**
     * 关闭监听
     */
    async close() {
        if (this._closed) return;

        this._closed = true;

        if (this._stream) {
            try {
                await this._stream.close();
            } catch (error) {
                if (this._context.logger) {
                    this._context.logger.error('[Watch] Error closing stream:', error);
                }
            }
        }

        // 先触发 close 事件，再移除监听器
        this._emitter.emit('close');

        // 移除所有事件监听器
        this._emitter.removeAllListeners();

        if (this._context.logger) {
            this._context.logger.info('[Watch] Closed');
        }
    }

    /**
     * 检查是否已关闭
     * @returns {boolean}
     */
    isClosed() {
        return this._closed;
    }

    /**
     * 获取当前 resumeToken
     * @returns {Object|null}
     */
    getResumeToken() {
        return this._lastResumeToken;
    }

    /**
     * 获取统计信息
     * @returns {Object}
     */
    getStats() {
        return {
            totalChanges: this._stats.totalChanges,
            reconnectAttempts: this._stats.reconnectAttempts,
            lastReconnectTime: this._stats.lastReconnectTime,
            uptime: Date.now() - this._stats.startTime,
            isActive: !this._closed && !this._reconnecting,
            cacheInvalidations: this._stats.cacheInvalidations,
            errors: this._stats.errors
        };
    }
}

/**
 * 创建 watch 操作
 * @param {Object} context - 上下文对象
 * @returns {Object} 包含 watch 方法的对象
 */
function createWatchOps(context) {
    return {
        /**
         * 监听集合变更
         * @param {Array} [pipeline=[]] - 聚合管道（过滤事件）
         * @param {Object} [options={}] - 配置选项
         * @returns {ChangeStreamWrapper}
         */
        watch: (pipeline = [], options = {}) => {
            // 参数验证
            if (!Array.isArray(pipeline)) {
                throw new Error('pipeline must be an array');
            }

            // ✅ v1.3.0: 自动转换 ObjectId 字符串
            const { convertAggregationPipeline } = require('../../utils/objectid-converter');
            const convertedPipeline = convertAggregationPipeline(pipeline, 0, {
                logger: context.logger,
                excludeFields: context.autoConvertConfig?.excludeFields,
                customFieldPatterns: context.autoConvertConfig?.customFieldPatterns,
                maxDepth: context.autoConvertConfig?.maxDepth || 5
            });

            // 构建 MongoDB watch 选项
            const watchOptions = {
                fullDocument: options.fullDocument || 'updateLookup',
                ...options
            };

            // 移除 monSQLize 扩展选项（避免传递给 MongoDB）
            delete watchOptions.autoReconnect;
            delete watchOptions.reconnectInterval;
            delete watchOptions.maxReconnectDelay;
            delete watchOptions.autoInvalidateCache;

            // 创建 MongoDB ChangeStream
            const changeStream = context.collection.watch(convertedPipeline, watchOptions);

            // 包装为 ChangeStreamWrapper
            const wrapper = new ChangeStreamWrapper(
                changeStream,
                context.collection,
                convertedPipeline,
                options,
                context
            );

            if (context.logger) {
                context.logger.info('[Watch] Started watching collection:', context.collection.collectionName);
            }

            return wrapper;
        }
    };
}

module.exports = {
    createWatchOps,
    ChangeStreamWrapper
};


