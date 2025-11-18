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

    interface CollectionAccessor {
        getNamespace(): { iid: string; type: string; db: string; collection: string };
        dropCollection(): Promise<boolean>;
        createCollection(name?: string | null, options?: any): Promise<boolean>;
        createView(viewName: string, source: string, pipeline?: any[]): Promise<boolean>;

        // findOne 重载：支持 meta 参数
        findOne(query?: any, options?: Omit<FindOptions, 'meta'>): Promise<any | null>;
        findOne(query: any, options: FindOptions & { meta: true | MetaOptions }): Promise<ResultWithMeta<any | null>>;
        findOne(query?: any, options?: FindOptions): Promise<any | null | ResultWithMeta<any | null>>;

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

        // find 重载：支持 meta 参数和链式调用 (v2.0+)
        find<T = any>(query?: any): FindChain<T>;
        find<T = any>(query: any, options: FindOptions & { meta: true | MetaOptions }): Promise<ResultWithMeta<T[]>>;
        find<T = any>(query?: any, options?: FindOptions): Promise<T[]> | FindChain<T> | ResultWithMeta<T[]>;

        // count 重载：支持 meta 参数
        count(query?: any, options?: Omit<CountOptions, 'meta'>): Promise<number>;
        count(query: any, options: CountOptions & { meta: true | MetaOptions }): Promise<ResultWithMeta<number>>;
        count(query?: any, options?: CountOptions): Promise<number | ResultWithMeta<number>>;

        // aggregate 重载：支持 meta 参数和链式调用 (v2.0+)
        aggregate<T = any>(pipeline?: any[]): AggregateChain<T>;
        aggregate<T = any>(pipeline: any[], options: AggregateOptions & { meta: true | MetaOptions }): Promise<ResultWithMeta<T[]>>;
        aggregate<T = any>(pipeline?: any[], options?: AggregateOptions): Promise<T[]> | AggregateChain<T> | ResultWithMeta<T[]>;

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
        findPage(options: FindPageOptions): Promise<PageResult>;

        // 写入操作
        insertOne(options: InsertOneOptions): Promise<InsertOneResult>;
        insertMany(options: InsertManyOptions): Promise<InsertManyResult>;

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
}
