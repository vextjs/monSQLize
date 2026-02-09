declare module 'monsqlize' {
    // ========================================
    // 导入所有模块
    // ========================================
    import type * as Base from './types/base';
    import type * as Expression from './types/expression';
    import type * as Cache from './types/cache';
    import type * as Options from './types/options';
    import type * as Query from './types/query';
    import type * as Write from './types/write';
    import type * as Batch from './types/batch';
    import type * as Pagination from './types/pagination';
    import type * as Stream from './types/stream';
    import type * as Transaction from './types/transaction';
    import type * as Lock from './types/lock';
    import type * as Chain from './types/chain';
    import type * as Pool from './types/pool';
    import type * as Saga from './types/saga';
    import type * as Sync from './types/sync';
    import type * as Collection from './types/collection';
    import type * as Model from './types/model';
    import type * as MonSQLizeModule from './types/monsqlize';
    import type * as FunctionCacheTypes from './types/function-cache';

    // ========================================
    // 基础类型
    // ========================================
    export import DbType = Base.DbType;
    export import ExpressionObject = Base.ExpressionObject;
    export import ExpressionContext = Base.ExpressionContext;
    export import ExpressionFunction = Base.ExpressionFunction;
    export import LoggerLike = Base.LoggerLike;
    export import LoggerOptions = Base.LoggerOptions;
    export import ErrorCodes = Base.ErrorCodes;
    export import MonSQLizeError = Base.MonSQLizeError;

    // ========================================
    // 表达式系统
    // ========================================
    export import UnifiedExpressionOperators = Expression.UnifiedExpressionOperators;

    // ========================================
    // 缓存相关
    // ========================================
    export import CacheLike = Cache.CacheLike;
    export import MemoryCacheOptions = Cache.MemoryCacheOptions;
    export import WritePolicy = Cache.WritePolicy;
    export import MultiLevelCachePolicy = Cache.MultiLevelCachePolicy;
    export import MultiLevelCacheOptions = Cache.MultiLevelCacheOptions;

    // ========================================
    // 配置选项
    // ========================================
    export import SSHConfig = Options.SSHConfig;
    export import TransactionOptions = Options.TransactionOptions;
    export import BaseOptions = Options.BaseOptions;

    // ========================================
    // 查询选项
    // ========================================
    export import MetaOptions = Query.MetaOptions;
    export import FindOptions = Query.FindOptions;
    export import CountOptions = Query.CountOptions;
    export import AggregateOptions = Query.AggregateOptions;
    export import DistinctOptions = Query.DistinctOptions;

    // ========================================
    // 写操作
    // ========================================
    export import WriteConcern = Write.WriteConcern;
    export import InsertOneSimplifiedOptions = Write.InsertOneSimplifiedOptions;
    export import InsertOneOptions = Write.InsertOneOptions;
    export import InsertOneResult = Write.InsertOneResult;
    export import InsertManySimplifiedOptions = Write.InsertManySimplifiedOptions;
    export import InsertManyOptions = Write.InsertManyOptions;
    export import InsertManyResult = Write.InsertManyResult;

    // ========================================
    // 批量操作
    // ========================================
    export import BatchProgress = Batch.BatchProgress;
    export import RetryInfo = Batch.RetryInfo;
    export import InsertBatchOptions = Batch.InsertBatchOptions;
    export import UpdateBatchOptions = Batch.UpdateBatchOptions;
    export import DeleteBatchOptions = Batch.DeleteBatchOptions;
    export import InsertBatchResult = Batch.InsertBatchResult;
    export import UpdateBatchResult = Batch.UpdateBatchResult;
    export import DeleteBatchResult = Batch.DeleteBatchResult;

    // ========================================
    // 分页系统
    // ========================================
    export import BookmarkKeyDims = Pagination.BookmarkKeyDims;
    export import PrewarmBookmarksResult = Pagination.PrewarmBookmarksResult;
    export import ListBookmarksResult = Pagination.ListBookmarksResult;
    export import ClearBookmarksResult = Pagination.ClearBookmarksResult;
    export import JumpOptions = Pagination.JumpOptions;
    export import OffsetJumpOptions = Pagination.OffsetJumpOptions;
    export import TotalsOptions = Pagination.TotalsOptions;
    export import FindPageOptions = Pagination.FindPageOptions;
    export import MetaInfo = Pagination.MetaInfo;
    export import TotalsInfo = Pagination.TotalsInfo;
    export import PageInfo = Pagination.PageInfo;
    export import PageResult = Pagination.PageResult;
    export import ResultWithMeta = Pagination.ResultWithMeta;

    // ========================================
    // 流式查询
    // ========================================
    export import StreamOptions = Stream.StreamOptions;
    export import ExplainOptions = Stream.ExplainOptions;
    export import ExplainResult = Stream.ExplainResult;

    // ========================================
    // 事务
    // ========================================
    export import MongoSession = Transaction.MongoSession;
    export import Transaction = Transaction.Transaction;

    // ========================================
    // 业务锁
    // ========================================
    export import LockOptions = Lock.LockOptions;
    export import Lock = Lock.Lock;
    export import LockStats = Lock.LockStats;
    export import LockAcquireError = Lock.LockAcquireError;
    export import LockTimeoutError = Lock.LockTimeoutError;

    // ========================================
    // 链式调用
    // ========================================
    export import CollationOptions = Chain.CollationOptions;
    export import FindChain = Chain.FindChain;
    export import AggregateChain = Chain.AggregateChain;

    // ========================================
    // 连接池
    // ========================================
    export import PoolRole = Pool.PoolRole;
    export import PoolStrategy = Pool.PoolStrategy;
    export import FallbackStrategy = Pool.FallbackStrategy;
    export import PoolConfig = Pool.PoolConfig;
    export import ConnectionPoolManagerOptions = Pool.ConnectionPoolManagerOptions;
    export import PoolHealthStatus = Pool.PoolHealthStatus;
    export import PoolStats = Pool.PoolStats;
    export import ConnectionPoolManager = Pool.ConnectionPoolManager;

    // ========================================
    // Saga 事务
    // ========================================
    export import SagaStep = Saga.SagaStep;
    export import SagaDefinition = Saga.SagaDefinition;
    export import SagaContext = Saga.SagaContext;
    export import SagaResult = Saga.SagaResult;
    export import SagaOrchestratorOptions = Saga.SagaOrchestratorOptions;
    export import SagaOrchestrator = Saga.SagaOrchestrator;

    // ========================================
    // 数据同步
    // ========================================
    export import SyncTarget = Sync.SyncTarget;
    export import ResumeTokenConfig = Sync.ResumeTokenConfig;
    export import SyncConfig = Sync.SyncConfig;
    export import SyncStats = Sync.SyncStats;

    // ========================================
    // Collection API
    // ========================================
    export import HealthView = Collection.HealthView;
    export import CollectionAccessor = Collection.CollectionAccessor;
    export import Collection = Collection.Collection;
    export import DbAccessor = Collection.DbAccessor;

    // ========================================
    // Model 层
    // ========================================
    export import SchemaDSL = Model.SchemaDSL;
    export import DefaultValue = Model.DefaultValue;
    export import HookContext = Model.HookContext;
    export import ValidationResult = Model.ValidationResult;
    export import ModelDefinition = Model.ModelDefinition;
    export import RelationConfig = Model.RelationConfig;
    export import PopulateConfig = Model.PopulateConfig;
    export import PopulateProxy = Model.PopulateProxy;
    export import VirtualConfig = Model.VirtualConfig;
    export import ModelInstance = Model.ModelInstance;
    export import Model = Model.Model;

    // ========================================
    // MonSQLize 主类
    // ========================================
    export import MonSQLize = MonSQLizeModule.MonSQLize;
    export default MonSQLizeModule.MonSQLize;

    // ========================================
    // 函数缓存（v1.1.4+）
    // ========================================
    export import WithCacheOptions = FunctionCacheTypes.WithCacheOptions;
    export import CacheStats = FunctionCacheTypes.CacheStats;
    export import FunctionCacheOptions = FunctionCacheTypes.FunctionCacheOptions;
    export import CachedFunction = FunctionCacheTypes.CachedFunction;
    export import withCache = FunctionCacheTypes.withCache;
    export import FunctionCache = FunctionCacheTypes.FunctionCache;
}

