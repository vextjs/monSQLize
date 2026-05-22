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
 */
export function validateRange(value: unknown, min: number, max: number, name: string): number {
    if (typeof value !== 'number' || isNaN(value as number)) {
        throw createError(ErrorCodes.INVALID_ARGUMENT, `${name} must be a valid number`);
    }
    if (!isFinite(value)) {
        throw createError(ErrorCodes.INVALID_ARGUMENT, `${name} must be a finite number`);
    }
    if ((value as number) < min || (value as number) > max) {
        throw createError(
            ErrorCodes.INVALID_ARGUMENT,
            `${name} must be between ${min} and ${max}, current value: ${value}`,
        );
    }
    return value;
}

/**
 * Validate that a value is a positive integer (>= 1).
 * Throws INVALID_ARGUMENT if not.
 */
export function validatePositiveInteger(value: unknown, name: string): number {
    if (!Number.isInteger(value) || (value as number) <= 0) {
        throw createError(ErrorCodes.INVALID_ARGUMENT, `${name} must be a positive integer, current value: ${value}`);
    }
    return value as number;
}
