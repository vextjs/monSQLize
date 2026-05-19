/**
 * model-utils.ts
 *
 * Pure utility functions for the model layer (no side effects, no external dependencies).
 * Shared by ModelInstance, populate path resolution, and other internals to avoid duplication.
 */

/**
 * Generate a stable string key for any value, used for Map grouping and deduplication.
 * Prefers ObjectId's toHexString(), then toString(), then String().
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
 * Deduplicate an array using toKey for identity comparison, preserving first occurrences.
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
 * Group values by keySelector, returning a Map<key, items[]>.
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
 * Read a nested field by dot-separated path (e.g. "a.b.c").
 * Returns undefined if the path does not exist.
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
 * Project a document to the given select field list; alwaysInclude fields (e.g. foreignField) are always kept.
 * The _id field is always retained.
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
 * Sort a document array by the given sort spec (does not mutate the original array).
 * Sort format: `{ field: 1 | -1 }`; dot-path notation is supported.
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
 * Convert a hydrated document (which may have non-enumerable virtual/method properties)
 * to a plain data object. Strips all function-valued fields; used by toObject() / toJSON() / save().
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
