/**
 * v1-compatible parameter normalization utilities.
 *
 * Matches monSQLize-v1/lib/common/normalize.js exactly so that the v1
 * compatibility runner can redirect `require('.../lib/common/normalize')` to
 * the compiled TS output and tests pass unmodified.
 */

/**
 * Normalize a projection parameter.
 * Array inputs are converted to `{ field: 1 }` objects.
 * Object inputs are returned as-is.
 * All other inputs return undefined.
 */
export function normalizeProjection(
    p: string[] | Record<string, unknown> | null | undefined,
): Record<string, unknown> | undefined {
    if (!p) return undefined;
    if (Array.isArray(p)) {
        const obj: Record<string, 1> = {};
        for (const k of p) {
            if (typeof k === 'string') obj[k] = 1;
        }
        return Object.keys(obj).length ? obj : undefined;
    }
    return p && typeof p === 'object' ? p : undefined;
}

/**
 * Normalize a sort parameter.
 * Returns the sort as-is if it is an object; otherwise returns undefined.
 */
export function normalizeSort(
    s: Record<string, 1 | -1> | null | undefined,
): Record<string, 1 | -1> | undefined {
    return s && typeof s === 'object' ? s : undefined;
}
