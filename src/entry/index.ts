import {
    BatchQueue,
    CountQueue,
    DEFAULT_SLOW_QUERY_LOG_CONFIG,
    ChangeStreamSyncManager,
    ConnectionPoolManager,
    DistributedCacheInvalidator,
    DistributedCacheLockManager,
    encodeCursor,
    decodeCursor,
    ErrorCodes,
    expr,
    createExpression,
    createRedisCacheAdapter,
    createConnectionError,
    createError,
    createValidationError,
    createCursorError,
    createQueryTimeoutError,
    FunctionCache,
    generateQueryHash,
    getSlowQueryThreshold,
    Logger,
    makePageResult,
    MemoryCache,
    Model,
    MonSQLizeRuntime,
    normalizeProjection,
    normalizeSort,
    ResumeTokenStore,
    SagaOrchestrator,
    SlowQueryLogConfigManager,
    SlowQueryLogManager,
    validateRange,
    validatePositiveInteger,
    validateSyncConfig,
    withCache,
    withSlowQueryLog,
} from './runtime-core';
import { Lock, LockAcquireError, LockManager, LockTimeoutError } from '../capabilities/lock';
import { CacheLockManager, Transaction, TransactionManager } from '../capabilities/transaction';
import {
    HealthChecker,
    PoolSelector,
    PoolStatsManager,
    validatePoolConfig,
    validatePoolConfigSafe,
} from '../capabilities/pool';

const MonSQLize = MonSQLizeRuntime as typeof MonSQLizeRuntime & Record<string, unknown>;

MonSQLize.Logger = Logger;
MonSQLize.MemoryCache = MemoryCache;
MonSQLize.Transaction = Transaction;
MonSQLize.createRedisCacheAdapter = createRedisCacheAdapter;
MonSQLize.TransactionManager = TransactionManager;
MonSQLize.CacheLockManager = CacheLockManager;
MonSQLize.Lock = Lock;
MonSQLize.LockManager = LockManager;
MonSQLize.LockAcquireError = LockAcquireError;
MonSQLize.LockTimeoutError = LockTimeoutError;
MonSQLize.DistributedCacheInvalidator = DistributedCacheInvalidator;
MonSQLize.ConnectionPoolManager = ConnectionPoolManager;
MonSQLize.HealthChecker = HealthChecker;
MonSQLize.PoolSelector = PoolSelector;
MonSQLize.PoolStats = PoolStatsManager;
MonSQLize.validatePoolConfig = validatePoolConfig;
MonSQLize.validatePoolConfigSafe = validatePoolConfigSafe;
MonSQLize.Model = Model;
MonSQLize.expr = expr;
MonSQLize.createExpression = createExpression;
MonSQLize.withCache = withCache;
MonSQLize.FunctionCache = FunctionCache;
MonSQLize.ChangeStreamSyncManager = ChangeStreamSyncManager;
MonSQLize.ResumeTokenStore = ResumeTokenStore;
MonSQLize.validateSyncConfig = validateSyncConfig;
MonSQLize.SlowQueryLogManager = SlowQueryLogManager;
MonSQLize.SlowQueryLogConfigManager = SlowQueryLogConfigManager;
MonSQLize.BatchQueue = BatchQueue;
MonSQLize.generateQueryHash = generateQueryHash;
MonSQLize.SagaOrchestrator = SagaOrchestrator;
MonSQLize.encodeCursor = encodeCursor;
MonSQLize.decodeCursor = decodeCursor;
MonSQLize.ErrorCodes = ErrorCodes;
MonSQLize.normalizeProjection = normalizeProjection;
MonSQLize.normalizeSort = normalizeSort;
MonSQLize.makePageResult = makePageResult;
MonSQLize.validateRange = validateRange;
MonSQLize.validatePositiveInteger = validatePositiveInteger;
MonSQLize.DistributedCacheLockManager = DistributedCacheLockManager;
MonSQLize.withSlowQueryLog = withSlowQueryLog;
MonSQLize.getSlowQueryThreshold = getSlowQueryThreshold;
MonSQLize.CountQueue = CountQueue;
MonSQLize.DEFAULT_SLOW_QUERY_LOG_CONFIG = DEFAULT_SLOW_QUERY_LOG_CONFIG;
MonSQLize.createConnectionError = createConnectionError;
MonSQLize.createError = createError;
MonSQLize.createValidationError = createValidationError;
MonSQLize.createCursorError = createCursorError;
MonSQLize.createQueryTimeoutError = createQueryTimeoutError;

export = MonSQLize;

