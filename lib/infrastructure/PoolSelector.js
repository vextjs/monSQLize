/**
 * PoolSelector - 连接池智能选择器
 *
 * 根据策略选择合适的连接池
 * 支持：auto（自动）、roundRobin（轮询）、leastConnections（最少连接）、
 *      weighted（加权）、manual（手动）
 *
 * @module lib/infrastructure/PoolSelector
 * @since v1.0.8
 */

/**
 * 连接池选择器
 */
class PoolSelector {
    /**
     * 构造函数
     *
     * @param {Object} options - 配置选项
     * @param {string} options.strategy - 选择策略
     * @param {Object} options.logger - 日志记录器
     */
    constructor(options = {}) {
        this._strategy = options.strategy || 'auto';
        this._logger = options.logger || console;
        this._roundRobinIndex = new Map(); // 轮询索引 Map<role, number>
    }

    /**
     * 选择连接池
     *
     * @param {Array<PoolConfig>} pools - 候选连接池列表
     * @param {Object} context - 上下文
     * @param {string} context.operation - 操作类型 ('read' | 'write')
     * @param {Map} context.healthStatus - 健康状态
     * @param {Object} context.stats - 统计信息
     * @param {Object} [context.poolPreference] - 连接池偏好
     * @returns {string} 选中的连接池名称
     * @throws {Error} 如果无可用连接池
     */
    select(pools, context) {
        if (!pools || pools.length === 0) {
            throw new Error('No available pools');
        }

        // 根据策略选择
        switch (this._strategy) {
            case 'auto':
                return this._selectByAuto(pools, context);

            case 'roundRobin':
                return this._selectByRoundRobin(pools, context);

            case 'leastConnections':
                return this._selectByLeastConnections(pools, context);

            case 'weighted':
                return this._selectByWeighted(pools, context);

            case 'manual':
                // 手动模式不应该到这里（应该在 ConnectionPoolManager 处理）
                return pools[0].name;

            default:
                this._logger.warn(`[PoolSelector] 未知策略: ${this._strategy}，使用 auto`);
                return this._selectByAuto(pools, context);
        }
    }

    /**
     * 自动策略：读写分离 + 负载均衡
     *
     * @private
     */
    _selectByAuto(pools, context) {
        const { operation, poolPreference } = context;

        // 1. 根据操作类型过滤
        let candidates = pools;

        if (operation === 'read') {
            // 读操作优先使用 secondary
            const secondaries = pools.filter(p => p.role === 'secondary');
            if (secondaries.length > 0) {
                candidates = secondaries;
            }
        } else if (operation === 'write') {
            // 写操作优先使用 primary
            const primaries = pools.filter(p => p.role === 'primary');
            if (primaries.length > 0) {
                candidates = primaries;
            }
        }

        // 2. 根据 poolPreference 过滤
        if (poolPreference) {
            if (poolPreference.role) {
                const filtered = candidates.filter(p => p.role === poolPreference.role);
                if (filtered.length > 0) {
                    candidates = filtered;
                }
            }

            if (poolPreference.tags && poolPreference.tags.length > 0) {
                const filtered = candidates.filter(p => {
                    if (!p.tags) return false;
                    return poolPreference.tags.some(tag => p.tags.includes(tag));
                });
                if (filtered.length > 0) {
                    candidates = filtered;
                }
            }
        }

        // 3. 如果只剩一个，直接返回
        if (candidates.length === 1) {
            return candidates[0].name;
        }

        // 4. 多个候选，使用加权负载均衡
        return this._selectByWeighted(candidates, context);
    }

    /**
     * 轮询策略
     *
     * @private
     */
    _selectByRoundRobin(pools, context) {
        const { operation } = context;
        const key = operation || 'default';

        // 获取当前索引
        let index = this._roundRobinIndex.get(key) || 0;

        // 选择连接池
        const pool = pools[index % pools.length];

        // 更新索引
        this._roundRobinIndex.set(key, (index + 1) % pools.length);

        return pool.name;
    }

    /**
     * 最少连接策略
     *
     * @private
     */
    _selectByLeastConnections(pools, context) {
        const { stats } = context;

        if (!stats) {
            // 无统计信息，降级到轮询
            return this._selectByRoundRobin(pools, context);
        }

        let minConnections = Infinity;
        let selectedPool = pools[0];

        for (const pool of pools) {
            const poolStats = stats[pool.name];
            if (!poolStats) continue;

            const connections = poolStats.connections || 0;
            if (connections < minConnections) {
                minConnections = connections;
                selectedPool = pool;
            }
        }

        return selectedPool.name;
    }

    /**
     * 加权策略
     *
     * @private
     */
    _selectByWeighted(pools, context) {
        // 计算总权重
        let totalWeight = 0;
        for (const pool of pools) {
            totalWeight += (pool.weight || 1);
        }

        // 随机选择
        let random = Math.random() * totalWeight;

        for (const pool of pools) {
            const weight = pool.weight || 1;
            random -= weight;

            if (random <= 0) {
                return pool.name;
            }
        }

        // 降级（不应该到这里）
        return pools[0].name;
    }

    /**
     * 设置策略
     *
     * @param {string} strategy - 策略名称
     */
    setStrategy(strategy) {
        this._strategy = strategy;
        this._logger.info(`[PoolSelector] 策略已更改: ${strategy}`);
    }

    /**
     * 获取当前策略
     *
     * @returns {string}
     */
    getStrategy() {
        return this._strategy;
    }
}

module.exports = PoolSelector;


