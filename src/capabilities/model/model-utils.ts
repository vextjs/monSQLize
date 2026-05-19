/**
 * model-utils.ts
 *
 * 模型层纯工具函数集合（无副作用，无外部依赖）。
 * 供 ModelInstance、populate 路径等内部逻辑共享，避免重复实现。
 */

/**
 * 对任意值生成稳定字符串 key，用于 Map 分组与去重。
 * 优先使用 ObjectId 的 toHexString()，其次 toString()，最后 String()。
 */
export function toKey(value: unknown): string {
    if (value instanceof Date) {
        return value.toISOString();
    }
    if (typeof value === 'object' && value !== null) {
        const candidate = value as { toHexString?: () => string; toString?: () => string; };
        if (typeof candidate.toHexString === 'function') {
            return candidate.toHexString();
        }
        if (typeof candidate.toString === 'function') {
            return candidate.toString();
        }
    }
    return String(value);
}

/**
 * 去重数组（按 toKey 做唯一性判断），保留首次出现的值。
 */
export function unique(values: unknown[]): unknown[] {
    const map = new Map<string, unknown>();
    for (const value of values) {
        const key = toKey(value);
        if (!map.has(key)) {
            map.set(key, value);
        }
    }
    return [...map.values()];
}

/**
 * 按 keySelector 分组，返回 Map<key, items[]>。
 */
export function groupBy<T>(values: T[], keySelector: (value: T) => unknown): Map<string, T[]> {
    const map = new Map<string, T[]>();
    for (const value of values) {
        const key = toKey(keySelector(value));
        const group = map.get(key);
        if (group) {
            group.push(value);
        } else {
            map.set(key, [value]);
        }
    }
    return map;
}

/**
 * 按点号路径读取嵌套字段（如 "a.b.c"）。
 * 路径不存在时返回 undefined。
 */
export function getByPath(source: Record<string, unknown>, path: string): unknown {
    return path.split('.').reduce<unknown>((current, key) => {
        if (!current || typeof current !== 'object') {
            return undefined;
        }
        return (current as Record<string, unknown>)[key];
    }, source);
}

/**
 * 按 select 字段列表裁剪文档，alwaysInclude 字段强制保留（如 foreignField）。
 * _id 字段始终保留。
 */
export function pickFields(
    document: Record<string, unknown>,
    select: string | string[],
    alwaysInclude: string[] = [],
): Record<string, unknown> {
    const keys = Array.isArray(select) ? select : select.split(/\s+/).filter(Boolean);
    const result: Record<string, unknown> = {};
    for (const key of [...new Set([...keys, ...alwaysInclude])]) {
        if (key in document) {
            result[key] = document[key];
        }
    }
    if ('_id' in document && !('_id' in result)) {
        result._id = document._id;
    }
    return result;
}

/**
 * 对文档数组按 sort 规则排序（不修改原数组）。
 * sort 格式：{ field: 1 | -1 }，支持点号路径。
 */
export function applySort<T extends Record<string, unknown>>(
    values: T[],
    sort: Record<string, 1 | -1>,
): T[] {
    const entries = Object.entries(sort);
    return [...values].sort((left, right) => {
        for (const [field, direction] of entries) {
            const leftValue = getByPath(left, field);
            const rightValue = getByPath(right, field);
            if (leftValue === rightValue) {
                continue;
            }
            if (leftValue == null) return direction;
            if (rightValue == null) return -direction;
            const result = leftValue > rightValue ? 1 : -1;
            return result * direction;
        }
        return 0;
    });
}

/**
 * 将含有 virtual / method 等不可枚举属性的水化文档转为纯数据对象。
 * 过滤掉所有 function 类型字段，用于 toObject() / toJSON() / save() 序列化。
 */
export function serializeDocument(document: Record<string, unknown>): Record<string, unknown> {
    const plain: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(document)) {
        if (typeof value !== 'function') {
            plain[key] = value;
        }
    }
    return plain;
}
