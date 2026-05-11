/**
 * P2-C 写入模块。
 *
 * 说明：
 * - 已恢复 `insertOne` / `insertMany` / `updateOne` / `updateMany` / `deleteOne` / `deleteMany` / `replaceOne` / `findOneAnd*` / `upsertOne`，保持 MongoDB 原生返回结构不变。
 * - 本轮继续补齐 `insertBatch` / `updateBatch` / `deleteBatch` / `incrementOne` 的最小 batch extension。
 * - 更完整的 retry / stream / cache invalidation 深层语义仍在后续阶段继续回补。
 */

import { Collection, Document, FindOptions } from 'mongodb';

import { createError, ErrorCodes } from '../../../core/errors';
import type {
    BatchErrorRecord,
    BatchWriteOptions,
    DeleteBatchResult,
    IncrementOneOptions,
    InsertBatchResult,
    UpdateBatchOptions,
    UpdateBatchResult,
} from '../../../../types/collection';

export type {
    BatchErrorRecord,
    BatchWriteOptions,
    DeleteBatchResult,
    IncrementOneOptions,
    InsertBatchResult,
    UpdateBatchOptions,
    UpdateBatchResult,
} from '../../../../types/collection';

/**
 * 将数组按固定大小拆分为批次。
 * @since v1.3.0
 */
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

/**
 * 构建 incrementOne 的最小 `$inc` 更新文档。
 * @since v1.3.0
 */
export function createIncrementUpdate(
    field: string | Record<string, number>,
    increment = 1,
    setPatch?: Record<string, unknown>,
): Record<string, unknown> {
    let incPayload: Record<string, number>;

    if (typeof field === 'string') {
        if (!field.trim()) {
            throw createError(ErrorCodes.INVALID_ARGUMENT, 'incrementOne: field must be a non-empty string.');
        }
        if (typeof increment !== 'number' || Number.isNaN(increment)) {
            throw createError(ErrorCodes.INVALID_ARGUMENT, 'incrementOne: increment must be a valid number.');
        }
        incPayload = { [field]: increment };
    } else if (field && typeof field === 'object' && !Array.isArray(field)) {
        incPayload = {};
        for (const [key, value] of Object.entries(field)) {
            if (typeof value !== 'number' || Number.isNaN(value)) {
                throw createError(ErrorCodes.INVALID_ARGUMENT, `incrementOne: field "${key}" must use a numeric increment.`);
            }
            incPayload[key] = value;
        }
        if (Object.keys(incPayload).length === 0) {
            throw createError(ErrorCodes.INVALID_ARGUMENT, 'incrementOne: field map must not be empty.');
        }
    } else {
        throw createError(ErrorCodes.INVALID_ARGUMENT, 'incrementOne: field must be a string or object.');
    }

    return {
        $inc: incPayload,
        ...(setPatch && Object.keys(setPatch).length > 0 ? { $set: setPatch } : {}),
    };
}

/**
 * 原生单条插入透传。
 * @since v1.3.0
 */
export async function insertOneDocument<TSchema extends Document = Document>(
    collection: Collection<TSchema>,
    ...args: Parameters<Collection<TSchema>['insertOne']>
): ReturnType<Collection<TSchema>['insertOne']> {
    return collection.insertOne(...args);
}

/**
 * 原生批量插入透传。
 * @since v1.3.0
 */
export async function insertManyDocuments<TSchema extends Document = Document>(
    collection: Collection<TSchema>,
    ...args: Parameters<Collection<TSchema>['insertMany']>
): ReturnType<Collection<TSchema>['insertMany']> {
    return collection.insertMany(...args);
}

/**
 * 原生单条更新透传。
 * @since v1.3.0
 */
export async function updateOneDocument<TSchema extends Document = Document>(
    collection: Collection<TSchema>,
    ...args: Parameters<Collection<TSchema>['updateOne']>
): ReturnType<Collection<TSchema>['updateOne']> {
    return collection.updateOne(...args);
}

/**
 * 原生批量更新透传。
 * @since v1.3.0
 */
export async function updateManyDocuments<TSchema extends Document = Document>(
    collection: Collection<TSchema>,
    ...args: Parameters<Collection<TSchema>['updateMany']>
): ReturnType<Collection<TSchema>['updateMany']> {
    return collection.updateMany(...args);
}

/**
 * 原生替换单个文档透传。
 * @since v1.3.0
 */
export async function replaceOneDocument<TSchema extends Document = Document>(
    collection: Collection<TSchema>,
    ...args: Parameters<Collection<TSchema>['replaceOne']>
): ReturnType<Collection<TSchema>['replaceOne']> {
    return collection.replaceOne(...args);
}

/**
 * 原子查找并更新单个文档。
 * @since v1.3.0
 */
export async function findOneAndUpdateDocument<TSchema extends Document = Document>(
    collection: Collection<TSchema>,
    ...args: Parameters<Collection<TSchema>['findOneAndUpdate']>
): ReturnType<Collection<TSchema>['findOneAndUpdate']> {
    return collection.findOneAndUpdate(...args);
}

/**
 * 原子查找并删除单个文档。
 * @since v1.3.0
 */
export async function findOneAndDeleteDocument<TSchema extends Document = Document>(
    collection: Collection<TSchema>,
    ...args: Parameters<Collection<TSchema>['findOneAndDelete']>
): ReturnType<Collection<TSchema>['findOneAndDelete']> {
    return collection.findOneAndDelete(...args);
}

/**
 * 便利 upsert 包装：强制 `upsert = true`。
 * @since v1.3.0
 */
export async function upsertOneDocument<TSchema extends Document = Document>(
    collection: Collection<TSchema>,
    filter: Parameters<Collection<TSchema>['updateOne']>[0],
    update: Parameters<Collection<TSchema>['updateOne']>[1],
    options: NonNullable<Parameters<Collection<TSchema>['updateOne']>[2]> = {},
): ReturnType<Collection<TSchema>['updateOne']> {
    return collection.updateOne(filter, update, {
        ...options,
        upsert: true,
    });
}

/**
 * 原生单条删除透传。
 * @since v1.3.0
 */
export async function deleteOneDocument<TSchema extends Document = Document>(
    collection: Collection<TSchema>,
    ...args: Parameters<Collection<TSchema>['deleteOne']>
): ReturnType<Collection<TSchema>['deleteOne']> {
    return collection.deleteOne(...args);
}

/**
 * 原生批量删除透传。
 * @since v1.3.0
 */
export async function deleteManyDocuments<TSchema extends Document = Document>(
    collection: Collection<TSchema>,
    ...args: Parameters<Collection<TSchema>['deleteMany']>
): ReturnType<Collection<TSchema>['deleteMany']> {
    return collection.deleteMany(...args);
}

/**
 * 分批批量插入文档。
 * @since v1.3.0
 */
export async function insertBatchDocuments<TSchema extends Document = Document>(
    collection: Collection<TSchema>,
    documents: TSchema[],
    options: BatchWriteOptions & Parameters<Collection<TSchema>['insertMany']>[1] = {},
): Promise<InsertBatchResult> {
    if (!Array.isArray(documents) || documents.length === 0) {
        throw createError(ErrorCodes.INVALID_ARGUMENT, 'insertBatch: documents must be a non-empty array.');
    }

    const { batchSize = 1000, ordered = false, ...driverOptions } = options;
    const batches = splitIntoBatches(documents, batchSize);
    const result: InsertBatchResult = {
        acknowledged: true,
        totalCount: documents.length,
        insertedCount: 0,
        batchCount: batches.length,
        errors: [],
        insertedIds: {},
    };

    let offset = 0;
    for (const [batchIndex, batch] of batches.entries()) {
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

/**
 * 分批更新匹配文档。
 * @since v1.3.0
 */
export async function updateBatchDocuments<TSchema extends Document = Document>(
    collection: Collection<TSchema>,
    filter: Parameters<Collection<TSchema>['find']>[0],
    update: Parameters<Collection<TSchema>['updateMany']>[1],
    options: UpdateBatchOptions & Parameters<Collection<TSchema>['updateMany']>[2] = {},
): Promise<UpdateBatchResult> {
    if (!filter || typeof filter !== 'object' || Array.isArray(filter)) {
        throw createError(ErrorCodes.INVALID_ARGUMENT, 'updateBatch: filter must be a non-empty object.');
    }
    if ((!update || typeof update !== 'object') && !Array.isArray(update)) {
        throw createError(ErrorCodes.INVALID_ARGUMENT, 'updateBatch: update must be an object or aggregation pipeline.');
    }

    const { batchSize = 1000, sort = { _id: 1 }, ...driverOptions } = options;
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
        batchCount: batches.length,
        errors: [],
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

/**
 * 分批删除匹配文档。
 * @since v1.3.0
 */
export async function deleteBatchDocuments<TSchema extends Document = Document>(
    collection: Collection<TSchema>,
    filter: Parameters<Collection<TSchema>['find']>[0],
    options: UpdateBatchOptions & Parameters<Collection<TSchema>['deleteMany']>[1] = {},
): Promise<DeleteBatchResult> {
    if (!filter || typeof filter !== 'object' || Array.isArray(filter)) {
        throw createError(ErrorCodes.INVALID_ARGUMENT, 'deleteBatch: filter must be a non-empty object.');
    }

    const { batchSize = 1000, sort = { _id: 1 }, ...driverOptions } = options;
    const ids = await collection.find(filter, {
        projection: { _id: 1 },
        sort,
    } as FindOptions).map((document) => document._id).toArray();
    const batches = splitIntoBatches(ids, batchSize);
    const result: DeleteBatchResult = {
        acknowledged: true,
        totalCount: ids.length,
        deletedCount: 0,
        batchCount: batches.length,
        errors: [],
    };

    for (const [batchIndex, batch] of batches.entries()) {
        try {
            const batchResult = await collection.deleteMany(
                { _id: { $in: batch } } as Parameters<Collection<TSchema>['deleteMany']>[0],
                driverOptions,
            );
            result.deletedCount += batchResult.deletedCount;
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

/**
 * 便利字段递增/递减。
 * @since v1.3.0
 */
export async function incrementOneDocument<TSchema extends Document = Document>(
    collection: Collection<TSchema>,
    filter: Parameters<Collection<TSchema>['findOneAndUpdate']>[0],
    field: string | Record<string, number>,
    incrementOrOptions?: number | IncrementOneOptions,
    maybeOptions?: IncrementOneOptions,
): Promise<TSchema | null> {
    const options = typeof incrementOrOptions === 'number' || incrementOrOptions === undefined
        ? (maybeOptions ?? {})
        : incrementOrOptions;
    const increment = typeof incrementOrOptions === 'number' ? incrementOrOptions : 1;
    const updateDocument = createIncrementUpdate(field, increment, options.$set);
    const { $set, ...driverOptions } = options;
    void $set;

    return collection.findOneAndUpdate(filter, updateDocument as Parameters<Collection<TSchema>['findOneAndUpdate']>[1], {
        ...driverOptions,
        returnDocument: (options.returnDocument ?? 'after') as 'before' | 'after',
    }) as Promise<TSchema | null>;
}

