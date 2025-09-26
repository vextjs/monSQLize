declare module 'monsqlize' {
    type DbType = 'mongodb';
    interface LoggerLike { debug?: (...args: any[]) => void; info?: (...args: any[]) => void; warn?: (...args: any[]) => void; error?: (...args: any[]) => void }
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
        meta?: boolean | MetaOptions;    // 返回耗时元信息
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

        // findPage：已在 PageResult 中包含 meta 字段，无需重载
        findPage(options: FindPageOptions): Promise<PageResult>;

        invalidate(op?: 'find' | 'findOne' | 'count' | 'findPage'): Promise<number>;
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
