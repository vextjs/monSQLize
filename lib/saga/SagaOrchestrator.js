/**
 * Saga 协调器
 * 负责管理所有 Saga 定义
 * 支持 Redis 存储（多进程共享）或内存存储（单进程）
 */
const SagaDefinition = require('./SagaDefinition');

class SagaOrchestrator {
    /**
     * 构造函数
     * @param {Object} options - 配置选项
     * @param {Object} [options.cache] - 缓存实例（可选，Redis 或内存）
     * @param {Object} [options.logger] - 日志记录器（可选）
     */
    constructor(options = {}) {
        this.cache = options.cache;
        this.logger = options.logger;

        // 存储策略：根据 cache 配置自动选择
        // 只有当 cache 存在且不是 false 时才使用 Redis
        if (this.cache && this.cache !== false && typeof this.cache.set === 'function') {
            // Redis 模式：使用 cache.set/get 存储 Saga 元数据
            this.useRedis = true;
            this.sagaKeyPrefix = 'monsqlize:saga:def:';
            this.logger?.debug('[Saga] 使用 Redis 存储（多进程共享）');
        } else {
            // 内存模式：使用 Map 存储
            this.sagas = new Map();
            this.useRedis = false;
            this.logger?.debug('[Saga] 使用内存存储（单进程）');
        }

        // 统计信息
        this.stats = {
            totalExecutions: 0,
            successfulExecutions: 0,
            failedExecutions: 0,
            compensatedExecutions: 0
        };
    }

    /**
     * 定义 Saga
     * @param {Object} config - Saga 配置
     * @param {string} config.name - Saga 名称
     * @param {Array} config.steps - Saga 步骤列表
     * @returns {SagaDefinition} Saga 定义实例
     */
    async defineSaga(config) {
        this._validateConfig(config);

        const saga = new SagaDefinition(config, this);

        if (this.useRedis) {
            // 存储元数据到 Redis
            await this.cache.set(
                this.sagaKeyPrefix + config.name,
                {
                    name: config.name,
                    steps: config.steps.map(s => ({
                        name: s.name,
                        hasCompensate: !!s.compensate
                    }))
                },
                0  // TTL=0 永久存储
            );

            // 函数保存在内存
            if (!this.sagas) this.sagas = new Map();
            this.sagas.set(config.name, saga);
        } else {
            this.sagas.set(config.name, saga);
        }

        this.logger?.debug(`[Saga] 定义 Saga: ${config.name}`);
        return saga;
    }

    /**
     * 执行 Saga
     * @param {string} sagaName - Saga 名称
     * @param {Object} data - 执行数据
     * @returns {Promise<Object>} 执行结果
     */
    async execute(sagaName, data) {
        const saga = this.sagas?.get(sagaName);

        if (!saga && this.useRedis) {
            // 检查 Redis 中是否存在
            const key = this.sagaKeyPrefix + sagaName;
            const def = await this.cache.get(key);

            if (def) {
                throw new Error(
                    `Saga '${sagaName}' 在 Redis 中存在但未在当前进程注册。` +
                    '请在进程启动时调用 defineSaga() 注册。'
                );
            }
        }

        if (!saga) {
            throw new Error(`Saga '${sagaName}' 未定义`);
        }

        this.stats.totalExecutions++;

        try {
            const result = await saga.execute(data);

            if (result.success) {
                this.stats.successfulExecutions++;
            } else {
                this.stats.failedExecutions++;
                this.stats.compensatedExecutions++;
            }

            return result;
        } catch (error) {
            this.stats.failedExecutions++;
            throw error;
        }
    }

    /**
     * 列出所有已定义的 Saga
     * @returns {Promise<string[]>} Saga 名称列表
     */
    async listSagas() {
        if (this.useRedis) {
            const keys = await this.cache.keys(this.sagaKeyPrefix + '*');
            return keys.map(key => key.replace(this.sagaKeyPrefix, ''));
        } else {
            return Array.from(this.sagas.keys());
        }
    }

    /**
     * 获取统计信息
     * @returns {Object} 统计信息
     */
    getStats() {
        return {
            ...this.stats,
            successRate: this.stats.totalExecutions > 0
                ? ((this.stats.successfulExecutions / this.stats.totalExecutions) * 100).toFixed(2) + '%'
                : '0%',
            storageMode: this.useRedis ? 'Redis' : '内存'
        };
    }

    /**
     * 验证 Saga 配置
     * @private
     * @param {Object} config - Saga 配置
     */
    _validateConfig(config) {
        if (!config.name) {
            throw new Error('Saga name is required');
        }

        if (!Array.isArray(config.steps) || config.steps.length === 0) {
            throw new Error('Saga steps must be a non-empty array');
        }

        for (const step of config.steps) {
            if (!step.name || !step.execute) {
                throw new Error('Each step must have name and execute function');
            }
        }
    }
}

module.exports = SagaOrchestrator;

