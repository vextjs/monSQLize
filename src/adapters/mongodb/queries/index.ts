/**
 * MongoDB query adapter layer.
 *
 * Description:
 * - Implements find / findOne / count / aggregate / distinct / findPage / findAndCount and other query APIs.
 * - Supports chained queries (FindChain / AggregateChain), cursor-based pagination, ObjectId
 *   auto-conversion, and slow-query monitoring.
 */

import { createHmac } from 'node:crypto';

import { ChangeStream, Collection, Document, FindOptions, ObjectId, Sort } from 'mongodb';

import { compilePipelineExpressions, hasExpressionInPipeline } from '../../../core/expression';
import { createError, ErrorCodes } from '../../../core/errors';
import { normalizeProjection } from '../../../utils/normalize';
import type {
    AggregateChain as AggregateChainContract,
    FindAndCountResult,
    FindChain as FindChainContract,
    FindPageOptions,
    FindPageResult,
    TotalsInfo,
    TotalsOptions,
} from '../../../../types/collection';

export type {
    AggregateChain,
    FindAndCountResult,
    FindPageOptions,
    FindPageResult,
} from '../../../../types/collection';

/**
 * Minimal interface for a query-result cache that supports TTL.
 * Satisfied by MemoryCache; injected from runtime to avoid circular deps.
 */
export interface QueryCacheLike {
    get(key: string): unknown;
    set(key: string, value: unknown, ttl: number): boolean;
    /** Optional: delete all cache keys matching a glob pattern (used for write-through invalidation). */
    delPattern?: (pattern: string) => number | Promise<number>;
}

/**
 * Runtime defaults threaded from MonSQLizeOptions down through DbFacade → CollectionFacade → query functions.
 * All fields are optional; missing values use the same defaults as v1.
 */
export interface RuntimeDefaults {
    /** Global query timeout in ms applied to all find/aggregate ops via maxTimeMS option. */
    maxTimeMS?: number;
    /** Default limit for find() when caller does not specify one. */
    findLimit?: number;
    /** Maximum allowed limit for findPage(). Requests exceeding this are silently clamped. */
    findPageMaxLimit?: number;
    /** 24-char hex → ObjectId auto-conversion. Pass `true` for all fields or a field map to select per field. */
    autoConvertObjectId?: boolean | Record<string, boolean>;
    /** HMAC-SHA256 secret for signing/verifying cursor tokens. */
    cursorSecret?: string;
    /** Slow query threshold in ms; operations exceeding this emit a warn log. Default 500ms. */
    slowQueryMs?: number;
    /** Namespace scope for multi-instance cursor isolation. */
    namespace?: { scope?: 'database' | 'connection'; instanceId?: string; };
    /** CountQueue instance for concurrency-limited count() operations. */
    countQueue?: { execute<T>(fn: () => Promise<T>): Promise<T>; };
}

type CursorPayload = {
    v: 1;
    values: unknown[];
};

type SortShape = Record<string, 1 | -1>;

function normalizeSortShape(sort?: Sort): SortShape {
    const normalized: SortShape = {};

    if (Array.isArray(sort)) {
        for (const [field, direction] of sort) {
            normalized[String(field)] = direction === -1 || direction === 'desc' || direction === 'descending' ? -1 : 1;
        }
    } else if (sort && typeof sort === 'object') {
        for (const [field, direction] of Object.entries(sort)) {
            normalized[field] = direction === -1 || direction === 'desc' || direction === 'descending' ? -1 : 1;
        }
    }

    if (!normalized._id) {
        normalized._id = 1;
    }

    return normalized;
}

function isHexObjectIdString(value: string): boolean {
    return /^[0-9a-fA-F]{24}$/.test(value);
}

function parseRequiredObjectId(id: unknown): ObjectId {
    if (!id) {
        throw createError(
            ErrorCodes.INVALID_ARGUMENT,
            'id 参数是必需的',
            [{ field: 'id', type: 'required', message: 'id must not be empty' }],
        );
    }

    if (typeof id === 'string') {
        if (!isHexObjectIdString(id)) {
            throw createError(
                ErrorCodes.INVALID_ARGUMENT,
                `无效的 ObjectId 格式: "${id}"`,
                [{
                    field: 'id',
                    type: 'format',
                    message: 'id must be a 24-character hex string or ObjectId instance',
                    received: id,
                }],
            );
        }
        return new ObjectId(id);
    }

    if (id instanceof ObjectId) {
        return id;
    }

    if (id && typeof id === 'object' && typeof (id as { toHexString?: () => string; }).toHexString === 'function') {
        const hex = (id as { toHexString: () => string; }).toHexString();
        if (isHexObjectIdString(hex)) {
            return new ObjectId(hex);
        }
    }

    if (id && typeof id === 'object' && typeof (id as { toString?: () => string; }).toString === 'function') {
        const value = (id as { toString: () => string; }).toString();
        if (isHexObjectIdString(value)) {
            return new ObjectId(value);
        }
    }

    throw createError(
        ErrorCodes.INVALID_ARGUMENT,
        'id 必须是字符串或 ObjectId 实例',
        [{
            field: 'id',
            type: 'type',
            message: `expected: string or ObjectId, received: ${typeof id}`,
            received: typeof id,
        }],
    );
}

function normalizeIdentifier(value: unknown, autoConvert = true): unknown {
    if (autoConvert && typeof value === 'string' && value.length === 24 && ObjectId.isValid(value)) {
        return new ObjectId(value);
    }

    return value;
}

/**
 * Recursively normalize a query filter by converting 24-char hex strings to ObjectId
 * for fields where autoConvertObjectId indicates conversion is desired.
 */
function normalizeQueryFilter(
    filter: Record<string, unknown>,
    autoConvert: boolean | Record<string, boolean>,
): Record<string, unknown> {
    const result: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(filter)) {
        if (key === '$and' || key === '$or' || key === '$nor') {
            result[key] = Array.isArray(value)
                ? value.map((item) => item && typeof item === 'object'
                    ? normalizeQueryFilter(item as Record<string, unknown>, autoConvert)
                    : item)
                : value;
            continue;
        }

        const shouldConvert = autoConvert === true || (typeof autoConvert === 'object' && autoConvert[key] !== false);

        if (typeof value === 'string' && value.length === 24 && ObjectId.isValid(value)) {
            result[key] = shouldConvert ? new ObjectId(value) : value;
        } else if (value && typeof value === 'object' && !Array.isArray(value) && !(value instanceof ObjectId)) {
            const nested = value as Record<string, unknown>;
            const hasOperators = Object.keys(nested).some((k) => k.startsWith('$'));

            if (hasOperators) {
                const nestedResult: Record<string, unknown> = {};
                for (const [op, opVal] of Object.entries(nested)) {
                    if (shouldConvert && (op === '$in' || op === '$nin' || op === '$all') && Array.isArray(opVal)) {
                        nestedResult[op] = opVal.map((item) =>
                            typeof item === 'string' && item.length === 24 && ObjectId.isValid(item)
                                ? new ObjectId(item)
                                : item,
                        );
                    } else if (shouldConvert && (op === '$eq' || op === '$ne') && typeof opVal === 'string' && opVal.length === 24 && ObjectId.isValid(opVal)) {
                        nestedResult[op] = new ObjectId(opVal);
                    } else if (op === '$elemMatch' && opVal && typeof opVal === 'object' && !Array.isArray(opVal)) {
                        nestedResult[op] = normalizeQueryFilter(opVal as Record<string, unknown>, autoConvert);
                    } else {
                        nestedResult[op] = opVal;
                    }
                }
                result[key] = nestedResult;
            } else {
                result[key] = normalizeQueryFilter(nested, autoConvert);
            }
        } else {
            result[key] = value;
        }
    }

    return result;
}

function encodeCursor(values: unknown[], secret?: string): string {
    const payload: CursorPayload = { v: 1, values };
    const encoded = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');

    if (!secret) {
        return encoded;
    }

    const sig = createHmac('sha256', secret).update(encoded).digest('base64url');
    return `${encoded}.${sig}`;
}

function decodeCursor(cursor: string, secret?: string): unknown[] {
    try {
        let raw = cursor;

        if (secret) {
            const dotIndex = cursor.lastIndexOf('.');
            if (dotIndex === -1) {
                throw createError(ErrorCodes.INVALID_PAGINATION, 'Cursor signature missing.');
            }
            const encoded = cursor.slice(0, dotIndex);
            const sig = cursor.slice(dotIndex + 1);
            const expected = createHmac('sha256', secret).update(encoded).digest('base64url');
            if (sig !== expected) {
                throw createError(ErrorCodes.INVALID_PAGINATION, 'Cursor signature invalid.');
            }
            raw = encoded;
        }

        const payload = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8')) as CursorPayload;
        if (payload?.v !== 1 || !Array.isArray(payload.values)) {
            throw new Error('Invalid cursor payload.');
        }
        return payload.values;
    } catch (cause) {
        if ((cause as { code?: string }).code === ErrorCodes.INVALID_PAGINATION) {
            throw cause;
        }
        throw createError(ErrorCodes.INVALID_PAGINATION, 'Invalid pagination cursor.', undefined, cause as Error);
    }
}

function reverseSort(sort: SortShape): SortShape {
    return Object.fromEntries(Object.entries(sort).map(([field, direction]) => [field, direction === 1 ? -1 : 1]));
}

/**
 * Restore cursor values to their original BSON types after JSON round-trip.
 * JSON.stringify converts Date objects to ISO strings; MongoDB BSON comparison
 * fails when a Date field is compared to a String value.
 */
function normalizeCursorValue(value: unknown): unknown {
    if (typeof value === 'string') {
        // Re-hydrate ISO date strings back to Date objects
        if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/.test(value)) {
            const d = new Date(value);
            if (!isNaN(d.getTime())) {
                return d;
            }
        }
        return normalizeIdentifier(value);
    }
    return value;
}

function buildFindDriverOptions<TSchema extends Document = Document>(
    options: Record<string, unknown> = {},
): Parameters<Collection<TSchema>['find']>[1] {
    const driverOptions: Record<string, unknown> = {
        ...(options.projection ? { projection: options.projection } : {}),
        ...(options.sort ? { sort: options.sort } : {}),
        ...(options.skip !== undefined ? { skip: options.skip } : {}),
        ...(options.limit !== undefined ? { limit: options.limit } : {}),
        ...(options.hint ? { hint: options.hint } : {}),
        ...(options.collation ? { collation: options.collation } : {}),
        ...(options.maxTimeMS !== undefined ? { maxTimeMS: options.maxTimeMS } : {}),
        ...(options.batchSize !== undefined ? { batchSize: options.batchSize } : {}),
        ...(options.comment ? { comment: options.comment } : {}),
    };

    return driverOptions as Parameters<Collection<TSchema>['find']>[1];
}

function buildAggregateDriverOptions<TSchema extends Document = Document>(
    options: Record<string, unknown> = {},
): Parameters<Collection<TSchema>['aggregate']>[1] {
    const driverOptions: Record<string, unknown> = {
        ...(options.hint ? { hint: options.hint } : {}),
        ...(options.collation ? { collation: options.collation } : {}),
        ...(options.comment ? { comment: options.comment } : {}),
        ...(options.maxTimeMS !== undefined ? { maxTimeMS: options.maxTimeMS } : {}),
        ...(options.allowDiskUse !== undefined ? { allowDiskUse: options.allowDiskUse } : {}),
        ...(options.batchSize !== undefined ? { batchSize: options.batchSize } : {}),
    };

    return driverOptions as Parameters<Collection<TSchema>['aggregate']>[1];
}

function buildCursorFilter(sort: SortShape, cursorValues: unknown[], direction: 'after' | 'before'): Document {
    const entries = Object.entries(sort);
    const clauses: Document[] = [];

    for (let index = 0; index < entries.length; index += 1) {
        const equalityPrefix = entries.slice(0, index).reduce<Record<string, unknown>>((carry, [field], prefixIndex) => {
            carry[field] = normalizeCursorValue(cursorValues[prefixIndex]);
            return carry;
        }, {});
        const [field, sortDirection] = entries[index];
        const operator = direction === 'after'
            ? (sortDirection === 1 ? '$gt' : '$lt')
            : (sortDirection === 1 ? '$lt' : '$gt');

        clauses.push({
            ...equalityPrefix,
            [field]: {
                [operator]: normalizeCursorValue(cursorValues[index]),
            },
        });
    }

    return clauses.length === 1 ? clauses[0] : { $or: clauses };
}

function mergeFilters(base: Document, extra?: Document): Document {
    if (!extra || Object.keys(extra).length === 0) {
        return base;
    }
    if (!base || Object.keys(base).length === 0) {
        return extra;
    }

    return { $and: [base, extra] };
}

// In-memory cache for async totals results (keyed by query fingerprint).
const _asyncTotalsCache = new Map<string, number>();

async function computeTotals<TSchema extends Document = Document>(
    coll: Collection<TSchema>,
    query: Document,
    limit: number,
    totals: TotalsOptions,
): Promise<TotalsInfo> {
    const mode = (totals.mode ?? 'sync') as TotalsInfo['mode'];

    if (mode === 'sync') {
        const countOpts: Record<string, unknown> = {};
        if (totals.maxTimeMS !== undefined) {
            countOpts.maxTimeMS = totals.maxTimeMS;
        }
        const total = await coll.countDocuments(
            query as Parameters<Collection<TSchema>['countDocuments']>[0],
            countOpts as Parameters<Collection<TSchema>['countDocuments']>[1],
        );
        const totalPages = total > 0 ? Math.ceil(total / limit) : 0;
        return { mode: 'sync', total, totalPages, ts: Date.now() };
    }

    if (mode === 'async') {
        const cacheKey = JSON.stringify({ q: query });
        const token = Buffer.from(cacheKey).toString('base64url');
        if (_asyncTotalsCache.has(cacheKey)) {
            return { mode: 'async', total: _asyncTotalsCache.get(cacheKey)!, token };
        }
        setImmediate(async () => {
            try {
                const n = await coll.countDocuments(
                    query as Parameters<Collection<TSchema>['countDocuments']>[0],
                );
                _asyncTotalsCache.set(cacheKey, n);
            } catch { /* ignore background count errors */ }
        });
        return { mode: 'async', total: null, token };
    }

    if (mode === 'approx') {
        const countOpts: Record<string, unknown> = {};
        if (totals.maxTimeMS !== undefined) {
            countOpts.maxTimeMS = totals.maxTimeMS;
        }
        const total = await coll.estimatedDocumentCount(countOpts as Parameters<Collection<TSchema>['estimatedDocumentCount']>[0]);
        const totalPages = total > 0 ? Math.ceil(total / limit) : 0;
        return { mode: 'approx', total, totalPages, ts: Date.now() };
    }

    // Unknown mode — return minimal stub
    return { mode: mode ?? 'sync' };
}

/**
 * Computes the effective projection: automatically protects sort fields so cursor
 * anchor extraction is not affected by the projection.
 * - Inclusion projection: force-appends sort fields (value: 1)
 * - Exclusion projection: removes sort fields from the exclusion list
 * Supports array-format projections (e.g. ['field1', 'field2']).
 * Ported from monSQLize-v1/lib/mongodb/queries/find-page.js
 */
function buildEffectiveProjection(
    projection: unknown,
    sort: Record<string, 1 | -1>,
): Record<string, unknown> | undefined {
    if (!projection) return undefined;

    // Array format → convert to inclusion object format
    let projObj: Record<string, unknown>;
    if (Array.isArray(projection)) {
        projObj = {};
        for (const f of projection as string[]) {
            projObj[f] = 1;
        }
    } else {
        projObj = { ...(projection as Record<string, unknown>) };
    }

    const sortFields = Object.keys(sort || {});
    // Detect exclusion projection: any non-_id field with value 0 or false
    const isExclusion = Object.entries(projObj).some(
        ([k, v]) => k !== '_id' && (v === 0 || v === false),
    );

    if (isExclusion) {
        // Exclusion: remove sort fields from the exclusion list to keep the cursor usable
        for (const k of sortFields) {
            if (projObj[k] === 0 || projObj[k] === false) {
                delete projObj[k];
            }
        }
    } else {
        // Inclusion: force-include sort fields
        for (const k of sortFields) {
            if (!projObj[k]) projObj[k] = 1;
        }
    }

    return projObj;
}

async function executeFindPage<TSchema extends Document = Document>(
    collection: Collection<TSchema>,
    options: FindPageOptions<TSchema> = {},
    defaults: RuntimeDefaults = {},
): Promise<FindPageResult<TSchema>> {
    const ext = options as Record<string, unknown>;
    const page = normalizePositiveInteger(options.page, 1, 'page');
    const rawLimit = normalizePositiveInteger(options.limit, 20, 'limit');
    const limit = defaults.findPageMaxLimit !== undefined && rawLimit > defaults.findPageMaxLimit
        ? defaults.findPageMaxLimit
        : rawLimit;
    const sort = normalizeSortShape(options.sort);
    const baseQuery = (options.query ?? {}) as Document;
    const cursorSecret = defaults.cursorSecret;

    // ── Validation ─────────────────────────────────────────────────────────────
    if ((options.after || options.before) && Number.isInteger(options.page)) {
        throw createError(ErrorCodes.VALIDATION_ERROR, 'page cannot be used with after/before cursor.');
    }

    // ── Stream conflict checks ──────────────────────────────────────────────────
    if (options.stream === true) {
        if (options.explain !== undefined && options.explain !== false) {
            throw createError(ErrorCodes.STREAM_NO_EXPLAIN, 'stream and explain cannot be used together.');
        }
        if (page > 1) {
            throw createError(ErrorCodes.STREAM_NO_JUMP, 'page jump cannot be used in stream mode.');
        }
        if (options.totals !== undefined) {
            throw createError(ErrorCodes.STREAM_NO_TOTALS, 'totals cannot be computed in stream mode.');
        }
    }

    // ── Jump-too-far check ──────────────────────────────────────────────────────
    const jumpOpts = ext.jump as { step: number; maxHops: number } | undefined;
    if (jumpOpts && page > 1 && (page - 1) > jumpOpts.maxHops) {
        throw createError(ErrorCodes.JUMP_TOO_FAR, 'Page jump exceeds maxHops limit.', [
            { page, maxHops: jumpOpts.maxHops, requestedHops: page - 1 },
        ]);
    }

    // ── Shared driver options ────────────────────────────────────────────────────
    const driverOpts: Record<string, unknown> = { ...(options.options ?? {}) };
    const effectiveMaxTimeMS = (ext.maxTimeMS as number | undefined) ?? defaults.maxTimeMS;
    if (effectiveMaxTimeMS !== undefined) driverOpts.maxTimeMS = effectiveMaxTimeMS;
    if (ext.hint !== undefined) driverOpts.hint = ext.hint;
    if (ext.collation !== undefined) driverOpts.collation = ext.collation;
    if (ext.batchSize !== undefined) driverOpts.batchSize = ext.batchSize;
    if (options.projection !== undefined) {
        driverOpts.projection = buildEffectiveProjection(options.projection, sort);
    }

    // ── Inner helpers (close over sort / baseQuery / cursorSecret / driverOpts) ─

    /** Build the query filter and effective sort for a cursor + direction. */
    const buildPageQuery = (cursor?: string, direction: 'after' | 'before' = 'after') => {
        const cursorFilter = cursor
            ? buildCursorFilter(sort, decodeCursor(cursor, cursorSecret), direction)
            : undefined;
        const effectiveSort = direction === 'before' ? reverseSort(sort) : sort;
        return { queryFilter: mergeFilters(baseQuery, cursorFilter), effectiveSort };
    };

    /** Fetch one page of items.  Callers must reverse items when direction === 'before'. */
    const fetchItems = async (
        queryFilter: Document,
        effectiveSort: SortShape,
        extra: { skip?: number } = {},
    ): Promise<{ items: TSchema[]; hasMore: boolean }> => {
        const fetchLimit = limit + 1;
        let rows: TSchema[];

        if (options.pipeline && options.pipeline.length > 0) {
            const stages: Document[] = [
                { $match: queryFilter },
                { $sort: effectiveSort as Document },
            ];
            if (extra.skip) stages.push({ $skip: extra.skip });
            stages.push({ $limit: fetchLimit });
            stages.push(...(options.pipeline as Document[]));
            const aggOpts: Record<string, unknown> = {};
            if (driverOpts.maxTimeMS !== undefined) aggOpts.maxTimeMS = driverOpts.maxTimeMS;
            if (driverOpts.hint !== undefined) aggOpts.hint = driverOpts.hint;
            if (driverOpts.collation !== undefined) aggOpts.collation = driverOpts.collation;
            rows = await collection
                .aggregate(stages, aggOpts as Parameters<Collection<TSchema>['aggregate']>[1])
                .toArray() as TSchema[];
        } else {
            rows = await collection
                .find(queryFilter as Parameters<Collection<TSchema>['find']>[0], {
                    ...driverOpts,
                    sort: effectiveSort,
                    limit: fetchLimit,
                    ...(extra.skip ? { skip: extra.skip } : {}),
                } as Parameters<Collection<TSchema>['find']>[1])
                .toArray() as TSchema[];
        }

        const hasMore = rows.length > limit;
        return { items: hasMore ? rows.slice(0, limit) : rows, hasMore };
    };

    /** Build the pageInfo block from a fetched result set. */
    const buildPageInfo = (
        items: TSchema[],
        hasMore: boolean,
        extra: { hasPrev?: boolean; currentPage?: number } = {},
    ) => {
        const first = items[0] ?? null;
        const last = items[items.length - 1] ?? null;
        const enc = (item: TSchema | null) =>
            item
                ? encodeCursor(
                    Object.keys(sort).map((f) => (item as Record<string, unknown>)[f]),
                    cursorSecret,
                )
                : null;
        return {
            hasNext: hasMore,
            hasPrev: extra.hasPrev ?? false,
            startCursor: enc(first),
            endCursor: enc(last),
            ...(extra.currentPage !== undefined ? { currentPage: extra.currentPage } : {}),
        };
    };

    // ── Stream mode: return a Node.js Readable directly ─────────────────────────
    if (options.stream === true) {
        const direction = options.before ? 'before' : 'after';
        const { queryFilter, effectiveSort } = buildPageQuery(options.after ?? options.before, direction);
        return collection
            .find(queryFilter as Parameters<Collection<TSchema>['find']>[0], {
                ...driverOpts,
                sort: effectiveSort,
                limit: limit + 1,
            } as Parameters<Collection<TSchema>['find']>[1])
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            .stream() as any;
    }

    // ── Explain mode: return raw MongoDB explain document ───────────────────────
    if (options.explain !== undefined && options.explain !== false) {
        const verbosity = typeof options.explain === 'string' ? options.explain : 'queryPlanner';
        const offsetJumpOpts2 = ext.offsetJump as { enable?: boolean } | undefined;
        let explainQueryFilter: Document;
        const explainExtra: Record<string, unknown> = {};

        if (options.after || options.before) {
            const dir = options.after ? 'after' : 'before';
            explainQueryFilter = buildPageQuery(options.after ?? options.before, dir).queryFilter as Document;
        } else if (offsetJumpOpts2?.enable && page > 1) {
            explainQueryFilter = baseQuery;
            explainExtra.skip = (page - 1) * limit;
        } else {
            explainQueryFilter = baseQuery;
        }

        return collection
            .find(explainQueryFilter as Parameters<Collection<TSchema>['find']>[0], {
                ...driverOpts,
                ...explainExtra,
                sort,
                limit,
            } as Parameters<Collection<TSchema>['find']>[1])
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            .explain(verbosity) as any;
    }

    // ── offsetJump mode: skip-based pagination ───────────────────────────────────
    const offsetJumpOpts = ext.offsetJump as { enable?: boolean; maxSkip?: number } | undefined;
    if (offsetJumpOpts?.enable) {
        const skipCount = page > 1 ? (page - 1) * limit : 0;
        const { queryFilter, effectiveSort } = buildPageQuery();
        const { items, hasMore } = await fetchItems(queryFilter as Document, effectiveSort, { skip: skipCount });
        const result: FindPageResult<TSchema> = {
            items,
            pageInfo: buildPageInfo(items, hasMore, { hasPrev: page > 1, currentPage: page }),
        };
        if (options.totals && (options.totals as TotalsOptions).mode !== 'none') {
            result.totals = await computeTotals(collection, baseQuery, limit, options.totals as TotalsOptions);
        }
        return result;
    }

    // ── After/Before cursor mode──────────────────────────────────────────────────
    if (options.after || options.before) {
        const direction = options.after ? 'after' : 'before';
        const { queryFilter, effectiveSort } = buildPageQuery(options.after ?? options.before, direction);
        const { items: rawItems, hasMore } = await fetchItems(queryFilter as Document, effectiveSort);
        const items = direction === 'before' ? [...rawItems].reverse() : rawItems;
        const first = items[0] ?? null;
        const last = items[items.length - 1] ?? null;
        const enc = (item: TSchema | null) =>
            item ? encodeCursor(Object.keys(sort).map((f) => (item as Record<string, unknown>)[f]), cursorSecret) : null;
        return {
            items,
            pageInfo: {
                hasNext: direction === 'before' ? Boolean(options.before) : hasMore,
                hasPrev: direction === 'before' ? hasMore : Boolean(options.after),
                startCursor: enc(first),
                endCursor: enc(last),
            },
        };
    }

    // ── Page navigation: cursor-walking ──────────────────────────────────────────
    const { queryFilter: q0, effectiveSort: es0 } = buildPageQuery();
    let { items, hasMore } = await fetchItems(q0 as Document, es0);

    if (page === 1) {
        const result: FindPageResult<TSchema> = {
            items,
            pageInfo: buildPageInfo(items, hasMore, { currentPage: 1 }),
        };
        if (options.totals && (options.totals as TotalsOptions).mode !== 'none') {
            result.totals = await computeTotals(collection, baseQuery, limit, options.totals as TotalsOptions);
        }
        return result;
    }

    for (let cp = 2; cp <= page; cp++) {
        const lastItem = items[items.length - 1];
        if (!lastItem) {
            return {
                items,
                pageInfo: buildPageInfo(items, false, { hasPrev: cp > 2, currentPage: cp - 1 }),
            };
        }
        const endCursor = encodeCursor(
            Object.keys(sort).map((f) => (lastItem as Record<string, unknown>)[f]),
            cursorSecret,
        );
        const { queryFilter: qN, effectiveSort: esN } = buildPageQuery(endCursor, 'after');
        const next = await fetchItems(qN as Document, esN);
        items = next.items;
        hasMore = next.hasMore;
    }

    const result: FindPageResult<TSchema> = {
        items,
        pageInfo: buildPageInfo(items, hasMore, { hasPrev: page > 1, currentPage: page }),
    };
    if (options.totals && (options.totals as TotalsOptions).mode !== 'none') {
        result.totals = await computeTotals(collection, baseQuery, limit, options.totals as TotalsOptions);
    }
    return result;
}

/**
 * Chainable wrapper around MongoDB `find()`.
 * Supports `sort`, `skip`, `limit`, `project`, `hint`, `timeout`,
 * `stream()`, `explain()` and thenable/async-iterable protocols.
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
    options?: Parameters<Collection<TSchema>['countDocuments']>[1] & { explain?: boolean | string; comment?: string; hint?: unknown; collation?: unknown; skip?: number; limit?: number; },
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
 * Finds a single document by its `_id` field.
 * Accepts string, ObjectId, or any value convertible to ObjectId.
 * @param collection - Target MongoDB collection.
 * @param id - Document identifier.
 * @param options - Native driver `findOne` options.
 * @returns The matching document, or `null` when not found.
 * @since v1.0.0
 */
export async function findOneByIdDocument<TSchema extends Document = Document>(
    collection: Collection<TSchema>,
    id: unknown,
    options?: Parameters<Collection<TSchema>['findOne']>[1],
): Promise<TSchema | null> {
    const objectId = parseRequiredObjectId(id);
    const rawOptions = (options ?? {}) as Record<string, unknown>;
    const normalizedOptions: Record<string, unknown> = {};
    const projection = normalizeProjection(rawOptions.projection as string[] | Record<string, unknown> | null | undefined);
    if (projection) normalizedOptions.projection = projection;
    if (rawOptions.maxTimeMS !== undefined) normalizedOptions.maxTimeMS = rawOptions.maxTimeMS;
    if (rawOptions.comment !== undefined) normalizedOptions.comment = rawOptions.comment;
    return findOneDocument(
        collection,
        { _id: objectId } as Parameters<Collection<TSchema>['findOne']>[0],
        normalizedOptions as Parameters<Collection<TSchema>['findOne']>[1],
    ) as unknown as Promise<TSchema | null>;
}

/**
 * Finds multiple documents by their `_id` values.
 * @param collection - Target MongoDB collection.
 * @param ids - Array of document identifiers.
 * @param options - Native driver `find` options.
 * @param defaults - Runtime-level defaults.
 * @returns Array of matching documents (order not guaranteed).
 * @since v1.0.0
 */
export async function findByIdsDocuments<TSchema extends Document = Document>(
    collection: Collection<TSchema>,
    ids: unknown[],
    options?: Parameters<Collection<TSchema>['find']>[1],
    defaults: RuntimeDefaults = {},
): Promise<TSchema[]> {
    if (!Array.isArray(ids)) {
        throw createError(
            ErrorCodes.INVALID_ARGUMENT,
            'ids 必须是数组',
            [{ field: 'ids', type: 'type', message: 'ids must be an array', received: typeof ids }],
        );
    }

    if (ids.length === 0) {
        return [];
    }

    const objectIds: ObjectId[] = [];
    const invalidIds: Array<{ index: number; value: unknown; }> = [];

    for (const [index, id] of ids.entries()) {
        if (id instanceof ObjectId) {
            objectIds.push(id);
            continue;
        }

        if (typeof id === 'string' && isHexObjectIdString(id)) {
            objectIds.push(new ObjectId(id));
            continue;
        }

        if (id && typeof id === 'object' && typeof (id as { toHexString?: () => string; }).toHexString === 'function') {
            const hex = (id as { toHexString: () => string; }).toHexString();
            if (isHexObjectIdString(hex)) {
                objectIds.push(new ObjectId(hex));
                continue;
            }
        }

        invalidIds.push({ index, value: id });
    }

    if (invalidIds.length > 0) {
        throw createError(
            ErrorCodes.INVALID_ARGUMENT,
            `ids 数组包含 ${invalidIds.length} 个无效 ID`,
            invalidIds.map((item) => ({
                field: `ids[${item.index}]`,
                type: 'format',
                message: 'invalid ID',
                received: item.value,
            })),
        );
    }

    const uniqueIds = [...new Set(objectIds.map((item) => item.toString()))].map((item) => new ObjectId(item));
    const rawOptions = (options ?? {}) as Record<string, unknown>;
    const driverOptions: Record<string, unknown> = {};
    const projection = normalizeProjection(rawOptions.projection as string[] | Record<string, unknown> | null | undefined);
    if (projection) driverOptions.projection = projection;
    if (rawOptions.sort !== undefined) driverOptions.sort = rawOptions.sort;
    if (rawOptions.comment !== undefined) driverOptions.comment = rawOptions.comment;
    if (rawOptions.maxTimeMS !== undefined) {
        driverOptions.maxTimeMS = rawOptions.maxTimeMS;
    } else if (defaults.maxTimeMS !== undefined) {
        driverOptions.maxTimeMS = defaults.maxTimeMS;
    }

    const results = await collection.find({
        _id: { $in: uniqueIds },
    } as Parameters<Collection<TSchema>['find']>[0], driverOptions as Parameters<Collection<TSchema>['find']>[1]).toArray() as TSchema[];

    if (rawOptions.preserveOrder === true) {
        const resultMap = new Map<string, TSchema>();
        for (const doc of results) {
            const docId = (doc as Record<string, unknown>)._id;
            if (docId instanceof ObjectId) {
                resultMap.set(docId.toString(), doc);
            } else if (docId !== undefined && docId !== null) {
                resultMap.set(String(docId), doc);
            }
        }
        return objectIds.map((item) => resultMap.get(item.toString())).filter((item): item is TSchema => item !== undefined);
    }

    return results;
}

/**
 * Returns all documents matching `query` together with the total count.
 * Unlike {@link createFindChain}, no `findLimit` is applied.
 * @param collection - Target MongoDB collection.
 * @param query - Filter predicate (default: `{}`).
 * @param options - Native driver `find` options.
 * @param defaults - Runtime-level defaults.
 * @returns `{ data, total }` — all matching documents and the total count.
 * @since v1.0.0
 */
export async function findAndCountDocuments<TSchema extends Document = Document>(
    collection: Collection<TSchema>,
    query?: Parameters<Collection<TSchema>['find']>[0],
    options?: Parameters<Collection<TSchema>['find']>[1],
    defaults?: RuntimeDefaults,
): Promise<FindAndCountResult<TSchema>> {
    // v1 compat: null query is treated as {} (match all)
    const normalizedQuery = (query == null ? {} : query) as Parameters<Collection<TSchema>['find']>[0];
    // findAndCount returns ALL matching documents; findLimit does NOT apply here.
    const countDefaults: RuntimeDefaults = defaults ? { ...defaults, findLimit: undefined } : {};
    const [data, total] = await Promise.all([
        createFindChain(collection, normalizedQuery, options, countDefaults).toArray(),
        collection.countDocuments(normalizedQuery as Parameters<Collection<TSchema>['countDocuments']>[0]),
    ]);

    return { data, total };
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

/**
 * Simplified pagination query.
 * @since v1.3.0
 */
export async function findPageDocuments<TSchema extends Document = Document>(
    collection: Collection<TSchema>,
    options: FindPageOptions<TSchema> = {},
    defaults?: RuntimeDefaults,
): Promise<FindPageResult<TSchema>> {
    return executeFindPage(collection, options, defaults ?? {});
}

function normalizePositiveInteger(value: number | undefined, fallback: number, field: string): number {
    if (value === undefined || value === null) {
        return fallback;
    }

    if (!Number.isInteger(value) || value <= 0) {
        throw createError(ErrorCodes.INVALID_PAGINATION, `${field} must be a positive integer.`);
    }

    return value;
}
