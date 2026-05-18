/**
 * runtime 公开默认值构建工具。
 *
 * 将 `MonSQLizeOptions` 中分散的可选参数合并为一个不可变的公开默认值对象，
 * 供 runtime 内部的各能力层（查询、慢日志、自动转换等）统一读取，
 * 避免各处重复编写 `options.X ?? defaultValue` 的兼容逻辑。
 */

import type { MonSQLizeOptions } from '../../types/monsqlize';

/**
 * 深度合并两个对象，patch 的非 undefined 值会覆盖 base 中对应字段。
 * 对于嵌套对象执行递归合并，不影响 base 原始引用。
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
 * 根据 `MonSQLizeOptions` 构建冻结的公开默认值对象。
 *
 * 内置默认值（maxTimeMS: 2000 / findLimit: 10 / slowQueryMs: 500 等）
 * 会被 options 中的对应字段覆盖（undefined 时保留内置值）。
 */
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
