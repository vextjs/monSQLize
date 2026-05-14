import type { Document, FindOptions, Sort } from 'mongodb';

/** Meta options for controlling timing/cache info in query results. */
export interface MetaOptions {
    /** 'op' = operation-level timing only; 'sub' = include sub-step timings (findPage only) */
    level?: 'op' | 'sub';
    /** Include cache hit/miss/ttl info in meta */
    includeCache?: boolean;
}

/** Cursor-based page navigation info returned by findPage. */
export interface PageInfo {
    hasNext: boolean;
    hasPrev: boolean;
    startCursor: string | null;
    endCursor: string | null;
    /** Target logical page number (cursor/offset-jump modes only) */
    currentPage?: number;
}

/** Totals/count info returned by findPage when totals mode is enabled. */
export interface TotalsInfo {
    mode: 'async' | 'sync' | 'approx';
    /** async: null = not ready yet; approx: undefined = unknown/approximate */
    total?: number | null;
    totalPages?: number | null;
    /** Short token for async totals polling */
    token?: string;
    /** Write timestamp (ms) if from cache */
    ts?: number;
    /** Error identifier for async mode failures */
    error?: string;
}

/** Timing/meta info returned by findPage when the meta option is enabled. */
export interface MetaInfo {
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
    page?: number;
    after?: boolean;
    before?: boolean;
    hops?: number;
    step?: number;
    /** Sub-step timings (level='sub' only) */
    steps?: Array<{ phase: 'hop' | 'offset'; index?: number; durationMs: number }>;
    error?: { code?: string; message: string };
}

/** Bookmark/cursor jump configuration for deep pagination. */
export interface JumpOptions {
    /** Bookmark density: store bookmark every N pages (default 10) */
    step?: number;
    /** Max cursor-walking hops per jump (default 20) */
    maxHops?: number;
    /** Optional custom key dimensions for bookmark keying */
    keyDims?: object;
    /** Custom bookmark reader — returns cursor string or null */
    getBookmark?: (params: { keyDims: unknown; page: number }) => Promise<string | null>;
    /** Custom bookmark writer */
    saveBookmark?: (params: { keyDims: unknown; page: number; cursor: string; ttlMs?: number }) => Promise<void>;
}

/** Offset-based fallback configuration for small-range pages in findPage. */
export interface OffsetJumpOptions {
    /** Enable offset fallback when skip <= maxSkip (default false) */
    enable?: boolean;
    /** Max skip before falling back to cursor-jump (default 50000) */
    maxSkip?: number;
}

/** Totals/count mode configuration for findPage. */
export interface TotalsOptions {
    /** Counting strategy (default 'none') */
    mode?: 'none' | 'async' | 'approx' | 'sync';
    /** Timeout for countDocuments (sync/async modes, ms) */
    maxTimeMS?: number;
    /** Cache TTL for totals (async/approx modes, ms; default 10 min) */
    ttlMs?: number;
    /** Index hint for count query */
    hint?: unknown;
    /** Collation for count query */
    collation?: unknown;
}

/** Stream query options for collection.stream(). */
export interface StreamOptions {
    projection?: Record<string, unknown> | string[];
    sort?: Record<string, 1 | -1>;
    limit?: number;
    skip?: number;
    /** Cursor batch size (default 1000) */
    batchSize?: number;
    maxTimeMS?: number;
    hint?: unknown;
    collation?: unknown;
    noCursorTimeout?: boolean;
}

/** Explain/query plan options for collection.explain(). */
export interface ExplainOptions {
    projection?: Record<string, unknown>;
    sort?: Record<string, 1 | -1>;
    limit?: number;
    skip?: number;
    maxTimeMS?: number;
    hint?: unknown;
    collation?: unknown;
    /** Verbosity level (default 'queryPlanner') */
    verbosity?: 'queryPlanner' | 'executionStats' | 'allPlansExecution';
}

/** MongoDB query execution plan result returned by collection.explain(). */
export interface ExplainResult {
    queryPlanner: {
        plannerVersion: number;
        namespace: string;
        indexFilterSet: boolean;
        parsedQuery?: unknown;
        winningPlan: unknown;
        rejectedPlans: unknown[];
    };
    executionStats?: {
        executionSuccess: boolean;
        nReturned: number;
        executionTimeMillis: number;
        totalKeysExamined: number;
        totalDocsExamined: number;
        executionStages: unknown;
        allPlansExecution?: unknown[];
    };
    serverInfo?: {
        host: string;
        port: number;
        version: string;
        gitVersion: string;
    };
    ok: number;
}

export interface HealthView {
    status: 'up' | 'down';
    connected: boolean;
    defaults?: Record<string, unknown>;
    cache?: Record<string, unknown>;
}

export interface InsertOneResult {
    acknowledged: boolean;
    insertedId: unknown;
}

export interface InsertManyResult {
    acknowledged: boolean;
    insertedCount: number;
    insertedIds: Record<number, unknown>;
}

export interface UpdateResult {
    acknowledged: boolean;
    matchedCount: number;
    modifiedCount: number;
    upsertedCount: number;
    upsertedId: unknown | null;
}

export interface DeleteResult {
    acknowledged: boolean;
    deletedCount: number;
}

export interface FindPageOptions<TSchema = unknown> {
    query?: Document;
    page?: number;
    limit?: number;
    after?: string;
    before?: string;
    sort?: Sort;
    projection?: Document;
    pipeline?: Document[];
    /** Totals/count configuration */
    totals?: TotalsOptions;
    stream?: boolean;
    explain?: boolean | string;
    options?: FindOptions;
    /** Cursor-walking bookmark jump configuration */
    jump?: JumpOptions;
    /** Offset-based fallback for small page ranges */
    offsetJump?: OffsetJumpOptions;
    maxTimeMS?: number;
    hint?: Document | string;
    collation?: Document;
    batchSize?: number;
    /** Cache TTL in milliseconds */
    cache?: number;
    /** Include timing/meta info in result — pass true or MetaOptions for sub-step detail */
    meta?: boolean | MetaOptions;
}

export interface FindPageResult<TSchema = unknown> {
    items: TSchema[];
    pageInfo: PageInfo;
    totals?: TotalsInfo;
    /** Timing/meta info — present when meta option was passed */
    meta?: MetaInfo;
}

export interface FindAndCountResult<TSchema = unknown> {
    data: TSchema[];
    total: number;
}

export interface FindChain<TSchema = unknown> extends Promise<TSchema[]> {
    limit(value: number): FindChain<TSchema>;
    skip(value: number): FindChain<TSchema>;
    sort(value: Sort | Record<string, 1 | -1>): FindChain<TSchema>;
    project(value: Document): FindChain<TSchema>;
    hint(value: unknown): FindChain<TSchema>;
    collation(value: Record<string, unknown>): FindChain<TSchema>;
    comment(value: string): FindChain<TSchema>;
    maxTimeMS(value: number): FindChain<TSchema>;
    batchSize(value: number): FindChain<TSchema>;
    explain(verbosity?: boolean | string): Promise<unknown>;
    stream(): NodeJS.ReadableStream;
    toArray(): Promise<TSchema[]>;
}

export interface AggregateChain<TResult = unknown> extends Promise<TResult[]> {
    hint(value: unknown): AggregateChain<TResult>;
    collation(value: Record<string, unknown>): AggregateChain<TResult>;
    comment(value: string): AggregateChain<TResult>;
    maxTimeMS(value: number): AggregateChain<TResult>;
    allowDiskUse(value: boolean): AggregateChain<TResult>;
    batchSize(value: number): AggregateChain<TResult>;
    explain(verbosity?: boolean | string): Promise<unknown>;
    stream(): NodeJS.ReadableStream;
    toArray(): Promise<TResult[]>;
}

/** Write concern options for batch operations. */
export interface WriteConcern {
    /** Write acknowledgement level (default: 1). */
    w?: number | 'majority';
    /** Wait for journal flush before acknowledging (default: false). */
    j?: boolean;
    /** Write timeout in milliseconds. */
    wtimeout?: number;
}

/** Per-batch retry record appended to batch result `retries` arrays. */
export interface BatchRetryRecord {
    batchIndex: number;
    attempts: number;
    success: boolean;
}

/** Progress callback payload delivered for each completed batch. */
export interface BatchProgress {
    currentBatch: number;
    totalBatches: number;
    inserted?: number;
    modified?: number;
    deleted?: number;
    /** Total document count (null when not yet known). */
    total: number | null;
    /** Completion percentage (null when total is unknown). */
    percentage: number | null;
    errors: number;
    retries: number;
}

/** Payload supplied to the `onRetry` callback for each retry attempt. */
export interface RetryInfo {
    batchIndex: number;
    attempt: number;
    maxAttempts: number;
    error: Error;
}

/** Options for insertBatch operations. */
export interface InsertBatchOptions {
    /** Number of documents per batch (default: 1000). */
    batchSize?: number;
    /** Maximum number of concurrent batch writes. */
    concurrency?: number;
    /** Ordered inserts — stop on first error when true. */
    ordered?: boolean;
    /** Progress callback invoked after each batch. */
    onProgress?: (progress: BatchProgress) => void;
    /** Error handling strategy. */
    onError?: 'stop' | 'skip' | 'collect' | 'retry';
    /** Number of retry attempts per batch on transient failure. */
    retryAttempts?: number;
    /** Delay between retries in milliseconds. */
    retryDelay?: number;
    /** Retry callback invoked before each retry attempt. */
    onRetry?: (retryInfo: RetryInfo) => void;
    /** MongoDB write concern. */
    writeConcern?: WriteConcern;
    /** Skip MongoDB document validation. */
    bypassDocumentValidation?: boolean;
    /** Query comment for server-side profiling. */
    comment?: string;
}

/** Options for deleteBatch operations. */
export interface DeleteBatchOptions {
    /** Number of documents per batch (default: 1000). */
    batchSize?: number;
    /** Estimate total for progress reporting. */
    estimateProgress?: boolean;
    /** Progress callback invoked after each batch. */
    onProgress?: (progress: BatchProgress) => void;
    /** Error handling strategy. */
    onError?: 'stop' | 'skip' | 'collect' | 'retry';
    /** Number of retry attempts per batch on transient failure. */
    retryAttempts?: number;
    /** Delay between retries in milliseconds. */
    retryDelay?: number;
    /** Retry callback invoked before each retry attempt. */
    onRetry?: (retryInfo: RetryInfo) => void;
    /** MongoDB write concern. */
    writeConcern?: WriteConcern;
    /** Query comment for server-side profiling. */
    comment?: string;
}

export interface BatchErrorRecord {
    batchIndex: number;
    message: string;
    /** Additional error details. */
    details?: unknown;
}

export interface InsertBatchResult {
    acknowledged: boolean;
    /** Total document count processed (never null for insert). */
    totalCount: number;
    insertedCount: number;
    batchCount: number;
    errors: BatchErrorRecord[];
    insertedIds: Record<number, unknown>;
    /** Per-batch retry records. */
    retries: BatchRetryRecord[];
}

export interface UpdateBatchResult {
    acknowledged: boolean;
    totalCount: number | null;
    matchedCount: number;
    modifiedCount: number;
    /** Number of documents upserted across all batches. */
    upsertedCount: number;
    batchCount: number;
    errors: BatchErrorRecord[];
    /** Per-batch retry records. */
    retries: BatchRetryRecord[];
}

export interface DeleteBatchResult {
    acknowledged: boolean;
    totalCount: number | null;
    deletedCount: number;
    batchCount: number;
    errors: BatchErrorRecord[];
    /** Per-batch retry records. */
    retries: BatchRetryRecord[];
}

export interface BatchWriteOptions {
    batchSize?: number;
    ordered?: boolean;
}

/** Options for updateBatch operations. */
export interface UpdateBatchOptions {
    /** Number of documents per batch (default: 1000). */
    batchSize?: number;
    /** Estimate total for progress reporting. */
    estimateProgress?: boolean;
    /** Progress callback invoked after each batch. */
    onProgress?: (progress: BatchProgress) => void;
    /** Error handling strategy. */
    onError?: 'stop' | 'skip' | 'collect' | 'retry';
    /** Number of retry attempts per batch on transient failure. */
    retryAttempts?: number;
    /** Delay between retries in milliseconds. */
    retryDelay?: number;
    /** Retry callback invoked before each retry attempt. */
    onRetry?: (retryInfo: RetryInfo) => void;
    /** MongoDB write concern. */
    writeConcern?: WriteConcern;
    /** Upsert documents that do not match the filter. */
    upsert?: boolean;
    /** Array filters for nested array updates. */
    arrayFilters?: unknown[];
    /** Query comment for server-side profiling. */
    comment?: string;
    /** Sort order used to paginate through batch cursor. */
    sort?: Record<string, 1 | -1>;
}

export interface IncrementOneOptions extends Record<string, unknown> {
    returnDocument?: 'before' | 'after';
    projection?: Record<string, unknown>;
    $set?: Record<string, unknown>;
}

export interface IndexCreateResult {
    name: string;
}

export interface BookmarkPrewarmResult {
    warmed: number;
    failed: number;
    keys: string[];
}

export interface BookmarkListResult {
    count: number;
    pages: number[];
    keys: string[];
}

export interface BookmarkClearResult {
    cleared: number;
    pattern: string;
    keysBefore: number;
}

export interface BookmarkKeyDims<TSchema = unknown> extends Omit<FindPageOptions<TSchema>, 'page'> {}

export interface BookmarkCacheLike {
    set(key: string, value: unknown): boolean | Promise<boolean>;
    get(key: string): unknown | Promise<unknown>;
    delete?(key: string): boolean | Promise<boolean>;
    keys?(pattern: string): string[] | Promise<string[]>;
    delPattern?(pattern: string): number | Promise<number>;
}

export interface AdminBuildInfoView {
    version?: string;
    versionArray?: number[];
    gitVersion?: string;
    bits?: number;
    debug?: boolean;
    maxBsonObjectSize?: number;
}

export interface ServerStatusView {
    connections: {
        current?: number;
        available?: number;
        totalCreated?: number;
    };
    mem: {
        resident?: number;
        virtual?: number;
        mapped?: number;
    };
    opcounters: {
        insert?: number;
        query?: number;
        update?: number;
        delete?: number;
        getmore?: number;
        command?: number;
    };
    network: {
        bytesIn?: number;
        bytesOut?: number;
        numRequests?: number;
    };
    uptime?: number;
    localTime?: Date;
    version?: string;
    process?: string;
}

export interface DbStatsView {
    db?: string;
    collections?: number;
    views?: number;
    objects?: number;
    avgObjSize?: number;
    dataSize?: number;
    storageSize?: number;
    indexes?: number;
    indexSize?: number;
    totalSize?: number;
    scaleFactor?: number;
}

export interface AdminAccessor {
    ping(): Promise<boolean>;
    buildInfo(): Promise<AdminBuildInfoView>;
    serverStatus(options?: { scale?: number; }): Promise<ServerStatusView>;
    stats(options?: { scale?: number; }): Promise<DbStatsView>;
}

export interface Collection<TSchema = unknown> {
    getNamespace(): { iid: string; type: 'mongodb'; db: string; collection: string; };
    raw(): unknown;
    findOne(query?: unknown, options?: unknown): Promise<TSchema | null>;
    find(query?: unknown, options?: unknown): FindChain<TSchema>;
    findOneById(id: unknown, options?: unknown): Promise<TSchema | null>;
    findByIds(ids: unknown[], options?: unknown): Promise<TSchema[]>;
    findAndCount(query?: unknown, options?: unknown): Promise<FindAndCountResult<TSchema>>;
    stream(query?: unknown, options?: unknown): NodeJS.ReadableStream;
    explain(query?: unknown, options?: unknown): Promise<unknown>;
    count(query?: unknown, options?: unknown): Promise<number>;
    insertOne(document?: unknown, options?: unknown): Promise<InsertOneResult>;
    insertMany(documents?: unknown[], options?: unknown): Promise<InsertManyResult>;
    updateOne(filter?: unknown, update?: unknown, options?: unknown): Promise<UpdateResult>;
    updateMany(filter?: unknown, update?: unknown, options?: unknown): Promise<UpdateResult>;
    replaceOne(filter?: unknown, replacement?: unknown, options?: unknown): Promise<UpdateResult>;
    findOneAndReplace(filter?: unknown, replacement?: unknown, options?: unknown): Promise<TSchema | null>;
    findOneAndUpdate(filter?: unknown, update?: unknown, options?: unknown): Promise<TSchema | null>;
    findOneAndDelete(filter?: unknown, options?: unknown): Promise<TSchema | null>;
    upsertOne(filter?: unknown, update?: unknown, options?: unknown): Promise<UpdateResult>;
    deleteOne(filter?: unknown, options?: unknown): Promise<DeleteResult>;
    deleteMany(filter?: unknown, options?: unknown): Promise<DeleteResult>;
    insertBatch(documents?: unknown[], options?: unknown): Promise<InsertBatchResult>;
    updateBatch(filter?: unknown, update?: unknown, options?: unknown): Promise<UpdateBatchResult>;
    deleteBatch(filter?: unknown, options?: unknown): Promise<DeleteBatchResult>;
    incrementOne(filter?: unknown, field?: string | Record<string, number>, incrementOrOptions?: unknown, maybeOptions?: unknown): Promise<TSchema | null>;
    createIndex(keys: unknown, options?: unknown): Promise<IndexCreateResult>;
    createIndexes(specs: Array<{ key: unknown; } & Record<string, unknown>>): Promise<string[]>;
    listIndexes(): Promise<Record<string, unknown>[]>;
    dropIndex(name: string): Promise<unknown>;
    dropIndexes(): Promise<unknown>;
    prewarmBookmarks(keyDims?: unknown, pages?: number[]): Promise<BookmarkPrewarmResult>;
    listBookmarks(keyDims?: unknown): Promise<BookmarkListResult>;
    clearBookmarks(keyDims?: unknown): Promise<BookmarkClearResult>;
    distinct(key: string, query?: unknown, options?: unknown): Promise<unknown[]>;
    aggregate<TResult = unknown>(pipeline?: unknown[], options?: unknown): AggregateChain<TResult>;
    findPage(options?: FindPageOptions<TSchema>): Promise<FindPageResult<TSchema>>;
    watch(pipeline?: unknown[], options?: unknown): unknown;
    /** @since v1.3.0 */
    invalidate(op?: 'find' | 'findOne' | 'count' | 'findPage'): Promise<number>;
    /** @since v1.3.0 */
    dropCollection(): Promise<boolean>;
    /** @since v1.3.0 */
    createCollection(name?: string, options?: Record<string, unknown>): Promise<boolean>;
    /** @since v1.3.0 */
    createView(name: string, source: string, pipeline?: unknown[]): Promise<boolean>;
    /** @since v1.3.0 */
    indexStats(): Promise<unknown[]>;
}

export interface DbAccessor {
    collection<TSchema = unknown>(name: string): Collection<TSchema>;
    raw(): unknown;
    admin(): AdminAccessor;
    /** @since v1.3.0 */
    listDatabases(options?: { nameOnly?: boolean }): Promise<Array<{ name: string; sizeOnDisk: number; empty: boolean }> | string[]>;
    /** @since v1.3.0 */
    dropDatabase(options?: { confirm: boolean; allowProduction?: boolean; user?: string }): Promise<{ dropped: boolean; database: string; timestamp: Date }>;
    /** @since v1.3.0 */
    listCollections(filter?: Record<string, unknown>, options?: Record<string, unknown>): Promise<Array<{ name: string; type: string }>>;
    /** @since v1.3.0 */
    runCommand(command: Record<string, unknown>, options?: Record<string, unknown>): Promise<Record<string, unknown>>;
}

// ---------------------------------------------------------------------------
// v1 backward-compat name aliases
// ---------------------------------------------------------------------------

/** @alias FindPageResult — v1 called the findPage result PageResult */
export type PageResult<T = unknown> = FindPageResult<T>;

/** @alias BookmarkPrewarmResult — v1 name */
export type PrewarmBookmarksResult = BookmarkPrewarmResult;

/** @alias BookmarkListResult — v1 name */
export type ListBookmarksResult = BookmarkListResult;

/** @alias BookmarkClearResult — v1 name */
export type ClearBookmarksResult = BookmarkClearResult;

// ---------------------------------------------------------------------------
// Write options (v1 parity)
// ---------------------------------------------------------------------------

/** Simplified insertOne options (used for the shorthand call form). */
export interface InsertOneSimplifiedOptions {
    writeConcern?: WriteConcern;
    bypassDocumentValidation?: boolean;
    comment?: string;
    session?: unknown;
    /** Invalidate query cache on success. @since v1.1.5 */
    autoInvalidate?: boolean;
}

/** Full insertOne options (document + write configuration). */
export interface InsertOneOptions {
    document: unknown;
    writeConcern?: WriteConcern;
    bypassDocumentValidation?: boolean;
    comment?: string;
}

/** Simplified insertMany options (used for the shorthand call form). */
export interface InsertManySimplifiedOptions {
    ordered?: boolean;
    writeConcern?: WriteConcern;
    bypassDocumentValidation?: boolean;
    comment?: string;
    session?: unknown;
    /** Invalidate query cache on success. @since v1.1.5 */
    autoInvalidate?: boolean;
}

/** Full insertMany options (documents array + write configuration). */
export interface InsertManyOptions {
    documents: unknown[];
    ordered?: boolean;
    writeConcern?: WriteConcern;
    bypassDocumentValidation?: boolean;
    comment?: string;
}

// ---------------------------------------------------------------------------
// Chain helpers (v1 parity)
// ---------------------------------------------------------------------------

/**
 * Collation options for locale-aware string comparison.
 * @since v1.0.0
 */
export interface CollationOptions {
    /** IETF language tag, e.g. 'en', 'zh'. */
    locale: string;
    /** Comparison strength: 1=base, 2=accent, 3=case. */
    strength?: number;
    /** Distinguish uppercase from lowercase at strength < 3. */
    caseLevel?: boolean;
    /** Which case is sorted first when cases are equal. */
    caseFirst?: 'upper' | 'lower';
    /** Sort numeric strings numerically, not lexicographically. */
    numericOrdering?: boolean;
    /** How spaces and punctuation are handled. */
    alternate?: 'non-ignorable' | 'shifted';
    /** Highest ignored character category. */
    maxVariable?: 'punct' | 'space';
    /** Sort secondary weights in reverse order. */
    backwards?: boolean;
}

// ---------------------------------------------------------------------------
// Pagination helpers (v1 parity)
// ---------------------------------------------------------------------------

/**
 * Query result with attached metadata (timing, cache, totals).
 * @since v1.3.0
 */
export interface ResultWithMeta<T = unknown> {
    data: T;
    meta: MetaInfo;
}

// ---------------------------------------------------------------------------
// Collection accessor alias (v1 parity)
// ---------------------------------------------------------------------------

/** @alias Collection — v1 called the collection accessor CollectionAccessor */
export type CollectionAccessor<TSchema = unknown> = Collection<TSchema>;

