import type { MonSQLizeOptions } from '../../types/monsqlize';

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

export function buildPublicDefaults(options: MonSQLizeOptions): Readonly<Record<string, unknown>> {
    return Object.freeze(deepMerge({
        maxTimeMS: 2000,
        findLimit: 10,
        slowQueryMs: 500,
        namespace: { scope: 'database' },
        findPageMaxLimit: 500,
        cursorSecret: undefined,
        log: { slowQueryTag: { event: 'slow_query', code: 'SLOW_QUERY' } },
    }, {
        maxTimeMS: options.maxTimeMS,
        findLimit: options.findLimit,
        findPageMaxLimit: options.findPageMaxLimit,
        slowQueryMs: options.slowQueryMs,
        namespace: options.namespace,
        cursorSecret: options.cursorSecret,
        autoConvertObjectId: options.autoConvertObjectId,
        log: options.log as Record<string, unknown> | undefined,
        slowQueryLog: options.slowQueryLog,
        cacheAutoInvalidate: options.cacheAutoInvalidate,
    } as Record<string, unknown>));
}
