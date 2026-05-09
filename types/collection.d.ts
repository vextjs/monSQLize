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

export interface BatchErrorRecord {
    batchIndex: number;
    message: string;
}

export interface InsertBatchResult {
    acknowledged: boolean;
    totalCount: number;
    insertedCount: number;
    batchCount: number;
    errors: BatchErrorRecord[];
    insertedIds: Record<number, unknown>;
}

export interface UpdateBatchResult {
    acknowledged: boolean;
    totalCount: number;
    matchedCount: number;
    modifiedCount: number;
    batchCount: number;
    errors: BatchErrorRecord[];
}

export interface DeleteBatchResult {
    acknowledged: boolean;
    totalCount: number;
    deletedCount: number;
    batchCount: number;
    errors: BatchErrorRecord[];
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
    find(query?: unknown, options?: unknown): Promise<TSchema[]>;
    count(query?: unknown, options?: unknown): Promise<number>;
    insertOne(document?: unknown, options?: unknown): Promise<InsertOneResult>;
    insertMany(documents?: unknown[], options?: unknown): Promise<InsertManyResult>;
    updateOne(filter?: unknown, update?: unknown, options?: unknown): Promise<UpdateResult>;
    updateMany(filter?: unknown, update?: unknown, options?: unknown): Promise<UpdateResult>;
    replaceOne(filter?: unknown, replacement?: unknown, options?: unknown): Promise<UpdateResult>;
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
    aggregate(pipeline?: unknown[], options?: unknown): Promise<unknown[]>;
    findPage(options?: unknown): Promise<{
        data: TSchema[];
        page: { page: number; limit: number; };
        totals: { total: number; totalPages: number; };
    }>;
    watch(pipeline?: unknown[], options?: unknown): unknown;
}

export interface DbAccessor {
    collection<TSchema = unknown>(name: string): Collection<TSchema>;
    raw(): unknown;
    admin(): AdminAccessor;
}

