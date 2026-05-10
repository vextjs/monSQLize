import {
    BatchQueue,
    ChangeStreamSyncManager,
    ConnectionPoolManager,
    DistributedCacheInvalidator,
    expr,
    createExpression,
    createRedisCacheAdapter,
    FunctionCache,
    generateQueryHash,
    Logger,
    MemoryCache,
    Model,
    MonSQLizeRuntime,
    ResumeTokenStore,
    SagaOrchestrator,
    SlowQueryLogConfigManager,
    SlowQueryLogManager,
    validateSyncConfig,
    withCache,
} from './runtime-core';
import { Lock, LockAcquireError, LockManager, LockTimeoutError } from '../capabilities/lock';
import { CacheLockManager, Transaction, TransactionManager } from '../capabilities/transaction';

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

export = MonSQLize;

