/**
 * Runtime capability factory functions.
 *
 * Extracts the initialisation logic for TransactionManager / LockManager /
 * ChangeStreamSyncManager / SlowQueryLogManager / SagaOrchestrator /
 * ConnectionPoolManager from runtime-core, making each easier to test and
 * maintain independently while reducing core-file complexity.
 *
 * Every factory function follows idempotent semantics: return the existing
 * instance if one already exists.
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
 * Initialisation config for TransactionManager.
 */
type TransactionManagerConfig = {
    current: TransactionManager | null;
    client: MongoClient | null;
    cache: import('../capabilities/cache').CacheLike;
    logger: LoggerLike | null;
    lockManager: CacheLockManager;
    transaction?: MonSQLizeOptions['transaction'];
};

/**
 * Get or create a `TransactionManager` instance.
 * Returns the existing instance if present; otherwise initialises a new one from the config.
 * Throws `NOT_CONNECTED` when not yet connected.
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
        maxDuration: config.transaction?.maxDuration ?? config.transaction?.defaultTimeout,
        enableRetry: config.transaction?.enableRetry,
        maxRetries: config.transaction?.maxRetries,
        retryDelay: config.transaction?.retryDelay,
        retryBackoff: config.transaction?.retryBackoff,
        defaultReadConcern: config.transaction?.defaultReadConcern,
        defaultWriteConcern: config.transaction?.defaultWriteConcern,
        defaultReadPreference: config.transaction?.defaultReadPreference,
        maxStatsSamples: config.transaction?.maxStatsSamples,
    });
}

/**
 * Get or create a `LockManager` instance (idempotent).
 */
export function getOrCreateLockManager(current: LockManager | null, logger: LoggerLike | null): LockManager {
    return current ?? new LockManager({ logger });
}

/**
 * Initialisation config for ChangeStreamSyncManager.
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
 * Lazily initialise `ChangeStreamSyncManager` and start sync.
 * Returns null when sync is not enabled or the default db is unavailable.
 * On start failure, calls the `onStartFailure` callback without interrupting runtime initialisation.
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
 * Initialisation config for SlowQueryLogManager.
 */
type SlowQueryManagerConfig = {
    current: SlowQueryLogManager | null;
    slowQueryLog: MonSQLizeOptions['slowQueryLog'];
    slowQueryMs: number | undefined;
    client: MongoClient | null;
    logger: LoggerLike | null;
};

/**
 * Lazily initialise `SlowQueryLogManager`.
 * Returns null when slowQueryLog is not configured or the client is not connected.
 * When `slowQueryMs` is present it is merged into `filter.minExecutionTimeMs`,
 * with the explicit option taking priority.
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
 * Assert that `SlowQueryLogManager` is enabled and return the instance.
 * Throws `INVALID_CONFIG` when not enabled.
 */
export function ensureRuntimeSlowQueryLogManager(manager: SlowQueryLogManager | null): SlowQueryLogManager {
    if (!manager) {
        throw createError(ErrorCodes.INVALID_CONFIG, 'MonSQLize slow query log is not enabled for this runtime.');
    }
    return manager;
}

/**
 * Get or create a `SagaOrchestrator` instance (idempotent).
 */
export function getOrCreateSagaOrchestrator(
    current: SagaOrchestrator | null,
    logger: LoggerLike | null,
    cache?: import('../capabilities/cache').CacheLike | null,
): SagaOrchestrator {
    return current ?? new SagaOrchestrator({ logger, cache });
}

/**
 * Assert that the pool manager is configured and return the instance.
 * Throws `INVALID_CONFIG` when not configured.
 */
export function requireRuntimePoolManager(poolManager: ConnectionPoolManager | null): ConnectionPoolManager {
    if (!poolManager) {
        throw createError(ErrorCodes.INVALID_CONFIG, 'MonSQLize pool() requires options.pools configuration.');
    }
    return poolManager;
}
