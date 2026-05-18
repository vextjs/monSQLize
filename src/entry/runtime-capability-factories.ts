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

type TransactionManagerConfig = {
    current: TransactionManager | null;
    client: MongoClient | null;
    cache: import('../capabilities/cache').MemoryCache;
    logger: LoggerLike | null;
    lockManager: CacheLockManager;
};

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

export function getOrCreateLockManager(current: LockManager | null, logger: LoggerLike | null): LockManager {
    return current ?? new LockManager({ logger });
}

type SyncManagerConfig = {
    enabled: boolean;
    defaultDb: DbFacade | null;
    current: ChangeStreamSyncManager | null;
    poolManager: ConnectionPoolManager | null;
    sync: NonNullable<MonSQLizeOptions['sync']>;
    logger: LoggerLike | null;
    onStartFailure: (error: unknown) => void;
};

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

type SlowQueryManagerConfig = {
    current: SlowQueryLogManager | null;
    slowQueryLog: MonSQLizeOptions['slowQueryLog'];
    slowQueryMs: number | undefined;
    client: MongoClient | null;
    logger: LoggerLike | null;
};

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

export function ensureRuntimeSlowQueryLogManager(manager: SlowQueryLogManager | null): SlowQueryLogManager {
    if (!manager) {
        throw createError(ErrorCodes.INVALID_CONFIG, 'MonSQLize slow query log is not enabled for this runtime.');
    }
    return manager;
}

export function getOrCreateSagaOrchestrator(current: SagaOrchestrator | null, logger: LoggerLike | null): SagaOrchestrator {
    return current ?? new SagaOrchestrator({ logger });
}

export function requireRuntimePoolManager(poolManager: ConnectionPoolManager | null): ConnectionPoolManager {
    if (!poolManager) {
        throw createError(ErrorCodes.INVALID_CONFIG, 'MonSQLize pool() requires options.pools configuration.');
    }
    return poolManager;
}
