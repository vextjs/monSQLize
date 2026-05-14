/**
 * v1-compatible validation utilities.
 *
 * Matches monSQLize-v1/lib/common/validation.js exactly so that the v1
 * compatibility runner can redirect `require('.../lib/common/validation')` to
 * the compiled TS output and tests pass unmodified.
 */

import { ErrorCodes, createError } from '../core/errors';

/**
 * Validate that a numeric value falls within [min, max] (inclusive).
 * Throws INVALID_ARGUMENT if out of range.
 *
 * NOTE: Error messages are intentionally in Chinese — v1 compatibility tests
 * assert on these exact strings and must not be changed.
 */
export function validateRange(value: unknown, min: number, max: number, name: string): number {
    if (typeof value !== 'number' || isNaN(value as number)) {
        throw createError(ErrorCodes.INVALID_ARGUMENT, `${name} 必须是一个有效的数字`);
    }
    if (!isFinite(value)) {
        throw createError(ErrorCodes.INVALID_ARGUMENT, `${name} 必须是有限数字`);
    }
    if ((value as number) < min || (value as number) > max) {
        throw createError(
            ErrorCodes.INVALID_ARGUMENT,
            `${name} 必须在 ${min} 到 ${max} 之间，当前值: ${value}`,
        );
    }
    return value;
}

/**
 * Validate that a value is a positive integer (>= 1).
 * Throws INVALID_ARGUMENT if not.
 *
 * NOTE: Error message is intentionally in Chinese — v1 compatibility tests
 * assert on this exact string and must not be changed.
 */
export function validatePositiveInteger(value: unknown, name: string): number {
    if (!Number.isInteger(value) || (value as number) <= 0) {
        throw createError(ErrorCodes.INVALID_ARGUMENT, `${name} 必须是正整数，当前值: ${value}`);
    }
    return value as number;
}
