/**
 * MongoDB accessor adapter layer.
 *
 * Notes:
 * - Wires runtime defaults, cache, and context into the concrete implementations.
 * - query / write / management logic remains in their respective sub-modules;
 *   this layer only delegates and provides a thin façade.
 * - Complex logic should continue to be pushed down into the query/write/management
 *   modules rather than accumulating here.
 */

import { ChangeStream, Collection, Db, Document } from 'mongodb';
import type { Logger } from '../../../core/logger';
import { normalizeProjection } from '../../../utils/normalize';
import {
    type BookmarkCacheLike,
    type BookmarkClearResult,
    type BookmarkKeyDims,
    type BookmarkListResult,
    type BookmarkPrewarmResult,
    type IndexCreateResult,
} from '../management';
import {
    clearBookmarksForAccessor,
    collModForAccessor,
    convertToCappedForAccessor,
    createCollectionForAccessor,
    createIndexForAccessor,
    createIndexesForAccessor,
    createViewForAccessor,
    dropCollectionForAccessor,
    dropIndexForAccessor,
    dropIndexesForAccessor,
    getValidatorForAccessor,
    indexStatsForAccessor,
    listBookmarksForAccessor,
    listIndexesForAccessor,
    prewarmBookmarksForAccessor,
    renameCollectionForAccessor,
    setValidationActionForAccessor,
    setValidationLevelForAccessor,
    setValidatorForAccessor,
    statsForAccessor,
} from './collection-accessor-management-helpers';

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
    watchDocuments,
} from '../queries';
import type { QueryCacheLike, RuntimeDefaults } from '../../../types/internal/query';
import type {
    CollectionAccessorManagementOptions,
    CollectionNamespaceView,
} from '../../../types/internal/accessor';
import {
    type BatchWriteOptions,
    type DeleteBatchResult,
    type IncrementOneOptions,
    type InsertBatchResult,
    type UpdateBatchOptions,
    type UpdateBatchResult,
} from '../writes';
import { convertObjectIdStrings, convertUpdateDocument } from '../utils/objectid-converter';
import {
    deleteBatchForAccessor,
    incrementOneForAccessor,
    insertBatchForAccessor,
    updateBatchForAccessor,
} from './collection-accessor-batch-helpers';
import {
    deleteManyForAccessor,
    deleteOneForAccessor,
    findOneAndDeleteForAccessor,
    findOneAndReplaceForAccessor,
    findOneAndUpdateForAccessor,
    insertManyForAccessor,
    insertOneForAccessor,
    replaceOneForAccessor,
    updateManyForAccessor,
    updateOneForAccessor,
    upsertOneForAccessor,
} from './collection-accessor-write-helpers';

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
        private readonly management: CollectionAccessorManagementOptions = {},
        private readonly dbRef?: Db,
    ) {}

    /** When autoConvertObjectId is enabled, auto-converts filter/query values. */
    private _cvFilter<T>(val: T): T {
        if (!this.management.defaults?.autoConvertObjectId) return val;
        return convertObjectIdStrings(val as unknown) as T;
    }

    /** When autoConvertObjectId is enabled, auto-converts plain documents (insert/replace). */
    private _cvDoc<T>(val: T): T {
        if (!this.management.defaults?.autoConvertObjectId) return val;
        return convertObjectIdStrings(val as unknown) as T;
    }

    /** When autoConvertObjectId is enabled, auto-converts update documents ($set/$push/etc.). */
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

    getNamespace(): CollectionNamespaceView {
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

    raw(): Collection<TSchema> {
        return this.collectionRef;
    }

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

    find(
        query?: Parameters<Collection<TSchema>['find']>[0],
        options?: Parameters<Collection<TSchema>['find']>[1] & { stream?: boolean },
    ): FindChain<TSchema> | NodeJS.ReadableStream {
        if ((options as Record<string, unknown> | undefined)?.stream) {
            return streamDocuments(this.collectionRef, query, options, this.management.defaults);
        }
        return createFindChain(this.collectionRef, query, options, this.management.defaults, this.management.queryCache) as unknown as FindChain<TSchema>;
    }

    async findOneById(id: unknown, options?: Parameters<Collection<TSchema>['findOne']>[1]): Promise<TSchema | null> {
        const maxTimeMS = this.management.defaults?.maxTimeMS;
        return findOneByIdDocument(this.collectionRef, id, (maxTimeMS !== undefined ? { maxTimeMS, ...options } : options) as Parameters<Collection<TSchema>['findOne']>[1]);
    }

    async findByIds(ids: unknown[], options?: Parameters<Collection<TSchema>['find']>[1]): Promise<TSchema[]> {
        const { findLimit: _skip, ...noLimitDefaults } = this.management.defaults ?? {};
        return findByIdsDocuments(this.collectionRef, ids, options, noLimitDefaults);
    }

    async findAndCount(query?: Parameters<Collection<TSchema>['find']>[0], options?: Parameters<Collection<TSchema>['find']>[1]) {
        return findAndCountDocuments(this.collectionRef, query != null ? this._cvFilter(query) as typeof query : query, options, this.management.defaults);
    }

    stream(query?: Parameters<Collection<TSchema>['find']>[0], options?: Parameters<Collection<TSchema>['find']>[1]): NodeJS.ReadableStream {
        return streamDocuments(this.collectionRef, query, options, this.management.defaults);
    }

    explain(query?: Parameters<Collection<TSchema>['find']>[0], options?: Parameters<Collection<TSchema>['find']>[1] & { explain?: boolean | string; }): Promise<unknown> {
        return explainDocuments(this.collectionRef, query, options, this.management.defaults);
    }

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
        const executeCount = () => countDocuments(this.collectionRef, normalizedQuery ?? {}, keyOptions as Parameters<Collection<TSchema>['countDocuments']>[1]);
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

    aggregate(
        pipeline: Document[] = [],
        options?: Parameters<Collection<TSchema>['aggregate']>[1],
    ) {
        const normalizedPipeline = this.management.defaults?.autoConvertObjectId
            ? pipeline.map((stage) => convertObjectIdStrings(stage as unknown) as Document)
            : pipeline;
        return createAggregateChain(this.collectionRef, normalizedPipeline, options, this.management.defaults);
    }

    async distinct(
        key: string,
        query?: Document,
        options?: Parameters<Collection<TSchema>['distinct']>[2],
    ): ReturnType<Collection<TSchema>['distinct']> {
        return distinctValues(this.collectionRef, key, this._cvFilter(query), options);
    }

    async findPage(options: FindPageOptions<TSchema> = {}): Promise<FindPageResult<TSchema>> {
        const resolvedOptions = options.query
            ? { ...options, query: this._cvFilter(options.query) as typeof options.query }
            : options;
        return findPageDocuments(this.collectionRef, resolvedOptions, this.management.defaults);
    }

    watch(pipeline: Document[] = [], options?: Parameters<Collection<TSchema>['watch']>[1]): ChangeStream<TSchema> {
        return watchDocuments(this.collectionRef, pipeline, options);
    }

    async insertOne(
        doc: Parameters<Collection<TSchema>['insertOne']>[0],
        options?: Parameters<Collection<TSchema>['insertOne']>[1],
    ): ReturnType<Collection<TSchema>['insertOne']> {
        return insertOneForAccessor(this.writeContext(), doc, options);
    }

    async insertMany(...args: Parameters<Collection<TSchema>['insertMany']>): ReturnType<Collection<TSchema>['insertMany']> {
        const [documents, options] = args;
        return insertManyForAccessor(this.writeContext(), documents, options);
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
        return updateOneForAccessor(this.writeContext(), filter, update, options);
    }

    async updateMany(...args: Parameters<Collection<TSchema>['updateMany']>): ReturnType<Collection<TSchema>['updateMany']> {
        const [filter, update, options] = args;
        return updateManyForAccessor(this.writeContext(), filter, update, options);
    }

    async replaceOne(...args: Parameters<Collection<TSchema>['replaceOne']>): ReturnType<Collection<TSchema>['replaceOne']> {
        const [filter, replacement, options] = args;
        return replaceOneForAccessor(this.writeContext(), filter, replacement, options);
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
        return findOneAndReplaceForAccessor(this.writeContext(), filter, replacement, options);
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
        return findOneAndUpdateForAccessor(this.writeContext(), filter, update, options);
    }

    /**
     * Atomically finds and deletes a single document.
     * @since v1.3.0
     */
    async findOneAndDelete(
        filter: Parameters<Collection<TSchema>['findOneAndDelete']>[0],
        options?: unknown,
    ): ReturnType<Collection<TSchema>['findOneAndDelete']> {
        return findOneAndDeleteForAccessor(this.writeContext(), filter, options);
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
        return upsertOneForAccessor(this.writeContext(), filter, update, options);
    }

    /**
     * Passthrough for native single-document delete, with v1 validation and cache invalidation.
     * @since v1.3.0
     */
    async deleteOne(
        filter: Parameters<Collection<TSchema>['deleteOne']>[0],
        options?: Parameters<Collection<TSchema>['deleteOne']>[1],
    ): ReturnType<Collection<TSchema>['deleteOne']> {
        return deleteOneForAccessor(this.writeContext(), filter, options);
    }

    async deleteMany(...args: Parameters<Collection<TSchema>['deleteMany']>): ReturnType<Collection<TSchema>['deleteMany']> {
        const [filter, options] = args;
        return deleteManyForAccessor(this.writeContext(), filter, options);
    }

    async insertBatch(documents: TSchema[], options?: BatchWriteOptions & Parameters<Collection<TSchema>['insertMany']>[1]): Promise<InsertBatchResult> {
        return insertBatchForAccessor(this.batchContext(), documents, options);
    }

    async updateBatch(
        filter: Parameters<Collection<TSchema>['find']>[0],
        update: Parameters<Collection<TSchema>['updateMany']>[1],
        options?: UpdateBatchOptions & Parameters<Collection<TSchema>['updateMany']>[2],
    ): Promise<UpdateBatchResult> {
        return updateBatchForAccessor(this.batchContext(), filter, update, options);
    }

    async deleteBatch(
        filter: Parameters<Collection<TSchema>['find']>[0],
        options?: UpdateBatchOptions & Parameters<Collection<TSchema>['deleteMany']>[1],
    ): Promise<DeleteBatchResult> {
        return deleteBatchForAccessor(this.batchContext(), filter, options);
    }

    async incrementOne(
        filter: Parameters<Collection<TSchema>['findOneAndUpdate']>[0],
        field: string | Record<string, number>,
        incrementOrOptions?: number | IncrementOneOptions,
        maybeOptions?: IncrementOneOptions,
    ): Promise<import('../writes/index.js').IncrementOneResult<TSchema>> {
        return incrementOneForAccessor(this.batchContext(), filter, field, incrementOrOptions, maybeOptions);
    }

    async createIndex(keys: Document, options?: Parameters<Collection<TSchema>['createIndex']>[1]): Promise<IndexCreateResult> {
        return createIndexForAccessor(this.collectionRef, keys, options);
    }

    async createIndexes(specs: Array<{ key: Document; } & Record<string, unknown>>): Promise<string[]> { return createIndexesForAccessor(this.collectionRef, specs); }

    async listIndexes(): Promise<Record<string, unknown>[]> { return listIndexesForAccessor(this.collectionRef); }

    async dropIndex(name: string): ReturnType<Collection<TSchema>['dropIndex']> { return dropIndexForAccessor(this.collectionRef, name); }

    async dropIndexes(): ReturnType<Collection<TSchema>['dropIndexes']> { return dropIndexesForAccessor(this.collectionRef); }

    async prewarmBookmarks(keyDims: BookmarkKeyDims<TSchema> = {}, pages: number[] = []): Promise<BookmarkPrewarmResult> {
        return prewarmBookmarksForAccessor(this.bookmarkContext(), keyDims, pages);
    }

    async listBookmarks(keyDims?: BookmarkKeyDims<TSchema>): Promise<BookmarkListResult> {
        return listBookmarksForAccessor(this.bookmarkContext(), keyDims);
    }

    async clearBookmarks(keyDims?: BookmarkKeyDims<TSchema>): Promise<BookmarkClearResult> {
        return clearBookmarksForAccessor(this.bookmarkContext(), keyDims);
    }

    async invalidate(op?: 'find' | 'findOne' | 'count' | 'findPage' | 'all' | string): Promise<number> { return this.invalidateReadCaches(op); }

    async dropCollection(): Promise<boolean> { return dropCollectionForAccessor(this.collectionRef); }

    async createCollection(name?: string, options: Record<string, unknown> = {}): Promise<boolean> {
        return createCollectionForAccessor(this.collectionRef, this.collectionName, this.dbRef, name, options);
    }

    async createView(name: string, source: string, pipeline: unknown[] = []): Promise<boolean> {
        return createViewForAccessor(this.collectionRef, this.dbRef, name, source, pipeline);
    }

    async indexStats(): Promise<unknown[]> { return indexStatsForAccessor(this.collectionRef); }

    async setValidator(validator: unknown, options: { validationLevel?: string; validationAction?: string } = {}): Promise<{ ok: number; collection: string }> {
        return setValidatorForAccessor(this.collectionRef, this.collectionName, this.dbRef, validator, options);
    }

    async setValidationLevel(level: unknown): Promise<{ ok: number; validationLevel: string }> {
        return setValidationLevelForAccessor(this.collectionRef, this.collectionName, this.dbRef, level);
    }

    async setValidationAction(action: unknown): Promise<{ ok: number; validationAction: string }> {
        return setValidationActionForAccessor(this.collectionRef, this.collectionName, this.dbRef, action);
    }

    async getValidator(): Promise<{ validator: Record<string, unknown> | null; validationLevel: string; validationAction: string; }> {
        return getValidatorForAccessor(this.collectionRef, this.collectionName, this.dbRef);
    }

    async stats(options: { scale?: number } = {}): Promise<{ ns: string; count: number; size: number; storageSize: number; totalIndexSize: number; nindexes: number; avgObjSize?: number; scaleFactor?: number; }> {
        return statsForAccessor(this.collectionRef, this.dbName, this.collectionName, options);
    }

    async renameCollection(newName: unknown, options: { dropTarget?: boolean } = {}): Promise<{ renamed: boolean; from: string; to: string }> {
        return renameCollectionForAccessor(this.collectionRef, this.collectionName, newName, options);
    }

    async collMod(modifications: unknown): Promise<Record<string, unknown>> {
        return collModForAccessor(this.collectionRef, this.collectionName, this.dbRef, modifications);
    }

    async convertToCapped(size: unknown, options: { max?: number } = {}): Promise<{ ok: number; collection: string; capped: boolean; size: number }> {
        return convertToCappedForAccessor(this.collectionRef, this.collectionName, this.dbRef, size, options);
    }

    private batchContext() {
        return {
            collectionRef: this.collectionRef,
            cvFilter: <T>(value: T) => this._cvFilter(value),
            cvDoc: <T>(value: T) => this._cvDoc(value),
            cvUpdate: <T>(value: T) => this._cvUpdate(value),
            invalidateAll: () => this.invalidateReadCaches('all'),
        };
    }

    private writeContext() {
        return {
            dbName: this.dbName,
            collectionName: this.collectionName,
            collectionRef: this.collectionRef,
            defaults: this.management.defaults,
            logger: this.management.logger,
            cvFilter: <T>(value: T) => this._cvFilter(value),
            cvDoc: <T>(value: T) => this._cvDoc(value),
            cvUpdate: <T>(value: T) => this._cvUpdate(value),
            invalidateAll: () => this.invalidateReadCaches('all'),
        };
    }

    private bookmarkContext() {
        return {
            namespace: `${this.dbName}:${this.collectionName}`,
            cache: this.management.cache,
            getCache: this.management.getCache,
            logger: this.management.logger,
            findPage: (options: FindPageOptions<TSchema>) => this.findPage(options),
        };
    }
}

