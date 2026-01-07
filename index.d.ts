declare module 'monsqlize' {
    type DbType = 'mongodb';

    /**
     * 日志记录器接口
     * v2.0 新增：支持 traceId 和结构化日志
     */
    interface LoggerLike {
        debug?: (...args: any[]) => void;
        info?: (...args: any[]) => void;
        warn?: (...args: any[]) => void;
        error?: (...args: any[]) => void;
        withTraceId?: (fn: Function, traceId?: string) => any;
        getTraceId?: () => string | null;
    }

    /**
     * 日志选项
     */
    interface LoggerOptions {
        /** 是否使用结构化日志（JSON 格式） */
        structured?: boolean;
        /** 是否启用 traceId（分布式追踪） */
        enableTraceId?: boolean;
    }

    /**
     * 统一错误码
     */
    const enum ErrorCodes {
        VALIDATION_ERROR = 'VALIDATION_ERROR',
        INVALID_COLLECTION_NAME = 'INVALID_COLLECTION_NAME',
        INVALID_DATABASE_NAME = 'INVALID_DATABASE_NAME',
        INVALID_CURSOR = 'INVALID_CURSOR',
        CURSOR_SORT_MISMATCH = 'CURSOR_SORT_MISMATCH',
        JUMP_TOO_FAR = 'JUMP_TOO_FAR',
        STREAM_NO_JUMP = 'STREAM_NO_JUMP',
        STREAM_NO_TOTALS = 'STREAM_NO_TOTALS',
        CONNECTION_TIMEOUT = 'CONNECTION_TIMEOUT',
        CONNECTION_FAILED = 'CONNECTION_FAILED',
        CONNECTION_CLOSED = 'CONNECTION_CLOSED',
        DATABASE_ERROR = 'DATABASE_ERROR',
        QUERY_TIMEOUT = 'QUERY_TIMEOUT',
        CACHE_ERROR = 'CACHE_ERROR',
        CACHE_TIMEOUT = 'CACHE_TIMEOUT',
        INVALID_CONFIG = 'INVALID_CONFIG',
        UNSUPPORTED_DATABASE = 'UNSUPPORTED_DATABASE',
    }

    // ============================================================================
    // 事务相关类型定义（Transaction API）
    // ============================================================================

    /**
     * 业务锁配置选项
     * @since v1.4.0
     */
    interface LockOptions {
        /** 锁过期时间（毫秒），默认 10000 */
        ttl?: number;
        /** 获取锁失败时的重试次数，默认 3 */
        retryTimes?: number;
        /** 重试间隔（毫秒），默认 100 */
        retryDelay?: number;
        /** Redis 不可用时是否降级为无锁执行，默认 false */
        fallbackToNoLock?: boolean;
    }

    /**
     * 锁对象
     * 表示一个已获取的锁，提供释放和续期方法
     * @since v1.4.0
     */
    interface Lock {
        /** 锁的 Key */
        readonly key: string;
        /** 锁的唯一ID */
        readonly lockId: string;
        /** 是否已释放 */
        readonly released: boolean;

        /**
         * 释放锁
         * @returns Promise<boolean> 是否成功释放
         */
        release(): Promise<boolean>;

        /**
         * 续期（延长 TTL）
         * @param ttl - 新的过期时间（毫秒），默认使用原TTL
         * @returns Promise<boolean> 是否成功续期
         */
        renew(ttl?: number): Promise<boolean>;

        /**
         * 检查锁是否仍被持有
         * @returns boolean
         */
        isHeld(): boolean;

        /**
         * 获取锁持有时间（毫秒）
         * @returns number
         */
        getHoldTime(): number;
    }

    /**
     * 锁统计信息
     * @since v1.4.0
     */
    interface LockStats {
        /** 成功获取锁的次数 */
        locksAcquired: number;
        /** 成功释放锁的次数 */
        locksReleased: number;
        /** 锁检查次数 */
        lockChecks: number;
        /** 错误次数 */
        errors: number;
        /** 锁键前缀 */
        lockKeyPrefix: string;
        /** 锁最大持续时间 */
        maxDuration: number;
    }

    /**
     * 锁获取失败错误
     * @since v1.4.0
     */
    class LockAcquireError extends Error {
        readonly code: 'LOCK_ACQUIRE_FAILED';
    }

    /**
     * 锁超时错误
     * @since v1.4.0
     */
    class LockTimeoutError extends Error {
        readonly code: 'LOCK_TIMEOUT';
    }

    /**
     * MongoDB 事务会话（原生 ClientSession）
     * @since v0.2.0
     */
    interface MongoSession {
        /** 会话 ID */
        id: any;
        /** 是否在事务中 */
        inTransaction(): boolean;
        /** 事务状态 */
        transaction?: {
            state: string;
        };
        /** 结束会话 */
        endSession(): void;
        /** 其他 MongoDB 原生方法 */
        [key: string]: any;
    }

    /**
     * 事务选项配置
     * @since v0.2.0
     */
    interface TransactionOptions {
        /** 读关注级别（Read Concern） */
        readConcern?: {
            level: 'local' | 'majority' | 'snapshot' | 'linearizable' | 'available';
        };
        /** 读偏好（Read Preference） */
        readPreference?: 'primary' | 'primaryPreferred' | 'secondary' | 'secondaryPreferred' | 'nearest';
        /** 因果一致性（Causal Consistency） */
        causalConsistency?: boolean;
        /** 事务最大执行时间（毫秒） */
        maxDuration?: number;
        /** 是否启用自动重试 */
        enableRetry?: boolean;
        /** 最大重试次数 */
        maxRetries?: number;
        /** 重试延迟（毫秒） */
        retryDelay?: number;
        /** 重试退避系数 */
        retryBackoff?: number;
        /** 是否启用缓存锁 */
        enableCacheLock?: boolean;
        /** 缓存锁清理间隔（毫秒） */
        lockCleanupInterval?: number;
    }

    /**
     * Transaction 事务类
     * 封装 MongoDB 原生会话，提供事务生命周期管理
     * @since v0.2.0
     */
    interface Transaction {
        /** 事务唯一 ID */
        readonly id: string;

        /** MongoDB 原生会话对象（传递给查询方法） */
        readonly session: MongoSession;

        /**
         * 启动事务
         * @returns Promise<void>
         */
        start(): Promise<void>;

        /**
         * 提交事务
         * @returns Promise<void>
         */
        commit(): Promise<void>;

        /**
         * 中止（回滚）事务
         * @returns Promise<void>
         */
        abort(): Promise<void>;

        /**
         * 结束会话（清理资源）
         * @returns Promise<void>
         */
        end(): Promise<void>;

        /**
         * 获取事务执行时长（毫秒）
         * @returns number
         */
        getDuration(): number;

        /**
         * 获取事务信息
         * @returns 事务状态信息
         */
        getInfo(): {
            id: string;
            status: 'pending' | 'started' | 'committed' | 'aborted';
            duration: number;
            sessionId: string;
        };
    }

    /**
     * 标准错误接口
     */
    interface MonSQLizeError extends Error {
        code: string;
        details?: any[];
        cause?: Error;
    }

    interface CacheLike {
        get(key: string): Promise<any>;
        set(key: string, val: any, ttl?: number): Promise<void>;
        del(key: string): Promise<boolean>;
        exists(key: string): Promise<boolean>;
        getMany(keys: string[]): Promise<Record<string, any>>;
        setMany(obj: Record<string, any>, ttl?: number): Promise<boolean>;
        delMany(keys: string[]): Promise<number>;
        delPattern(pattern: string): Promise<number>;
        clear(): void;
        keys(pattern?: string): string[];
        getStats?(): any;
    }

    /**
     * 内置内存缓存的配置（MemoryCacheOptions）
     * - maxSize: 最大键数量（默认 100000）
     * - maxMemory: 最大内存占用（字节；0 表示不限制）
     * - enableStats: 是否启用统计，默认 true
     */
    interface MemoryCacheOptions {
        maxSize?: number;
        maxMemory?: number;
        enableStats?: boolean;
        // 允许透传其他实现细节，但不做强约束
        [k: string]: any;
    }

    /**
     * SSH 隧道配置
     * @since v1.3.0
     */
    interface SSHConfig {
        /** SSH 服务器地址 */
        host: string;
        /** SSH 服务器端口（默认 22） */
        port?: number;
        /** SSH 用户名 */
        username: string;
        /** SSH 密码（与 privateKey 二选一） */
        password?: string;
        /** SSH 私钥（字符串或 Buffer，与 password 二选一） */
        privateKey?: string | Buffer;
        /** 私钥密码（如果私钥有加密） */
        passphrase?: string;
        /** 连接超时时间（毫秒，默认 30000） */
        readyTimeout?: number;
        /** 保持连接的间隔时间（毫秒，默认 10000） */
        keepaliveInterval?: number;
        /** 目标数据库主机（相对于 SSH 服务器，默认 'localhost'） */
        dstHost?: string;
        /** 目标数据库端口（相对于 SSH 服务器） */
        dstPort?: number;
    }

    /**
     * 多层缓存写策略
     * - both：本地+远端双写（等待远端完成）
     * - local-first-async-remote：本地先返回，远端异步写（降低尾延迟）
     */
    type WritePolicy = 'both' | 'local-first-async-remote';

    interface MultiLevelCachePolicy {
        writePolicy?: WritePolicy;
        /** 远端命中后是否回填本地，默认 true */
        backfillLocalOnRemoteHit?: boolean;
    }

    /**
     * 多层缓存配置对象（配置式启用双层缓存）
     * 说明：当 BaseOptions.cache 传入该对象时（且 multiLevel=true），框架会自动创建 MultiLevelCache：
     * - local：始终使用内置内存缓存（仅接受配置对象 MemoryCacheOptions）
     * - remote：可传 CacheLike 实例（推荐生产），或传配置对象以退化为“内存占位”
     * - remote.timeoutMs：远端操作超时（毫秒，默认 50）
     * - publish：可选的广播函数（例如用于 pub/sub 触发跨进程本地失效）
     */
    interface MultiLevelCacheOptions {
        multiLevel: true;
        local?: MemoryCacheOptions;
        remote?: CacheLike | (MemoryCacheOptions & { timeoutMs?: number });
        policy?: MultiLevelCachePolicy;
        publish?: (msg: any) => void;
    }
    interface BaseOptions {
        type: DbType;
        databaseName: string;
        config: any;
        /** SSH 隧道配置（v1.3.0+） */
        ssh?: SSHConfig;
        cache?: CacheLike | MemoryCacheOptions | MultiLevelCacheOptions | object;
        logger?: LoggerLike;
        maxTimeMS?: number; // 全局默认查询超时（毫秒）
        findLimit?: number; // 全局默认 find limit（未传 limit 时使用；0 表示不限制）
        namespace?: { instanceId?: string; scope?: 'database' | 'connection' };
        slowQueryMs?: number; // 慢查询日志阈值（毫秒），默认 500
        /** MongoDB 副本集读偏好（全局配置）
         * - 'primary': 仅读主节点（默认）
         * - 'primaryPreferred': 优先读主节点，主节点不可用时读从节点
         * - 'secondary': 仅读从节点
         * - 'secondaryPreferred': 优先读从节点，从节点不可用时读主节点
         * - 'nearest': 读最近的节点（低延迟）
         */
        readPreference?: 'primary' | 'primaryPreferred' | 'secondary' | 'secondaryPreferred' | 'nearest';
        /**
         * 事务配置（MongoDB Transaction API）
         * 需要 MongoDB 4.0+ 且部署在副本集或分片集群上
         * @since v0.2.0
         */
        transaction?: TransactionOptions | false;
        // 统一默认（新增可选项）
        findPageMaxLimit?: number;          // 深分页页大小上限（默认 500）
        cursorSecret?: string;              // 可选：游标签名密钥（如启用 HMAC 验签）
        log?: {
            slowQueryTag?: { event?: string; code?: string };
            formatSlowQuery?: (meta: any) => any;
        };
        /**
         * ObjectId 自动转换配置（v1.3.0+）
         * 自动将字符串 _id 转换为 ObjectId
         * @default true（MongoDB）
         * @since v1.3.0
         */
        autoConvertObjectId?: boolean | {
            /** 是否启用（默认 true） */
            enabled?: boolean;
            /** 排除字段列表 */
            excludeFields?: string[];
            /** 自定义字段模式 */
            customFieldPatterns?: string[];
            /** 最大转换深度（默认 10） */
            maxDepth?: number;
            /** 日志级别（默认 'warn'） */
            logLevel?: 'info' | 'warn' | 'error';
        };
        /**
         * Count 队列配置（高并发控制）
         * 避免大量并发 count 查询压垮数据库
         * @default { enabled: true, concurrency: CPU核心数 }
         * @since v1.0.0
         */
        countQueue?: boolean | {
            /** 是否启用队列（默认 true） */
            enabled?: boolean;
            /** 并发数（默认 CPU 核心数，最少 4，最多 16） */
            concurrency?: number;
            /** 最大队列长度（默认 10000） */
            maxQueueSize?: number;
            /** 超时时间（毫秒，默认 60000） */
            timeout?: number;
        };
    }
    interface FindOptions {
        projection?: Record<string, any> | string[];
        sort?: Record<string, 1 | -1>;
        limit?: number;
        skip?: number;
        cache?: number;
        maxTimeMS?: number;
        /** Mongo-only: 透传 hint 到驱动 */
        hint?: any;
        /** Mongo-only: 透传 collation 到驱动 */
        collation?: any;
        /** 查询注释（用于生产环境日志跟踪）*/
        comment?: string;
        meta?: boolean | MetaOptions;    // 返回耗时元信息
    }
    interface CountOptions {
        cache?: number;
        maxTimeMS?: number;
        /** Mongo-only: 透传 hint 到 countDocuments */
        hint?: any;
        /** Mongo-only: 透传 collation 到 countDocuments */
        collation?: any;
        /** 查询注释（用于生产环境日志跟踪）*/
        comment?: string;
        meta?: boolean | MetaOptions;
    }

    // ============================================================================
    // 批量操作相关类型定义（Batch Operations）
    // ============================================================================

    /**
     * insertBatch 选项
     * @since v1.0.0
     */
    interface InsertBatchOptions {
        /** 每批插入的文档数量（默认 1000） */
        batchSize?: number;
        /** 并发批次数（1=串行，>1=并行，默认 1） */
        concurrency?: number;
        /** 批次内是否按顺序插入（默认 false） */
        ordered?: boolean;
        /** 进度回调函数 */
        onProgress?: (progress: BatchProgress) => void;
        /** 错误处理策略: 'stop'|'skip'|'collect'|'retry'（默认 'stop'） */
        onError?: 'stop' | 'skip' | 'collect' | 'retry';
        /** 失败批次最大重试次数（onError='retry'时有效，默认 3） */
        retryAttempts?: number;
        /** 重试延迟时间（毫秒，默认 1000） */
        retryDelay?: number;
        /** 重试回调函数 */
        onRetry?: (retryInfo: RetryInfo) => void;
        /** 写确认级别 */
        writeConcern?: { w?: number | string; j?: boolean; wtimeout?: number };
        /** 是否绕过文档验证（默认 false） */
        bypassDocumentValidation?: boolean;
        /** 操作注释（用于日志追踪） */
        comment?: string;
    }

    /**
     * updateBatch 选项
     * @since v1.0.0
     */
    interface UpdateBatchOptions {
        /** 每批更新的文档数量（默认 1000） */
        batchSize?: number;
        /** 是否预先 count 总数（用于进度百分比，默认 true） */
        estimateProgress?: boolean;
        /** 进度回调函数 */
        onProgress?: (progress: BatchProgress) => void;
        /** 错误处理策略: 'stop'|'skip'|'collect'|'retry'（默认 'stop'） */
        onError?: 'stop' | 'skip' | 'collect' | 'retry';
        /** 失败批次最大重试次数（onError='retry'时有效，默认 3） */
        retryAttempts?: number;
        /** 重试延迟时间（毫秒，默认 1000） */
        retryDelay?: number;
        /** 重试回调函数 */
        onRetry?: (retryInfo: RetryInfo) => void;
        /** 写确认级别 */
        writeConcern?: { w?: number | string; j?: boolean; wtimeout?: number };
        /** 未匹配时是否插入（默认 false） */
        upsert?: boolean;
        /** 数组过滤器 */
        arrayFilters?: any[];
        /** 操作注释（用于日志追踪） */
        comment?: string;
    }

    /**
     * deleteBatch 选项
     * @since v1.0.0
     */
    interface DeleteBatchOptions {
        /** 每批删除的文档数量（默认 1000） */
        batchSize?: number;
        /** 是否预先 count 总数（用于进度百分比，默认 true） */
        estimateProgress?: boolean;
        /** 进度回调函数 */
        onProgress?: (progress: BatchProgress) => void;
        /** 错误处理策略: 'stop'|'skip'|'collect'|'retry'（默认 'stop'） */
        onError?: 'stop' | 'skip' | 'collect' | 'retry';
        /** 失败批次最大重试次数（onError='retry'时有效，默认 3） */
        retryAttempts?: number;
        /** 重试延迟时间（毫秒，默认 1000） */
        retryDelay?: number;
        /** 重试回调函数 */
        onRetry?: (retryInfo: RetryInfo) => void;
        /** 写确认级别 */
        writeConcern?: { w?: number | string; j?: boolean; wtimeout?: number };
        /** 操作注释（用于日志追踪） */
        comment?: string;
    }

    /**
     * 批量操作进度信息
     */
    interface BatchProgress {
        /** 当前批次号（从1开始） */
        currentBatch: number;
        /** 总批次数 */
        totalBatches: number;
        /** 已处理数量 */
        inserted?: number;
        modified?: number;
        deleted?: number;
        /** 总数量 */
        total: number | null;
        /** 完成百分比（0-100） */
        percentage: number | null;
        /** 错误数量 */
        errors: number;
        /** 重试数量 */
        retries: number;
    }

    /**
     * 重试信息
     */
    interface RetryInfo {
        /** 批次索引（从0开始） */
        batchIndex: number;
        /** 当前重试次数 */
        attempt: number;
        /** 最大重试次数 */
        maxAttempts: number;
        /** 错误信息 */
        error: Error;
    }

    /**
     * insertBatch 返回结果
     */
    interface InsertBatchResult {
        /** 是否被确认 */
        acknowledged: boolean;
        /** 总文档数 */
        totalCount: number;
        /** 成功插入数 */
        insertedCount: number;
        /** 总批次数 */
        batchCount: number;
        /** 错误列表 */
        errors: Array<{ batchIndex: number; message: string; details?: any }>;
        /** 重试记录列表 */
        retries: Array<{ batchIndex: number; attempts: number; success: boolean }>;
        /** 插入的文档 _id 映射表 */
        insertedIds: Record<number, any>;
    }

    /**
     * updateBatch 返回结果
     */
    interface UpdateBatchResult {
        /** 是否被确认 */
        acknowledged: boolean;
        /** 总文档数（estimateProgress=true时有值） */
        totalCount: number | null;
        /** 匹配文档数 */
        matchedCount: number;
        /** 成功更新数 */
        modifiedCount: number;
        /** 插入数（upsert=true时） */
        upsertedCount: number;
        /** 总批次数 */
        batchCount: number;
        /** 错误列表 */
        errors: Array<{ batchIndex: number; message: string; details?: any }>;
        /** 重试记录列表 */
        retries: Array<{ batchIndex: number; attempts: number; success: boolean }>;
    }

    /**
     * deleteBatch 返回结果
     */
    interface DeleteBatchResult {
        /** 是否被确认 */
        acknowledged: boolean;
        /** 总文档数（estimateProgress=true时有值） */
        totalCount: number | null;
        /** 成功删除数 */
        deletedCount: number;
        /** 总批次数 */
        batchCount: number;
        /** 错误列表 */
        errors: Array<{ batchIndex: number; message: string; details?: any }>;
        /** 重试记录列表 */
        retries: Array<{ batchIndex: number; attempts: number; success: boolean }>;
    }

    interface AggregateOptions {
        cache?: number;                  // 缓存时间（毫秒），默认 0（不缓存）
        maxTimeMS?: number;              // 查询超时时间（毫秒）
        allowDiskUse?: boolean;          // 是否允许使用磁盘（默认 false）
        collation?: any;                 // 排序规则（可选）
        hint?: string | object;          // 索引提示（可选）
        comment?: string;                // 查询注释（可选）
        meta?: boolean | MetaOptions;    // 返回耗时元信息
    }

    interface DistinctOptions {
        cache?: number;                  // 缓存时间（毫秒），默认继承实例缓存配置
        maxTimeMS?: number;              // 查询超时时间（毫秒）
        collation?: any;                 // 排序规则（可选）
        hint?: string | object;          // 索引提示（可选）
        meta?: boolean | MetaOptions;    // 返回耗时元信息
    }

    // 写入操作相关接口
    interface WriteConcern {
        w?: number | 'majority';         // 写确认级别（默认 1）
        j?: boolean;                     // 是否等待日志落盘（默认 false）
        wtimeout?: number;               // 写超时时间（毫秒）
    }

    /**
     * 简化的插入选项（用于简化调用形式）
     */
    interface InsertOneSimplifiedOptions {
        writeConcern?: WriteConcern;     // 写确认级别（可选）
        bypassDocumentValidation?: boolean; // 跳过文档验证（可选）
        comment?: string;                // 查询注释（用于生产环境日志跟踪）
        session?: any;                   // 事务会话
    }

    interface InsertOneOptions {
        document: any;                   // 要插入的文档
        writeConcern?: WriteConcern;     // 写确认级别（可选）
        bypassDocumentValidation?: boolean; // 跳过文档验证（可选）
        comment?: string;                // 查询注释（用于生产环境日志跟踪）
    }

    interface InsertOneResult {
        acknowledged: boolean;           // 是否被确认
        insertedId: any;                 // 插入的文档 _id
    }

    /**
     * 简化的批量插入选项（用于简化调用形式）
     */
    interface InsertManySimplifiedOptions {
        ordered?: boolean;               // 是否有序插入（默认 true）
        writeConcern?: WriteConcern;     // 写确认级别（可选）
        bypassDocumentValidation?: boolean; // 跳过文档验证（可选）
        comment?: string;                // 查询注释（用于生产环境日志跟踪）
        session?: any;                   // 事务会话
    }

    interface InsertManyOptions {
        documents: any[];                // 要插入的文档数组
        ordered?: boolean;               // 是否有序插入（默认 true）
        writeConcern?: WriteConcern;     // 写确认级别（可选）
        bypassDocumentValidation?: boolean; // 跳过文档验证（可选）
        comment?: string;                // 查询注释（用于生产环境日志跟踪）
    }

    interface InsertManyResult {
        acknowledged: boolean;           // 是否被确认
        insertedCount: number;           // 成功插入的文档数量
        insertedIds: { [key: number]: any }; // 插入的文档 _id 映射表
    }

    interface StreamOptions {
        projection?: Record<string, any> | string[];  // 字段投影
        sort?: Record<string, 1 | -1>;   // 排序配置
        limit?: number;                  // 限制返回数量
        skip?: number;                   // 跳过数量
        batchSize?: number;              // 每批次大小（默认 1000）
        maxTimeMS?: number;              // 查询超时时间（毫秒）
        hint?: any;                      // 索引提示
        collation?: any;                 // 排序规则
        noCursorTimeout?: boolean;       // 禁用游标超时（默认 false）
    }

    // Explain 选项（查询执行计划诊断）
    interface ExplainOptions {
        projection?: object;             // 字段投影
        sort?: Record<string, 1 | -1>;   // 排序配置
        limit?: number;                  // 限制返回数量
        skip?: number;                   // 跳过数量
        maxTimeMS?: number;              // 查询超时时间（毫秒）
        hint?: any;                      // 索引提示
        collation?: any;                 // 排序规则
        verbosity?: 'queryPlanner' | 'executionStats' | 'allPlansExecution'; // 详细程度（默认 'queryPlanner'）
    }

    // Bookmark 维护 APIs 相关接口
    interface BookmarkKeyDims {
        sort?: Record<string, 1 | -1>;   // 排序配置（与 findPage 一致）
        limit?: number;                  // 每页数量
        query?: object;                  // 查询条件（用于计算 queryShape）
        pipeline?: object[];             // 聚合管道（用于计算 pipelineShape）
    }

    interface PrewarmBookmarksResult {
        warmed: number;                  // 成功预热的 bookmark 数量
        failed: number;                  // 预热失败的 bookmark 数量
        keys: string[];                  // 已缓存的 bookmark 键列表
    }

    interface ListBookmarksResult {
        count: number;                   // bookmark 总数
        pages: number[];                 // 已缓存的页码列表（排序后）
        keys: string[];                  // 缓存键列表
    }

    interface ClearBookmarksResult {
        cleared: number;                 // 清除的 bookmark 数量
        pattern: string;                 // 使用的匹配模式
        keysBefore: number;              // 清除前的 bookmark 数量
    }

    // 跳页相关类型
    interface JumpOptions {
        step?: number;                    // 书签密度：每隔 step 页存一个书签；默认 10
        maxHops?: number;                 // 单次跳页允许的"连续 after 次数（累计）"上限；默认 20
        keyDims?: object;                 // 可选；未传则自动生成去敏形状
        getBookmark?: (params: { keyDims: any; page: number }) => Promise<string | null>;
        saveBookmark?: (params: { keyDims: any; page: number; cursor: string; ttlMs?: number }) => Promise<void>;
    }

    interface OffsetJumpOptions {
        enable?: boolean;                 // 开启后，当 skip=(page-1)*limit ≤ maxSkip 时走 `$skip+$limit`
        maxSkip?: number;                 // 默认 50_000；超过则回退到"书签跳转"逻辑
    }

    interface TotalsOptions {
        mode?: 'none' | 'async' | 'approx' | 'sync'; // 默认 'none'
        maxTimeMS?: number;              // 用于 `countDocuments` 的超时（sync/async）
        ttlMs?: number;                  // 总数缓存 TTL（async/approx），默认 10 分钟
        hint?: any;                      // 计数 hint（可选）
        collation?: any;                 // 计数 collation（可选，与列表一致更安全）
    }

    interface MetaOptions {
        level?: 'op' | 'sub';            // sub: 返回子步骤耗时（仅 findPage）
        includeCache?: boolean;          // 包含缓存相关信息
    }

    // 深度分页（统一版）选项与返回类型
    interface FindPageOptions extends FindOptions {
        pipeline?: object[];
        after?: string;
        before?: string;
        limit: number;
        allowDiskUse?: boolean;
        /** Mongo-only: 透传 hint 到 aggregate */
        hint?: any;
        /** Mongo-only: 透传 collation 到 aggregate */
        collation?: any;

        // 新增：跳页相关参数
        page?: number;                   // 目标页（≥1）；与 after/before 互斥
        jump?: JumpOptions;              // 跳页（书签）配置
        offsetJump?: OffsetJumpOptions;  // 小范围 offset 兜底
        totals?: TotalsOptions;          // 总数/总页数配置
        meta?: boolean | MetaOptions;    // 返回耗时元信息
    }

    interface MetaInfo {
        op: string;
        ns: { iid: string; type: string; db: string; coll: string };
        startTs: number;
        endTs: number;
        durationMs: number;
        maxTimeMS?: number;
        fromCache?: boolean;
        cacheHit?: boolean;
        cacheTtl?: number;
        keyHash?: string;
        // findPage 专用字段
        page?: number;
        after?: boolean;
        before?: boolean;
        hops?: number;
        step?: number;
        steps?: Array<{ phase: 'hop' | 'offset'; index?: number; durationMs: number }>; // level='sub' 时提供
        error?: { code?: string; message: string };
    }

    interface TotalsInfo {
        mode: 'async' | 'sync' | 'approx';
        total?: number | null | undefined;   // async: null（未就绪）；approx: undefined（未知或近似）
        totalPages?: number | null | undefined;
        token?: string;                      // async 时返回的短标识（<keyHash>）
        ts?: number;                         // 写入时间戳（毫秒），如果来自缓存
        error?: string;                      // 仅 async：统计失败时可能附带的错误标识
    }

    interface PageInfo {
        hasNext: boolean;
        hasPrev: boolean;
        startCursor: string | null;
        endCursor: string | null;
        currentPage?: number;                // 仅跳页/offset 模式回显目标页号（逻辑页号）
    }

    interface PageResult<T = any> {
        items: T[];
        pageInfo: PageInfo;
        totals?: TotalsInfo;                 // 当启用 totals 时返回
        meta?: MetaInfo;                     // 当启用 meta 时返回
    }

    // 带 meta 的返回类型（用于 findOne/find/count）
    interface ResultWithMeta<T = any> {
        data: T;
        meta: MetaInfo;
    }

    interface HealthView {
        status: 'up' | 'down';
        connected: boolean;
        defaults?: any;
        cache?: any;
        driver?: { connected: boolean };
    }

    interface CollectionAccessor<TSchema = any> {
        getNamespace(): { iid: string; type: string; db: string; collection: string };
        dropCollection(): Promise<boolean>;
        createCollection(name?: string | null, options?: any): Promise<boolean>;
        createView(viewName: string, source: string, pipeline?: any[]): Promise<boolean>;

        // findOne 重载：支持 meta 参数和泛型
        findOne<T = TSchema>(query?: any, options?: Omit<FindOptions, 'meta'>): Promise<T | null>;
        findOne<T = TSchema>(query: any, options: FindOptions & { meta: true | MetaOptions }): Promise<ResultWithMeta<T | null>>;
        findOne<T = TSchema>(query?: any, options?: FindOptions): Promise<T | null | ResultWithMeta<T | null>>;

        /**
         * 通过 _id 查询单个文档（便利方法）
         * @param id - 文档的 _id（字符串会自动转换为 ObjectId）
         * @param options - 查询选项（支持 projection, cache, maxTimeMS, comment）
         * @returns Promise<文档 | null>
         * @throws {Error} 当 id 参数无效时
         * @example
         * // 字符串 ID（自动转换）
         * const user = await collection('users').findOneById('507f1f77bcf86cd799439011');
         *
         * @example
         * // ObjectId
         * const user = await collection('users').findOneById(new ObjectId(userId));
         *
         * @example
         * // 带选项
         * const user = await collection('users').findOneById(userId, {
         *   projection: { name: 1, email: 1 },
         *   cache: 5000
         * });
         */
        findOneById(id: string | any, options?: Omit<FindOptions, 'meta'>): Promise<any | null>;

        u        /**
         * 批量通过 _id 查询多个文档（便利方法）
         * @param ids - _id 数组（支持字符串和 ObjectId 混合）
         * @param options - 查询选项
         * @returns Promise<文档数组>
         * @throws {Error} 当 ids 参数无效时
         * @example
         * // 字符串 ID 数组
         * const users = await collection('users').findByIds([
         *   '507f1f77bcf86cd799439011',
         *   '507f1f77bcf86cd799439012'
         * ]);
         *
         * @example
         * // ObjectId 数组
         * const users = await collection('users').findByIds([
         *   new ObjectId('507f1f77bcf86cd799439011'),
         *   new ObjectId('507f1f77bcf86cd799439012')
         * ]);
         *
         * @example
         * // 混合类型 + 选项
         * const users = await collection('users').findByIds(
         *   ['507f1f77bcf86cd799439011', new ObjectId('507f1f77bcf86cd799439012')],
         *   {
         *     projection: { name: 1, email: 1 },
         *     sort: { name: 1 },
         *     cache: 5000,
         *     preserveOrder: true
         *   }
         * );
         */
        findByIds(
            ids: Array<string | any>,
            options?: {
                projection?: Record<string, any>;
                sort?: Record<string, 1 | -1>;
                cache?: number;
                maxTimeMS?: number;
                comment?: string;
                preserveOrder?: boolean;
            }
        ): Promise<any[]>;

        // find 重载：支持 meta 参数和链式调用 (v2.0+)
        find<T = TSchema>(query?: any): FindChain<T>;
        find<T = TSchema>(query: any, options: FindOptions & { meta: true | MetaOptions }): Promise<ResultWithMeta<T[]>>;
        find<T = TSchema>(query?: any, options?: FindOptions): Promise<T[]> | FindChain<T> | ResultWithMeta<T[]>;

        // count 重载：支持 meta 参数
        count(query?: any, options?: Omit<CountOptions, 'meta'>): Promise<number>;
        count(query: any, options: CountOptions & { meta: true | MetaOptions }): Promise<ResultWithMeta<number>>;
        count(query?: any, options?: CountOptions): Promise<number | ResultWithMeta<number>>;

        // aggregate 重载：支持 meta 参数和链式调用 (v2.0+)
        aggregate<T = TSchema>(pipeline?: any[]): AggregateChain<T>;
        aggregate<T = TSchema>(pipeline: any[], options: AggregateOptions & { meta: true | MetaOptions }): Promise<ResultWithMeta<T[]>>;
        aggregate<T = TSchema>(pipeline?: any[], options?: AggregateOptions): Promise<T[]> | AggregateChain<T> | ResultWithMeta<T[]>;

        // distinct 重载：支持 meta 参数
        distinct<T = any>(field: string, query?: any, options?: Omit<DistinctOptions, 'meta'>): Promise<T[]>;
        distinct<T = any>(field: string, query: any, options: DistinctOptions & { meta: true | MetaOptions }): Promise<ResultWithMeta<T[]>>;
        distinct<T = any>(field: string, query?: any, options?: DistinctOptions): Promise<T[] | ResultWithMeta<T[]>>;

        // stream：返回 Node.js 可读流
        stream(query?: any, options?: StreamOptions): NodeJS.ReadableStream;

        // explain：查询执行计划诊断
        explain(query?: any, options?: ExplainOptions): Promise<any>;

        // Bookmark 维护 APIs
        prewarmBookmarks(keyDims: BookmarkKeyDims, pages: number[]): Promise<PrewarmBookmarksResult>;
        listBookmarks(keyDims?: BookmarkKeyDims): Promise<ListBookmarksResult>;
        clearBookmarks(keyDims?: BookmarkKeyDims): Promise<ClearBookmarksResult>;

        // findPage：已在 PageResult 中包含 meta 字段，无需重载
        findPage<T = TSchema>(options: FindPageOptions): Promise<PageResult<T>>;

        // 写入操作 - 支持简化调用和完整配置
        insertOne<T = TSchema>(document: T, options?: InsertOneSimplifiedOptions): Promise<InsertOneResult>;
        insertOne(options: InsertOneOptions): Promise<InsertOneResult>;

        insertMany<T = TSchema>(documents: T[], options?: InsertManySimplifiedOptions): Promise<InsertManyResult>;
        insertMany(options: InsertManyOptions): Promise<InsertManyResult>;

        /**
         * Upsert 单个文档（存在则更新，不存在则插入）- 便利方法
         * @param filter - 查询条件
         * @param update - 更新内容（直接字段或操作符）
         * @param options - 操作选项
         * @returns Promise<UpsertOneResult>
         * @example
         * // 基础用法（自动包装 $set）
         * const result = await collection('users').upsertOne(
         *   { userId: 'user123' },
         *   { name: 'Alice', age: 30 }
         * );
         *
         * @example
         * // 使用更新操作符
         * const result = await collection('users').upsertOne(
         *   { userId: 'user123' },
         *   { $set: { name: 'Alice' }, $inc: { count: 1 } }
         * );
         *
         * @example
         * // 带选项
         * const result = await collection('configs').upsertOne(
         *   { key: 'theme' },
         *   { value: 'dark' },
         *   { maxTimeMS: 5000, comment: 'sync-config' }
         * );
         */
        upsertOne(
            filter: Record<string, any>,
            update: Record<string, any>,
            options?: {
                maxTimeMS?: number;
                comment?: string;
            }
        ): Promise<{
            acknowledged: boolean;
            matchedCount: number;
            modifiedCount: number;
            upsertedId?: any;
            upsertedCount: number;
        }>;

        /**
         * 原子递增/递减字段值（便利方法）
         * @param filter - 查询条件
         * @param field - 字段名或字段-增量对象
         * @param increment - 增量（默认 1，负数为递减）
         * @param options - 操作选项
         * @returns Promise<IncrementOneResult>
         */
        incrementOne(
            filter: Record<string, any>,
            field: string | Record<string, number>,
            increment?: number,
            options?: {
                returnDocument?: 'before' | 'after';
                projection?: Record<string, any>;
                maxTimeMS?: number;
                comment?: string;
            }
        ): Promise<{
            acknowledged: boolean;
            matchedCount: number;
            modifiedCount: number;
            value: any | null;
        }>;

        invalidate(op?: 'find' | 'findOne' | 'count' | 'findPage' | 'aggregate' | 'distinct'): Promise<number>;

        // ============================================================================
        // 批量操作方法 (Batch Operations)
        // ============================================================================

        /**
         * 大批量插入（自动分批+重试）
         * @param documents - 要插入的文档数组
         * @param options - 批量插入选项
         * @returns Promise<InsertBatchResult>
         * @since v1.0.0
         * @example
         * const result = await collection('products').insertBatch(largeDataset, {
         *   batchSize: 1000,
         *   onProgress: (p) => console.log(`${p.percentage}%`)
         * });
         */
        insertBatch<T = TSchema>(documents: T[], options?: InsertBatchOptions): Promise<InsertBatchResult>;

        /**
         * 批量更新文档（流式查询+分批更新）
         * @param filter - 查询条件
         * @param update - 更新操作（必须使用更新操作符）
         * @param options - 批量更新选项
         * @returns Promise<UpdateBatchResult>
         * @since v1.0.0
         * @example
         * const result = await collection('users').updateBatch(
         *   { status: 'pending' },
         *   { $set: { status: 'processed' } },
         *   { batchSize: 5000, onError: 'retry' }
         * );
         */
        updateBatch(
            filter: Record<string, any>,
            update: Record<string, any>,
            options?: UpdateBatchOptions
        ): Promise<UpdateBatchResult>;

        /**
         * 批量删除文档（流式查询+分批删除）
         * @param filter - 查询条件
         * @param options - 批量删除选项
         * @returns Promise<DeleteBatchResult>
         * @since v1.0.0
         * @example
         * const result = await collection('logs').deleteBatch(
         *   { createdAt: { $lt: expireDate } },
         *   { batchSize: 5000, estimateProgress: true }
         * );
         */
        deleteBatch(
            filter: Record<string, any>,
            options?: DeleteBatchOptions
        ): Promise<DeleteBatchResult>;

        /**
         * 查询文档并返回总数（便利方法）
         * @param filter - 查询条件
         * @param options - 查询选项
         * @returns Promise<{ documents: T[], total: number }>
         * @since v1.0.0
         * @example
         * const { documents, total } = await collection('users').findAndCount(
         *   { status: 'active' },
         *   { limit: 10, cache: 60000 }
         * );
         */
        findAndCount<T = TSchema>(
            filter?: Record<string, any>,
            options?: FindOptions
        ): Promise<{ documents: T[]; total: number }>;
    }

    /**
     * Collection 类型别名（与 CollectionAccessor 等价）
     * @since v1.0.4
     */
    type Collection<TSchema = any> = CollectionAccessor<TSchema>;

    type DbAccessor = {
        collection<TSchema = any>(name: string): CollectionAccessor<TSchema>;
        db(dbName: string): { collection<TSchema = any>(name: string): CollectionAccessor<TSchema> };
    };

    export default class MonSQLize {
        constructor(options: BaseOptions);
        connect(): Promise<DbAccessor>;
        getCache(): CacheLike;
        getDefaults(): { maxTimeMS?: number; findLimit?: number; namespace?: { instanceId?: string; scope?: 'database' | 'connection' }; slowQueryMs?: number };
        close(): Promise<void>;

        /** 事件订阅：connected/closed/error/slow-query/query */
        on(event: 'connected', handler: (payload: { type: string; db: string; scope?: string; iid?: string }) => void): void;
        on(event: 'closed', handler: (payload: { type: string; db: string; iid?: string }) => void): void;
        on(event: 'error', handler: (payload: { type: string; db: string; error: string; iid?: string }) => void): void;
        on(event: 'slow-query', handler: (meta: MetaInfo) => void): void;
        on(event: 'query', handler: (meta: MetaInfo) => void): void;
        on(event: string, handler: (payload: any) => void): void;

        /** 一次性事件订阅 */
        once(event: 'connected', handler: (payload: { type: string; db: string; scope?: string; iid?: string }) => void): void;
        once(event: 'closed', handler: (payload: { type: string; db: string; iid?: string }) => void): void;
        once(event: 'error', handler: (payload: { type: string; db: string; error: string; iid?: string }) => void): void;
        once(event: 'slow-query', handler: (meta: MetaInfo) => void): void;
        once(event: 'query', handler: (meta: MetaInfo) => void): void;
        once(event: string, handler: (payload: any) => void): void;

        /** 取消事件订阅 */
        off(event: 'connected', handler: (payload: { type: string; db: string; scope?: string; iid?: string }) => void): void;
        off(event: 'closed', handler: (payload: { type: string; db: string; iid?: string }) => void): void;
        off(event: 'error', handler: (payload: { type: string; db: string; error: string; iid?: string }) => void): void;
        off(event: 'slow-query', handler: (meta: MetaInfo) => void): void;
        off(event: 'query', handler: (meta: MetaInfo) => void): void;
        off(event: string, handler: (payload: any) => void): void;

        /** 触发事件 */
        emit(event: string, payload: any): void;

        /** 健康检查 */
        health(): Promise<HealthView>;

        /**
         * 获取慢查询日志（持久化存储）
         * @param filter - 查询条件（可选）
         * @param options - 查询选项（可选）
         * @returns 慢查询日志数组
         * @since v1.3.1
         * @example
         * // 查询所有慢查询
         * const logs = await msq.getSlowQueryLogs({}, { limit: 10 });
         *
         * // 按collection过滤
         * const userLogs = await msq.getSlowQueryLogs(
         *   { collection: 'users' },
         *   { sort: { count: -1 }, limit: 10 }
         * );
         *
         * // 按操作类型过滤
         * const findLogs = await msq.getSlowQueryLogs({ operation: 'find' });
         */
        getSlowQueryLogs(
            filter?: Record<string, any>,
            options?: {
                sort?: Record<string, 1 | -1>;
                limit?: number;
                skip?: number;
            }
        ): Promise<Array<{
            queryHash: string;
            database: string;
            collection: string;
            operation: string;
            count: number;
            totalTimeMs: number;
            avgTimeMs: number;
            maxTimeMs: number;
            minTimeMs: number;
            firstSeen: Date;
            lastSeen: Date;
        }>>;

        /**
         * 创建手动事务会话
         * @param options - 事务选项
         * @returns Transaction 实例
         * @since v0.2.0
         * @example
         * const tx = await msq.startSession();
         * try {
         *   await collection('users').updateOne({...}, {...}, { session: tx.session });
         *   await tx.commit();
         * } catch (error) {
         *   await tx.abort();
         * }
         */
        startSession(options?: TransactionOptions): Promise<Transaction>;

        /**
         * 自动管理事务生命周期（推荐）
         * @param callback - 事务回调函数
         * @param options - 事务选项
         * @returns 回调函数的返回值
         * @since v0.2.0
         * @example
         * await msq.withTransaction(async (tx) => {
         *   await collection('accounts').updateOne({ _id: 'A' }, { $inc: { balance: -100 } }, { session: tx.session });
         *   await collection('accounts').updateOne({ _id: 'B' }, { $inc: { balance: 100 } }, { session: tx.session });
         * });
         */
        withTransaction<T = any>(
            callback: (transaction: Transaction) => Promise<T>,
            options?: TransactionOptions
        ): Promise<T>;

        // ============================================================================
        // 业务锁 API (v1.4.0+)
        // ============================================================================

        /**
         * 业务锁：自动管理锁生命周期（推荐）
         * @param key - 锁的唯一标识
         * @param callback - 获取锁后执行的函数
         * @param options - 锁选项
         * @returns callback 的返回值
         * @since v1.4.0
         * @example
         * // 库存扣减
         * await db.withLock('inventory:SKU123', async () => {
         *   const product = await inventory.findOne({ sku: 'SKU123' });
         *   if (product.stock >= 1) {
         *     await inventory.updateOne({ sku: 'SKU123' }, { $inc: { stock: -1 } });
         *   }
         * });
         */
        withLock?<T = any>(
            key: string,
            callback: () => Promise<T>,
            options?: LockOptions
        ): Promise<T>;

        /**
         * 业务锁：手动获取锁（阻塞重试）
         * @param key - 锁的唯一标识
         * @param options - 锁选项
         * @returns Lock 对象
         * @since v1.4.0
         * @example
         * const lock = await db.acquireLock('resource:123', { ttl: 5000 });
         * try {
         *   // 业务逻辑
         * } finally {
         *   await lock.release();
         * }
         */
        acquireLock?(key: string, options?: LockOptions): Promise<Lock>;

        /**
         * 业务锁：尝试获取锁（不阻塞）
         * @param key - 锁的唯一标识
         * @param options - 锁选项（不包含 retryTimes）
         * @returns Lock 对象或 null
         * @since v1.4.0
         * @example
         * const lock = await db.tryAcquireLock('resource:123');
         * if (lock) {
         *   try {
         *     // 业务逻辑
         *   } finally {
         *     await lock.release();
         *   }
         * } else {
         *   console.log('资源被占用');
         * }
         */
        tryAcquireLock?(key: string, options?: Omit<LockOptions, 'retryTimes'>): Promise<Lock | null>;

        /**
         * 获取锁统计信息
         * @returns 锁统计信息
         * @since v1.4.0
         * @example
         * const stats = db.getLockStats();
         * console.log(stats.locksAcquired, stats.locksReleased);
         */
        getLockStats?(): LockStats;

        /**
         * 创建 Redis 缓存适配器（静态方法）
         * @param client - Redis 客户端实例（ioredis）
         * @param options - 可选配置
         * @returns Redis 缓存适配器实例
         * @example
         * const Redis = require('ioredis');
         * const redis = new Redis();
         * const redisCache = MonSQLize.createRedisCacheAdapter(redis);
         */
        static createRedisCacheAdapter(client: any, options?: any): CacheLike;
    }

    // ============================================================================
    // 链式调用 API (v2.0+)
    // ============================================================================

    /**
     * Collation 选项（字符串排序规则）
     */
    interface CollationOptions {
        locale: string;                  // 语言代码，如 'zh', 'en'
        strength?: number;               // 比较级别：1=基本, 2=重音, 3=大小写
        caseLevel?: boolean;             // 是否区分大小写
        caseFirst?: 'upper' | 'lower';   // 大小写优先级
        numericOrdering?: boolean;       // 数字排序
        alternate?: 'non-ignorable' | 'shifted'; // 空格和标点处理
        maxVariable?: 'punct' | 'space'; // 最大可变字符
        backwards?: boolean;             // 反向比较
    }

    /**
     * Explain 执行计划结果
     */
    interface ExplainResult {
        queryPlanner: {
            plannerVersion: number;
            namespace: string;
            indexFilterSet: boolean;
            parsedQuery?: any;
            winningPlan: any;
            rejectedPlans: any[];
        };
        executionStats?: {
            executionSuccess: boolean;
            nReturned: number;
            executionTimeMillis: number;
            totalKeysExamined: number;
            totalDocsExamined: number;
            executionStages: any;
            allPlansExecution?: any[];
        };
        serverInfo?: {
            host: string;
            port: number;
            version: string;
            gitVersion: string;
        };
        ok: number;
    }

    /**
     * FindChain - find 查询的链式调用构建器
     *
     * @template T - 文档类型
     *
     * @example
     * // 基础链式调用
     * const results = await collection<Product>('products')
     *   .find({ category: 'electronics' })
     *   .limit(10)
     *   .skip(5)
     *   .sort({ price: -1 });
     *
     * @example
     * // 复杂链式调用
     * const results = await collection<Product>('products')
     *   .find({ inStock: true })
     *   .sort({ rating: -1 })
     *   .skip(10)
     *   .limit(20)
     *   .project({ name: 1, price: 1 })
     *   .hint({ category: 1, price: -1 })
     *   .maxTimeMS(5000);
     */
    interface FindChain<T = any> extends PromiseLike<T[]> {
        /**
         * 限制返回文档数量
         * @param n - 限制数量，必须为非负数
         * @returns 返回自身以支持链式调用
         * @throws {Error} 如果 n 不是非负数
         */
        limit(n: number): FindChain<T>;

        /**
         * 跳过指定数量的文档
         * @param n - 跳过数量，必须为非负数
         * @returns 返回自身以支持链式调用
         * @throws {Error} 如果 n 不是非负数
         */
        skip(n: number): FindChain<T>;

        /**
         * 设置排序规则
         * @param spec - 排序配置，如 { price: -1, name: 1 }
         * @returns 返回自身以支持链式调用
         * @throws {Error} 如果 spec 不是对象或数组
         */
        sort(spec: Record<string, 1 | -1> | Array<[string, 1 | -1]>): FindChain<T>;

        /**
         * 设置字段投影
         * @param spec - 投影配置，如 { name: 1, price: 1 }
         * @returns 返回带有投影类型的新链
         * @throws {Error} 如果 spec 不是对象或数组
         */
        project<K extends keyof T>(spec: Record<K, 1 | 0> | Array<K>): FindChain<Pick<T, K>>;
        project(spec: Record<string, 1 | 0> | string[]): FindChain<Partial<T>>;

        /**
         * 设置索引提示（强制使用指定索引）
         * @param spec - 索引名称或索引规格
         * @returns 返回自身以支持链式调用
         * @throws {Error} 如果 spec 为空
         */
        hint(spec: Record<string, 1 | -1> | string): FindChain<T>;

        /**
         * 设置排序规则（用于字符串排序）
         * @param spec - 排序规则配置
         * @returns 返回自身以支持链式调用
         * @throws {Error} 如果 spec 不是对象
         */
        collation(spec: CollationOptions): FindChain<T>;

        /**
         * 设置查询注释（用于日志追踪）
         * @param str - 注释内容
         * @returns 返回自身以支持链式调用
         * @throws {Error} 如果 str 不是字符串
         */
        comment(str: string): FindChain<T>;

        /**
         * 设置查询超时时间
         * @param ms - 超时时间（毫秒）
         * @returns 返回自身以支持链式调用
         * @throws {Error} 如果 ms 不是非负数
         */
        maxTimeMS(ms: number): FindChain<T>;

        /**
         * 设置批处理大小
         * @param n - 批处理大小
         * @returns 返回自身以支持链式调用
         * @throws {Error} 如果 n 不是非负数
         */
        batchSize(n: number): FindChain<T>;

        /**
         * 返回查询执行计划（不执行查询）
         * @param verbosity - 详细级别
         * @returns 执行计划
         */
        explain(verbosity?: 'queryPlanner' | 'executionStats' | 'allPlansExecution'): Promise<ExplainResult>;

        /**
         * 返回流式结果
         * @returns MongoDB 游标流
         */
        stream(): NodeJS.ReadableStream;

        /**
         * 显式转换为数组（执行查询）
         * @returns 查询结果数组
         * @throws {Error} 如果查询已执行
         */
        toArray(): Promise<T[]>;

        /**
         * Promise.then 接口
         */
        then<TResult1 = T[], TResult2 = never>(
            onfulfilled?: ((value: T[]) => TResult1 | PromiseLike<TResult1>) | null,
            onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null
        ): Promise<TResult1 | TResult2>;

        /**
         * Promise.catch 接口
         */
        catch<TResult = never>(
            onrejected?: ((reason: any) => TResult | PromiseLike<TResult>) | null
        ): Promise<T[] | TResult>;

        /**
         * Promise.finally 接口
         */
        finally(onfinally?: (() => void) | null): Promise<T[]>;
    }

    /**
     * AggregateChain - aggregate 查询的链式调用构建器
     *
     * @template T - 文档类型
     *
     * @example
     * // 基础聚合
     * const results = await collection<Order>('orders')
     *   .aggregate([
     *     { $match: { status: 'paid' } },
     *     { $group: { _id: '$category', total: { $sum: '$amount' } } }
     *   ])
     *   .allowDiskUse(true);
     *
     * @example
     * // 复杂聚合
     * const results = await collection<Order>('orders')
     *   .aggregate([
     *     { $match: { status: 'paid' } },
     *     { $sort: { createdAt: -1 } },
     *     { $limit: 100 }
     *   ])
     *   .hint({ status: 1, createdAt: -1 })
     *   .allowDiskUse(true)
     *   .maxTimeMS(10000);
     */
    interface AggregateChain<T = any> extends PromiseLike<T[]> {
        /**
         * 设置索引提示（强制使用指定索引）
         * @param spec - 索引名称或索引规格
         * @returns 返回自身以支持链式调用
         * @throws {Error} 如果 spec 为空
         */
        hint(spec: Record<string, 1 | -1> | string): AggregateChain<T>;

        /**
         * 设置排序规则（用于字符串排序）
         * @param spec - 排序规则配置
         * @returns 返回自身以支持链式调用
         * @throws {Error} 如果 spec 不是对象
         */
        collation(spec: CollationOptions): AggregateChain<T>;

        /**
         * 设置查询注释（用于日志追踪）
         * @param str - 注释内容
         * @returns 返回自身以支持链式调用
         * @throws {Error} 如果 str 不是字符串
         */
        comment(str: string): AggregateChain<T>;

        /**
         * 设置查询超时时间
         * @param ms - 超时时间（毫秒）
         * @returns 返回自身以支持链式调用
         * @throws {Error} 如果 ms 不是非负数
         */
        maxTimeMS(ms: number): AggregateChain<T>;

        /**
         * 允许使用磁盘进行大数据量排序/分组
         * @param bool - 是否允许
         * @returns 返回自身以支持链式调用
         * @throws {Error} 如果 bool 不是布尔值
         */
        allowDiskUse(bool: boolean): AggregateChain<T>;

        /**
         * 设置批处理大小
         * @param n - 批处理大小
         * @returns 返回自身以支持链式调用
         * @throws {Error} 如果 n 不是非负数
         */
        batchSize(n: number): AggregateChain<T>;

        /**
         * 返回聚合执行计划（不执行聚合）
         * @param verbosity - 详细级别
         * @returns 执行计划
         */
        explain(verbosity?: 'queryPlanner' | 'executionStats' | 'allPlansExecution'): Promise<ExplainResult>;

        /**
         * 返回流式结果
         * @returns MongoDB 游标流
         */
        stream(): NodeJS.ReadableStream;

        /**
         * 显式转换为数组（执行聚合）
         * @returns 聚合结果数组
         * @throws {Error} 如果查询已执行
         */
        toArray(): Promise<T[]>;

        /**
         * Promise.then 接口
         */
        then<TResult1 = T[], TResult2 = never>(
            onfulfilled?: ((value: T[]) => TResult1 | PromiseLike<TResult1>) | null,
            onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null
        ): Promise<TResult1 | TResult2>;

        /**
         * Promise.catch 接口
         */
        catch<TResult = never>(
            onrejected?: ((reason: any) => TResult | PromiseLike<TResult>) | null
        ): Promise<T[] | TResult>;

        /**
         * Promise.finally 接口
         */
        finally(onfinally?: (() => void) | null): Promise<T[]>;
    }

    // ============================================================================
    // Model 层类型定义（Model API）
    // @since v1.0.3
    // ============================================================================

    /**
     * Schema DSL 函数类型
     */
    type SchemaDSL = (dsl: any) => any;

    // ============================================================================
    // Relations 和 Populate 类型定义
    // @since v1.2.0
    // ============================================================================

    /**
     * 关系配置（MongoDB 原生风格）
     * @since v1.2.0
     */
    interface RelationConfig {
        /**
         * 关联的集合名称（MongoDB 原生集合名）
         * @example 'posts'
         */
        from: string;

        /**
         * 本地字段名（用于匹配的字段）
         * @example '_id'
         */
        localField: string;

        /**
         * 外部字段名（关联集合中的字段）
         * @example 'authorId'
         */
        foreignField: string;

        /**
         * 返回类型
         * - true: 返回单个文档或 null（one-to-one）
         * - false: 返回数组（one-to-many）
         * @default false
         */
        single?: boolean;
    }

    /**
     * 虚拟字段配置
     * @since v1.0.6
     */
    interface VirtualConfig {
        /**
         * getter 函数（必需）
         * @example
         * get: function() {
         *     return `${this.firstName} ${this.lastName}`;
         * }
         */
        get: (this: any) => any;

        /**
         * setter 函数（可选）
         * @example
         * set: function(value) {
         *     const parts = value.split(' ');
         *     this.firstName = parts[0];
         *     this.lastName = parts[1];
         * }
         */
        set?: (this: any, value: any) => void;
    }

    /**
     * 默认值类型
     * @since v1.0.6
     */
    type DefaultValue<T = any> = T | ((context?: any, doc?: any) => T);

    /**
     * Populate 配置
     * @since v1.2.0
     */
    interface PopulateConfig {
        /**
         * 关系路径（relations 中定义的名称）
         * @example 'posts'
         */
        path: string;

        /**
         * 字段选择（空格分隔）
         * @example 'title content createdAt'
         */
        select?: string;

        /**
         * 排序规则
         * @example { createdAt: -1 }
         */
        sort?: Record<string, 1 | -1>;

        /**
         * 限制返回数量
         * @example 10
         */
        limit?: number;

        /**
         * 跳过数量
         * @example 20
         */
        skip?: number;

        /**
         * 额外过滤条件
         * @example { status: 'published' }
         */
        match?: any;

        /**
         * 嵌套 populate（支持多层关联）
         * @example
         * // 字符串形式
         * populate: 'comments'
         *
         * // 对象形式
         * populate: { path: 'comments', select: 'content' }
         *
         * // 数组形式
         * populate: ['comments', 'likes']
         */
        populate?: string | PopulateConfig | (string | PopulateConfig)[];
    }

    /**
     * PopulateProxy - 支持链式 populate 调用
     * @since v1.2.0
     */
    interface PopulateProxy<T = any> extends Promise<T> {
        /**
         * 添加 populate 路径（链式调用）
         *
         * @param path - 关系路径或配置对象
         * @returns PopulateProxy 实例，支持继续链式调用
         *
         * @example
         * // 字符串形式
         * User.findOne({ _id }).populate('posts')
         *
         * // 对象形式
         * User.findOne({ _id }).populate({ path: 'posts', select: 'title' })
         *
         * // 链式调用
         * User.findOne({ _id })
         *     .populate('profile')
         *     .populate({ path: 'posts', limit: 10 })
         *
         * // 嵌套 populate
         * User.findOne({ _id }).populate({
         *     path: 'posts',
         *     populate: 'comments'
         * })
         */
        populate(path: string): PopulateProxy<T>;
        populate(config: PopulateConfig): PopulateProxy<T>;
    }

    // ============================================================================
    // Model 定义类型
    // ============================================================================

    /**
     * Model 定义配置
     */
    interface ModelDefinition<T = any> {
        /**
         * 枚举配置（可被 schema 引用）
         * @example
         * enums: {
         *   role: 'admin|user|guest',
         *   status: 'active|inactive'
         * }
         */
        enums?: Record<string, string>;

        /**
         * Schema 定义（数据验证规则）
         * 使用 function 时，this 自动绑定到 definition，可访问 this.enums
         *
         * @param dsl - schema-dsl 函数
         * @returns Schema 对象
         *
         * @example
         * // 使用 function（推荐）
         * schema: function(dsl) {
         *   return dsl({
         *     username: 'string:3-32!',
         *     role: this.enums.role.default('user')
         *   });
         * }
         *
         * // 使用箭头函数
         * schema: (dsl) => dsl({
         *   username: 'string:3-32!',
         *   email: 'email!'
         * })
         */
        schema: SchemaDSL | ((this: ModelDefinition<T>, dsl: SchemaDSL) => any);

        /**
         * 自定义方法
         *
         * @param model - ModelInstance 实例
         * @returns 包含 instance 和 static 方法的对象
         *
         * @example
         * methods: (model) => ({
         *   instance: {
         *     checkPassword(password: string) {
         *       return this.password === password;
         *     }
         *   },
         *   static: {
         *     async findByUsername(username: string) {
         *       return await model.findOne({ username });
         *     }
         *   }
         * })
         */
        methods?: (model: ModelInstance<T>) => {
            instance?: Record<string, Function>;
            static?: Record<string, Function>;
        };

        /**
         * 生命周期钩子
         *
         * @param model - ModelInstance 实例
         * @returns 包含各操作钩子的对象
         *
         * @example
         * hooks: (model) => ({
         *   insert: {
         *     before: async (ctx, docs) => {
         *       ctx.timestamp = Date.now();
         *       return { ...docs, createdAt: new Date() };
         *     },
         *     after: async (ctx, result) => {
         *       console.log('插入耗时:', Date.now() - ctx.timestamp);
         *     }
         *   }
         * })
         */
        hooks?: (model: ModelInstance<T>) => {
            find?: {
                before?: (ctx: HookContext, options: any) => void | Promise<void>;
                after?: (ctx: HookContext, result: any) => any | Promise<any>;
            };
            insert?: {
                before?: (ctx: HookContext, docs: any) => any | Promise<any>;
                after?: (ctx: HookContext, result: any) => void | Promise<void>;
            };
            update?: {
                before?: (ctx: HookContext, filter: any, update: any) => [any, any] | Promise<[any, any]>;
                after?: (ctx: HookContext, result: any) => void | Promise<void>;
            };
            delete?: {
                before?: (ctx: HookContext, filter: any) => void | Promise<void>;
                after?: (ctx: HookContext, result: any) => void | Promise<void>;
            };
        };

        /**
         * 索引定义（自动创建）
         *
         * @example
         * indexes: [
         *   { key: { username: 1 }, unique: true },
         *   { key: { email: 1 }, unique: true },
         *   { key: { status: 1, createdAt: -1 } }
         * ]
         */
        indexes?: Array<{
            key: Record<string, 1 | -1>;
            unique?: boolean;
            sparse?: boolean;
            expireAfterSeconds?: number;
            [key: string]: any;
        }>;

        /**
         * 虚拟字段定义
         * @since v1.0.6
         *
         * @example
         * virtuals: {
         *   fullName: {
         *     get: function() {
         *       return `${this.firstName} ${this.lastName}`;
         *     },
         *     set: function(value) {
         *       const parts = value.split(' ');
         *       this.firstName = parts[0];
         *       this.lastName = parts[1];
         *     }
         *   }
         * }
         */
        virtuals?: Record<string, VirtualConfig>;

        /**
         * 默认值定义
         * @since v1.0.6
         *
         * @example
         * defaults: {
         *   status: 'active',
         *   createdAt: () => new Date(),
         *   score: 0
         * }
         */
        defaults?: Record<string, DefaultValue>;

        /**
         * 关系定义（MongoDB 原生风格）
         * @since v1.2.0
         *
         * @example
         * relations: {
         *   // one-to-one
         *   profile: {
         *     from: 'profiles',
         *     localField: 'profileId',
         *     foreignField: '_id',
         *     single: true
         *   },
         *   // one-to-many
         *   posts: {
         *     from: 'posts',
         *     localField: '_id',
         *     foreignField: 'authorId',
         *     single: false
         *   }
         * }
         */
        relations?: Record<string, RelationConfig>;

        /**
         * Model 选项配置
         * @since v1.0.3
         */
        /**
         * 关系定义（MongoDB 原生风格）
         * @since v1.2.0
         *
         * @example
         * relations: {
         * @since v1.2.0
         *
         * @example
         * relations: {
         *   // one-to-one
         *   profile: {
         *     from: 'profiles',
         *     localField: 'profileId',
         *     foreignField: '_id',
         *     single: true
         *   },
         *   // one-to-many
         *   posts: {
         *     from: 'posts',
         *     localField: '_id',
         *     foreignField: 'authorId',
         *     single: false
         *   }
         * }
         */

        /**
         * Model 选项配置
         * @since v1.0.3
         */
        options?: {
            /**
             * 自动时间戳
             * 启用后自动管理 createdAt 和 updatedAt 字段
             *
             * @example
             * // 简单模式：启用默认字段名
             * options: { timestamps: true }
             *
             * // 自定义字段名
             * options: {
             *   timestamps: {
             *     createdAt: 'created_time',
             *     updatedAt: 'updated_time'
             *   }
             * }
             *
             * // 只启用其中一个
             * options: {
             *   timestamps: {
             *     createdAt: true,
             *     updatedAt: false
             *   }
             * }
             */
            timestamps?: boolean | {
                /** 创建时间字段名，false 表示禁用 */
                createdAt?: boolean | string;
                /** 更新时间字段名，false 表示禁用 */
                updatedAt?: boolean | string;
            };

            /**
             * 是否启用 Schema 验证（默认 true）
             * @since v1.0.3
             */
            schemaValidation?: boolean;

            /**
             * 是否启用严格模式（不允许未定义的字段，默认 false）
             * @since v1.0.3
             */
            strict?: boolean;

            /**
             * 自定义错误消息
             * @since v1.0.3
             */
            messages?: Record<string, string>;
        };
    }

    /**
     * Hook 上下文
     * 用于在 before 和 after 钩子之间传递数据
     */
    interface HookContext {
        [key: string]: any;
    }

    /**
     * 数据验证结果
     */
    interface ValidationResult {
        /** 是否验证通过 */
        valid: boolean;
        /** 错误列表 */
        errors: Array<{
            field: string;
            message: string;
            value?: any;
        }>;
        /** 验证后的数据 */
        data: any;
    }

    /**
     * Model 类（静态方法）
     */
    class Model {
        /**
         * 注册一个 Model 定义
         *
         * @param collectionName - 集合名称
         * @param definition - Model 定义对象
         * @throws {Error} 集合名称无效、schema 未定义、Model 已存在
         *
         * @example
         * Model.define('users', {
         *   schema: (dsl) => dsl({
         *     username: 'string:3-32!',
         *     email: 'email!'
         *   }),
         *   methods: (model) => ({
         *     instance: {
         *       checkPassword(password) {
         *         return this.password === password;
         *       }
         *     }
         *   })
         * });
         */
        static define<T = any>(collectionName: string, definition: ModelDefinition<T>): void;

        /**
         * 获取已注册的 Model 定义
         *
         * @param collectionName - 集合名称
         * @returns Model 定义对象，如果不存在返回 undefined
         */
        static get<T = any>(collectionName: string): ModelDefinition<T> | undefined;

        /**
         * 检查 Model 是否已注册
         *
         * @param collectionName - 集合名称
         * @returns 是否已注册
         */
        static has(collectionName: string): boolean;

        /**
         * 列出所有已注册的 Model 名称
         *
         * @returns Model 名称数组
         */
        static list(): string[];

        /**
         * 清空所有已注册的 Model（仅测试用）
         * @private
         */
        static _clear(): void;
    }

    /**
     * ModelInstance 类
     * 继承 collection 的所有方法，并扩展 Model 特性
     */
    interface ModelInstance<T = any> extends Collection<T> {
        /** 关联的 collection 对象 */
        readonly collection: Collection<T>;

        /** Model 定义对象 */
        readonly definition: ModelDefinition<T>;

        /** monSQLize 实例 */
        readonly msq: MonSQLize;

        /**
         * 验证数据是否符合 schema 定义
         *
         * @param data - 待验证的数据
         * @param options - 验证选项
         * @returns 验证结果
         *
         * @example
         * const result = User.validate({
         *   username: 'test',
         *   email: 'test@example.com'
         * });
         *
         * if (!result.valid) {
         *   console.error('验证失败:', result.errors);
         * }
         */
        validate(data: any, options?: { locale?: 'zh-CN' | 'en-US' }): ValidationResult;

        // ============================================================================
        // 查询方法重载（支持 Populate）
        // @since v1.2.0
        // ============================================================================

        /**
         * 查询多个文档（支持 populate）
         *
         * @param filter - 查询条件
         * @param options - 查询选项
         * @returns PopulateProxy 实例，支持链式 populate 调用
         *
         * @example
         * // 基本查询
         * const users = await User.find({ status: 'active' });
         *
         * // 带 populate
         * const users = await User.find({ status: 'active' }).populate('posts');
         *
         * // 嵌套 populate
         * const users = await User.find({}).populate({
         *     path: 'posts',
         *     populate: 'comments'
         * });
         */
        find(filter: any, options?: any): PopulateProxy<T[]>;

        /**
         * 查询单个文档（支持 populate）
         *
         * @param filter - 查询条件
         * @param options - 查询选项
         * @returns PopulateProxy 实例，支持链式 populate 调用
         *
         * @example
         * const user = await User.findOne({ _id }).populate('profile').populate('posts');
         */
        findOne(filter: any, options?: any): PopulateProxy<T | null>;

        /**
         * 通过 ID 查询单个文档（支持 populate）
         *
         * @param id - 文档 ID
         * @param options - 查询选项
         * @returns PopulateProxy 实例，支持链式 populate 调用
         */
        findOneById(id: any, options?: any): PopulateProxy<T | null>;

        /**
         * 通过 ID 数组批量查询（支持 populate）
         *
         * @param ids - ID 数组
         * @param options - 查询选项
         * @returns PopulateProxy 实例，支持链式 populate 调用
         */
        findByIds(ids: any[], options?: any): PopulateProxy<T[]>;

        /**
         * 查询并统计总数（支持 populate）
         *
         * @param filter - 查询条件
         * @param options - 查询选项
         * @returns PopulateProxy 实例，返回 { data, total }
         *
         * @example
         * const result = await User.findAndCount({ status: 'active' })
         *     .populate('posts');
         * // result: { data: [...], total: 100 }
         */
        findAndCount(filter: any, options?: any): PopulateProxy<{ data: T[]; total: number }>;

        /**
         * 分页查询（支持 populate）
         *
         * @param filter - 查询条件
         * @param options - 查询选项
         * @returns PopulateProxy 实例，返回 { data, pagination }
         *
         * @example
         * const result = await User.findPage({ status: 'active' }, { page: 1, pageSize: 20 })
         *     .populate('posts');
         * // result: { data: [...], pagination: {...} }
         */
        findPage(filter: any, options?: any): PopulateProxy<{ data: T[]; pagination: any }>;
    }

    /**
     * 扩展 MonSQLize 类，添加 model 方法
     */
    interface MonSQLize {
        /**
         * 获取已注册的 Model 实例
         *
         * @param collectionName - 集合名称
         * @returns ModelInstance 实例
         * @throws {Error} 数据库未连接、Model 未定义
         *
         * @example
         * const User = msq.model('users');
         *
         * // 使用继承的 collection 方法
         * const users = await User.find({ status: 'active' });
         *
         * // 使用自定义静态方法
         * const admin = await User.findByUsername('admin');
         *
         * // 使用实例方法
         * const user = await User.findOne({ username: 'test' });
         * if (user.checkPassword('secret')) {
         *   console.log('登录成功');
         * }
         */
        model<T = any>(collectionName: string): ModelInstance<T>;

        /**
         * Model 类引用
         */
        Model: typeof Model;
    }

    /**
     * 导出 Model 类
     */
    export { Model };

    /**
     * 导出锁错误类型
     * @since v1.4.0
     */
    export { LockAcquireError, LockTimeoutError };

    /**
     * 导出类型别名
     * @since v1.0.4
     */
    export type { Collection, CollectionAccessor };
}


