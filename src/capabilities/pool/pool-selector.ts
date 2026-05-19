/**
 * 连接池选择策略（PoolSelector）。
 *
 * 实现 auto / roundRobin / leastConnections / weighted / manual
 * 五种路由策略，基于 role + tags + 权重动态选择目标连接池。
 */
import type { LoggerLike } from '../../core/logger';

type PoolSelectorPoolConfig = {
    name: string;
    role?: string;
    weight?: number;
    status?: string;
    tags?: string[];
};

type PoolSelectorContext = {
    operation?: string;
    stats?: Record<string, { connections?: number }>;
    poolPreference?: {
        role?: string;
        tags?: string[];
    };
};

type PoolSelectorOptions = {
    strategy?: string;
    logger?: Pick<LoggerLike, 'warn' | 'info'>;
};

/**
 * 连接池路由选择器（Pool Routing Selector）。
 *
 * 设计说明：
 * - 实现五种选择策略，通过 setStrategy() 运行时切换，无需重建实例：
 *   · auto         — 读写分离优先（read→secondary / write→primary），
 *                    再按 role/tags 过滤候选集，最终按权重随机路由。
 *   · roundRobin   — 按 operation key 维护轮询游标，同时尊重 role 过滤。
 *   · leastConnections — 优先选择当前活跃连接数最少的 pool（需传入 stats）。
 *   · weighted     — 纯权重随机，不区分 role。
 *   · manual       — 始终返回第一个 pool（由调用方决定顺序）。
 * - tags 过滤：单 tag → some（任一匹配）；多 tags → every（全部匹配）。
 * - 策略降级：未知策略自动回退到 auto 并打印 warn 日志。
 * @since v1.5.0
 */
export class PoolSelector {
    private _strategy: string;
    private readonly _logger: Pick<LoggerLike, 'warn' | 'info'>;
    private readonly _roundRobinIndex = new Map<string, number>();

    constructor(options: PoolSelectorOptions = {}) {
        this._strategy = options.strategy ?? 'auto';
        this._logger = options.logger ?? console;
    }

    select(pools: PoolSelectorPoolConfig[], context: PoolSelectorContext): string {
        if (!pools || pools.length === 0) {
            throw new Error('No available pools');
        }
        switch (this._strategy) {
            case 'auto':
                return this.selectByAuto(pools, context);
            case 'roundRobin':
                return this.selectByRoundRobin(pools, context);
            case 'leastConnections':
                return this.selectByLeastConnections(pools, context);
            case 'weighted':
                return this.selectByWeighted(pools);
            case 'manual':
                return pools[0].name;
            default:
                this._logger.warn?.(`[PoolSelector] Unknown strategy: ${this._strategy}, falling back to auto`);
                return this.selectByAuto(pools, context);
        }
    }

    private selectByAuto(pools: PoolSelectorPoolConfig[], context: PoolSelectorContext): string {
        const { operation, poolPreference } = context;
        let candidates = pools;

        if (operation === 'read') {
            const secondaries = pools.filter((pool) => pool.role === 'secondary');
            if (secondaries.length > 0) {
                candidates = secondaries;
            }
        } else if (operation === 'write') {
            const primaries = pools.filter((pool) => pool.role === 'primary');
            if (primaries.length > 0) {
                candidates = primaries;
            }
        }

        if (poolPreference?.role) {
            const filteredByRole = candidates.filter((pool) => pool.role === poolPreference.role);
            if (filteredByRole.length > 0) {
                candidates = filteredByRole;
            }
        }

        if (poolPreference?.tags?.length) {
            const tags = poolPreference.tags;
            const filteredByTags = candidates.filter((pool) => {
                if (!pool.tags) {
                    return false;
                }
                return tags.length === 1
                    ? tags.some((tag) => pool.tags?.includes(tag))
                    : tags.every((tag) => pool.tags?.includes(tag));
            });
            if (filteredByTags.length > 0) {
                candidates = filteredByTags;
            }
        }

        if (candidates.length === 1) {
            return candidates[0].name;
        }
        return this.selectByWeighted(candidates);
    }

    private selectByRoundRobin(pools: PoolSelectorPoolConfig[], context: PoolSelectorContext): string {
        let candidates = pools;
        if (context.operation === 'read') {
            const nonPrimary = pools.filter((pool) => pool.role === 'secondary' || pool.role === 'analytics');
            if (nonPrimary.length > 0) {
                candidates = nonPrimary;
            }
        } else if (context.operation === 'write') {
            const primaries = pools.filter((pool) => pool.role === 'primary');
            if (primaries.length > 0) {
                candidates = primaries;
            }
        }

        const key = context.operation ?? 'default';
        const index = this._roundRobinIndex.get(key) ?? 0;
        const pool = candidates[index % candidates.length];
        this._roundRobinIndex.set(key, (index + 1) % candidates.length);
        return pool.name;
    }

    private selectByLeastConnections(pools: PoolSelectorPoolConfig[], context: PoolSelectorContext): string {
        if (!context.stats) {
            return this.selectByRoundRobin(pools, context);
        }

        let minConnections = Infinity;
        let selectedPool = pools[0];
        for (const pool of pools) {
            const poolStats = context.stats[pool.name];
            if (!poolStats) {
                continue;
            }
            const connections = poolStats.connections ?? 0;
            if (connections < minConnections) {
                minConnections = connections;
                selectedPool = pool;
            }
        }
        return selectedPool.name;
    }

    private selectByWeighted(pools: PoolSelectorPoolConfig[]): string {
        let totalWeight = 0;
        for (const pool of pools) {
            totalWeight += pool.weight ?? 1;
        }
        let random = Math.random() * totalWeight;
        for (const pool of pools) {
            random -= pool.weight ?? 1;
            if (random <= 0) {
                return pool.name;
            }
        }
        return pools[0].name;
    }

    setStrategy(strategy: string): void {
        this._strategy = strategy;
        this._logger.info?.(`[PoolSelector] Strategy changed: ${strategy}`);
    }

    getStrategy(): string {
        return this._strategy;
    }
}
