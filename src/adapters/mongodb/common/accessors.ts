/**
 * MongoDB accessor adapter layer.
 *
 * Description:
 * - Provides CollectionFacade / DbFacade, encapsulating the full API set for query / write / management.
 * - Write operations are delegated to the `writes/**` sub-module; management operations to `management/**`.
 */

import { ChangeStream, Collection, Db, Document } from 'mongodb';
import type { Logger } from '../../../core/logger';
import { createError, ErrorCodes } from '../../../core/errors';
import { normalizeProjection } from '../../../utils/normalize';
import {
    clearBookmarks,
    createIndexDefinition,
    createIndexDefinitions,
    dropIndexDefinition,
    dropIndexDefinitions,
    listBookmarks,
    listIndexDefinitions,
    MongoAdminAccessor,
    prewarmBookmarks,
    type BookmarkCacheLike,
    type BookmarkClearResult,
    type BookmarkKeyDims,
    type BookmarkListResult,
    type BookmarkPrewarmResult,
    type DbStatsView,
    type IndexCreateResult,
    type ServerStatusView,
    type AdminBuildInfoView,
} from '../management';

import {
    countDocuments,
    createAggregateChain,
    createFindChain,
    distinctValues,
    explainDocuments,
    findAndCountDocuments,
    findByIdsDocuments,
    findOneByIdDocument,
    findOneDocument,
    findPageDocuments,
    streamDocuments,
    type FindChain,
    type FindPageOptions,
    type FindPageResult,
    type QueryCacheLike,
    type RuntimeDefaults,
    watchDocuments,
} from '../queries';
import {
    deleteBatchDocuments,
    deleteManyDocuments,
    deleteOneDocument,
    findOneAndReplaceDocument,
    findOneAndDeleteDocument,
    findOneAndUpdateDocument,
    incrementOneDocument,
    insertBatchDocuments,
    insertManyDocuments,
    insertOneDocument,
    replaceOneDocument,
    upsertOneDocument,
    updateBatchDocuments,
    updateManyDocuments,
    updateOneDocument,
    type BatchWriteOptions,
    type DeleteBatchResult,
    type IncrementOneOptions,
    type InsertBatchResult,
    type UpdateBatchOptions,
    type UpdateBatchResult,
} from '../writes';
import { convertObjectIdStrings, convertUpdateDocument } from '../utils/objectid-converter';

/**
 * Low-level MongoDB collection accessor.
 * Provides CRUD, query, and management operations for a single collection.
 * @since v1.0.0
 */
export class MongoCollectionAccessor<TSchema extends Document = Document> {
    constructor(
        private readonly dbName: string,
        private readonly collectionName: string,
        private readonly collectionRef: Collection<TSchema>,
        private readonly management: {
            cache?: BookmarkCacheLike | null;
            queryCache?: QueryCacheLike | null;
            getCache?: () => BookmarkCacheLike | null | undefined;
            getQueryCache?: () => QueryCacheLike | null | undefined;
            logger?: Logger;
            defaults?: RuntimeDefaults;
            cacheAutoInvalidate?: boolean;
        } = {},
        private readonly dbRef?: Db,
    ) {}

    /** Auto-convert filter / query if autoConvertObjectId is enabled. */
    private _cvFilter<T>(val: T): T {
        if (!this.management.defaults?.autoConvertObjectId) return val;
        return convertObjectIdStrings(val as unknown) as T;
    }

    /** Auto-convert plain document (insert/replace) if autoConvertObjectId is enabled. */
    private _cvDoc<T>(val: T): T {
        if (!this.management.defaults?.autoConvertObjectId) return val;
        return convertObjectIdStrings(val as unknown) as T;
    }

    /** Auto-convert update document ($set/$push/…) if autoConvertObjectId is enabled. */
    private _cvUpdate<T>(val: T): T {
        if (!this.management.defaults?.autoConvertObjectId || Array.isArray(val)) return val;
        return convertUpdateDocument(val as unknown) as T;
    }

    private async invalidateReadCaches(operation?: 'find' | 'findOne' | 'count' | 'findPage' | 'all' | string): Promise<number> {
        if (!this.management.queryCache?.delPattern) {
            return 0;
        }

        const namespace = this.collectionRef.namespace;
        const bookmarkNamespace = `${this.dbName}:${this.collectionName}`;
        const legacyNamespacePatterns = [
            `${String(this.management.defaults?.namespace?.instanceId)}:mongodb:${this.dbName}:${this.collectionName}:*`,
        ];
        const patterns = operation === 'find'
            ? [`find:${namespace}:*`]
            : operation === 'findOne'
                ? [`findOne:${namespace}:*`]
                : operation === 'count'
                    ? [`count:${namespace}:*`]
                    : operation === 'findPage'
                        ? [`bookmark:${bookmarkNamespace}:*`]
                        : [
                            `find:${namespace}:*`,
                            `findOne:${namespace}:*`,
                            `count:${namespace}:*`,
                            `bookmark:${bookmarkNamespace}:*`,
                        ];
        patterns.push(...legacyNamespacePatterns);


        let deleted = 0;
        for (const pattern of patterns) {
            const d = Number(await Promise.resolve(this.management.queryCache.delPattern(pattern)));
            deleted += d;
        }
        return deleted;
    }

    /**
     * Returns the collection namespace.
     * @since v1.3.0
     */
    getNamespace(): { iid: string; type: 'mongodb'; db: string; collection: string; } {
        const instanceId = this.management.defaults?.namespace?.instanceId;
        const iid = instanceId
            ? `${instanceId}:${this.dbName}:${this.collectionName}`
            : `${this.dbName}:${this.collectionName}`;
        return {
            iid,
            type: 'mongodb',
            db: this.dbName,
            collection: this.collectionName,
        };
    }

    /**
     * Returns the underlying native MongoDB Collection.
     * @since v1.3.0
     */
    raw(): Collection<TSchema> {
        return this.collectionRef;
    }

    /**
     * Finds a single document matching the query.
     * @since v1.3.0
     */
    async findOne(
        query: Parameters<Collection<TSchema>['findOne']>[0],
        options?: Parameters<Collection<TSchema>['findOne']>[1],
    ): ReturnType<Collection<TSchema>['findOne']> {
        const normalizedQuery = this._cvFilter(query);
        const maxTimeMS = this.management.defaults?.maxTimeMS;
        const rawOptions: Record<string, unknown> = { ...(maxTimeMS !== undefined ? { maxTimeMS } : {}), ...((options ?? {}) as Record<string, unknown>) };
        const projection = normalizeProjection(rawOptions.projection as string[] | Record<string, unknown> | null | undefined);
        const cacheTTL = rawOptions.explain ? 0 : typeof rawOptions.cache === 'number' ? rawOptions.cache : 0;
        const driverOptions: Record<string, unknown> = {};
        if (projection) driverOptions.projection = projection;
        if (rawOptions.maxTimeMS !== undefined) driverOptions.maxTimeMS = rawOptions.maxTimeMS;
        if (rawOptions.comment !== undefined) driverOptions.comment = rawOptions.comment;
        if (rawOptions.sort !== undefined) driverOptions.sort = rawOptions.sort;
        if (rawOptions.hint !== undefined) driverOptions.hint = rawOptions.hint;
        if (rawOptions.collation !== undefined) driverOptions.collation = rawOptions.collation;
        if (rawOptions.explain !== undefined) driverOptions.explain = rawOptions.explain;

        if (cacheTTL > 0 && this.management.queryCache) {
            const { cache: _cache, ...keyOptions } = rawOptions;
            void _cache;
            const cacheKey = `findOne:${this.collectionRef.namespace}:${JSON.stringify(normalizedQuery ?? {})}:${JSON.stringify({ ...keyOptions, projection })}`;
            const cached = this.management.queryCache.get(cacheKey) as TSchema | null | undefined;
            if (cached !== undefined) {
                return Promise.resolve(cached) as ReturnType<Collection<TSchema>['findOne']>;
            }
            const result = await findOneDocument(this.collectionRef, normalizedQuery, driverOptions as Parameters<Collection<TSchema>['findOne']>[1]);
            this.management.queryCache.set(cacheKey, result, cacheTTL);
            return result as ReturnType<Collection<TSchema>['findOne']>;
        }

        return findOneDocument(this.collectionRef, normalizedQuery, driverOptions as Parameters<Collection<TSchema>['findOne']>[1]);
    }

    /**
     * Queries multiple documents (restores v1 FindChain compatible form).
     *
     * When `options.stream === true`, returns a Node.js ReadableStream (v1 compatible).
     * @since v1.3.0
     */
    find(
        query?: Parameters<Collection<TSchema>['find']>[0],
        options?: Parameters<Collection<TSchema>['find']>[1] & { stream?: boolean },
    ): FindChain<TSchema> | NodeJS.ReadableStream {
        if ((options as Record<string, unknown> | undefined)?.stream) {
            return streamDocuments(this.collectionRef, query, options, this.management.defaults);
        }
        return createFindChain(this.collectionRef, query, options, this.management.defaults, this.management.queryCache) as unknown as FindChain<TSchema>;
    }

    /**
     * Finds a single document by its `_id`.
     * @since v1.3.0
     */
    async findOneById(
        id: unknown,
        options?: Parameters<Collection<TSchema>['findOne']>[1],
    ): Promise<TSchema | null> {
        const maxTimeMS = this.management.defaults?.maxTimeMS;
        const merged = maxTimeMS !== undefined ? { maxTimeMS, ...options } : options;
        return findOneByIdDocument(this.collectionRef, id, merged as Parameters<Collection<TSchema>['findOne']>[1]);
    }

    /**
     * Finds multiple documents by a set of `_id` values.
     * @since v1.3.0
     */
    async findByIds(
        ids: unknown[],
        options?: Parameters<Collection<TSchema>['find']>[1],
    ): Promise<TSchema[]> {
        // findByIds returns ALL matching documents; findLimit must NOT apply here.
        const { findLimit: _skip, ...noLimitDefaults } = this.management.defaults ?? {};
        return findByIdsDocuments(this.collectionRef, ids, options, noLimitDefaults);
    }

    /**
     * Returns both matching documents and the total count.
     * @since v1.3.0
     */
    async findAndCount(
        query?: Parameters<Collection<TSchema>['find']>[0],
        options?: Parameters<Collection<TSchema>['find']>[1],
    ) {
        return findAndCountDocuments(
            this.collectionRef,
            query != null ? this._cvFilter(query) as typeof query : query,
            options,
            this.management.defaults,
        );
    }

    /**
     * Returns query results as a streaming cursor.
     * @since v1.3.0
     */
    stream(
        query?: Parameters<Collection<TSchema>['find']>[0],
        options?: Parameters<Collection<TSchema>['find']>[1],
    ): NodeJS.ReadableStream {
        return streamDocuments(this.collectionRef, query, options, this.management.defaults);
    }

    /**
     * Returns the query execution plan.
     * @since v1.3.0
     */
    explain(
        query?: Parameters<Collection<TSchema>['find']>[0],
        options?: Parameters<Collection<TSchema>['find']>[1] & { explain?: boolean | string; },
    ): Promise<unknown> {
        return explainDocuments(this.collectionRef, query, options, this.management.defaults);
    }

    /**
     * Counts the number of documents matching the query.
     * @since v1.3.0
     */
    async count(
        query?: Parameters<Collection<TSchema>['countDocuments']>[0],
        options?: Parameters<Collection<TSchema>['countDocuments']>[1],
    ): ReturnType<Collection<TSchema>['countDocuments']> {
        const normalizedQuery = this._cvFilter(query);
        const maxTimeMS = this.management.defaults?.maxTimeMS;
        const merged: Record<string, unknown> = { ...(maxTimeMS !== undefined ? { maxTimeMS } : {}), ...((options ?? {}) as Record<string, unknown>) };
        const cacheTTL = typeof merged.cache === 'number' ? merged.cache : 0;
        const { cache: _cache, ...keyOptions } = merged;
        void _cache;
        const executeCount = () => countDocuments(this.collectionRef, normalizedQuery ?? {}, keyOptions as any);
        const countQueue = this.management.defaults?.countQueue;
        if (cacheTTL > 0 && this.management.queryCache) {
            const cacheKey = `count:${this.collectionRef.namespace}:${JSON.stringify(normalizedQuery ?? {})}:${JSON.stringify(keyOptions)}`;
            const cached = this.management.queryCache.get(cacheKey);
            if (cached !== undefined) {
                return Promise.resolve(cached as never) as ReturnType<Collection<TSchema>['countDocuments']>;
            }
            const runner = countQueue ? countQueue.execute(executeCount) : executeCount();
            return runner.then((result) => {
                this.management.queryCache?.set(cacheKey, result, cacheTTL);
                return result;
            }) as ReturnType<Collection<TSchema>['countDocuments']>;
        }
        return (countQueue ? countQueue.execute(executeCount) : executeCount()) as unknown as ReturnType<Collection<TSchema>['countDocuments']>;
    }

    /**
     * Runs an aggregation pipeline.
     * @since v1.3.0
     */
    aggregate(
        pipeline: Document[] = [],
        options?: Parameters<Collection<TSchema>['aggregate']>[1],
    ) {
        const normalizedPipeline = this.management.defaults?.autoConvertObjectId
            ? pipeline.map((stage) => convertObjectIdStrings(stage as unknown) as Document)
            : pipeline;
        return createAggregateChain(this.collectionRef, normalizedPipeline, options, this.management.defaults);
    }

    /**
     * Returns distinct values for a field.
     * @since v1.3.0
     */
    async distinct(
        key: string,
        query?: Document,
        options?: Parameters<Collection<TSchema>['distinct']>[2],
    ): ReturnType<Collection<TSchema>['distinct']> {
        return distinctValues(this.collectionRef, key, this._cvFilter(query), options);
    }

    /**
     * Simplified paginated query.
     * @since v1.3.0
     */
    async findPage(options: FindPageOptions<TSchema> = {}): Promise<FindPageResult<TSchema>> {
        const resolvedOptions = options.query
            ? { ...options, query: this._cvFilter(options.query) as typeof options.query }
            : options;
        return findPageDocuments(this.collectionRef, resolvedOptions, this.management.defaults);
    }

    /**
     * Watches for collection change events.
     * @since v1.3.0
     */
    watch(
        pipeline: Document[] = [],
        options?: Parameters<Collection<TSchema>['watch']>[1],
    ): ChangeStream<TSchema> {
        return watchDocuments(this.collectionRef, pipeline, options);
    }

    /**
     * Passthrough for native single-document insert, with v1 validation and cache invalidation.
     * @since v1.3.0
     */
    async insertOne(
        doc: Parameters<Collection<TSchema>['insertOne']>[0],
        options?: Parameters<Collection<TSchema>['insertOne']>[1],
    ): ReturnType<Collection<TSchema>['insertOne']> {
        // v1 compat: document must be a non-null, non-array object
        if (doc === null || doc === undefined || typeof doc !== 'object' || Array.isArray(doc)) {
            throw createError(
                ErrorCodes.DOCUMENT_REQUIRED,
                'document must be an object',
                [{ field: 'document', type: 'object.required', message: 'document is required and must be an object' }],
            );
        }
        let result: Awaited<ReturnType<Collection<TSchema>['insertOne']>>;
        const t0 = Date.now();
        try {
            result = await insertOneDocument(this.collectionRef, this._cvDoc(doc), options as Parameters<Collection<TSchema>['insertOne']>[1]);
        } catch (err: unknown) {
            const mongoErr = err as { code?: number; message?: string };
            if (mongoErr?.code === 11000) {
                // v1 compat: code='DUPLICATE_KEY' (insertOne.test expects err.code==='DUPLICATE_KEY')
                // message must include both '唯一性约束' (insertOne.test) and 'duplicate key' (indexes.test)
                throw createError(
                    ErrorCodes.DUPLICATE_KEY,
                    `文档插入失败：违反唯一性约束 (duplicate key)`,
                    [{ field: '_id', message: mongoErr.message ?? 'duplicate key' }],
                    err as Error,
                );
            }
            throw createError(
                ErrorCodes.WRITE_ERROR,
                `insertOne failed: ${mongoErr?.message ?? String(err)}`,
                undefined,
                err as Error,
            );
        }
        // v1 compat: slow query log
        const elapsed = Date.now() - t0;
        const threshold = this.management.defaults?.slowQueryMs ?? 500;
        if (elapsed > threshold && this.management.logger) {
            try {
                this.management.logger.warn('[insertOne] 慢操作警告', {
                    ns: `${this.dbName}.${this.collectionName}`,
                    threshold,
                    duration: elapsed,
                    insertedId: result.insertedId,
                    comment: (options as Record<string, unknown>)?.comment,
                    op: 'insertOne',
                    ts: new Date().toISOString(),
                });
            } catch (_) { /* ignore logging errors */ }
        }
        // Invalidate all read caches after a successful write to prevent stale data in find/findOne/count/bookmark.
        await this.invalidateReadCaches('all');
        return result;
    }

    /**
     * Passthrough for native bulk insert.
     * @since v1.3.0
     */
    async insertMany(...args: Parameters<Collection<TSchema>['insertMany']>): ReturnType<Collection<TSchema>['insertMany']> {
        const [documents, options] = args;
        if (!Array.isArray(documents)) {
            throw createError('DOCUMENTS_REQUIRED', 'documents 必须是数组类型');
        }
        if (documents.length === 0) {
            throw createError('DOCUMENTS_REQUIRED', 'documents 数组不能为空');
        }
        if (documents.some((item) => item === null || typeof item !== 'object' || Array.isArray(item))) {
            throw createError('DOCUMENTS_REQUIRED', 'documents 中的所有元素必须是对象类型');
        }

        const t0 = Date.now();
        let result: Awaited<ReturnType<Collection<TSchema>['insertMany']>>;
        try {
            const convertedDocs = documents.map((d) => this._cvDoc(d)) as typeof documents;
            result = await insertManyDocuments(this.collectionRef, ...[convertedDocs, options] as Parameters<Collection<TSchema>['insertMany']>);
        } catch (err: unknown) {
            const mongoErr = err as { code?: number; message?: string; };
            if (mongoErr?.code === 11000) {
                // v1 compat: message must include '唯一性约束' (insertMany.test) and 'duplicate key' (indexes.test)
                throw createError(
                    ErrorCodes.DUPLICATE_KEY,
                    `批量插入失败：违反唯一性约束 (duplicate key)`,
                    [{ field: '_id', message: mongoErr.message ?? 'duplicate key' }],
                    err as Error,
                );
            }
            throw err;
        }

        const elapsed = Date.now() - t0;
        const threshold = this.management.defaults?.slowQueryMs ?? 500;
        if (elapsed >= threshold && this.management.logger) {
            this.management.logger.warn('[insertMany] 慢操作警告', {
                ns: `${this.dbName}.${this.collectionName}`,
                threshold,
                duration: elapsed,
                documentCount: documents.length,
                insertedCount: result.insertedCount,
                ordered: (options as Record<string, unknown> | undefined)?.ordered ?? true,
                comment: (options as Record<string, unknown> | undefined)?.comment,
                op: 'insertMany',
            });
        }

        await this.invalidateReadCaches('all');
        return result as unknown as ReturnType<Collection<TSchema>['insertMany']>;
    }

    /**
     * Passthrough for native single-document update, with v1 validation and cache invalidation.
     * @since v1.3.0
     */
    async updateOne(
        filter: Parameters<Collection<TSchema>['updateOne']>[0],
        update: Parameters<Collection<TSchema>['updateOne']>[1],
        options?: Parameters<Collection<TSchema>['updateOne']>[2],
    ): ReturnType<Collection<TSchema>['updateOne']> {
        // v1 compat: filter must be a non-null, non-array object
        if (filter === null || filter === undefined || typeof filter !== 'object' || Array.isArray(filter)) {
            throw createError(
                ErrorCodes.INVALID_ARGUMENT,
                'filter 必须是对象类型',
                [{ field: 'filter', type: 'object.required', message: 'filter 是必需参数且必须是对象' }],
            );
        }
        // v1 compat: update must be a non-null object or array (pipeline)
        if (update === null || update === undefined) {
            throw createError(
                ErrorCodes.INVALID_ARGUMENT,
                'update 必须是对象（更新操作符）或数组（聚合管道）',
                [{ field: 'update', type: 'object|array.required', message: 'update 必须是更新操作符对象或聚合管道数组' }],
            );
        }
        if (Array.isArray(update)) {
            // pipeline path: must not be empty
            if ((update as unknown[]).length === 0) {
                throw createError(
                    ErrorCodes.INVALID_ARGUMENT,
                    'update 聚合管道不能为空数组',
                    [{ field: 'update', type: 'array.empty', message: 'aggregation pipeline must contain at least one stage' }],
                );
            }
            // v1 compat: validate each pipeline stage
            for (let i = 0; i < (update as unknown[]).length; i++) {
                const stage = (update as unknown[])[i];
                // 3.1 Each stage must be a non-null, non-array object
                if (stage === null || typeof stage !== 'object' || Array.isArray(stage)) {
                    throw createError(
                        ErrorCodes.INVALID_ARGUMENT,
                        `update 聚合管道第 ${i + 1} 阶段必须是对象`,
                        [{ field: `update[${i}]`, type: 'object.required', message: 'pipeline stage must be an object' }],
                    );
                }
                // 3.2 stage must not be an empty object
                const stageKeys = Object.keys(stage as object);
                if (stageKeys.length === 0) {
                    throw createError(
                        ErrorCodes.INVALID_ARGUMENT,
                        `update 聚合管道第 ${i + 1} 阶段不能为空对象`,
                        [{ field: `update[${i}]`, type: 'object.empty', message: 'pipeline stage must not be empty' }],
                    );
                }
                // 3.3 stage key must start with $
                const stageOperator = stageKeys[0];
                if (!stageOperator.startsWith('$')) {
                    throw createError(
                        ErrorCodes.INVALID_ARGUMENT,
                        `update pipeline stage ${i + 1} operator must start with $, got "${stageOperator}"`,
                        [{ field: `update[${i}]`, type: 'object.invalidKeys', message: 'pipeline operator must start with $' }],
                    );
                }
            }
        } else if (typeof update === 'object') {
            const keys = Object.keys(update as object);
            if (keys.length === 0) {
                throw createError(
                    ErrorCodes.INVALID_ARGUMENT,
                    'update 不能为空对象',
                    [{ field: 'update', type: 'object.empty', message: 'update must not be empty' }],
                );
            }
            const hasOperator = keys.some((k) => k.startsWith('$'));
            if (!hasOperator) {
                throw createError(
                    ErrorCodes.INVALID_ARGUMENT,
                    'update 必须使用更新操作符（如 $set, $inc 等）',
                    [{ field: 'update', type: 'object.invalidKeys', message: '请使用 $set, $inc, $push 等更新操作符' }],
                );
            }
        }
        // v1 compat: unconditionally convert ObjectId string fields in the traditional operator path
        const normalizedFilter = this._cvFilter(filter);
        const finalUpdate = Array.isArray(update)
            ? update
            : (convertUpdateDocument(update) as typeof update);
        const result = await updateOneDocument(this.collectionRef, normalizedFilter, finalUpdate, options);
        // Invalidate all read caches uniformly.
        // Do not rely on cacheAutoInvalidate or clear only find:* — otherwise findOne/count/bookmark
        // and aggregation pipeline / transaction write scenarios will retain stale cached data.
        if (result.modifiedCount > 0 || result.upsertedId) {
            await this.invalidateReadCaches('all');
        }
        return result;
    }

    /**
     * Passthrough for native bulk update.
     * @since v1.3.0
     */
    async updateMany(...args: Parameters<Collection<TSchema>['updateMany']>): ReturnType<Collection<TSchema>['updateMany']> {
        const [filter, update, options] = args;
        if (filter === null || filter === undefined || typeof filter !== 'object' || Array.isArray(filter)) {
            throw createError(ErrorCodes.INVALID_ARGUMENT, 'filter 必须是非空对象');
        }
        if (update === null || update === undefined || typeof update !== 'object') {
            throw createError(ErrorCodes.INVALID_ARGUMENT, 'update 必须是对象（更新操作符）或数组（聚合管道）');
        }
        if (!Array.isArray(update)) {
            const keys = Object.keys(update as Record<string, unknown>);
            if (keys.length === 0 || !keys.some((key) => key.startsWith('$'))) {
                throw createError(ErrorCodes.INVALID_ARGUMENT, 'update 必须使用更新操作符（如 $set, $inc 等）');
            }
        }
        const result = await updateManyDocuments(this.collectionRef, this._cvFilter(filter), this._cvUpdate(update), options);
        if (result.modifiedCount > 0 || result.upsertedId) {
            await this.invalidateReadCaches('all');
        }
        return result as unknown as ReturnType<Collection<TSchema>['updateMany']>;
    }

    /**
     * Passthrough for native single-document replace.
     * @since v1.3.0
     */
    async replaceOne(...args: Parameters<Collection<TSchema>['replaceOne']>): ReturnType<Collection<TSchema>['replaceOne']> {
        const [filter, replacement, options] = args;
        if (filter === null || filter === undefined || typeof filter !== 'object' || Array.isArray(filter)) {
            throw createError(ErrorCodes.INVALID_ARGUMENT, 'filter 必须是非空对象');
        }
        if (replacement === null || replacement === undefined || typeof replacement !== 'object' || Array.isArray(replacement)) {
            throw createError(ErrorCodes.INVALID_ARGUMENT, 'replacement 必须是对象类型');
        }
        if (Object.keys(replacement as Record<string, unknown>).some((key) => key.startsWith('$'))) {
            throw createError(ErrorCodes.INVALID_ARGUMENT, 'replacement 不能包含更新操作符（如 $set, $inc 等）');
        }
        const result = await replaceOneDocument(this.collectionRef, this._cvFilter(filter), this._cvDoc(replacement), options);
        await this.invalidateReadCaches('all');
        return result as unknown as ReturnType<Collection<TSchema>['replaceOne']>;
    }

    /**
     * Atomically finds and replaces a single document.
     * @since v1.3.0
     */
    async findOneAndReplace(
        filter: Parameters<Collection<TSchema>['findOneAndReplace']>[0],
        replacement: Parameters<Collection<TSchema>['findOneAndReplace']>[1],
        options?: unknown,
    ): ReturnType<Collection<TSchema>['findOneAndReplace']> {
        if (filter === null || filter === undefined || typeof filter !== 'object' || Array.isArray(filter)) {
            throw createError(ErrorCodes.INVALID_ARGUMENT, 'filter 必须是非空对象');
        }
        if (replacement === null || replacement === undefined || typeof replacement !== 'object' || Array.isArray(replacement)) {
            throw createError(ErrorCodes.INVALID_ARGUMENT, 'replacement 必须是对象类型');
        }
        if (Object.keys(replacement as Record<string, unknown>).some((key) => key.startsWith('$'))) {
            throw createError(ErrorCodes.INVALID_ARGUMENT, 'replacement 不能包含更新操作符（如 $set, $inc 等）');
        }
        const result = await findOneAndReplaceDocument(this.collectionRef, this._cvFilter(filter), this._cvDoc(replacement), options);
        if (result) {
            await this.invalidateReadCaches('all');
        }
        return result as unknown as ReturnType<Collection<TSchema>['findOneAndReplace']>;
    }

    /**
     * Atomically finds and updates a single document.
     * @since v1.3.0
     */
    async findOneAndUpdate(
        filter: Parameters<Collection<TSchema>['findOneAndUpdate']>[0],
        update: Parameters<Collection<TSchema>['findOneAndUpdate']>[1],
        options?: unknown,
    ): ReturnType<Collection<TSchema>['findOneAndUpdate']> {
        if (filter === null || filter === undefined || typeof filter !== 'object' || Array.isArray(filter)) {
            throw createError(ErrorCodes.INVALID_ARGUMENT, 'filter 必须是非空对象');
        }
        if (update === null || update === undefined || typeof update !== 'object') {
            throw createError(ErrorCodes.INVALID_ARGUMENT, 'update 必须是对象（更新操作符）或数组（聚合管道）');
        }
        if (!Array.isArray(update)) {
            const keys = Object.keys(update as Record<string, unknown>);
            if (keys.length === 0 || !keys.some((key) => key.startsWith('$'))) {
                throw createError(ErrorCodes.INVALID_ARGUMENT, 'update 必须使用更新操作符（如 $set, $inc 等）');
            }
        }
        const result = await findOneAndUpdateDocument(this.collectionRef, this._cvFilter(filter), this._cvUpdate(update), options);
        if (result) {
            await this.invalidateReadCaches('all');
        }
        return result as unknown as ReturnType<Collection<TSchema>['findOneAndUpdate']>;
    }

    /**
     * Atomically finds and deletes a single document.
     * @since v1.3.0
     */
    async findOneAndDelete(
        filter: Parameters<Collection<TSchema>['findOneAndDelete']>[0],
        options?: unknown,
    ): ReturnType<Collection<TSchema>['findOneAndDelete']> {
        if (filter === null || filter === undefined || typeof filter !== 'object' || Array.isArray(filter)) {
            throw createError(ErrorCodes.INVALID_ARGUMENT, 'filter 必须是非空对象');
        }
        const result = await findOneAndDeleteDocument(this.collectionRef, this._cvFilter(filter), options);
        if (result) {
            await this.invalidateReadCaches('all');
        }
        return result as unknown as ReturnType<Collection<TSchema>['findOneAndDelete']>;
    }

    /**
     * Convenience upsert wrapper.
     * @since v1.3.0
     */
    async upsertOne(
        filter: Parameters<Collection<TSchema>['updateOne']>[0],
        update: Parameters<Collection<TSchema>['updateOne']>[1],
        options?: Parameters<Collection<TSchema>['updateOne']>[2],
    ): ReturnType<Collection<TSchema>['updateOne']> {
        if (filter === null || filter === undefined || typeof filter !== 'object' || Array.isArray(filter)) {
            throw createError(ErrorCodes.INVALID_ARGUMENT, 'filter 必须是非空对象');
        }
        if (update === null || update === undefined || typeof update !== 'object' || Array.isArray(update)) {
            throw createError(ErrorCodes.INVALID_ARGUMENT, 'update 必须是非空对象');
        }
        const updateDoc = Object.keys(update as Record<string, unknown>).some((key) => key.startsWith('$'))
            ? update
            : { $set: update as Record<string, unknown> };
        const result = await upsertOneDocument(this.collectionRef, this._cvFilter(filter), this._cvUpdate(updateDoc) as Parameters<Collection<TSchema>['updateOne']>[1], options);
        await this.invalidateReadCaches('all');
        const normalizedResult = result.upsertedId === null
            ? { ...result, upsertedId: undefined }
            : result;
        return normalizedResult as unknown as ReturnType<Collection<TSchema>['updateOne']>;
    }

    /**
     * Passthrough for native single-document delete, with v1 validation and cache invalidation.
     * @since v1.3.0
     */
    async deleteOne(
        filter: Parameters<Collection<TSchema>['deleteOne']>[0],
        options?: Parameters<Collection<TSchema>['deleteOne']>[1],
    ): ReturnType<Collection<TSchema>['deleteOne']> {
        // v1 compat: filter must be a non-null, non-array object
        if (filter === null || filter === undefined || typeof filter !== 'object' || Array.isArray(filter)) {
            throw createError(
                ErrorCodes.INVALID_ARGUMENT,
                'filter 必须是对象类型',
                [{ field: 'filter', type: 'object.required', message: 'filter 是必需参数且必须是对象' }],
            );
        }
        const result = await deleteOneDocument(this.collectionRef, this._cvFilter(filter), options as Parameters<Collection<TSchema>['deleteOne']>[1]);
        // Invalidate all read caches after a successful delete to prevent stale hits across query shapes.
        if (result.deletedCount > 0) {
            await this.invalidateReadCaches('all');
        }
        return result;
    }

    /**
     * Passthrough for native bulk delete.
     * @since v1.3.0
     */
    async deleteMany(...args: Parameters<Collection<TSchema>['deleteMany']>): ReturnType<Collection<TSchema>['deleteMany']> {
        const [filter, options] = args;
        if (filter === null || filter === undefined || typeof filter !== 'object' || Array.isArray(filter)) {
            throw createError(ErrorCodes.INVALID_ARGUMENT, 'filter 必须是非空对象');
        }
        const result = await deleteManyDocuments(this.collectionRef, this._cvFilter(filter), options);
        if (result.deletedCount > 0) {
            await this.invalidateReadCaches('all');
        }
        return result as unknown as ReturnType<Collection<TSchema>['deleteMany']>;
    }

    /**
     * Bulk-inserts documents in batches.
     * @since v1.3.0
     */
    async insertBatch(documents: TSchema[], options?: BatchWriteOptions & Parameters<Collection<TSchema>['insertMany']>[1]): Promise<InsertBatchResult> {
        if (!Array.isArray(documents)) {
            throw createError(ErrorCodes.INVALID_ARGUMENT, 'documents 必须是数组类型');
        }
        const result = await insertBatchDocuments(this.collectionRef, documents.map((d) => this._cvDoc(d)), options);
        await this.invalidateReadCaches('all');
        return result;
    }

    /**
     * Bulk-updates matching documents in batches.
     * @since v1.3.0
     */
    async updateBatch(
        filter: Parameters<Collection<TSchema>['find']>[0],
        update: Parameters<Collection<TSchema>['updateMany']>[1],
        options?: UpdateBatchOptions & Parameters<Collection<TSchema>['updateMany']>[2],
    ): Promise<UpdateBatchResult> {
        const result = await updateBatchDocuments(this.collectionRef, this._cvFilter(filter), this._cvUpdate(update), options);
        if (result.modifiedCount > 0) {
            await this.invalidateReadCaches('all');
        }
        return result;
    }

    /**
     * Bulk-deletes matching documents in batches.
     * @since v1.3.0
     */
    async deleteBatch(
        filter: Parameters<Collection<TSchema>['find']>[0],
        options?: UpdateBatchOptions & Parameters<Collection<TSchema>['deleteMany']>[1],
    ): Promise<DeleteBatchResult> {
        const result = await deleteBatchDocuments(this.collectionRef, this._cvFilter(filter), options);
        if (result.deletedCount > 0) {
            await this.invalidateReadCaches('all');
        }
        return result;
    }

    /**
     * Convenience field increment / decrement.
     * @since v1.3.0
     */
    async incrementOne(
        filter: Parameters<Collection<TSchema>['findOneAndUpdate']>[0],
        field: string | Record<string, number>,
        incrementOrOptions?: number | IncrementOneOptions,
        maybeOptions?: IncrementOneOptions,
    ): Promise<import('../writes/index.js').IncrementOneResult<TSchema>> {
        const result = await incrementOneDocument(this.collectionRef, this._cvFilter(filter), field, incrementOrOptions, maybeOptions);
        if (result.modifiedCount > 0) {
            await this.invalidateReadCaches('all');
        }
        return result;
    }

    /**
     * Creates a single index.
     * @since v1.3.0
     */
    async createIndex(
        keys: Document,
        options?: Parameters<Collection<TSchema>['createIndex']>[1],
    ): Promise<IndexCreateResult> {
        return createIndexDefinition(this.collectionRef, keys, options);
    }

    /**
     * Creates multiple indexes in bulk.
     * @since v1.3.0
     */
    async createIndexes(specs: Array<{ key: Document; } & Record<string, unknown>>): Promise<string[]> {
        return createIndexDefinitions(this.collectionRef, specs);
    }

    /**
     * Lists all indexes on the collection.
     * @since v1.3.0
     */
    async listIndexes(): Promise<Record<string, unknown>[]> {
        return listIndexDefinitions(this.collectionRef);
    }

    /**
     * Drops a specific index.
     * @since v1.3.0
     */
    async dropIndex(name: string): ReturnType<Collection<TSchema>['dropIndex']> {
        return dropIndexDefinition(this.collectionRef, name);
    }

    /**
     * Drops all non-`_id_` indexes.
     * @since v1.3.0
     */
    async dropIndexes(): ReturnType<Collection<TSchema>['dropIndexes']> {
        return dropIndexDefinitions(this.collectionRef);
    }

    /**
     * Pre-warms the findPage bookmark cache.
     * @since v1.3.0
     */
    async prewarmBookmarks(
        keyDims: BookmarkKeyDims<TSchema> = {},
        pages: number[] = [],
    ): Promise<BookmarkPrewarmResult> {
        return prewarmBookmarks({
            namespace: `${this.dbName}:${this.collectionName}`,
            cache: this.management.getCache ? this.management.getCache() : this.management.cache,
            logger: this.management.logger,
            keyDims,
            pages,
            findPage: (options) => this.findPage(options),
        });
    }

    /**
     * Lists the findPage bookmark cache entries.
     * @since v1.3.0
     */
    async listBookmarks(keyDims?: BookmarkKeyDims<TSchema>): Promise<BookmarkListResult> {
        return listBookmarks({
            namespace: `${this.dbName}:${this.collectionName}`,
            cache: this.management.getCache ? this.management.getCache() : this.management.cache,
            keyDims,
        });
    }

    /**
     * Clears the findPage bookmark cache.
     * @since v1.3.0
     */
    async clearBookmarks(keyDims?: BookmarkKeyDims<TSchema>): Promise<BookmarkClearResult> {
        return clearBookmarks({
            namespace: `${this.dbName}:${this.collectionName}`,
            cache: this.management.getCache ? this.management.getCache() : this.management.cache,
            keyDims,
        });
    }

    /**
     * Invalidates the cache (v1 compatible).
     * The TS version only maintains the findPage cursor cache; there is no full query cache.
     * - If `op` is `'findPage'` or unspecified, the bookmark cache is cleared.
     * - Other `op` values (`find`/`findOne`/`count`) are no-ops in the TS version and return 0.
     * @since v1.3.0
     */
    async invalidate(op?: 'find' | 'findOne' | 'count' | 'findPage' | 'all' | string): Promise<number> {
        return this.invalidateReadCaches(op);
    }

    /**
     * Drops the collection (v1 compatible).
     * @since v1.3.0
     */
    async dropCollection(): Promise<boolean> {
        return this.collectionRef.drop();
    }

    /**
     * Creates a collection (v1 compatible).
     * @param name - Collection name; defaults to the currently bound collection name when omitted.
     * @param options - MongoDB createCollection options.
     * @since v1.3.0
     */
    async createCollection(name?: string, options: Record<string, unknown> = {}): Promise<boolean> {
        const db = this.dbRef ?? this.collectionRef.db;
        const collName = name ?? this.collectionName;
        await db.createCollection(collName, options as Parameters<Db['createCollection']>[1]);
        return true;
    }

    /**
     * Creates a view collection (v1 compatible).
     * @param name - View name.
     * @param source - Source collection name.
     * @param pipeline - Aggregation pipeline.
     * @since v1.3.0
     */
    async createView(name: string, source: string, pipeline: unknown[] = []): Promise<boolean> {
        const db = this.dbRef ?? this.collectionRef.db;
        await db.createCollection(name, { viewOn: source, pipeline } as Parameters<Db['createCollection']>[1]);
        return true;
    }

    /**
     * Returns index statistics (v1 compatible).
     * @since v1.3.0
     */
    async indexStats(): Promise<unknown[]> {
        const cursor = this.collectionRef.aggregate([{ $indexStats: {} }]);
        return cursor.toArray();
    }

    /**
     * Sets the collection validation rules (v1 compatible).
     * @param validator - Validator object ($jsonSchema or query expression).
     * @param options - Optional validation level and action configuration.
     * @since v1.3.0
     */
    async setValidator(
        validator: unknown,
        options: { validationLevel?: string; validationAction?: string } = {},
    ): Promise<{ ok: number; collection: string }> {
        if (validator === null || typeof validator !== 'object') {
            throw new Error('Validator must be a non-null object');
        }
        const db = this.dbRef ?? this.collectionRef.db;
        const isEmptyValidator = Object.keys(validator as Record<string, unknown>).length === 0;
        const cmd: Record<string, unknown> = {
            collMod: this.collectionName,
            validator: validator as Record<string, unknown>,
        };
        if (options.validationLevel) {
            cmd['validationLevel'] = options.validationLevel;
        } else if (isEmptyValidator) {
            // When clearing the validator (empty obj), restore defaults so getValidator() is consistent
            cmd['validationLevel'] = 'strict';
            cmd['validationAction'] = 'error';
        }
        if (options.validationAction) cmd['validationAction'] = options.validationAction;
        const result = await db.command(cmd);
        return { ok: result['ok'] as number, collection: this.collectionName };
    }

    /**
     * Sets the collection validation level (v1 compatible).
     * @param level - Validation level: `'off'` | `'strict'` | `'moderate'`.
     * @since v1.3.0
     */
    async setValidationLevel(level: unknown): Promise<{ ok: number; validationLevel: string }> {
        if (typeof level !== 'string' || !['off', 'strict', 'moderate'].includes(level)) {
            throw new Error('Invalid validation level: must be "off", "strict", or "moderate"');
        }
        const db = this.dbRef ?? this.collectionRef.db;
        const result = await db.command({ collMod: this.collectionName, validationLevel: level });
        return { ok: result['ok'] as number, validationLevel: level };
    }

    /**
     * Sets the collection validation action (v1 compatible).
     * @param action - Validation action: `'error'` | `'warn'`.
     * @since v1.3.0
     */
    async setValidationAction(action: unknown): Promise<{ ok: number; validationAction: string }> {
        if (typeof action !== 'string' || !['error', 'warn'].includes(action)) {
            throw new Error('Invalid validation action: must be "error" or "warn"');
        }
        const db = this.dbRef ?? this.collectionRef.db;
        const result = await db.command({ collMod: this.collectionName, validationAction: action });
        return { ok: result['ok'] as number, validationAction: action };
    }

    /**
     * Returns the collection validation configuration (v1 compatible).
     * @returns The validator, validation level, and validation action.
     * @since v1.3.0
     */
    async getValidator(): Promise<{
        validator: Record<string, unknown> | null;
        validationLevel: string;
        validationAction: string;
    }> {
        const db = this.dbRef ?? this.collectionRef.db;
        const cursor = db.listCollections({ name: this.collectionName });
        const collections = await cursor.toArray();
        const info = collections[0] as { options?: Record<string, unknown> } | undefined;
        return {
            validator: (info?.options?.['validator'] as Record<string, unknown> | undefined) ?? null,
            validationLevel: (info?.options?.['validationLevel'] as string | undefined) ?? 'strict',
            validationAction: (info?.options?.['validationAction'] as string | undefined) ?? 'error',
        };
    }

    /**
     * Returns collection statistics (v1 compatible; uses $collStats aggregation).
     * The collStats command was removed in MongoDB 7.x and must be replaced with an aggregation pipeline.
     * @param options - Optional scale factor (bytes/1 = default).
     * @since v1.3.0
     */
    async stats(options: { scale?: number } = {}): Promise<{
        ns: string;
        count: number;
        size: number;
        storageSize: number;
        totalIndexSize: number;
        nindexes: number;
        avgObjSize?: number;
        scaleFactor?: number;
    }> {
        const scale = options.scale ?? 1;
        const pipeline = [{ $collStats: { storageStats: { scale }, count: {} } }];
        const cursor = this.collectionRef.aggregate<Record<string, unknown>>(pipeline);
        const results = await cursor.toArray();
        const raw = results[0] ?? {};
        const storage = (raw['storageStats'] as Record<string, unknown>) ?? {};
        return {
            ns: (raw['ns'] as string) ?? `${this.dbName}.${this.collectionName}`,
            count: (storage['count'] as number) ?? 0,
            size: (storage['size'] as number) ?? 0,
            storageSize: (storage['storageSize'] as number) ?? 0,
            totalIndexSize: (storage['totalIndexSize'] as number) ?? 0,
            nindexes: (storage['nindexes'] as number) ?? 0,
            avgObjSize: storage['avgObjSize'] as number | undefined,
            scaleFactor: (storage['scaleFactor'] as number) ?? scale,
        };
    }

    /**
     * Renames the collection (v1-compat).
     * @param newName - New collection name.
     * @param options - Optional options (dropTarget: whether to overwrite an existing collection with the new name).
     * @since v1.3.0
     */
    async renameCollection(
        newName: unknown,
        options: { dropTarget?: boolean } = {},
    ): Promise<{ renamed: boolean; from: string; to: string }> {
        if (!newName || typeof newName !== 'string') {
            throw new Error('New collection name is required and must be a non-empty string');
        }
        await (this.collectionRef as unknown as Collection<Document>).rename(newName, {
            dropTarget: options.dropTarget ?? false,
        });
        return { renamed: true, from: this.collectionName, to: newName };
    }

    /**
     * Modifies collection properties (v1-compat).
     * @param modifications - Object containing the collection property modifications.
     * @since v1.3.0
     */
    async collMod(modifications: unknown): Promise<Record<string, unknown>> {
        if (modifications === null || typeof modifications !== 'object') {
            throw new Error('Modifications must be a non-null object');
        }
        const db = this.dbRef ?? this.collectionRef.db;
        const result = await db.command({
            collMod: this.collectionName,
            ...(modifications as Record<string, unknown>),
        });
        return result as Record<string, unknown>;
    }

    /**
     * Converts the collection to a fixed-size capped collection (v1-compat).
     * @param size - Maximum byte size of the collection (must be a positive integer).
     * @param options - Optional options (max: maximum document count).
     * @since v1.3.0
     */
    async convertToCapped(
        size: unknown,
        options: { max?: number } = {},
    ): Promise<{ ok: number; collection: string; capped: boolean; size: number }> {
        if (typeof size !== 'number') {
            throw new Error('Size must be a number');
        }
        if (size <= 0) {
            throw new Error('Size must be a positive number');
        }
        const db = this.dbRef ?? this.collectionRef.db;
        const cmd: Record<string, unknown> = { convertToCapped: this.collectionName, size };
        if (options.max !== undefined) cmd['max'] = options.max;
        const result = await db.command(cmd);
        return {
            ok: result['ok'] as number,
            collection: this.collectionName,
            capped: true,
            size: size as number,
        };
    }
}

/**
 * High-level MongoDB database accessor.
 * Wraps a `Db` reference and delegates to per-collection accessors.
 * @since v1.0.0
 */
export class MongoDbAccessor {
    constructor(
        private readonly dbName: string,
        private readonly dbRef: Db,
        private readonly management: {
            cache?: BookmarkCacheLike | null;
            queryCache?: QueryCacheLike | null;
            getCache?: () => BookmarkCacheLike | null | undefined;
            getQueryCache?: () => QueryCacheLike | null | undefined;
            logger?: Logger;
            defaults?: RuntimeDefaults;
            cacheAutoInvalidate?: boolean;
        } = {},
    ) {}

    /**
     * Returns the collection accessor.
     * @since v1.3.0
     */
    collection<TSchema extends Document = Document>(name: string): MongoCollectionAccessor<TSchema> {
        return new MongoCollectionAccessor<TSchema>(
            this.dbName,
            name,
            this.dbRef.collection<TSchema>(name),
            this.management,
            this.dbRef,
        );
    }

    /**
     * Returns the native MongoDB Db instance.
     * @since v1.3.0
     */
    raw(): Db {
        return this.dbRef;
    }

    /**
     * Returns the database-level admin façade.
     * @since v1.3.0
     */
    admin(): {
        ping: () => Promise<boolean>;
        buildInfo: () => Promise<AdminBuildInfoView>;
        serverStatus: (options?: { scale?: number; }) => Promise<ServerStatusView>;
        stats: (options?: { scale?: number; }) => Promise<DbStatsView>;
    } {
        const admin = new MongoAdminAccessor(this.dbRef, this.management.logger);
        return {
            ping: () => admin.ping(),
            buildInfo: () => admin.buildInfo(),
            serverStatus: (options) => admin.serverStatus(options),
            stats: (options) => admin.stats(options),
        };
    }

    /**
     * Lists all databases (v1-compat).
     * @since v1.3.0
     */
    async listDatabases(options: { nameOnly?: boolean } = {}): Promise<Array<{ name: string; sizeOnDisk: number; empty: boolean }> | string[]> {
        const admin = this.dbRef.admin();
        const result = await admin.listDatabases();
        if (options.nameOnly) {
            return result.databases.map((db: { name: string }) => db.name);
        }
        return result.databases.map((db: { name: string; sizeOnDisk?: number; empty?: boolean }) => ({
            name: db.name,
            sizeOnDisk: db.sizeOnDisk ?? 0,
            empty: db.empty ?? false,
        }));
    }

    /**
     * Drops the current database (v1-compat; requires confirm: true).
     * @since v1.3.0
     */
    async dropDatabase(options: { confirm: boolean; allowProduction?: boolean; user?: string } = { confirm: false }): Promise<{ dropped: boolean; database: string; timestamp: Date }> {
        if (!options.confirm) {
            const err = new Error(
                'dropDatabase requires explicit confirmation. Pass { confirm: true } to proceed.\n\n' +
                '⚠️  WARNING: This will DELETE ALL DATA in the database!\n' +
                '⚠️  This operation CANNOT BE UNDONE!',
            ) as Error & { code: string };
            err.code = 'CONFIRMATION_REQUIRED';
            throw err;
        }
        const isProduction = process.env['NODE_ENV'] === 'production';
        if (isProduction && !options.allowProduction) {
            const err = new Error('dropDatabase is blocked in production. Pass { allowProduction: true } to override.') as Error & { code: string };
            err.code = 'PRODUCTION_BLOCKED';
            throw err;
        }
        this.management.logger?.warn?.('[dropDatabase]', { database: this.dbName, user: options.user ?? 'unknown' });
        await this.dbRef.dropDatabase();
        return { dropped: true, database: this.dbName, timestamp: new Date() };
    }

    /**
     * Lists all collections in the current database (v1-compat).
     * @since v1.3.0
     */
    async listCollections(filter: Record<string, unknown> = {}, options: Record<string, unknown> = {}): Promise<Array<{ name: string; type: string }>> {
        const cursor = this.dbRef.listCollections(filter, options as Parameters<Db['listCollections']>[1]);
        return cursor.toArray() as Promise<Array<{ name: string; type: string }>>;
    }

    /**
     * Executes a raw database command (v1-compat).
     * @since v1.3.0
     */
    async runCommand(command: Record<string, unknown>, options: Record<string, unknown> = {}): Promise<Record<string, unknown>> {
        return this.dbRef.command(command, options as Parameters<Db['command']>[1]) as Promise<Record<string, unknown>>;
    }
}



