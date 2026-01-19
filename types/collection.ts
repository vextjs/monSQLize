/**
 * Collection API 相关类型定义
 * @module types/collection
 */

import type { FindOptions, CountOptions, AggregateOptions, DistinctOptions } from './query';
import type {
    WriteConcern,
    InsertOneSimplifiedOptions,
    InsertOneOptions,
    InsertOneResult,
    InsertManySimplifiedOptions,
    InsertManyOptions,
    InsertManyResult
} from './write';
import type {
    InsertBatchOptions,
    InsertBatchResult,
    UpdateBatchOptions,
    UpdateBatchResult,
    DeleteBatchOptions,
    DeleteBatchResult
} from './batch';
import type {
    FindPageOptions,
    PageResult,
    ResultWithMeta,
    MetaOptions,
    BookmarkKeyDims,
    PrewarmBookmarksResult,
    ListBookmarksResult,
    ClearBookmarksResult
} from './pagination';
import type { StreamOptions, ExplainOptions } from './stream';
import type { FindChain, AggregateChain } from './chain';

/**
 * 健康视图
 */
export interface HealthView {
    status: 'up' | 'down';
    connected: boolean;
    defaults?: any;
    cache?: any;
    driver?: { connected: boolean };
}

/**
 * Collection 访问器接口
 * 提供所有 Collection 操作方法
 */
export interface CollectionAccessor<TSchema = any> {
    /**
     * 获取命名空间信息
     */
    getNamespace(): { iid: string; type: string; db: string; collection: string };

    /**
     * 删除集合
     */
    dropCollection(): Promise<boolean>;

    /**
     * 创建集合
     */
    createCollection(name?: string | null, options?: any): Promise<boolean>;

    /**
     * 创建视图
     */
    createView(viewName: string, source: string, pipeline?: any[]): Promise<boolean>;

    // ============================================================================
    // 查询方法
    // ============================================================================

    /**
     * 查询单个文档
     * 支持 meta 参数和泛型
     */
    findOne<T = TSchema>(query?: any, options?: Omit<FindOptions, 'meta'>): Promise<T | null>;
    findOne<T = TSchema>(query: any, options: FindOptions & { meta: true | MetaOptions }): Promise<ResultWithMeta<T | null>>;
    findOne<T = TSchema>(query?: any, options?: FindOptions): Promise<T | null | ResultWithMeta<T | null>>;

    /**
     * 通过 _id 查询单个文档（便利方法）
     * @param id - 文档的 _id（字符串会自动转换为 ObjectId）
     * @param options - 查询选项
     */
    findOneById(id: string | any, options?: Omit<FindOptions, 'meta'>): Promise<any | null>;

    /**
     * 批量通过 _id 查询多个文档（便利方法）
     * @param ids - _id 数组
     * @param options - 查询选项
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

    /**
     * 查询多个文档
     * 支持 meta 参数和链式调用
     */
    find<T = TSchema>(query?: any): FindChain<T>;
    find<T = TSchema>(query: any, options: FindOptions & { meta: true | MetaOptions }): Promise<ResultWithMeta<T[]>>;
    find<T = TSchema>(query?: any, options?: FindOptions): Promise<T[]> | FindChain<T> | ResultWithMeta<T[]>;

    /**
     * 计数
     * 支持 meta 参数
     */
    count(query?: any, options?: Omit<CountOptions, 'meta'>): Promise<number>;
    count(query: any, options: CountOptions & { meta: true | MetaOptions }): Promise<ResultWithMeta<number>>;
    count(query?: any, options?: CountOptions): Promise<number | ResultWithMeta<number>>;

    /**
     * 聚合查询
     * 支持 meta 参数和链式调用
     */
    aggregate<T = TSchema>(pipeline?: any[]): AggregateChain<T>;
    aggregate<T = TSchema>(pipeline: any[], options: AggregateOptions & { meta: true | MetaOptions }): Promise<ResultWithMeta<T[]>>;
    aggregate<T = TSchema>(pipeline?: any[], options?: AggregateOptions): Promise<T[]> | AggregateChain<T> | ResultWithMeta<T[]>;

    /**
     * 去重查询
     * 支持 meta 参数
     */
    distinct<T = any>(field: string, query?: any, options?: Omit<DistinctOptions, 'meta'>): Promise<T[]>;
    distinct<T = any>(field: string, query: any, options: DistinctOptions & { meta: true | MetaOptions }): Promise<ResultWithMeta<T[]>>;
    distinct<T = any>(field: string, query?: any, options?: DistinctOptions): Promise<T[] | ResultWithMeta<T[]>>;

    /**
     * 流式查询
     * 返回 Node.js 可读流
     */
    stream(query?: any, options?: StreamOptions): NodeJS.ReadableStream;

    /**
     * 查询执行计划诊断
     */
    explain(query?: any, options?: ExplainOptions): Promise<any>;

    // ============================================================================
    // 分页相关
    // ============================================================================

    /**
     * 深度分页
     */
    findPage<T = TSchema>(options: FindPageOptions): Promise<PageResult<T>>;

    /**
     * Bookmark 维护 APIs
     */
    prewarmBookmarks(keyDims: BookmarkKeyDims, pages: number[]): Promise<PrewarmBookmarksResult>;
    listBookmarks(keyDims?: BookmarkKeyDims): Promise<ListBookmarksResult>;
    clearBookmarks(keyDims?: BookmarkKeyDims): Promise<ClearBookmarksResult>;

    // ============================================================================
    // 写入操作
    // ============================================================================

    /**
     * 插入单个文档
     * 支持简化调用和完整配置
     */
    insertOne<T = TSchema>(document: T, options?: InsertOneSimplifiedOptions): Promise<InsertOneResult>;
    insertOne(options: InsertOneOptions): Promise<InsertOneResult>;

    /**
     * 插入多个文档
     * 支持简化调用和完整配置
     */
    insertMany<T = TSchema>(documents: T[], options?: InsertManySimplifiedOptions): Promise<InsertManyResult>;
    insertMany(options: InsertManyOptions): Promise<InsertManyResult>;

    /**
     * Upsert 单个文档（存在则更新，不存在则插入）
     * @param filter - 查询条件
     * @param update - 更新内容
     * @param options - 操作选项
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

    /**
     * 使缓存失效
     */
    invalidate(op?: 'find' | 'findOne' | 'count' | 'findPage' | 'aggregate' | 'distinct'): Promise<number>;

    // ============================================================================
    // 批量操作
    // ============================================================================

    /**
     * 大批量插入（自动分批+重试）
     * @since v1.0.0
     */
    insertBatch<T = TSchema>(documents: T[], options?: InsertBatchOptions): Promise<InsertBatchResult>;

    /**
     * 批量更新文档（流式查询+分批更新）
     * @since v1.0.0
     */
    updateBatch(
        filter: Record<string, any>,
        update: Record<string, any>,
        options?: UpdateBatchOptions
    ): Promise<UpdateBatchResult>;

    /**
     * 批量删除文档（流式查询+分批删除）
     * @since v1.0.0
     */
    deleteBatch(
        filter: Record<string, any>,
        options?: DeleteBatchOptions
    ): Promise<DeleteBatchResult>;

    /**
     * 查询文档并返回总数（便利方法）
     * @since v1.0.0
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
export type Collection<TSchema = any> = CollectionAccessor<TSchema>;

/**
 * 数据库访问器
 */
export type DbAccessor = {
    collection<TSchema = any>(name: string): CollectionAccessor<TSchema>;
    db(dbName: string): { collection<TSchema = any>(name: string): CollectionAccessor<TSchema> };
};

