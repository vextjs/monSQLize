/**
 * ObjectId auto-conversion utility — ported from v1 compat layer.
 * Automatically converts valid 24-character hex string values to ObjectId.
 * Ported from monSQLize-v1/lib/utils/objectid-converter.js
 */

import { ObjectId } from 'mongodb';

type ObjectIdConversionOptions = boolean | {
    enabled?: boolean;
    excludeFields?: string[];
    customFieldPatterns?: string[];
    maxDepth?: number;
    logLevel?: string;
    [field: string]: unknown;
} | Record<string, boolean>;

/** Field whitelist patterns */
const OBJECTID_FIELD_PATTERNS: Array<string | RegExp> = [
    '_id',
    /^.*Id$/,
    /^.*Ids$/,
    /^.*_id$/,
    /^.*_ids$/,
];

/** Special operators that skip conversion */
const SPECIAL_OPERATORS = new Set(['$expr', '$function', '$where', '$accumulator']);

/** Check whether a field name should be converted */
function shouldConvertField(fieldName: string): boolean {
    if (!fieldName || typeof fieldName !== 'string') return false;
    return OBJECTID_FIELD_PATTERNS.some((pattern) => {
        if (typeof pattern === 'string') return fieldName === pattern;
        if (pattern instanceof RegExp) return pattern.test(fieldName);
        return false;
    });
}

/** Check whether a string is a valid ObjectId */
function isValidObjectIdString(str: unknown): str is string {
    if (typeof str !== 'string') return false;
    if (!/^[0-9a-fA-F]{24}$/.test(str)) return false;
    return ObjectId.isValid(str);
}

/** Check whether a value is a MongoDB field reference (starts with $) */
function isFieldReference(value: unknown): boolean {
    if (typeof value !== 'string') return false;
    return value.startsWith('$');
}

function normalizeConversionOptions(options: ObjectIdConversionOptions | undefined): {
    enabled: boolean;
    excludeFields: string[];
    customFieldPatterns: string[];
    maxDepth: number;
    fieldMap: Record<string, boolean>;
} {
    if (options === false) {
        return { enabled: false, excludeFields: [], customFieldPatterns: [], maxDepth: 10, fieldMap: {} };
    }
    if (options === true || options === undefined) {
        return { enabled: true, excludeFields: [], customFieldPatterns: [], maxDepth: 10, fieldMap: {} };
    }
    if (typeof options !== 'object' || options === null) {
        return { enabled: true, excludeFields: [], customFieldPatterns: [], maxDepth: 10, fieldMap: {} };
    }

    const optionRecord = options as Record<string, unknown>;
    const fieldMap: Record<string, boolean> = {};
    for (const [key, value] of Object.entries(optionRecord)) {
        if (typeof value === 'boolean' && !['enabled'].includes(key)) {
            fieldMap[key] = value;
        }
    }

    return {
        enabled: optionRecord.enabled !== false,
        excludeFields: Array.isArray(optionRecord.excludeFields) ? optionRecord.excludeFields.map(String) : [],
        customFieldPatterns: Array.isArray(optionRecord.customFieldPatterns) ? optionRecord.customFieldPatterns.map(String) : [],
        maxDepth: typeof optionRecord.maxDepth === 'number' && optionRecord.maxDepth >= 0 ? optionRecord.maxDepth : 10,
        fieldMap,
    };
}

function stripArrayIndexes(path: string): string {
    return path.replace(/\[\d+\]/g, '');
}

function getLastPathSegment(path: string): string {
    const stripped = stripArrayIndexes(path);
    const parts = stripped.split('.');
    return parts[parts.length - 1] ?? stripped;
}

function matchesFieldPattern(pattern: string, path: string): boolean {
    const stripped = stripArrayIndexes(path);
    const fieldName = getLastPathSegment(path);
    if (pattern === stripped || pattern === fieldName) return true;
    if (!pattern.includes('*')) return false;
    const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\\\*/g, '.*');
    return new RegExp(`^${escaped}$`).test(stripped) || new RegExp(`^${escaped}$`).test(fieldName);
}

function shouldConvertPath(path: string, options: ReturnType<typeof normalizeConversionOptions>): boolean {
    if (!options.enabled) return false;
    const stripped = stripArrayIndexes(path);
    const fieldName = getLastPathSegment(path);
    if (options.fieldMap[stripped] === false || options.fieldMap[fieldName] === false) return false;
    return !options.excludeFields.some((pattern) => matchesFieldPattern(pattern, path));
}

function shouldConvertFieldByOptions(fieldName: string, path: string, options: ReturnType<typeof normalizeConversionOptions>): boolean {
    return shouldConvertField(fieldName) || options.customFieldPatterns.some((pattern) => matchesFieldPattern(pattern, path));
}

/**
 * Recursively convert eligible ObjectId strings within an object.
 * Returns the original object when no conversion occurs (no cloning).
 */
export function convertObjectIdStrings(
    obj: unknown,
    fieldPath = '',
    depth = 0,
    visited: WeakSet<object> = new WeakSet(),
    options?: ObjectIdConversionOptions,
): unknown {
    const conversionOptions = normalizeConversionOptions(options);

    if (depth > conversionOptions.maxDepth) return obj;
    if (obj === null || obj === undefined) return obj;
    if (obj instanceof ObjectId) return obj;

    // Cross-version ObjectId compat (constructor.name === 'ObjectId')
    if (
        obj !== null &&
        typeof obj === 'object' &&
        (obj as Record<string, unknown>).constructor?.name === 'ObjectId'
    ) {
        try {
            const hex = (obj as { toString(): string }).toString();
            if (isValidObjectIdString(hex)) return new ObjectId(hex);
        } catch { /* ignore */ }
        return obj;
    }

    // String: skip field references; convert valid ObjectId strings directly (v1 compat behavior)
    if (typeof obj === 'string') {
        if (isFieldReference(obj)) return obj;
        if (shouldConvertPath(fieldPath, conversionOptions) && isValidObjectIdString(obj)) {
            try { return new ObjectId(obj); } catch { return obj; }
        }
        return obj;
    }

    // Array
    if (Array.isArray(obj)) {
        let changed = false;
        const converted = (obj as unknown[]).map((item, i) => {
            const newItem = convertObjectIdStrings(item, `${fieldPath}[${i}]`, depth + 1, visited, options);
            if (newItem !== item) changed = true;
            return newItem;
        });
        return changed ? converted : obj;
    }

    // Object
    if (typeof obj === 'object') {
        const o = obj as Record<string, unknown>;
        if (visited.has(o)) return obj;
        visited.add(o);

        try {
            let changed = false;
            const converted: Record<string, unknown> = {};

            for (const [key, value] of Object.entries(o)) {
                const currentPath = fieldPath ? `${fieldPath}.${key}` : key;

                // Skip special operators
                if (SPECIAL_OPERATORS.has(key)) {
                    converted[key] = value;
                    continue;
                }

                // Matching field name + valid ObjectId string → convert
                if (
                    typeof value === 'string' &&
                    shouldConvertFieldByOptions(key, currentPath, conversionOptions) &&
                    shouldConvertPath(currentPath, conversionOptions) &&
                    !isFieldReference(value) &&
                    isValidObjectIdString(value)
                ) {
                    try {
                        converted[key] = new ObjectId(value);
                        changed = true;
                    } catch {
                        converted[key] = value;
                    }
                } else {
                    const newValue = convertObjectIdStrings(value, currentPath, depth + 1, visited, options);
                    if (newValue !== value) changed = true;
                    converted[key] = newValue;
                }
            }

            return changed ? converted : obj;
        } finally {
            visited.delete(o);
        }
    }

    return obj;
}

/**
 * Convert ObjectId strings in an update document (legacy operator path).
 * Only converts values under $set / $setOnInsert / $push / $addToSet / $pull.
 * Other operators ($inc / $mul / $unset, etc.) are left unchanged.
 */
export function convertUpdateDocument(
    update: unknown,
    options?: ObjectIdConversionOptions,
): unknown {
    if (!update || typeof update !== 'object' || Array.isArray(update)) return update;

    const ops = update as Record<string, unknown>;
    let changed = false;
    const converted: Record<string, unknown> = {};

    const CONVERT_OPS = new Set(['$set', '$setOnInsert', '$push', '$addToSet', '$pull']);

    for (const [op, value] of Object.entries(ops)) {
        if (CONVERT_OPS.has(op)) {
            const newVal = convertObjectIdStrings(value, `update.${op}`, 0, new WeakSet(), options);
            if (newVal !== value) changed = true;
            converted[op] = newVal;
        } else {
            converted[op] = value;
        }
    }

    return changed ? converted : update;
}
