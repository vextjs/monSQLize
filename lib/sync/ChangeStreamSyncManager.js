/**
 * ChangeStreamSyncManager - Change Stream 同步管理器
 *
 * 负责管理 MongoDB Change Stream，实时同步数据到备份库
 *
 * 核心功能：
 * - 启动/停止 Change Stream
 * - 事件过滤和转换
 * - Resume Token 管理
 * - 错误处理和自动重连
 *
 * @module lib/sync/ChangeStreamSyncManager
 * @since v1.0.8
 */

const SyncTarget = require('./SyncTarget');
const ResumeTokenStore = require('./ResumeTokenStore');
const { validateSyncConfig } = require('./SyncConfig');

/**
 * Change Stream 同步管理器
 */
class ChangeStreamSyncManager {
    /**
     * 构造函数
     *
     * @param {Object} options - 配置选项
     * @param {Object} options.db - MongoDB 数据库实例
     * @param {Object} options.poolManager - ConnectionPoolManager 实例
     * @param {Object} options.config - 同步配置
     * @param {Object} [options.logger] - 日志记录器
     */
    constructor(options) {
        this.db = options.db;
        this.poolManager = options.poolManager;
        this.config = options.config;
        this.logger = options.logger || console;

        // 验证配置
        validateSyncConfig(this.config);

        // Resume Token 管理器
        this.tokenStore = new ResumeTokenStore({
            storage: this.config.resumeToken?.storage || 'file',
            path: this.config.resumeToken?.path || './.sync-resume-token',
            redis: this.config.resumeToken?.redis,
            logger: this.logger
        });

        // 备份目标列表
        this.targets = [];

        // Change Stream 实例
        this.changeStream = null;
        this.isRunning = false;
        this.isReconnecting = false;

        // 统计信息
        this.stats = {
            eventCount: 0,
            syncedCount: 0,
            errorCount: 0,
            startTime: null,
            lastEventTime: null
        };
    }

    /**
     * 启动同步
     *
     * @returns {Promise<void>}
     */
    async start() {
        if (this.isRunning) {
            this.logger.warn('[ChangeStreamSync] 同步已在运行中');
            return;
        }

        try {
            // 1. 验证环境（检查 Change Stream 支持）
            await this._validateEnvironment();

            // 2. 初始化备份目标
            await this._initTargets();

            // 3. 加载 Resume Token
            const resumeAfter = await this.tokenStore.load();

            if (resumeAfter) {
                this.logger.info('[ChangeStreamSync] 从 Resume Token 恢复');
            }

            // 4. 构建过滤管道
            const pipeline = this._buildPipeline();

            // 5. 启动 Change Stream
            const options = {
                fullDocument: 'updateLookup',  // 获取完整文档
                resumeAfter: resumeAfter || undefined
            };

            this.changeStream = this.db.watch(pipeline, options);

            // 6. 注册事件监听
            this.changeStream.on('change', (event) => this._handleChange(event));
            this.changeStream.on('error', (error) => this._handleError(error));
            this.changeStream.on('close', () => this._handleClose());

            this.isRunning = true;
            this.stats.startTime = new Date();

            this.logger.info('[ChangeStreamSync] 同步已启动', {
                targets: this.targets.length,
                targetNames: this.targets.map(t => t.name),
                resumeToken: !!resumeAfter,
                collections: this.config.collections || ['*']
            });

        } catch (error) {
            this.logger.error('[ChangeStreamSync] 启动失败', {
                error: error.message,
                stack: error.stack
            });
            throw error;
        }
    }

    /**
     * 停止同步
     *
     * @returns {Promise<void>}
     */
    async stop() {
        if (!this.isRunning) {
            this.logger.warn('[ChangeStreamSync] 同步未运行');
            return;
        }

        try {
            // 关闭 Change Stream
            if (this.changeStream) {
                await this.changeStream.close();
                this.changeStream = null;
            }

            // 关闭所有目标连接
            await Promise.all(this.targets.map(target => target.close()));

            this.isRunning = false;

            this.logger.info('[ChangeStreamSync] 同步已停止', {
                stats: this.getStats()
            });

        } catch (error) {
            this.logger.error('[ChangeStreamSync] 停止失败', {
                error: error.message
            });
        }
    }

    /**
     * 验证环境（检查 Change Stream 支持）
     *
     * @private
     * @returns {Promise<void>}
     */
    async _validateEnvironment() {
        try {
            // 创建临时 Change Stream 测试支持
            const testCollection = this.db.collection('_sync_test');
            const testStream = testCollection.watch();
            await testStream.close();

            this.logger.debug('[ChangeStreamSync] Change Stream 支持检查通过');

        } catch (error) {
            if (error.code === 40573 || error.message.includes('changeStream')) {
                throw new Error(
                    'Change Stream 不可用。请确保：\n' +
                    '1. MongoDB 是 Replica Set 或 Sharded Cluster\n' +
                    '2. MongoDB 版本 >= 4.0\n' +
                    '3. 用户有 changeStream 权限\n' +
                    '原始错误: ' + error.message
                );
            }
            throw error;
        }
    }

    /**
     * 初始化备份目标
     *
     * @private
     * @returns {Promise<void>}
     */
    async _initTargets() {
        this.targets = [];

        for (const targetConfig of this.config.targets) {
            const target = new SyncTarget({
                name: targetConfig.name,
                poolManager: this.poolManager,
                config: targetConfig,
                logger: this.logger
            });

            await target.connect();
            this.targets.push(target);
        }

        this.logger.info('[ChangeStreamSync] 备份目标已初始化', {
            count: this.targets.length,
            names: this.targets.map(t => t.name)
        });
    }

    /**
     * 构建过滤管道
     *
     * @private
     * @returns {Array} MongoDB Aggregation Pipeline
     */
    _buildPipeline() {
        const pipeline = [];

        // 过滤集合
        if (this.config.collections && this.config.collections[0] !== '*') {
            pipeline.push({
                $match: {
                    'ns.coll': { $in: this.config.collections }
                }
            });
        }

        // 过滤操作类型
        pipeline.push({
            $match: {
                operationType: { $in: ['insert', 'update', 'delete', 'replace'] }
            }
        });

        return pipeline;
    }

    /**
     * 处理 Change Event
     *
     * @private
     * @param {Object} event - Change Stream 事件
     * @returns {Promise<void>}
     */
    async _handleChange(event) {
        this.stats.eventCount++;
        this.stats.lastEventTime = new Date();

        try {
            // 1. 应用自定义过滤
            if (this.config.filter && !this.config.filter(event)) {
                this.logger.debug('[ChangeStreamSync] 事件被过滤', {
                    operationType: event.operationType,
                    collection: event.ns?.coll
                });
                return;
            }

            // 2. 数据转换
            let document = event.fullDocument;
            if (this.config.transform) {
                document = this.config.transform(document);
            }

            // 3. 同步到所有目标
            const syncPromises = this.targets.map(target =>
                target.apply(event.operationType, document, event.documentKey)
                    .catch(err => {
                        this.stats.errorCount++;
                        this.logger.error('[ChangeStreamSync] 目标同步失败', {
                            target: target.name,
                            error: err.message
                        });
                        // 不抛出，继续同步其他目标
                    })
            );

            await Promise.all(syncPromises);

            this.stats.syncedCount++;

            // 4. 保存 Resume Token
            await this.tokenStore.save(event._id);

            this.logger.debug('[ChangeStreamSync] 事件处理完成', {
                operationType: event.operationType,
                collection: event.ns?.coll,
                id: event.documentKey?._id
            });

        } catch (error) {
            this.stats.errorCount++;
            this.logger.error('[ChangeStreamSync] 事件处理失败', {
                error: error.message,
                event: event.operationType,
                collection: event.ns?.coll
            });
        }
    }

    /**
     * 处理 Change Stream 错误
     *
     * @private
     * @param {Error} error - 错误对象
     */
    async _handleError(error) {
        this.logger.error('[ChangeStreamSync] Change Stream 错误', {
            error: error.message,
            code: error.code
        });

        // 自动重连
        if (!this.isReconnecting) {
            await this._reconnect();
        }
    }

    /**
     * 处理 Change Stream 关闭
     *
     * @private
     */
    _handleClose() {
        this.logger.warn('[ChangeStreamSync] Change Stream 已关闭');

        if (this.isRunning && !this.isReconnecting) {
            // 意外关闭，尝试重连
            this._reconnect();
        }
    }

    /**
     * 自动重连
     *
     * @private
     * @returns {Promise<void>}
     */
    async _reconnect() {
        if (this.isReconnecting) {
            return;
        }

        this.isReconnecting = true;
        const maxRetries = 5;
        let retries = 0;

        this.logger.info('[ChangeStreamSync] 开始重连...');

        while (retries < maxRetries && this.isRunning) {
            try {
                await this.stop();

                // 指数退避
                const delay = 1000 * Math.pow(2, retries);
                this.logger.info(`[ChangeStreamSync] 等待 ${delay}ms 后重连...`);
                await new Promise(resolve => setTimeout(resolve, delay));

                await this.start();

                this.logger.info('[ChangeStreamSync] 重连成功');
                this.isReconnecting = false;
                return;

            } catch (error) {
                retries++;
                this.logger.error(`[ChangeStreamSync] 重连失败 (${retries}/${maxRetries})`, {
                    error: error.message
                });
            }
        }

        this.isReconnecting = false;
        this.logger.error('[ChangeStreamSync] 重连失败，已达到最大重试次数');
    }

    /**
     * 获取统计信息
     *
     * @returns {Object} 统计信息
     */
    getStats() {
        return {
            isRunning: this.isRunning,
            eventCount: this.stats.eventCount,
            syncedCount: this.stats.syncedCount,
            errorCount: this.stats.errorCount,
            startTime: this.stats.startTime,
            lastEventTime: this.stats.lastEventTime,
            targets: this.targets.map(t => t.getStats())
        };
    }
}

module.exports = ChangeStreamSyncManager;

