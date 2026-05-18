/**
 * findPage 执行层。
 *
 * 职责：
 * - 游标分页 / 偏移分页 / After/Before 三种模式的核心逻辑
 * - totals 计算（sync / async / approx 三种模式）
 * - meta 性能追踪
 *
 * 依赖：query-helpers（cursor 编解码、filter 构建）、types/internal/query
 * 不依赖 FindChain / AggregateChain，避免循环引用。
 */

import { Collection, Document } from 'mongodb';

import { MemoryCache } from '../../../capabilities/cache';
import { createError, ErrorCodes } from '../../../core/errors';
import type { RuntimeDefaults, SortShape } from '../../../types/internal/query';
import type {
    FindPageOptions,
    FindPageResult,
    MetaInfo,
    MetaOptions,
    TotalsInfo,
    TotalsOptions,
} from '../../../../types/collection';
import {
    buildCursorFilter,
    buildEffectiveProjection,
    decodeCursor,
    encodeCursor,
    normalizeSortShape,
    reverseSort,
} from './query-helpers';

// ── 内部工具函数 ──────────────────────────────────────────────────────────────

function normalizePositiveInteger(value: number | undefined, fallback: number, field: string): number {
    if (value === undefined || value === null) {
        return fallback;
    }
    if (!Number.isInteger(value) || value <= 0) {
        throw createError(ErrorCodes.INVALID_PAGINATION, `${field} must be a positive integer.`);
    }
    return value;
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

// 异步 totals 结果缓存（按查询指纹索引，统一复用 cache-hub MemoryCache）
const _asyncTotalsCache = new MemoryCache({
    maxEntries: 10_000,
    enableStats: false,
});

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
        const cachedTotal = _asyncTotalsCache.get(cacheKey);
        if (cachedTotal !== undefined) {
            return { mode: 'async', total: cachedTotal as number, token };
        }
        setImmediate(async () => {
            try {
                const n = await coll.countDocuments(
                    query as Parameters<Collection<TSchema>['countDocuments']>[0],
                );
                _asyncTotalsCache.set(cacheKey, n);
            } catch { /* 忽略后台计数错误 */ }
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

    // 未知 mode — 返回最小 stub
    return { mode: mode ?? 'sync' };
}

// ── 核心 findPage 执行函数 ────────────────────────────────────────────────────

/**
 * findPage 核心执行函数（供 findPageDocuments 调用）。
 * 不对外暴露，仅在本层使用。
 */
export async function executeFindPage<TSchema extends Document = Document>(
    collection: Collection<TSchema>,
    options: FindPageOptions<TSchema> = {},
    defaults: RuntimeDefaults = {},
): Promise<FindPageResult<TSchema>> {
    const metaEnabled = options.meta === true || (typeof options.meta === 'object' && options.meta !== null);
    const metaOptions = (options.meta && typeof options.meta === 'object' ? options.meta : {}) as MetaOptions;
    const metaLevel = options.meta === true ? 'op' : (metaOptions.level ?? 'op');
    const metaStartTs = Date.now();
    const metaSteps: NonNullable<MetaInfo['steps']> = [];
    const ext = options as Record<string, unknown>;
    const page = normalizePositiveInteger(options.page, 1, 'page');
    const rawLimit = normalizePositiveInteger(options.limit, 20, 'limit');
    const limit = defaults.findPageMaxLimit !== undefined && rawLimit > defaults.findPageMaxLimit
        ? defaults.findPageMaxLimit
        : rawLimit;
    const sort = normalizeSortShape(options.sort);
    const baseQuery = (options.query ?? {}) as Document;
    const cursorSecret = defaults.cursorSecret;
    const dbName = (collection as Collection<TSchema> & { dbName?: string; namespace?: { db?: string; }; }).dbName
        ?? (collection as Collection<TSchema> & { namespace?: { db?: string; }; }).namespace?.db
        ?? '';
    const collectionName = collection.collectionName ?? '';

    const pushMetaStep = (
        name: string,
        durationMs: number,
        phase: NonNullable<MetaInfo['steps']>[number]['phase'],
        index?: number,
    ): void => {
        if (metaEnabled && metaLevel === 'sub') {
            metaSteps.push({ name, phase, durationMs, ...(index !== undefined ? { index } : {}) });
        }
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let effectiveMaxTimeMS: number | undefined;
    const driverOpts: Record<string, unknown> = { ...(options.options ?? {}) };
    effectiveMaxTimeMS = (ext.maxTimeMS as number | undefined) ?? defaults.maxTimeMS;
    if (effectiveMaxTimeMS !== undefined) driverOpts.maxTimeMS = effectiveMaxTimeMS;
    if (ext.hint !== undefined) driverOpts.hint = ext.hint;
    if (ext.collation !== undefined) driverOpts.collation = ext.collation;
    if (ext.batchSize !== undefined) driverOpts.batchSize = ext.batchSize;
    if (options.projection !== undefined) {
        driverOpts.projection = buildEffectiveProjection(options.projection, sort);
    }

    const finishResult = (result: FindPageResult<TSchema>): FindPageResult<TSchema> => {
        if (!metaEnabled) {
            return result;
        }

        const metaEndTs = Date.now();
        if (metaLevel === 'sub' && metaSteps.length > 0) {
            const stepTotal = metaSteps.reduce((sum, step) => sum + step.durationMs, 0);
            const delta = (metaEndTs - metaStartTs) - stepTotal;
            if (delta > 0) {
                metaSteps.push({ name: 'finalizeResult', phase: 'fetch', durationMs: delta });
            } else if (delta < 0) {
                const lastStep = metaSteps[metaSteps.length - 1];
                lastStep.durationMs = Math.max(0, lastStep.durationMs + delta);
            }
        }
        result.meta = {
            op: 'findPage',
            ns: {
                iid: defaults.namespace?.instanceId ?? 'default',
                type: 'mongodb',
                db: dbName,
                coll: collectionName,
            },
            db: dbName,
            collection: collectionName,
            timestamp: metaStartTs,
            startTs: metaStartTs,
            endTs: metaEndTs,
            durationMs: metaEndTs - metaStartTs,
            ...(typeof effectiveMaxTimeMS === 'number' ? { maxTimeMS: effectiveMaxTimeMS } : {}),
            page,
            after: Boolean(options.after),
            before: Boolean(options.before),
            hops: options.after || options.before ? 1 : Math.max(0, page - 1),
            ...(jumpOpts ? { step: jumpOpts.step } : {}),
            ...(metaLevel === 'sub' ? { steps: metaSteps } : {}),
        };

        return result;
    };

    // ── 校验 ──────────────────────────────────────────────────────────────────
    if ((options.after || options.before) && Number.isInteger(options.page)) {
        throw createError(ErrorCodes.VALIDATION_ERROR, 'page cannot be used with after/before cursor.');
    }

    // ── stream 冲突检查 ───────────────────────────────────────────────────────
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

    // ── 跳跃检查 ──────────────────────────────────────────────────────────────
    const jumpOpts = ext.jump as { step: number; maxHops: number } | undefined;
    if (jumpOpts && page > 1 && (page - 1) > jumpOpts.maxHops) {
        throw createError(ErrorCodes.JUMP_TOO_FAR, 'Page jump exceeds maxHops limit.', [
            { page, maxHops: jumpOpts.maxHops, requestedHops: page - 1 },
        ]);
    }

    // ── 内部闭包（关联 sort / baseQuery / cursorSecret / driverOpts）──────────

    /** 根据游标和方向构建查询 filter 和有效排序 */
    const buildPageQuery = (cursor?: string, direction: 'after' | 'before' = 'after') => {
        const cursorFilter = cursor
            ? buildCursorFilter(sort, decodeCursor(cursor, cursorSecret), direction)
            : undefined;
        const effectiveSort = direction === 'before' ? reverseSort(sort) : sort;
        return { queryFilter: mergeFilters(baseQuery, cursorFilter), effectiveSort };
    };

    /** 获取一页数据；before 方向需要调用方自行翻转 */
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

    const timedFetchItems = async (
        name: string,
        phase: NonNullable<MetaInfo['steps']>[number]['phase'],
        queryFilter: Document,
        effectiveSort: SortShape,
        extra: { skip?: number } = {},
        index?: number,
    ): Promise<{ items: TSchema[]; hasMore: boolean }> => {
        const stepStartTs = Date.now();
        const result = await fetchItems(queryFilter, effectiveSort, extra);
        pushMetaStep(name, Date.now() - stepStartTs, phase, index);
        return result;
    };

    const timedComputeTotals = async (): Promise<TotalsInfo> => {
        const stepStartTs = Date.now();
        const result = await computeTotals(collection, baseQuery, limit, options.totals as TotalsOptions);
        pushMetaStep('computeTotals', Date.now() - stepStartTs, 'totals');
        return result;
    };

    /** 从结果集构建 pageInfo 块 */
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

    // ── Stream 模式：直接返回 Node.js Readable ──────────────────────────────────
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

    // ── Explain 模式：返回 MongoDB 原始 explain 文档 ─────────────────────────
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

    // ── offsetJump 模式：skip-based 分页 ───────────────────────────────────────
    const offsetJumpOpts = ext.offsetJump as { enable?: boolean; maxSkip?: number } | undefined;
    if (offsetJumpOpts?.enable) {
        const skipCount = page > 1 ? (page - 1) * limit : 0;
        const { queryFilter, effectiveSort } = buildPageQuery();
        const { items, hasMore } = await timedFetchItems('offsetFetch', 'offset', queryFilter as Document, effectiveSort, { skip: skipCount });
        const result: FindPageResult<TSchema> = {
            items,
            pageInfo: buildPageInfo(items, hasMore, { hasPrev: page > 1, currentPage: page }),
        };
        if (options.totals && (options.totals as TotalsOptions).mode !== 'none') {
            result.totals = await timedComputeTotals();
        }
        return finishResult(result);
    }

    // ── After/Before 游标模式 ─────────────────────────────────────────────────
    if (options.after || options.before) {
        const direction = options.after ? 'after' : 'before';
        const { queryFilter, effectiveSort } = buildPageQuery(options.after ?? options.before, direction);
        const { items: rawItems, hasMore } = await timedFetchItems('cursorFetch', 'fetch', queryFilter as Document, effectiveSort);
        const items = direction === 'before' ? [...rawItems].reverse() : rawItems;
        const first = items[0] ?? null;
        const last = items[items.length - 1] ?? null;
        const enc = (item: TSchema | null) =>
            item ? encodeCursor(Object.keys(sort).map((f) => (item as Record<string, unknown>)[f]), cursorSecret) : null;
        return finishResult({
            items,
            pageInfo: {
                hasNext: direction === 'before' ? Boolean(options.before) : hasMore,
                hasPrev: direction === 'before' ? hasMore : Boolean(options.after),
                startCursor: enc(first),
                endCursor: enc(last),
            },
        });
    }

    // ── 页面导航：游标步进 ────────────────────────────────────────────────────
    const { queryFilter: q0, effectiveSort: es0 } = buildPageQuery();
    let { items, hasMore } = await timedFetchItems('initialFetch', page > 1 ? 'hop' : 'fetch', q0 as Document, es0, {}, 1);

    if (page === 1) {
        const result: FindPageResult<TSchema> = {
            items,
            pageInfo: buildPageInfo(items, hasMore, { currentPage: 1 }),
        };
        if (options.totals && (options.totals as TotalsOptions).mode !== 'none') {
            result.totals = await timedComputeTotals();
        }
        return finishResult(result);
    }

    for (let cp = 2; cp <= page; cp++) {
        const lastItem = items[items.length - 1];
        if (!lastItem) {
            return finishResult({
                items,
                pageInfo: buildPageInfo(items, false, { hasPrev: cp > 2, currentPage: cp - 1 }),
            });
        }
        const endCursor = encodeCursor(
            Object.keys(sort).map((f) => (lastItem as Record<string, unknown>)[f]),
            cursorSecret,
        );
        const { queryFilter: qN, effectiveSort: esN } = buildPageQuery(endCursor, 'after');
        const next = await timedFetchItems(`hop-${cp}`, 'hop', qN as Document, esN, {}, cp);
        items = next.items;
        hasMore = next.hasMore;
    }

    const result: FindPageResult<TSchema> = {
        items,
        pageInfo: buildPageInfo(items, hasMore, { hasPrev: page > 1, currentPage: page }),
    };
    if (options.totals && (options.totals as TotalsOptions).mode !== 'none') {
        result.totals = await timedComputeTotals();
    }
    return finishResult(result);
}

// ── 公开 API ──────────────────────────────────────────────────────────────────

/**
 * 游标 + 偏移双模式分页查询。
 * @param collection - MongoDB 集合。
 * @param options - 分页参数（limit / page / after / before / sort / query 等）。
 * @param defaults - 运行时默认值。
 * @returns `{ items, pageInfo, totals?, meta? }` — v1 兼容分页结果。
 * @since v1.0.0
 */
export async function findPageDocuments<TSchema extends Document = Document>(
    collection: Collection<TSchema>,
    options: FindPageOptions<TSchema> = {},
    defaults?: RuntimeDefaults,
): Promise<FindPageResult<TSchema>> {
    return executeFindPage(collection, options, defaults ?? {});
}
