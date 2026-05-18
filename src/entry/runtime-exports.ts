/**
 * runtime-exports.ts — 公共符号桶形导出
 *
 * 说明：
 * - 从各子模块直接重新导出供外部使用的类型和实现
 * - 保持与原 runtime-core.ts 内联导出完全兼容，不改变任何公开 API
 * - 当需要新增公共符号时，在此文件追加即可，无需动 runtime-core.ts 主体
 */

export {
    MongoCollectionAccessor as CollectionFacade,
    MongoDbAccessor as DbFacade,
} from '../adapters/mongodb/common/accessors';
export { Logger } from '../core/logger';
export { MemoryCache, createRedisCacheAdapter, DistributedCacheInvalidator } from '../capabilities/cache';
export type { CacheStats } from '../capabilities/cache';
export { FunctionCache, withCache } from '../capabilities/function-cache';
export type { CachedFunction, WithCacheOptions } from '../capabilities/function-cache';
export { Model } from '../capabilities/model';
export type {
    ModelConnection,
    ModelDefinition,
    PopulateConfig,
    PopulateProxy,
    RelationConfig,
    ValidationResult,
    VirtualConfig,
} from '../capabilities/model';
export {
    createExpression,
    compilePipelineExpressions,
    expr,
    hasExpressionInObject,
    hasExpressionInPipeline,
    isExpressionObject,
} from '../core/expression';
export type { ExpressionObject } from '../core/expression';
export { ConnectionPoolManager } from '../capabilities/pool';
export type {
    ConnectionPoolManagerOptions,
    FallbackStrategy,
    PoolConfig,
    PoolHealthStatus,
    PoolRole,
    PoolStats,
    PoolStrategy,
} from '../capabilities/pool';
export { ChangeStreamSyncManager, ResumeTokenStore, validateSyncConfig } from '../capabilities/sync';
export type {
    ResumeTokenConfig,
    SyncChangeEvent,
    SyncConfig,
    SyncStats,
    SyncTargetConfig,
} from '../capabilities/sync';
export {
    BatchQueue,
    DEFAULT_SLOW_QUERY_LOG_CONFIG,
    SlowQueryLogConfigManager,
    SlowQueryLogManager,
    generateQueryHash,
    getSlowQueryThreshold,
    withSlowQueryLog,
} from '../capabilities/slow-query-log';
export type {
    SlowQueryLogConfig,
    SlowQueryLogConfigInput,
    SlowQueryLogEntry,
    SlowQueryLogFilter,
    SlowQueryLogQueryOptions,
    SlowQueryLogRecord,
} from '../capabilities/slow-query-log';
export { SagaOrchestrator } from '../capabilities/saga';
export type {
    SagaDefinition,
    SagaOrchestratorOptions,
    SagaResult,
    SagaStats,
    SagaStep,
} from '../capabilities/saga';
export { encodeCursor, decodeCursor } from '../utils/cursor';
export {
    ErrorCodes,
    createError,
    createConnectionError,
    createValidationError,
    createCursorError,
    createQueryTimeoutError,
} from '../core/errors';
export { normalizeProjection, normalizeSort } from '../utils/normalize';
export { makePageResult } from '../utils/page-result';
export { validateRange, validatePositiveInteger } from '../utils/validation';
export { DistributedCacheLockManager, Lock, LockAcquireError, LockTimeoutError, LockManager } from '../capabilities/lock';
export type { LockOptions, LockStats } from '../capabilities/lock';
export { Transaction, TransactionManager, CacheLockManager } from '../capabilities/transaction';
export type { MongoSession, TransactionOptions, TransactionStats } from '../capabilities/transaction';
export { CountQueue } from '../capabilities/count-queue';
export type { CountQueueOptions, CountQueueStats } from '../capabilities/count-queue';
export type { LoggerLike } from '../core/logger';
export type { MultiLevelCacheOptions, MultiLevelCachePolicy, WritePolicy } from '../../types/runtime';
export type { HealthView } from '../../types/collection';
export type { MonSQLizeOptions } from '../../types/monsqlize';
export type { SyncTargetHealthCheckConfig } from '../../types/sync';
