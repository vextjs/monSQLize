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
        // 统一默认（新增可选项）
        findPageMaxLimit?: number;          // 深分页页大小上限（默认 500）
        cursorSecret?: string;              // 可选：游标签名密钥（如启用 HMAC 验签）
        log?: {
            slowQueryTag?: { event?: string; code?: string };
            formatSlowQuery?: (meta: any) => any;
        };
    }
    interface FindOptions {
        query?: any;
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
        query?: any;
        cache?: number;
        maxTimeMS?: number;
        /** Mongo-only: 透传 hint 到 countDocuments */
        hint?: any;
        /** Mongo-only: 透传 collation 到 countDocuments */
        collation?: any;
        /** 查询注释（用于生产环境日志跟踪）*/
        comment?: string;
        meta?: boolean | MetaOptions;    // 返回耗时元信息
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
        query?: any;                     // 过滤条件，只对匹配的文档进行去重
        cache?: number;                  // 缓存时间（毫秒），默认继承实例缓存配置
        maxTimeMS?: number;              // 查询超时时间（毫秒）
        collation?: any;                 // 排序规则（可选）
        hint?: string | object;          // 索引提示（可选）
        meta?: boolean | MetaOptions;    // 返回耗时元信息
    }

    interface StreamOptions {
        query?: any;                     // 查询条件
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
        query?: object;                  // 查询条件
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

    interface CollectionAccessor {
        getNamespace(): { iid: string; type: string; db: string; collection: string };
        dropCollection(): Promise<boolean>;
        createCollection(name?: string | null, options?: any): Promise<boolean>;
        createView(viewName: string, source: string, pipeline?: any[]): Promise<boolean>;

        // findOne 重载：支持 meta 参数
        findOne(options?: Omit<FindOptions, 'meta'>): Promise<any | null>;
        findOne(options: FindOptions & { meta: true | MetaOptions }): Promise<ResultWithMeta<any | null>>;
        findOne(options?: FindOptions): Promise<any | null | ResultWithMeta<any | null>>;

        // find 重载：支持 meta 参数
        find(options?: Omit<FindOptions, 'meta'>): Promise<any[]>;
        find(options: FindOptions & { meta: true | MetaOptions }): Promise<ResultWithMeta<any[]>>;
        find(options?: FindOptions): Promise<any[] | ResultWithMeta<any[]>>;

        // count 重载：支持 meta 参数
        count(options?: Omit<CountOptions, 'meta'>): Promise<number>;
        count(options: CountOptions & { meta: true | MetaOptions }): Promise<ResultWithMeta<number>>;
        count(options?: CountOptions): Promise<number | ResultWithMeta<number>>;

        // aggregate 重载：支持 meta 参数
        aggregate(pipeline?: any[], options?: Omit<AggregateOptions, 'meta'>): Promise<any[]>;
        aggregate(pipeline: any[], options: AggregateOptions & { meta: true | MetaOptions }): Promise<ResultWithMeta<any[]>>;
        aggregate(pipeline?: any[], options?: AggregateOptions): Promise<any[] | ResultWithMeta<any[]>>;

        // distinct 重载：支持 meta 参数
        distinct<T = any>(field: string, options?: Omit<DistinctOptions, 'meta'>): Promise<T[]>;
        distinct<T = any>(field: string, options: DistinctOptions & { meta: true | MetaOptions }): Promise<ResultWithMeta<T[]>>;
        distinct<T = any>(field: string, options?: DistinctOptions): Promise<T[] | ResultWithMeta<T[]>>;

        // stream：返回 Node.js 可读流
        stream(options?: StreamOptions): NodeJS.ReadableStream;

        // explain：查询执行计划诊断
        explain(options?: ExplainOptions): Promise<any>;

        // Bookmark 维护 APIs
        prewarmBookmarks(keyDims: BookmarkKeyDims, pages: number[]): Promise<PrewarmBookmarksResult>;
        listBookmarks(keyDims?: BookmarkKeyDims): Promise<ListBookmarksResult>;
        clearBookmarks(keyDims?: BookmarkKeyDims): Promise<ClearBookmarksResult>;

        // findPage：已在 PageResult 中包含 meta 字段，无需重载
        findPage(options: FindPageOptions): Promise<PageResult>;

        invalidate(op?: 'find' | 'findOne' | 'count' | 'findPage' | 'aggregate' | 'distinct'): Promise<number>;
    }

    type DbAccessor = {
        collection: (name: string) => CollectionAccessor;
        db: (dbName: string) => { collection: (name: string) => CollectionAccessor };
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
    }
}
