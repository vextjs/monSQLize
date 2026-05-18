import { createError, ErrorCodes } from '../../../core/errors';

export function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

export function splitIntoBatches<TItem>(items: TItem[], batchSize: number): TItem[][] {
    if (!Number.isInteger(batchSize) || batchSize <= 0) {
        throw createError(ErrorCodes.INVALID_ARGUMENT, 'batchSize must be a positive integer.');
    }

    const batches: TItem[][] = [];
    for (let index = 0; index < items.length; index += batchSize) {
        batches.push(items.slice(index, index + batchSize));
    }
    return batches;
}

export function createIncrementUpdate(
    field: string | Record<string, number>,
    increment = 1,
    setPatch?: Record<string, unknown>,
): Record<string, unknown> {
    let incPayload: Record<string, number>;

    if (typeof field === 'string') {
        if (!field.trim()) {
            throw createError(ErrorCodes.INVALID_ARGUMENT, 'field 必须是字符串或对象');
        }
        if (typeof increment !== 'number' || Number.isNaN(increment)) {
            throw createError(ErrorCodes.INVALID_ARGUMENT, 'increment 必须是数字');
        }
        incPayload = { [field]: increment };
    } else if (field && typeof field === 'object' && !Array.isArray(field)) {
        incPayload = {};
        for (const [key, value] of Object.entries(field)) {
            if (typeof value !== 'number' || Number.isNaN(value)) {
                throw createError(ErrorCodes.INVALID_ARGUMENT, '增量必须是数字');
            }
            incPayload[key] = value;
        }
        if (Object.keys(incPayload).length === 0) {
            throw createError(ErrorCodes.INVALID_ARGUMENT, 'field 必须是字符串或对象');
        }
    } else {
        throw createError(ErrorCodes.INVALID_ARGUMENT, 'field 必须是字符串或对象');
    }

    return {
        $inc: incPayload,
        ...(setPatch && Object.keys(setPatch).length > 0 ? { $set: setPatch } : {}),
    };
}
