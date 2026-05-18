import { Collection, Document, FindOptions } from 'mongodb';
import { createError, ErrorCodes } from '../../../core/errors';
import type {
    BatchWriteOptions,
    DeleteBatchResult,
    InsertBatchResult,
    UpdateBatchOptions,
    UpdateBatchResult,
} from '../../../../types/collection';
import { sleep, splitIntoBatches } from './write-utils';

export async function insertBatchDocuments<TSchema extends Document = Document>(
    collection: Collection<TSchema>,
    documents: TSchema[],
    options: BatchWriteOptions & Parameters<Collection<TSchema>['insertMany']>[1] = {},
): Promise<InsertBatchResult> {
    if (!Array.isArray(documents)) {
        throw createError(ErrorCodes.INVALID_ARGUMENT, 'documents 必须是数组类型');
    }
    if (documents.length === 0) {
        throw createError(ErrorCodes.INVALID_ARGUMENT, 'documents 数组不能为空');
    }

    const rawOptions = options as BatchWriteOptions & Parameters<Collection<TSchema>['insertMany']>[1] & {
        concurrency?: number;
        onError?: 'stop' | 'skip' | 'collect' | 'retry';
        retryAttempts?: number;
        retryDelay?: number;
        onProgress?: (progress: Record<string, unknown>) => void;
        onRetry?: (retryInfo: Record<string, unknown>) => void;
    };
    const {
        batchSize = 1000,
        ordered = false,
        concurrency,
        onError = 'stop',
        retryAttempts = 0,
        retryDelay = 0,
        onProgress,
        onRetry,
        ...driverOptions
    } = rawOptions;

    if (concurrency !== undefined && (!Number.isInteger(concurrency) || concurrency < 0)) {
        throw createError(ErrorCodes.INVALID_ARGUMENT, 'concurrency must be a non-negative integer');
    }
    if (!['stop', 'skip', 'collect', 'retry'].includes(onError)) {
        throw createError(ErrorCodes.INVALID_ARGUMENT, 'onError must be one of: stop/skip/collect/retry');
    }
    if (!Number.isInteger(retryAttempts) || retryAttempts < 0) {
        throw createError(ErrorCodes.INVALID_ARGUMENT, 'retryAttempts must be a non-negative integer');
    }

    const batches = splitIntoBatches(documents, batchSize);
    const result: InsertBatchResult & {
        retries: Array<Record<string, unknown>>;
        errors: Array<Record<string, unknown>>;
    } = {
        acknowledged: true,
        totalCount: documents.length,
        insertedCount: 0,
        batchCount: batches.length,
        errors: [],
        insertedIds: {},
        retries: [],
    };

    let offset = 0;
    for (const [batchIndex, batch] of batches.entries()) {
        let attempts = 0;

        while (true) {
            try {
                const batchResult = await collection.insertMany(batch as unknown as Parameters<Collection<TSchema>['insertMany']>[0], {
                    ...driverOptions,
                    ordered,
                });
                result.insertedCount += batchResult.insertedCount;
                for (const [key, value] of Object.entries(batchResult.insertedIds)) {
                    result.insertedIds[offset + Number.parseInt(key, 10)] = value;
                }
                offset += batch.length;
                onProgress?.({
                    currentBatch: batchIndex + 1,
                    totalBatches: batches.length,
                    inserted: result.insertedCount,
                    total: documents.length,
                    percentage: Math.round((result.insertedCount / documents.length) * 100),
                    retries: result.retries.length,
                });
                break;
            } catch (cause) {
                const errorRecord = {
                    batchIndex,
                    message: cause instanceof Error ? cause.message : String(cause),
                    error: cause,
                    attempts: attempts + 1,
                };

                if (onError === 'retry' && attempts < retryAttempts) {
                    attempts += 1;
                    const retryInfo = {
                        batchIndex,
                        attempt: attempts,
                        maxAttempts: retryAttempts,
                        delay: retryDelay,
                    };
                    result.retries.push(retryInfo);
                    onRetry?.(retryInfo);
                    if (retryDelay > 0) {
                        await sleep(retryDelay);
                    }
                    continue;
                }

                result.errors.push(errorRecord);
                onProgress?.({
                    currentBatch: batchIndex + 1,
                    totalBatches: batches.length,
                    inserted: result.insertedCount,
                    total: documents.length,
                    percentage: Math.round((result.insertedCount / documents.length) * 100),
                    retries: result.retries.length,
                });

                if (onError === 'stop') {
                    throw createError(ErrorCodes.WRITE_ERROR, errorRecord.message, undefined, cause as Error);
                }
                break;
            }
        }
    }

    return result;
}

export async function updateBatchDocuments<TSchema extends Document = Document>(
    collection: Collection<TSchema>,
    filter: Parameters<Collection<TSchema>['find']>[0],
    update: Parameters<Collection<TSchema>['updateMany']>[1],
    options: UpdateBatchOptions & Parameters<Collection<TSchema>['updateMany']>[2] = {},
): Promise<UpdateBatchResult> {
    if (!filter || typeof filter !== 'object' || Array.isArray(filter)) {
        throw createError(ErrorCodes.INVALID_ARGUMENT, 'filter 必须是对象类型');
    }
    if (!update || typeof update !== 'object') {
        throw createError(ErrorCodes.INVALID_ARGUMENT, 'update 必须是对象（更新操作符）或数组（聚合管道）');
    }
    if (!Array.isArray(update)) {
        const keys = Object.keys(update as Record<string, unknown>);
        if (keys.length === 0 || !keys.some((key) => key.startsWith('$'))) {
            throw createError(ErrorCodes.INVALID_ARGUMENT, 'update 必须使用更新操作符（如 $set, $inc 等）');
        }
    }

    const { batchSize = 1000, sort = { _id: 1 }, onProgress, ...driverOptions } = options as UpdateBatchOptions & Parameters<Collection<TSchema>['updateMany']>[2] & {
        onProgress?: (progress: Record<string, unknown>) => void;
    };
    const ids = await collection.find(filter, {
        projection: { _id: 1 },
        sort,
    } as FindOptions).map((document) => document._id).toArray();
    const batches = splitIntoBatches(ids, batchSize);
    const result: UpdateBatchResult = {
        acknowledged: true,
        totalCount: ids.length,
        matchedCount: 0,
        modifiedCount: 0,
        upsertedCount: 0,
        batchCount: batches.length,
        errors: [],
        retries: [],
    };

    for (const [batchIndex, batch] of batches.entries()) {
        try {
            const batchResult = await collection.updateMany(
                { _id: { $in: batch } } as Parameters<Collection<TSchema>['updateMany']>[0],
                update,
                driverOptions,
            );
            result.matchedCount += batchResult.matchedCount;
            result.modifiedCount += batchResult.modifiedCount;
            result.upsertedCount += (batchResult.upsertedCount ?? 0);
            onProgress?.({
                currentBatch: batchIndex + 1,
                totalBatches: batches.length,
                modified: result.modifiedCount,
                matched: result.matchedCount,
                percentage: ids.length === 0 ? 100 : Math.round((result.modifiedCount / ids.length) * 100),
            });
        } catch (cause) {
            result.errors.push({
                batchIndex,
                message: cause instanceof Error ? cause.message : String(cause),
            });
            throw cause;
        }
    }

    return result;
}

export async function deleteBatchDocuments<TSchema extends Document = Document>(
    collection: Collection<TSchema>,
    filter: Parameters<Collection<TSchema>['find']>[0],
    options: UpdateBatchOptions & Parameters<Collection<TSchema>['deleteMany']>[1] = {},
): Promise<DeleteBatchResult> {
    if (!filter || typeof filter !== 'object' || Array.isArray(filter)) {
        throw createError(ErrorCodes.INVALID_ARGUMENT, 'filter 必须是对象类型');
    }

    const rawOptions = options as UpdateBatchOptions & Parameters<Collection<TSchema>['deleteMany']>[1] & {
        estimateProgress?: boolean;
        onProgress?: (progress: Record<string, unknown>) => void;
        onError?: 'stop' | 'skip' | 'collect' | 'retry';
        retryAttempts?: number;
        retryDelay?: number;
        onRetry?: (retryInfo: Record<string, unknown>) => void;
    };
    const {
        batchSize = 1000,
        sort = { _id: 1 },
        estimateProgress = true,
        onProgress,
        onError = 'stop',
        retryAttempts = 0,
        retryDelay = 0,
        onRetry,
        ...driverOptions
    } = rawOptions;
    if (!['stop', 'skip', 'collect', 'retry'].includes(onError)) {
        throw createError(ErrorCodes.INVALID_ARGUMENT, 'onError must be one of: stop/skip/collect/retry');
    }
    if (!Number.isInteger(retryAttempts) || retryAttempts < 0) {
        throw createError(ErrorCodes.INVALID_ARGUMENT, 'retryAttempts must be a non-negative integer');
    }

    const ids = await collection.find(filter, {
        projection: { _id: 1 },
        sort,
    } as FindOptions).map((document) => document._id).toArray();
    const batches = splitIntoBatches(ids, batchSize);
    const result: DeleteBatchResult & {
        retries: Array<Record<string, unknown>>;
        errors: Array<Record<string, unknown>>;
    } = {
        acknowledged: true,
        totalCount: estimateProgress ? ids.length : null,
        deletedCount: 0,
        batchCount: batches.length,
        errors: [],
        retries: [],
    };

    for (const [batchIndex, batch] of batches.entries()) {
        let attempts = 0;
        while (true) {
            try {
                const batchResult = await collection.deleteMany(
                    { _id: { $in: batch } } as Parameters<Collection<TSchema>['deleteMany']>[0],
                    driverOptions,
                );
                result.deletedCount += batchResult.deletedCount;
                onProgress?.({
                    currentBatch: batchIndex + 1,
                    totalBatches: batches.length,
                    deleted: result.deletedCount,
                    percentage: estimateProgress && ids.length > 0 ? Math.round((result.deletedCount / ids.length) * 100) : null,
                });
                break;
            } catch (cause) {
                const errorRecord = {
                    batchIndex,
                    message: cause instanceof Error ? cause.message : String(cause),
                    error: cause,
                    attempts: attempts + 1,
                };
                if (onError === 'retry' && attempts < retryAttempts) {
                    attempts += 1;
                    const retryInfo = {
                        batchIndex,
                        attempt: attempts,
                        maxAttempts: retryAttempts,
                        delay: retryDelay,
                    };
                    result.retries.push(retryInfo);
                    onRetry?.(retryInfo);
                    if (retryDelay > 0) {
                        await sleep(retryDelay);
                    }
                    continue;
                }
                result.errors.push(errorRecord);
                if (onError === 'stop') {
                    throw createError(ErrorCodes.WRITE_ERROR, errorRecord.message, undefined, cause as Error);
                }
                break;
            }
        }
    }

    return result;
}
