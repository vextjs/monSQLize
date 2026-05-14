/**
 * v1-compatible page result builder.
 *
 * Matches monSQLize-v1/lib/common/page-result.js exactly so that the v1
 * compatibility runner can redirect `require('.../lib/common/page-result')` to
 * the compiled TS output and tests pass unmodified.
 */

import { encodeCursor } from './cursor';

/** Context object passed to {@link makePageResult} to construct cursor-based page results. */
export interface PageResultContext {
    limit: number;
    stableSort: Record<string, 1 | -1>;
    direction: 'after' | 'before' | null;
    hasCursor: boolean;
    pickAnchor: (doc: unknown, sort: Record<string, 1 | -1>) => Record<string, unknown>;
}

/** Pagination metadata included in every {@link PageResult}. */
export interface PageInfo {
    hasNext: boolean;
    hasPrev: boolean;
    startCursor: string | null;
    endCursor: string | null;
}

/** v1-compatible page result returned by cursor-based `findPage()`. */
export interface PageResult {
    items: unknown[];
    pageInfo: PageInfo;
}

/**
 * Build a v1-compatible page result from a raw rows array.
 * Uses limit+1 probe pattern: if rows.length > limit there are more pages.
 */
export function makePageResult(rows: unknown[], ctx: PageResultContext): PageResult {
    const { limit, stableSort, direction, hasCursor, pickAnchor } = ctx;
    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;

    const first = items[0] ?? null;
    const last = items[items.length - 1] ?? null;

    const makeCur = (doc: unknown): string =>
        encodeCursor({ v: 1, s: stableSort, a: pickAnchor(doc, stableSort) });

    return {
        items,
        pageInfo: {
            hasNext: direction === 'before' ? Boolean(hasCursor) : hasMore,
            hasPrev: direction === 'before' ? hasMore : Boolean(hasCursor),
            startCursor: first != null ? makeCur(first) : null,
            endCursor: last != null ? makeCur(last) : null,
        },
    };
}
