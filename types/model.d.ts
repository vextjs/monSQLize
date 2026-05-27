import type { BookmarkClearResult, BookmarkListResult, BookmarkPrewarmResult, DeleteBatchResult, DeleteResult, IndexCreateResult, InsertOneResult, UpdateResult } from './collection';

/**
 * Schema DSL transformer function.
 * Receives a raw DSL descriptor and returns a transformed schema object.
 * @since v1.0.0
 */
export type SchemaDSL = (dsl: unknown) => unknown;

/**
 * Default value for a model field — either a static value or a factory function.
 * @template T Field value type
 * @since v1.0.0
 */
export type DefaultValue<T = unknown> = T | ((context?: unknown, doc?: unknown) => T);

export interface ValidationResult {
    valid: boolean;
    errors?: Array<{
        field: string;
        message: string;
        value?: unknown;
    }>;
    data?: unknown;
}

export interface HookContext {
    operation: string;
    collection: string;
    data?: unknown;
    filter?: unknown;
    update?: unknown;
    result?: unknown;
    error?: Error;
    [key: string]: unknown;
}

export interface ModelConnection {
    pool?: string;
    database?: string;
}

export interface RelationConfig {
    from: string;
    localField: string;
    foreignField: string;
    single?: boolean;
}

export interface PopulateConfig {
    path: string;
    select?: string | string[];
    match?: Record<string, unknown>;
    sort?: Record<string, 1 | -1>;
    limit?: number;
    skip?: number;
    populate?: string | PopulateConfig | Array<string | PopulateConfig>;
}

export interface VirtualConfig {
    get: (this: Record<string, unknown>) => unknown;
    set?: (this: Record<string, unknown>, value: unknown) => void;
}

/** v1 hooks factory format */
export type V1HooksFactory<TDocument = Record<string, unknown>> = (
    model: ModelInstance<TDocument>,
) => {
    find?: {
        before?: (ctx: Record<string, unknown>, ...args: unknown[]) => unknown;
        after?: (ctx: Record<string, unknown>, result: unknown) => unknown;
    };
    insert?: {
        before?: (ctx: Record<string, unknown>, ...args: unknown[]) => unknown;
        after?: (ctx: Record<string, unknown>, result: unknown) => unknown;
    };
    update?: {
        before?: (ctx: Record<string, unknown>, ...args: unknown[]) => unknown;
        after?: (ctx: Record<string, unknown>, result: unknown) => unknown;
    };
    delete?: {
        before?: (ctx: Record<string, unknown>, ...args: unknown[]) => unknown;
        after?: (ctx: Record<string, unknown>, result: unknown) => unknown;
    };
};

/** v1 methods factory format */
export type V1MethodsFactory<TDocument = Record<string, unknown>> = (
    model: ModelInstance<TDocument>,
) => {
    instance?: Record<string, (this: TDocument & Record<string, unknown>, ...args: unknown[]) => unknown>;
    static?: Record<string, (...args: unknown[]) => unknown>;
};

export interface ModelDefinitionOptions {
    timestamps?: boolean | { createdAt?: string | boolean; updatedAt?: string | boolean };
    validate?: boolean;
    softDelete?: boolean | {
        enabled?: boolean;
        field?: string;
        type?: string;
        ttl?: number | null;
    };
    version?: boolean | {
        enabled?: boolean;
        field?: string;
    };
}

export interface ModelDefinition<TDocument = Record<string, unknown>> {
    enums?: Record<string, string>;
    schema?: ((dsl: unknown) => unknown) | Record<string, unknown>;
    defaults?: Record<string, unknown | ((context?: unknown, doc?: TDocument) => unknown)>;
    hooks?:
    | {
        beforeCreate?: (context: HookContext) => Promise<void> | void;
        afterCreate?: (context: HookContext) => Promise<void> | void;
        beforeInsert?: (context: HookContext) => Promise<void> | void;
        afterInsert?: (context: HookContext) => Promise<void> | void;
        beforeUpdate?: (context: HookContext) => Promise<void> | void;
        afterUpdate?: (context: HookContext) => Promise<void> | void;
        beforeDelete?: (context: HookContext) => Promise<void> | void;
        afterDelete?: (context: HookContext) => Promise<void> | void;
        beforeFind?: (context: HookContext) => Promise<void> | void;
        afterFind?: (context: HookContext) => Promise<void> | void;
    }
    | V1HooksFactory<TDocument>;
    methods?:
    | Record<string, (this: TDocument & Record<string, unknown>, ...args: unknown[]) => unknown>
    | V1MethodsFactory<TDocument>;
    statics?: Record<string, (...args: unknown[]) => unknown>;
    relations?: Record<string, RelationConfig>;
    virtuals?: Record<string, VirtualConfig>;
    connection?: ModelConnection;
    indexes?: Array<{ key: unknown } & Record<string, unknown>>;
    options?: ModelDefinitionOptions;
}

export interface RegisteredModel<TDocument = Record<string, unknown>> {
    collectionName: string;
    definition: ModelDefinition<TDocument>;
}

export interface ModelScopeOptions {
    database?: string;
    pool?: string;
}

export interface PopulateProxy<T = unknown> extends Promise<T> {
    populate(path: string | PopulateConfig | Array<string | PopulateConfig>, options?: Partial<Omit<PopulateConfig, 'path'>>): PopulateProxy<T>;
    exec(): Promise<T>;
}

export type ModelDocument<TDocument = Record<string, unknown>> = TDocument & Record<string, unknown> & {
    save(): Promise<ModelDocument<TDocument>>;
    remove(): Promise<boolean>;
    validate(): Promise<ValidationResult>;
    populate(path: string | PopulateConfig | Array<string | PopulateConfig>): Promise<ModelDocument<TDocument> | null>;
    toObject(): TDocument & Record<string, unknown>;
    toJSON(): TDocument & Record<string, unknown>;
};

export interface ModelInstance<TDocument = Record<string, unknown>> {
    readonly collectionName: string;
    readonly dbName: string;
    readonly poolName?: string;
    readonly definition: ModelDefinition<TDocument>;
    /** 返回当前模型的命名空间元数据，包含实例 ID、类型、数据库和集合名称。 */
    getNamespace(): { iid: string; type: 'mongodb'; db: string; collection: string; };
    /** 返回当前模型声明的关系配置映射。 */
    getRelations(): Record<string, RelationConfig>;
    /** 返回当前模型声明的枚举字段值映射。 */
    getEnums(): Record<string, string>;
    /** 返回底层原生 MongoDB Collection 对象，用于执行框架未封装的原始操作。 */
    raw(): unknown;
    /**
     * 查询符合条件的文档列表。
     * @param query 可选的过滤条件。
     * @param options 可选的查询选项（projection、sort、limit 等）。
     * @returns 文档数组，支持链式 `.populate()` 调用。
     */
    find(query?: unknown, options?: unknown): PopulateProxy<Array<ModelDocument<TDocument>>>;
    /**
     * 查询第一条符合条件的文档。
     * @param query 可选的过滤条件。
     * @param options 可选的查询选项。
     * @returns 匹配的文档，未找到时返回 `null`。
     */
    findOne(query?: unknown, options?: unknown): PopulateProxy<ModelDocument<TDocument> | null>;
    /**
     * 按主键 ID 查询单条文档（`findOne` 的 ID 快捷方式）。
     * @param id 文档主键值。
     * @param options 可选的查询选项。
     * @returns 匹配的文档，未找到时返回 `null`。
     */
    findOneById(id: unknown, options?: unknown): PopulateProxy<ModelDocument<TDocument> | null>;
    /**
     * 按主键 ID 查询单条文档（`findOneById` 的别名）。
     * @param id 文档主键值。
     * @param options 可选的查询选项。
     * @returns 匹配的文档，未找到时返回 `null`。
     */
    findById(id: unknown, options?: unknown): PopulateProxy<ModelDocument<TDocument> | null>;
    /**
     * 按多个主键 ID 批量查询文档。
     * @param ids 主键值数组。
     * @param options 可选的查询选项。
     * @returns 匹配的文档数组。
     */
    findByIds(ids: unknown[], options?: unknown): PopulateProxy<Array<ModelDocument<TDocument>>>;
    /**
     * 分页查询文档，支持基于游标或页码两种分页模式。
     * @param options 分页选项，包含 `limit`、`cursor`/`page`、`filter`、`sort` 等字段。
     * @returns 包含文档列表、分页信息及可选汇总数据的结果对象。
     */
    findPage(options?: unknown): PopulateProxy<{
        items: Array<ModelDocument<TDocument>>;
        pageInfo: {
            hasNext: boolean;
            hasPrev: boolean;
            startCursor: string | null;
            endCursor: string | null;
            currentPage?: number;
        };
        totals?: Record<string, unknown>;
        meta?: import('./collection').MetaInfo;
    }>;
    /**
     * 查询符合条件的文档列表，同时返回未分页的总数。
     * @param query 可选的过滤条件。
     * @param options 可选的查询选项。
     * @returns 包含文档数组和总数的对象。
     */
    findAndCount(query?: unknown, options?: unknown): PopulateProxy<{
        data: Array<ModelDocument<TDocument>>;
        total: number;
    }>;
    /**
     * 统计符合条件的文档数量。
     * @param query 可选的过滤条件。
     * @param options 可选的统计选项。
     * @returns 匹配的文档数量。
     */
    count(query?: unknown, options?: unknown): Promise<number>;
    /**
     * 插入单条文档。
     * @param document 要插入的文档数据。
     * @param options 可选的写入选项。
     * @returns 包含插入 ID 的结果对象。
     */
    insertOne(document?: unknown, options?: unknown): Promise<InsertOneResult>;
    /**
     * 批量插入多条文档（有序插入，遇错即停）。
     * @param documents 要插入的文档数组。
     * @param options 可选的写入选项。
     */
    insertMany(documents?: unknown[], options?: unknown): Promise<unknown>;
    /**
     * 更新第一条符合条件的文档。
     * @param filter 过滤条件。
     * @param update 更新操作符文档（如 `$set`、`$inc`）。
     * @param options 可选的更新选项。
     */
    updateOne(filter?: unknown, update?: unknown, options?: unknown): Promise<unknown>;
    /**
     * 更新所有符合条件的文档。
     * @param filter 过滤条件。
     * @param update 更新操作符文档。
     * @param options 可选的更新选项。
     */
    updateMany(filter?: unknown, update?: unknown, options?: unknown): Promise<unknown>;
    /**
     * 替换第一条符合条件的文档（整体替换，不使用更新操作符）。
     * @param filter 过滤条件。
     * @param replacement 替换后的完整文档。
     * @param options 可选的替换选项。
     */
    replaceOne(filter?: unknown, replacement?: unknown, options?: unknown): Promise<unknown>;
    /**
     * 原子地查找并更新单条文档，返回更新后的文档。
     * @param filter 过滤条件。
     * @param update 更新操作符文档。
     * @param options 可选的选项（如 `returnDocument: 'after'`）。
     * @returns 更新后的文档，未找到时返回 `null`。
     */
    findOneAndUpdate(filter?: unknown, update?: unknown, options?: unknown): Promise<TDocument | null>;
    /**
     * 原子地查找并替换单条文档，返回替换后的文档。
     * @param filter 过滤条件。
     * @param replacement 替换后的完整文档。
     * @param options 可选的选项。
     * @returns 替换后的文档，未找到时返回 `null`。
     */
    findOneAndReplace(filter?: unknown, replacement?: unknown, options?: unknown): Promise<TDocument | null>;
    /**
     * 原子地查找并删除单条文档，返回被删除的文档。
     * @param filter 过滤条件。
     * @param options 可选的选项。
     * @returns 被删除的文档，未找到时返回 `null`。
     */
    findOneAndDelete(filter?: unknown, options?: unknown): Promise<TDocument | null>;
    /**
     * 若文档存在则更新，否则插入（upsert 语义）。
     * @param filter 过滤条件。
     * @param update 更新操作符文档。
     * @param options 可选的更新选项。
     * @returns 标准 `UpdateResult` 对象。
     */
    upsertOne(filter?: unknown, update?: unknown, options?: unknown): Promise<UpdateResult>;
    /**
     * 对符合条件的单条文档的指定字段执行原子自增操作。
     * @param filter 过滤条件。
     * @param field 字段名或字段-增量映射对象。
     * @param increment 增量值（`field` 为字符串时使用）。
     * @param options 可选的更新选项。
     */
    incrementOne(filter?: unknown, field?: string | Record<string, number>, increment?: number, options?: unknown): Promise<unknown>;
    /**
     * 删除第一条符合条件的文档。
     * @param filter 过滤条件。
     * @param options 可选的删除选项。
     * @returns 标准 `DeleteResult` 对象。
     */
    deleteOne(filter?: unknown, options?: unknown): Promise<DeleteResult>;
    /**
     * 删除所有符合条件的文档。
     * @param filter 过滤条件。
     * @param options 可选的删除选项。
     * @returns 标准 `DeleteResult` 对象。
     */
    deleteMany(filter?: unknown, options?: unknown): Promise<DeleteResult>;
    // soft-delete extended methods
    /**
     * 查询包含软删除文档在内的所有匹配文档。
     * @param query 可选的过滤条件。
     * @param options 可选的查询选项。
     */
    findWithDeleted(query?: unknown, options?: unknown): PopulateProxy<Array<ModelDocument<TDocument>>>;
    /**
     * 仅查询已被软删除的文档。
     * @param query 可选的过滤条件。
     * @param options 可选的查询选项。
     */
    findOnlyDeleted(query?: unknown, options?: unknown): PopulateProxy<Array<ModelDocument<TDocument>>>;
    /**
     * 查询第一条符合条件的文档（包含软删除文档）。
     * @param query 可选的过滤条件。
     * @param options 可选的查询选项。
     * @returns 匹配的文档，未找到时返回 `null`。
     */
    findOneWithDeleted(query?: unknown, options?: unknown): PopulateProxy<ModelDocument<TDocument> | null>;
    /**
     * 恢复第一条符合条件的软删除文档。
     * @param filter 过滤条件。
     * @param options 可选的更新选项。
     */
    restore(filter?: unknown, options?: unknown): Promise<unknown>;
    /**
     * 批量恢复所有符合条件的软删除文档。
     * @param filter 过滤条件。
     * @param options 可选的更新选项。
     */
    restoreMany(filter?: unknown, options?: unknown): Promise<unknown>;
    /**
     * 物理删除第一条符合条件的文档（绕过软删除机制）。
     * @param filter 过滤条件。
     * @param options 可选的删除选项。
     * @returns 标准 `DeleteResult` 对象。
     */
    forceDelete(filter?: unknown, options?: unknown): Promise<DeleteResult>;
    /**
     * 物理删除所有符合条件的文档（绕过软删除机制）。
     * @param filter 过滤条件。
     * @param options 可选的删除选项。
     * @returns 标准 `DeleteResult` 对象。
     */
    forceDeleteMany(filter?: unknown, options?: unknown): Promise<DeleteResult>;
    /**
     * 查询第一条仅在软删除范围内匹配的文档。
     * @param query 可选的过滤条件。
     * @param options 可选的查询选项。
     * @returns 匹配的已删除文档，未找到时返回 `null`。
     */
    findOneOnlyDeleted(query?: unknown, options?: unknown): PopulateProxy<ModelDocument<TDocument> | null>;
    /**
     * 统计包含软删除文档在内的匹配数量。
     * @param query 可选的过滤条件。
     * @param options 可选的统计选项。
     */
    countWithDeleted(query?: unknown, options?: unknown): Promise<number>;
    /**
     * 统计已被软删除的文档数量。
     * @param query 可选的过滤条件。
     * @param options 可选的统计选项。
     */
    countOnlyDeleted(query?: unknown, options?: unknown): Promise<number>;
    /**
     * 使用写队列批量插入大量文档，适合高吞吐写入场景。
     * @param docs 要插入的文档数组。
     * @param options 可选的批量写入选项。
     */
    insertBatch(docs: unknown[], options?: unknown): Promise<unknown>;
    /**
     * 批量更新符合条件的文档（底层使用 `bulkWrite`）。
     * @param filter 过滤条件。
     * @param update 更新操作符文档。
     * @param options 可选的批量写入选项。
     */
    updateBatch(filter?: unknown, update?: unknown, options?: unknown): Promise<unknown>;
    /** 批量删除符合条件的文档。 */
    deleteBatch(filter?: unknown, options?: unknown): Promise<DeleteBatchResult>;
    /**
     * 在集合上创建单个索引。
     * @param keys 索引键规范对象。
     * @param options 可选的索引选项（如 `unique`、`sparse`）。
     * @returns 索引创建结果。
     */
    createIndex(keys: unknown, options?: unknown): Promise<IndexCreateResult>;
    /**
     * 批量创建多个索引。
     * @param specs 索引规范数组，每项包含 `key` 及可选的索引选项。
     * @returns 已创建索引的名称数组。
     */
    createIndexes(specs: Array<{ key: unknown; } & Record<string, unknown>>): Promise<string[]>;
    /** 列出集合上所有现有索引的定义信息。 */
    listIndexes(): Promise<Record<string, unknown>[]>;
    /**
     * 按名称删除指定索引。
     * @param name 索引名称。
     */
    dropIndex(name: string): Promise<unknown>;
    /** 删除集合上的所有非 `_id` 索引。 */
    dropIndexes(): Promise<unknown>;
    /** 预热游标分页书签缓存。 */
    prewarmBookmarks(keyDims?: unknown, pages?: number[]): Promise<BookmarkPrewarmResult>;
    /** 列出游标分页书签缓存。 */
    listBookmarks(keyDims?: unknown): Promise<BookmarkListResult>;
    /** 清理游标分页书签缓存。 */
    clearBookmarks(keyDims?: unknown): Promise<BookmarkClearResult>;
    /**
     * 获取指定字段在符合条件的文档中的所有唯一值。
     * @param key 目标字段名。
     * @param query 可选的过滤条件。
     * @param options 可选的驱动级选项。
     * @returns 唯一值数组。
     */
    distinct(key: string, query?: unknown, options?: unknown): Promise<unknown[]>;
    /**
     * 执行聚合管道并返回结果数组。
     * @param pipeline 聚合阶段数组。
     * @param options 可选的聚合选项（如 `allowDiskUse`）。
     * @returns 聚合结果文档数组。
     */
    aggregate(pipeline?: unknown[], options?: unknown): Promise<unknown[]>;
    /** 返回匹配查询的可读流。 */
    stream(query?: unknown, options?: unknown): NodeJS.ReadableStream;
    /** 返回 MongoDB 查询执行计划。 */
    explain(query?: unknown, options?: unknown): Promise<unknown>;
    /** 手动失效当前 Model 对应集合的读缓存。 */
    invalidate(op?: 'find' | 'findOne' | 'count' | 'findPage' | 'aggregate' | 'distinct'): Promise<number>;
    /** 删除当前 Model 对应集合。 */
    dropCollection(): Promise<boolean>;
    /** 创建当前或指定名称的集合。 */
    createCollection(name?: string, options?: Record<string, unknown>): Promise<boolean>;
    /** 创建 MongoDB view。 */
    createView(name: string, source: string, pipeline?: unknown[]): Promise<boolean>;
    /** 返回索引使用统计。 */
    indexStats(): Promise<unknown[]>;
    /** 设置集合 JSON Schema validator。 */
    setValidator(validator: unknown, options?: { validationLevel?: string; validationAction?: string }): Promise<{ ok: number; collection: string }>;
    /** 设置集合 validation level。 */
    setValidationLevel(level: 'off' | 'moderate' | 'strict' | string): Promise<{ ok: number; validationLevel: string }>;
    /** 设置集合 validation action。 */
    setValidationAction(action: 'error' | 'warn' | string): Promise<{ ok: number; validationAction: string }>;
    /** 读取集合 validator 与校验设置。 */
    getValidator(): Promise<{ validator: Record<string, unknown> | null; validationLevel: string; validationAction: string }>;
    /** 返回集合存储与索引统计。 */
    stats(options?: { scale?: number }): Promise<{ ns: string; count: number; size: number; storageSize: number; totalIndexSize: number; nindexes: number; avgObjSize?: number; scaleFactor?: number }>;
    /** 重命名当前 Model 对应集合。 */
    renameCollection(newName: string, options?: { dropTarget?: boolean }): Promise<{ renamed: boolean; from: string; to: string }>;
    /** 执行 collMod 管理命令。 */
    collMod(modifications: Record<string, unknown>): Promise<Record<string, unknown>>;
    /** 将集合转换为 capped collection。 */
    convertToCapped(size: number, options?: { max?: number }): Promise<{ ok: number; collection: string; capped: boolean; size: number }>;
    /**
     * 打开集合的 ChangeStream 以监听实时变更事件。
     * @param pipeline 可选的聚合过滤管道。
     * @param options 可选的 ChangeStream 选项。
     * @returns MongoDB 原生 ChangeStream 对象。
     */
    watch(pipeline?: unknown[], options?: unknown): import('mongodb').ChangeStream;
    /**
     * 根据模型 schema 定义验证文档数据的合法性。
     * @param document 要验证的文档对象。
     * @returns 包含 `valid` 标志和错误详情的验证结果对象。
     */
    validate(document?: unknown): ValidationResult;
}

export declare class Model {
    static define<TDocument = Record<string, unknown>>(collectionName: string, definition: ModelDefinition<TDocument>): void;
    static get<TDocument = Record<string, unknown>>(collectionName: string): RegisteredModel<TDocument> | undefined;
    static has(collectionName: string): boolean;
    static list(): string[];
    static undefine(collectionName: string): boolean;
    static redefine<TDocument = Record<string, unknown>>(collectionName: string, definition: ModelDefinition<TDocument>): void;
    static _clear(): void;
}



