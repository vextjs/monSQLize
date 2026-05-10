import {
    ConnectionPoolManager,
    DistributedCacheInvalidator,
    expr,
    createExpression,
    createRedisCacheAdapter,
    FunctionCache,
    Logger,
    MemoryCache,
    Model,
    MonSQLizeRuntime,
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

export = MonSQLize;

