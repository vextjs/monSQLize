/**
 * ObjectId auto-conversion utility — ported from v1 compat layer.
 * Automatically converts 24-char hex strings in whitelist fields to ObjectId.
 * Ported from monSQLize-v1/lib/utils/objectid-converter.js
 */

import { ObjectId } from 'mongodb';

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

/**
 * Recursively convert ObjectId strings in whitelist fields within an object.
 * Returns the original object when no conversion occurs (no cloning).
 */
export function convertObjectIdStrings(
    obj: unknown,
    fieldPath = '',
    depth = 0,
    visited: WeakSet<object> = new WeakSet(),
): unknown {
    const MAX_DEPTH = 10;

    if (depth > MAX_DEPTH) return obj;
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
        if (isValidObjectIdString(obj)) {
            try { return new ObjectId(obj); } catch { return obj; }
        }
        return obj;
    }

    // Array
    if (Array.isArray(obj)) {
        let changed = false;
        const converted = (obj as unknown[]).map((item, i) => {
            const newItem = convertObjectIdStrings(item, `${fieldPath}[${i}]`, depth + 1, visited);
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
                shouldConvertField(key) &&
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
                const newValue = convertObjectIdStrings(value, currentPath, depth + 1, visited);
                if (newValue !== value) changed = true;
                converted[key] = newValue;
            }
        }

        return changed ? converted : obj;
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
): unknown {
    if (!update || typeof update !== 'object' || Array.isArray(update)) return update;

    const ops = update as Record<string, unknown>;
    let changed = false;
    const converted: Record<string, unknown> = {};

    const CONVERT_OPS = new Set(['$set', '$setOnInsert', '$push', '$addToSet', '$pull']);

    for (const [op, value] of Object.entries(ops)) {
        if (CONVERT_OPS.has(op)) {
            const newVal = convertObjectIdStrings(value, `update.${op}`);
            if (newVal !== value) changed = true;
            converted[op] = newVal;
        } else {
            converted[op] = value;
        }
    }

    return changed ? converted : update;
}
