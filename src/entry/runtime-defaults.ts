/**
 * Runtime public defaults builder.
 *
 * Merges the scattered optional parameters from `MonSQLizeOptions` into a single
 * immutable public defaults object, giving all capability layers (query, slow-log,
 * auto-convert, etc.) a unified source of truth and eliminating repeated
 * `options.X ?? defaultValue` compatibility logic throughout.
 */

import type { MonSQLizeOptions } from '../../types/monsqlize';

/**
 * Deep-merge two objects: non-undefined values from `patch` override the corresponding fields in `base`.
 * Nested objects are merged recursively without mutating the original `base` reference.
 */
function deepMerge(base: Record<string, unknown>, patch: Record<string, unknown>): Record<string, unknown> {
    const output: Record<string, unknown> = { ...base };
    for (const key of Object.keys(patch || {})) {
        const value = patch[key];
        if (value && typeof value === 'object' && !Array.isArray(value)) {
            output[key] = deepMerge((base[key] as Record<string, unknown>) || {}, value as Record<string, unknown>);
        } else if (value !== undefined) {
            output[key] = value;
        }
    }
    return output;
}

/**
 * Build a frozen public defaults object from `MonSQLizeOptions`.
 *
 * Built-in defaults (maxTimeMS: 2000 / findLimit: 500 / slowQueryMs: 500, etc.)
 * are overridden by the corresponding options fields (undefined preserves the built-in value).
 */
export function buildPublicDefaults(options: MonSQLizeOptions): Readonly<Record<string, unknown>> {
    return Object.freeze(deepMerge({
        maxTimeMS: 2000,
        findLimit: 500,
        findMaxLimit: 10000,
        findMaxSkip: 50000,
        slowQueryMs: 500,
        namespace: { scope: 'database' },
        findPageMaxLimit: 500,
        cursorSecret: undefined,
        log: { slowQueryTag: { event: 'slow_query', code: 'SLOW_QUERY' } },
    }, {
        maxTimeMS: options.maxTimeMS,
        findLimit: options.findLimit,
        findMaxLimit: options.findMaxLimit,
        findMaxSkip: options.findMaxSkip,
        findPageMaxLimit: options.findPageMaxLimit,
        slowQueryMs: options.slowQueryMs,
        namespace: options.namespace,
        cursorSecret: options.cursorSecret,
        requireCursorSecret: options.requireCursorSecret,
        cursorTypes: options.cursorTypes,
        autoConvertObjectId: options.autoConvertObjectId,
        log: options.log as Record<string, unknown> | undefined,
        slowQueryLog: options.slowQueryLog,
        cacheAutoInvalidate: options.cacheAutoInvalidate,
    } as Record<string, unknown>));
}

export function shouldWarnUnsignedCursorSecret(options: MonSQLizeOptions): boolean {
    const warning = options.cursorSecretWarning ?? 'production';
    return !options.cursorSecret
        && (warning === 'always' || (warning === 'production' && process.env.NODE_ENV === 'production'));
}
