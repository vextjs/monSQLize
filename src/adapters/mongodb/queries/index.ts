/**
 * MongoDB 查询适配层——入口桶文件。
 *
 * 职责边界：
 * - FindChain / AggregateChain：链式查询构建器
 * - findDocuments / findOneDocument / countDocuments / aggregateDocuments / distinctValues
 *   streamDocuments / explainDocuments / watchDocuments：基础查询函数
 *
 * 已拆出到独立模块（向后兼容 re-export）：
 * - `find-page.ts`    — executeFindPage / findPageDocuments
 * - `find-by-id.ts`   — findOneByIdDocument / findByIdsDocuments
 * - `find-and-count.ts` — findAndCountDocuments
 * - `query-helpers.ts` — cursor / ObjectId / sort / projection helpers
 */

import { ChangeStream, Collection, Document, FindOptions, Sort } from 'mongodb';

import { compilePipelineExpressions, hasExpressionInPipeline } from '../../../core/expression';
import type { QueryCacheLike, RuntimeDefaults } from '../../../types/internal/query';
import type {
    AggregateChain as AggregateChainContract,
    FindChain as FindChainContract,
} from '../../../../types/collection';
import {
    buildAggregateDriverOptions,
    buildFindDriverOptions,
    normalizeQueryFilter,
} from './query-helpers';

// ── 从拆出模块重新导出（保持向后兼容）──────────────────────────────────────
export type {
    AggregateChain,
    FindAndCountResult,
    FindPageOptions,
    FindPageResult,
} from '../../../../types/collection';
export type { QueryCacheLike, RuntimeDefaults } from '../../../types/internal/query';
export { findPageDocuments } from './find-page';
export { findOneByIdDocument, findByIdsDocuments } from './find-by-id';
export { findAndCountDocuments } from './find-and-count';


/**
 * Chainable wrapper around MongoDB `find()`.
 * Supports `sort`, `skip`, `limit`, `project`, `hint`, `timeout`,
 * stream(), xplain() and thenable/async-iterable protocols.
 * @since v1.0.0
 */
export class FindChain<TSchema extends Document = Document> implements FindChainContract<TSchema> {
    readonly [Symbol.toStringTag] = 'Promise';

    private executed = false;
    private readonly options: Record<string, unknown>;
    private readonly normalizedQuery: Parameters<Collection<TSchema>['find']>[0];

    constructor(
        private readonly collection: Collection<TSchema>,
        query: Parameters<Collection<TSchema>['find']>[0] = {},
        initialOptions: Record<string, unknown> = {},
        private readonly defaults: RuntimeDefaults = {},
        private readonly queryCache?: QueryCacheLike | null,
    ) {
        this.options = { ...initialOptions };
        this.normalizedQuery = defaults.autoConvertObjectId
            ? normalizeQueryFilter(
                (query as Record<string, unknown>) ?? {},
                defaults.autoConvertObjectId,
            ) as Parameters<Collection<TSchema>['find']>[0]
            : query;
    }

    private buildExecuteOptions(): Record<string, unknown> {
        return {
            ...(this.defaults.maxTimeMS !== undefined ? { maxTimeMS: this.defaults.maxTimeMS } : {}),
            ...(this.defaults.findLimit !== undefined ? { limit: this.defaults.findLimit } : {}),
            ...this.options,
        };
    }

    limit(value: number): FindChain<TSchema> {
        if (typeof value !== 'number' || value < 0) {
            throw new Error(`limit() requires a non-negative number, got: ${typeof value} (${value})`);
        }
        this.options.limit = value;
        return this;
    }

    skip(value: number): FindChain<TSchema> {
        if (typeof value !== 'number' || value < 0) {
            throw new Error(`skip() requires a non-negative number, got: ${typeof value} (${value})`);
        }
        this.options.skip = value;
        return this;
    }

    sort(value: Sort | Record<string, 1 | -1>): FindChain<TSchema> {
        if (!value || typeof value !== 'object') {
            throw new Error(`sort() requires an object or array, got: ${typeof value}`);
        }
        this.options.sort = value;
        return this;
    }

    project(value: Document): FindChain<TSchema> {
        this.options.projection = value;
        return this;
    }

    hint(value: unknown): FindChain<TSchema> {
        this.options.hint = value;
        return this;
    }

    collation(value: Record<string, unknown>): FindChain<TSchema> {
        this.options.collation = value;
        return this;
    }

    comment(value: string): FindChain<TSchema> {
        this.options.comment = value;
        return this;
    }

    maxTimeMS(value: number): FindChain<TSchema> {
        this.options.maxTimeMS = value;
        return this;
    }

    batchSize(value: number): FindChain<TSchema> {
        this.options.batchSize = value;
        return this;
    }

    private buildCacheKey(): string {
        // Strip non-query options from cache key (mirrors v1's key generation)
        const { cache: _c, explain: _e, stream: _s, ...keyOpts } = this.options;
        return `find:${this.collection.namespace}:${JSON.stringify(this.normalizedQuery)}:${JSON.stringify(keyOpts)}`;
    }

    explain(verbosity: boolean | string = 'queryPlanner'): Promise<unknown> {
        return this.collection.find(this.normalizedQuery, buildFindDriverOptions<TSchema>(this.buildExecuteOptions())).explain(verbosity === true ? 'queryPlanner' : verbosity);
    }

    stream(): NodeJS.ReadableStream {
        return this.collection.find(this.normalizedQuery, buildFindDriverOptions<TSchema>(this.buildExecuteOptions())).stream();
    }

    toArray(): Promise<TSchema[]> {
        if (this.executed) {
            throw new Error('Query already executed.');
        }
        this.executed = true;
        return this.collection.find(this.normalizedQuery, buildFindDriverOptions<TSchema>(this.buildExecuteOptions())).toArray() as Promise<TSchema[]>;
    }

    then<TResult1 = TSchema[], TResult2 = never>(
        onfulfilled?: ((value: TSchema[]) => TResult1 | PromiseLike<TResult1>) | null,
        onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
    ): Promise<TResult1 | TResult2> {
        // v1 compat: explain option routes to .explain() instead of toArray()
        if (this.options.explain !== undefined && this.options.explain !== false) {
            const verbosity = typeof this.options.explain === 'string' ? this.options.explain : 'queryPlanner';
            return this.explain(verbosity).then(onfulfilled as never, onrejected ?? undefined) as Promise<TResult1 | TResult2>;
        }

        // v1 compat: cache option (TTL in ms) — read-through cache
        const cacheTTL = typeof this.options.cache === 'number' ? this.options.cache : 0;
        if (cacheTTL > 0 && this.queryCache) {
            const cacheKey = this.buildCacheKey();
            const cached = this.queryCache.get(cacheKey);
            if (cached !== undefined) {
                return Promise.resolve(cached as TSchema[]).then(onfulfilled ?? undefined, onrejected ?? undefined);
            }
            const qc = this.queryCache;
            return this.toArray().then((result) => {
                const setResult = qc.set(cacheKey, result, cacheTTL);
                return result;
            }).then(onfulfilled ?? undefined, onrejected ?? undefined);
        }

        return this.toArray().then(onfulfilled ?? undefined, onrejected ?? undefined);
    }

    catch<TResult = never>(onrejected?: ((reason: unknown) => TResult | PromiseLike<TResult>) | null): Promise<TSchema[] | TResult> {
        return this.toArray().catch(onrejected ?? undefined);
    }

    finally(onfinally?: (() => void) | null): Promise<TSchema[]> {
        return this.toArray().finally(onfinally ?? undefined);
    }
}

class AggregateChain<TResult = unknown, TSchema extends Document = Document> implements AggregateChainContract<TResult> {
    readonly [Symbol.toStringTag] = 'Promise';

    private executed = false;
    private readonly options: Record<string, unknown>;

    constructor(
        private readonly collection: Collection<TSchema>,
        private readonly pipeline: Document[] = [],
        initialOptions: Record<string, unknown> = {},
        private readonly defaults: RuntimeDefaults = {},
    ) {
        this.options = { ...initialOptions };
    }

    private buildExecuteOptions(): Record<string, unknown> {
        return {
            ...(this.defaults.maxTimeMS !== undefined ? { maxTimeMS: this.defaults.maxTimeMS } : {}),
            ...this.options,
        };
    }

    hint(value: unknown): AggregateChain<TResult, TSchema> {
        this.options.hint = value;
        return this;
    }

    collation(value: Record<string, unknown>): AggregateChain<TResult, TSchema> {
        this.options.collation = value;
        return this;
    }

    comment(value: string): AggregateChain<TResult, TSchema> {
        this.options.comment = value;
        return this;
    }

    maxTimeMS(value: number): AggregateChain<TResult, TSchema> {
        this.options.maxTimeMS = value;
        return this;
    }

    allowDiskUse(value: boolean): AggregateChain<TResult, TSchema> {
        this.options.allowDiskUse = value;
        return this;
    }

    batchSize(value: number): AggregateChain<TResult, TSchema> {
        this.options.batchSize = value;
        return this;
    }

    explain(verbosity: boolean | string = 'queryPlanner'): Promise<unknown> {
        return this.collection.aggregate(this.pipeline, buildAggregateDriverOptions<TSchema>(this.buildExecuteOptions())).explain(verbosity === true ? 'queryPlanner' : verbosity);
    }

    stream(): NodeJS.ReadableStream {
        return this.collection.aggregate(this.pipeline, buildAggregateDriverOptions<TSchema>(this.buildExecuteOptions())).stream();
    }

    toArray(): Promise<TResult[]> {
        if (this.executed) {
            throw new Error('Query already executed.');
        }
        this.executed = true;
        return this.collection.aggregate(this.pipeline, buildAggregateDriverOptions<TSchema>(this.buildExecuteOptions())).toArray() as Promise<TResult[]>;
    }

    then<TResult1 = TResult[], TResult2 = never>(
        onfulfilled?: ((value: TResult[]) => TResult1 | PromiseLike<TResult1>) | null,
        onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
    ): Promise<TResult1 | TResult2> {
        // v1 compat: explain option routes to .explain() instead of toArray()
        if (this.options.explain !== undefined && this.options.explain !== false) {
            const verbosity = typeof this.options.explain === 'string' ? this.options.explain : 'queryPlanner';
            return this.explain(verbosity).then(onfulfilled as never, onrejected ?? undefined) as Promise<TResult1 | TResult2>;
        }
        // v1 compat: stream option routes to .stream() instead of toArray()
        if (this.options.stream === true) {
            return Promise.resolve(this.stream()).then(onfulfilled as never, onrejected ?? undefined) as Promise<TResult1 | TResult2>;
        }
        return this.toArray().then(onfulfilled ?? undefined, onrejected ?? undefined);
    }

    catch<TResultCatch = never>(onrejected?: ((reason: unknown) => TResultCatch | PromiseLike<TResultCatch>) | null): Promise<TResult[] | TResultCatch> {
        return this.toArray().catch(onrejected ?? undefined);
    }

    finally(onfinally?: (() => void) | null): Promise<TResult[]> {
        return this.toArray().finally(onfinally ?? undefined);
    }
}

/**
 * Creates a {@link FindChain} for the given collection.
 * @param collection - Target MongoDB collection.
 * @param query - Filter predicate (default: `{}`).
 * @param options - Native driver `find` options.
 * @param defaults - Runtime-level defaults (e.g. `findLimit`, `maxTimeMS`).
 * @param queryCache - Optional query result cache.
 * @returns A chainable find builder implementing the v1 contract.
 * @since v1.0.0
 */
export function createFindChain<TSchema extends Document = Document>(
    collection: Collection<TSchema>,
    query?: Parameters<Collection<TSchema>['find']>[0],
    options?: Parameters<Collection<TSchema>['find']>[1],
    defaults?: RuntimeDefaults,
    queryCache?: QueryCacheLike | null,
): FindChainContract<TSchema> {
    return new FindChain(collection, query, (options ?? {}) as Record<string, unknown>, defaults ?? {}, queryCache);
}

/**
 * Creates an {@link AggregateChain} for the given collection.
 * @param collection - Target MongoDB collection.
 * @param pipeline - Aggregation pipeline stages.
 * @param options - Native driver `aggregate` options.
 * @param defaults - Runtime-level defaults.
 * @returns A chainable aggregate builder implementing the v1 contract.
 * @since v1.0.0
 */
export function createAggregateChain<TSchema extends Document = Document, TResult = Document>(
    collection: Collection<TSchema>,
    pipeline: Document[] = [],
    options?: Parameters<Collection<TSchema>['aggregate']>[1],
    defaults?: RuntimeDefaults,
): AggregateChainContract<TResult> {
    const processedPipeline = hasExpressionInPipeline(pipeline)
        ? compilePipelineExpressions(pipeline)
        : pipeline;

    return new AggregateChain<TResult, TSchema>(collection, processedPipeline, (options ?? {}) as Record<string, unknown>, defaults ?? {});
}

/**
 * Queries multiple documents and returns them as an array.
 * @param collection - The MongoDB collection to query.
 * @param args - Filter and options forwarded directly to `collection.find()`.
 * @returns Promise resolving to an array of matching documents.
 * @since v1.3.0
 */
export async function findDocuments<TSchema extends Document = Document>(
    collection: Collection<TSchema>,
    ...args: Parameters<Collection<TSchema>['find']>
): Promise<TSchema[]> {
    return collection.find(...args).toArray() as Promise<TSchema[]>;
}

/**
 * Queries a single document.
 * @since v1.3.0
 */
export async function findOneDocument<TSchema extends Document = Document>(
    collection: Collection<TSchema>,
    ...args: Parameters<Collection<TSchema>['findOne']>
): ReturnType<Collection<TSchema>['findOne']> {
    const [query, options] = args;
    const rawOptions = (options ?? {}) as FindOptions<TSchema> & { explain?: boolean | string; };
    const findOptions: FindOptions<TSchema> = {};
    if (rawOptions.projection !== undefined) findOptions.projection = rawOptions.projection;
    if (rawOptions.sort !== undefined) findOptions.sort = rawOptions.sort;
    if (rawOptions.maxTimeMS !== undefined) findOptions.maxTimeMS = rawOptions.maxTimeMS;
    if (rawOptions.comment !== undefined) findOptions.comment = rawOptions.comment;
    if (rawOptions.hint !== undefined) findOptions.hint = rawOptions.hint;
    if (rawOptions.collation !== undefined) findOptions.collation = rawOptions.collation;

    if (rawOptions.explain) {
        const verbosity = rawOptions.explain === true ? 'queryPlanner' : rawOptions.explain;
        return collection.find((query ?? {}) as Parameters<Collection<TSchema>['find']>[0], findOptions)
            .limit(1)
            .explain(verbosity) as ReturnType<Collection<TSchema>['findOne']>;
    }

    return collection.findOne(
        (query ?? {}) as Parameters<Collection<TSchema>['findOne']>[0],
        findOptions as Parameters<Collection<TSchema>['findOne']>[1],
    ) as ReturnType<Collection<TSchema>['findOne']>;
}

/**
 * Counts the number of documents.
 * @since v1.3.0
 */
export async function countDocuments<TSchema extends Document = Document>(
    collection: Collection<TSchema>,
    query?: Parameters<Collection<TSchema>['countDocuments']>[0],
    options?: Parameters<Collection<TSchema>['countDocuments']>[1],
): Promise<unknown> {
    const rawQuery = (query ?? {}) as Record<string, unknown>;
    const rawOptions = (options ?? {}) as Record<string, unknown>;
    const isEmptyQuery = Object.keys(rawQuery).length === 0;
    const explain = rawOptions.explain;
    const maxTimeMS = rawOptions.maxTimeMS as number | undefined;
    const comment = rawOptions.comment as string | undefined;

    if (explain) {
        const verbosity = typeof explain === 'string' ? explain : 'queryPlanner';
        if (isEmptyQuery) {
            return {
                queryPlanner: { plannerVersion: 1, namespace: collection.namespace },
                executionStats: { executionSuccess: true, estimatedCount: true },
                command: { estimatedDocumentCount: collection.collectionName },
            };
        }

        const pipeline = [{ $match: rawQuery }, { $count: 'total' }];
        const aggregateOptions: Record<string, unknown> = {};
        if (maxTimeMS !== undefined) aggregateOptions.maxTimeMS = maxTimeMS;
        if (rawOptions.hint !== undefined) aggregateOptions.hint = rawOptions.hint;
        if (rawOptions.collation !== undefined) aggregateOptions.collation = rawOptions.collation;
        if (comment) aggregateOptions.comment = comment;
        return collection.aggregate(pipeline, aggregateOptions).explain(verbosity);
    }

    if (isEmptyQuery) {
        const estimatedOptions: Record<string, unknown> = {};
        if (maxTimeMS !== undefined) estimatedOptions.maxTimeMS = maxTimeMS;
        if (comment) estimatedOptions.comment = comment;
        return collection.estimatedDocumentCount(estimatedOptions as Parameters<Collection<TSchema>['estimatedDocumentCount']>[0]);
    }

    const countOptions: Record<string, unknown> = {};
    if (maxTimeMS !== undefined) countOptions.maxTimeMS = maxTimeMS;
    if (rawOptions.hint !== undefined) countOptions.hint = rawOptions.hint;
    if (rawOptions.collation !== undefined) countOptions.collation = rawOptions.collation;
    if (typeof rawOptions.skip === 'number') countOptions.skip = rawOptions.skip;
    if (typeof rawOptions.limit === 'number') countOptions.limit = rawOptions.limit;
    if (comment) countOptions.comment = comment;
    return collection.countDocuments(rawQuery as Parameters<Collection<TSchema>['countDocuments']>[0], countOptions as Parameters<Collection<TSchema>['countDocuments']>[1]);
}

/**
 * Runs an aggregation query.
 * @since v1.3.0
 */
export async function aggregateDocuments<TSchema extends Document = Document>(
    collection: Collection<TSchema>,
    pipeline: Document[] = [],
    options?: Parameters<Collection<TSchema>['aggregate']>[1],
): Promise<Document[]> {
    return createAggregateChain<TSchema, Document>(collection, pipeline, options).toArray();
}

/**
 * Queries distinct values for a field.
 * @since v1.3.0
 */
export async function distinctValues<TSchema extends Document = Document>(
    collection: Collection<TSchema>,
    key: string,
    filter?: Document,
    options?: Parameters<Collection<TSchema>['distinct']>[2],
): ReturnType<Collection<TSchema>['distinct']> {
    const normalizedFilter = (filter ?? {}) as Parameters<Collection<TSchema>['distinct']>[1];
    if (options === undefined) {
        return collection.distinct(key, normalizedFilter);
    }
    return collection.distinct(key, normalizedFilter, options);
}

/**
 * Watches the collection for change stream events.
 * @since v1.3.0
 */
export function watchDocuments<TSchema extends Document = Document>(
    collection: Collection<TSchema>,
    pipeline: Document[] = [],
    options?: Parameters<Collection<TSchema>['watch']>[1],
): ChangeStream<TSchema> {
    const processedPipeline = hasExpressionInPipeline(pipeline)
        ? compilePipelineExpressions(pipeline)
        : pipeline;

    return collection.watch(processedPipeline, options);
}


/**
 * Opens a Node.js readable stream over the query results.
 * No `findLimit` is applied — all matching documents are streamed.
 * @param collection - Target MongoDB collection.
 * @param query - Filter predicate.
 * @param options - Native driver `find` options.
 * @param defaults - Runtime-level defaults.
 * @returns A readable object stream of matching documents.
 * @since v1.0.0
 */
export function streamDocuments<TSchema extends Document = Document>(
    collection: Collection<TSchema>,
    query?: Parameters<Collection<TSchema>['find']>[0],
    options?: Parameters<Collection<TSchema>['find']>[1],
    defaults?: RuntimeDefaults,
): NodeJS.ReadableStream {
    // stream returns all results; findLimit does NOT apply.
    const streamDefaults: RuntimeDefaults = defaults ? { ...defaults, findLimit: undefined } : {};
    return createFindChain(collection, query, options, streamDefaults).stream();
}

/**
 * Returns the query execution plan without fetching any documents.
 * @param collection - Target MongoDB collection.
 * @param query - Filter predicate.
 * @param options - Native driver `find` options; `explain` controls verbosity.
 * @param defaults - Runtime-level defaults.
 * @returns The explain plan object from MongoDB.
 * @since v1.0.0
 */
export function explainDocuments<TSchema extends Document = Document>(
    collection: Collection<TSchema>,
    query?: Parameters<Collection<TSchema>['find']>[0],
    options?: Parameters<Collection<TSchema>['find']>[1] & { explain?: boolean | string; },
    defaults?: RuntimeDefaults,
): Promise<unknown> {
    return createFindChain(collection, query, options, defaults).explain(options?.explain ?? 'queryPlanner');
}