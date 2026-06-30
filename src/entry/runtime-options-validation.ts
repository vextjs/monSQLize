/**
 * Runtime option validation helpers.
 */

import type { MonSQLizeOptions } from '../../types/monsqlize';
import { ErrorCodes, createError } from '../core/errors';
import { validateRange } from '../utils/validation';
import { validateWritePathPolicyConfig } from '../capabilities/write-path-policy';

export function validateRuntimeNumericOptions(options: MonSQLizeOptions): void {
    validateWritePathPolicyConfig(options.writePathPolicy);
    if (options.maxTimeMS !== undefined && options.maxTimeMS !== null) {
        validateRange(options.maxTimeMS, 1, 300000, 'maxTimeMS');
    }
    if (options.findLimit !== undefined && options.findLimit !== null) {
        validateRange(options.findLimit, 1, 10000, 'findLimit');
    }
    if (options.findMaxLimit !== undefined && options.findMaxLimit !== null) {
        validateRange(options.findMaxLimit, 1, 100000, 'findMaxLimit');
    }
    if (options.findMaxSkip !== undefined && options.findMaxSkip !== null) {
        validateRange(options.findMaxSkip, 0, 10000000, 'findMaxSkip');
    }
    if (options.findPageMaxLimit !== undefined && options.findPageMaxLimit !== null) {
        validateRange(options.findPageMaxLimit, 1, 10000, 'findPageMaxLimit');
    }
    const effectiveFindLimit = options.findLimit ?? 500;
    if (
        options.findMaxLimit !== undefined
        && options.findMaxLimit !== null
        && effectiveFindLimit > options.findMaxLimit
    ) {
        throw createError(
            ErrorCodes.INVALID_ARGUMENT,
            `findLimit must be less than or equal to findMaxLimit, current values: ${effectiveFindLimit} > ${options.findMaxLimit}`,
        );
    }
}
