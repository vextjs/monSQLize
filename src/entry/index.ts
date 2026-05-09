import {
    CacheLockManager,
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
    TransactionManager,
    withCache,
} from './runtime-core';

const MonSQLize = MonSQLizeRuntime as typeof MonSQLizeRuntime & Record<string, unknown>;

MonSQLize.Logger = Logger;
MonSQLize.MemoryCache = MemoryCache;
MonSQLize.createRedisCacheAdapter = createRedisCacheAdapter;
MonSQLize.TransactionManager = TransactionManager;
MonSQLize.CacheLockManager = CacheLockManager;
MonSQLize.DistributedCacheInvalidator = DistributedCacheInvalidator;
MonSQLize.ConnectionPoolManager = ConnectionPoolManager;
MonSQLize.Model = Model;
MonSQLize.expr = expr;
MonSQLize.createExpression = createExpression;
MonSQLize.withCache = withCache;
MonSQLize.FunctionCache = FunctionCache;

export = MonSQLize;

