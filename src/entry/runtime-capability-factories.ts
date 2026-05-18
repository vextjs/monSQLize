/**
 * runtime 能力层工厂函数集合。
 *
 * 将 TransactionManager / LockManager / ChangeStreamSyncManager / SlowQueryLogManager
 * / SagaOrchestrator / ConnectionPoolManager 的初始化逻辑从 runtime-core 中提取出来，
 * 便于单独测试和维护，同时减少核心文件的复杂度。
 *
 * 每个工厂函数均遵循 "已存在则返回现有实例" 的幂等语义。
 */

import { LockManager } from '../capabilities/lock';
import type { ConnectionPoolManager } from '../capabilities/pool';
import { SagaOrchestrator } from '../capabilities/saga';
import {
    SlowQueryLogManager,
    type SlowQueryLogConfig,
} from '../capabilities/slow-query-log';
import { ChangeStreamSyncManager } from '../capabilities/sync';
import {
    CacheLockManager,
    TransactionManager,
} from '../capabilities/transaction';
import { ErrorCodes, createError } from '../core/errors';
import type { LoggerLike } from '../core/logger';
import type { MonSQLizeOptions } from '../../types/monsqlize';
import type { MongoDbAccessor as DbFacade } from '../adapters/mongodb/common/accessors';
import type { MongoClient } from 'mongodb';

/**
 * TransactionManager 的初始化配置参数。
 */
type TransactionManagerConfig = {
    current: TransactionManager | null;
    client: MongoClient | null;
    cache: import('../capabilities/cache').MemoryCache;
    logger: LoggerLike | null;
    lockManager: CacheLockManager;
};

/**
 * 获取或创建 `TransactionManager` 实例。
 * 若已存在当前实例则直接返回，否则按配置初始化新实例。
 * 未连接时抛出 `NOT_CONNECTED` 错误。
 */
export function getOrCreateTransactionManager(config: TransactionManagerConfig): TransactionManager {
    if (!config.client) {
        throw createError(ErrorCodes.NOT_CONNECTED, 'MonSQLize is not connected yet.');
    }
    if (config.current) {
        return config.current;
    }
    return new TransactionManager({
        client: config.client,
        cache: config.cache,
        logger: config.logger,
        lockManager: config.lockManager,
    });
}

/**
 * 获取或创建 `LockManager` 实例（幂等语义）。
 */
export function getOrCreateLockManager(current: LockManager | null, logger: LoggerLike | null): LockManager {
    return current ?? new LockManager({ logger });
}

/**
 * ChangeStreamSyncManager 的初始化配置参数。
 */
type SyncManagerConfig = {
    enabled: boolean;
    defaultDb: DbFacade | null;
    current: ChangeStreamSyncManager | null;
    poolManager: ConnectionPoolManager | null;
    sync: NonNullable<MonSQLizeOptions['sync']>;
    logger: LoggerLike | null;
    onStartFailure: (error: unknown) => void;
};

/**
 * 按需初始化 `ChangeStreamSyncManager` 并启动同步。
 * 若 sync 未启用或默认 db 不可用则返回 null。
 * 启动失败时调用 `onStartFailure` 回调，不中断 runtime 初始化。
 */
export async function initializeRuntimeSyncManager(config: SyncManagerConfig): Promise<ChangeStreamSyncManager | null> {
    if (!config.enabled || !config.defaultDb) {
        return null;
    }
    if (config.current) {
        return config.current;
    }
    const manager = new ChangeStreamSyncManager({
        db: config.defaultDb.raw(),
        poolManager: config.poolManager,
        config: config.sync,
        logger: config.logger,
    });
    try {
        await manager.start();
    } catch (error) {
        config.onStartFailure(error);
    }
    return manager;
}

/**
 * SlowQueryLogManager 的初始化配置参数。
 */
type SlowQueryManagerConfig = {
    current: SlowQueryLogManager | null;
    slowQueryLog: MonSQLizeOptions['slowQueryLog'];
    slowQueryMs: number | undefined;
    client: MongoClient | null;
    logger: LoggerLike | null;
};

/**
 * 按需初始化 `SlowQueryLogManager`。
 * 若未配置 slowQueryLog 或未连接则返回 null。
 * `slowQueryMs` 存在时将合并到 `filter.minExecutionTimeMs`，以选项配置为优先。
 */
export function initializeRuntimeSlowQueryLogManager(config: SlowQueryManagerConfig): SlowQueryLogManager | null {
    if (!config.slowQueryLog || !config.client) {
        return null;
    }
    if (config.current) {
        return config.current;
    }
    let slowQueryLogConfig = config.slowQueryLog;
    if (
        config.slowQueryMs !== undefined &&
        typeof slowQueryLogConfig === 'object' &&
        slowQueryLogConfig !== null
    ) {
        const partialConfig = slowQueryLogConfig as Partial<SlowQueryLogConfig>;
        if (!partialConfig.filter?.minExecutionTimeMs) {
            slowQueryLogConfig = {
                ...partialConfig,
                filter: {
                    ...partialConfig.filter,
                    minExecutionTimeMs: config.slowQueryMs,
                },
            } as unknown as typeof slowQueryLogConfig;
        }
    }
    return new SlowQueryLogManager(
        slowQueryLogConfig,
        config.client,
        'mongodb',
        config.logger,
    );
}

/**
 * 确保 `SlowQueryLogManager` 已启用并返回实例。
 * 若未启用则抛出 `INVALID_CONFIG` 错误。
 */
export function ensureRuntimeSlowQueryLogManager(manager: SlowQueryLogManager | null): SlowQueryLogManager {
    if (!manager) {
        throw createError(ErrorCodes.INVALID_CONFIG, 'MonSQLize slow query log is not enabled for this runtime.');
    }
    return manager;
}

/**
 * 获取或创建 `SagaOrchestrator` 实例（幂等语义）。
 */
export function getOrCreateSagaOrchestrator(current: SagaOrchestrator | null, logger: LoggerLike | null): SagaOrchestrator {
    return current ?? new SagaOrchestrator({ logger });
}

/**
 * 断言连接池管理器已配置并返回实例。
 * 若未配置则抛出 `INVALID_CONFIG` 错误。
 */
export function requireRuntimePoolManager(poolManager: ConnectionPoolManager | null): ConnectionPoolManager {
    if (!poolManager) {
        throw createError(ErrorCodes.INVALID_CONFIG, 'MonSQLize pool() requires options.pools configuration.');
    }
    return poolManager;
}
