/**
 * 集合访问器单条写操作辅助函数。
 *
 * 为 MongoCollectionAccessor 提供 insertOne、updateOne、deleteOne、
 * replaceOne、findOneAndUpdate 等单条写操作的底层实现。
 */
import type { Collection, Document } from 'mongodb';
import type { Logger } from '../../../core/logger';
import { createError, ErrorCodes } from '../../../core/errors';
import type { RuntimeDefaults } from '../../../types/internal/query';
import { convertUpdateDocument } from '../utils/objectid-converter';
import {
    deleteManyDocuments,
    deleteOneDocument,
    findOneAndDeleteDocument,
    findOneAndReplaceDocument,
    findOneAndUpdateDocument,
    insertManyDocuments,
    insertOneDocument,
    replaceOneDocument,
    upsertOneDocument,
    updateManyDocuments,
    updateOneDocument,
} from '../writes';

export type AccessorWriteContext<TSchema extends Document = Document> = {
    dbName: string;
    collectionName: string;
    collectionRef: Collection<TSchema>;
    defaults?: RuntimeDefaults;
    logger?: Logger;
    cvFilter<T>(value: T): T;
    cvDoc<T>(value: T): T;
    cvUpdate<T>(value: T): T;
    invalidateAll(): Promise<number>;
};

function assertObjectArgument(value: unknown, field: string, message: string, errorCode: string = ErrorCodes.INVALID_ARGUMENT): void {
    if (value === null || value === undefined || typeof value !== 'object' || Array.isArray(value)) {
        throw createError(errorCode, message, [{ field, type: 'object.required', message }]);
    }
}

function assertUpdateDocument(update: unknown): void {
    if (update === null || update === undefined) {
        throw createError(
            ErrorCodes.INVALID_ARGUMENT,
            'update 必须是对象（更新操作符）或数组（聚合管道）',
            [{ field: 'update', type: 'object|array.required', message: 'update 必须是更新操作符对象或聚合管道数组' }],
        );
    }
    if (Array.isArray(update)) {
        if (update.length === 0) {
            throw createError(
                ErrorCodes.INVALID_ARGUMENT,
                'update 聚合管道不能为空数组',
                [{ field: 'update', type: 'array.empty', message: 'aggregation pipeline must contain at least one stage' }],
            );
        }
        for (let index = 0; index < update.length; index++) {
            const stage = update[index];
            if (stage === null || typeof stage !== 'object' || Array.isArray(stage)) {
                throw createError(
                    ErrorCodes.INVALID_ARGUMENT,
                    `update 聚合管道第 ${index + 1} 阶段必须是对象`,
                    [{ field: `update[${index}]`, type: 'object.required', message: 'pipeline stage must be an object' }],
                );
            }
            const stageKeys = Object.keys(stage as object);
            if (stageKeys.length === 0) {
                throw createError(
                    ErrorCodes.INVALID_ARGUMENT,
                    `update 聚合管道第 ${index + 1} 阶段不能为空对象`,
                    [{ field: `update[${index}]`, type: 'object.empty', message: 'pipeline stage must not be empty' }],
                );
            }
            const stageOperator = stageKeys[0];
            if (!stageOperator.startsWith('$')) {
                throw createError(
                    ErrorCodes.INVALID_ARGUMENT,
                    `update pipeline stage ${index + 1} operator must start with $, got "${stageOperator}"`,
                    [{ field: `update[${index}]`, type: 'object.invalidKeys', message: 'pipeline operator must start with $' }],
                );
            }
        }
        return;
    }

    if (typeof update !== 'object') {
        throw createError(
            ErrorCodes.INVALID_ARGUMENT,
            'update 必须是对象（更新操作符）或数组（聚合管道）',
            [{ field: 'update', type: 'object|array.required', message: 'update 必须是更新操作符对象或聚合管道数组' }],
        );
    }

    const keys = Object.keys(update as object);
    if (keys.length === 0) {
        throw createError(
            ErrorCodes.INVALID_ARGUMENT,
            'update 不能为空对象',
            [{ field: 'update', type: 'object.empty', message: 'update must not be empty' }],
        );
    }
    if (!keys.some((key) => key.startsWith('$'))) {
        throw createError(
            ErrorCodes.INVALID_ARGUMENT,
            'update 必须使用更新操作符（如 $set, $inc 等）',
            [{ field: 'update', type: 'object.invalidKeys', message: '请使用 $set, $inc, $push 等更新操作符' }],
        );
    }
}

function assertReplacementDocument(replacement: unknown): void {
    assertObjectArgument(replacement, 'replacement', 'replacement 必须是对象类型');
    if (Object.keys(replacement as Record<string, unknown>).some((key) => key.startsWith('$'))) {
        throw createError(ErrorCodes.INVALID_ARGUMENT, 'replacement 不能包含更新操作符（如 $set, $inc 等）');
    }
}

export async function insertOneForAccessor<TSchema extends Document = Document>(
    context: AccessorWriteContext<TSchema>,
    doc: Parameters<Collection<TSchema>['insertOne']>[0],
    options?: Parameters<Collection<TSchema>['insertOne']>[1],
): ReturnType<Collection<TSchema>['insertOne']> {
    assertObjectArgument(doc, 'document', 'document must be an object', ErrorCodes.DOCUMENT_REQUIRED);

    let result: Awaited<ReturnType<Collection<TSchema>['insertOne']>>;
    const startedAt = Date.now();
    try {
        result = await insertOneDocument(context.collectionRef, context.cvDoc(doc), options);
    } catch (err: unknown) {
        const mongoErr = err as { code?: number; message?: string };
        if (mongoErr?.code === 11000) {
            throw createError(
                ErrorCodes.DUPLICATE_KEY,
                '文档插入失败：违反唯一性约束 (duplicate key)',
                [{ field: '_id', message: mongoErr.message ?? 'duplicate key' }],
                err as Error,
            );
        }
        throw createError(
            ErrorCodes.WRITE_ERROR,
            `insertOne failed: ${mongoErr?.message ?? String(err)}`,
            undefined,
            err as Error,
        );
    }

    const elapsed = Date.now() - startedAt;
    const threshold = context.defaults?.slowQueryMs ?? 500;
    if (elapsed > threshold && context.logger) {
        try {
            context.logger.warn('[insertOne] 慢操作警告', {
                ns: `${context.dbName}.${context.collectionName}`,
                threshold,
                duration: elapsed,
                insertedId: result.insertedId,
                comment: (options as Record<string, unknown>)?.comment,
                op: 'insertOne',
                ts: new Date().toISOString(),
            });
        } catch (_) { /* ignore logging errors */ }
    }

    await context.invalidateAll();
    return result;
}

export async function insertManyForAccessor<TSchema extends Document = Document>(
    context: AccessorWriteContext<TSchema>,
    documents: Parameters<Collection<TSchema>['insertMany']>[0],
    options?: Parameters<Collection<TSchema>['insertMany']>[1],
): ReturnType<Collection<TSchema>['insertMany']> {
    if (!Array.isArray(documents)) {
        throw createError('DOCUMENTS_REQUIRED', 'documents 必须是数组类型');
    }
    if (documents.length === 0) {
        throw createError('DOCUMENTS_REQUIRED', 'documents 数组不能为空');
    }
    if (documents.some((item) => item === null || typeof item !== 'object' || Array.isArray(item))) {
        throw createError('DOCUMENTS_REQUIRED', 'documents 中的所有元素必须是对象类型');
    }

    const startedAt = Date.now();
    let result: Awaited<ReturnType<Collection<TSchema>['insertMany']>>;
    try {
        const convertedDocs = documents.map((document) => context.cvDoc(document)) as typeof documents;
        result = await insertManyDocuments(context.collectionRef, convertedDocs, options);
    } catch (err: unknown) {
        const mongoErr = err as { code?: number; message?: string };
        if (mongoErr?.code === 11000) {
            throw createError(
                ErrorCodes.DUPLICATE_KEY,
                '批量插入失败：违反唯一性约束 (duplicate key)',
                [{ field: '_id', message: mongoErr.message ?? 'duplicate key' }],
                err as Error,
            );
        }
        throw err;
    }

    const elapsed = Date.now() - startedAt;
    const threshold = context.defaults?.slowQueryMs ?? 500;
    if (elapsed >= threshold && context.logger) {
        context.logger.warn('[insertMany] 慢操作警告', {
            ns: `${context.dbName}.${context.collectionName}`,
            threshold,
            duration: elapsed,
            documentCount: documents.length,
            insertedCount: result.insertedCount,
            ordered: (options as Record<string, unknown> | undefined)?.ordered ?? true,
            comment: (options as Record<string, unknown> | undefined)?.comment,
            op: 'insertMany',
        });
    }

    await context.invalidateAll();
    return result;
}

export async function updateOneForAccessor<TSchema extends Document = Document>(
    context: AccessorWriteContext<TSchema>,
    filter: Parameters<Collection<TSchema>['updateOne']>[0],
    update: Parameters<Collection<TSchema>['updateOne']>[1],
    options?: Parameters<Collection<TSchema>['updateOne']>[2],
): ReturnType<Collection<TSchema>['updateOne']> {
    assertObjectArgument(filter, 'filter', 'filter 必须是对象类型');
    assertUpdateDocument(update);

    const normalizedFilter = context.cvFilter(filter);
    const finalUpdate = Array.isArray(update)
        ? update
        : (convertUpdateDocument(update) as typeof update);
    const result = await updateOneDocument(context.collectionRef, normalizedFilter, finalUpdate, options);
    if (result.modifiedCount > 0 || result.upsertedId) {
        await context.invalidateAll();
    }
    return result;
}

export async function updateManyForAccessor<TSchema extends Document = Document>(
    context: AccessorWriteContext<TSchema>,
    filter: Parameters<Collection<TSchema>['updateMany']>[0],
    update: Parameters<Collection<TSchema>['updateMany']>[1],
    options?: Parameters<Collection<TSchema>['updateMany']>[2],
): ReturnType<Collection<TSchema>['updateMany']> {
    assertObjectArgument(filter, 'filter', 'filter 必须是非空对象');
    assertUpdateDocument(update);

    const result = await updateManyDocuments(context.collectionRef, context.cvFilter(filter), context.cvUpdate(update), options);
    if (result.modifiedCount > 0 || result.upsertedId) {
        await context.invalidateAll();
    }
    return result;
}

export async function replaceOneForAccessor<TSchema extends Document = Document>(
    context: AccessorWriteContext<TSchema>,
    filter: Parameters<Collection<TSchema>['replaceOne']>[0],
    replacement: Parameters<Collection<TSchema>['replaceOne']>[1],
    options?: Parameters<Collection<TSchema>['replaceOne']>[2],
): ReturnType<Collection<TSchema>['replaceOne']> {
    assertObjectArgument(filter, 'filter', 'filter 必须是非空对象');
    assertReplacementDocument(replacement);

    const result = await replaceOneDocument(context.collectionRef, context.cvFilter(filter), context.cvDoc(replacement), options);
    await context.invalidateAll();
    return result;
}

export async function findOneAndReplaceForAccessor<TSchema extends Document = Document>(
    context: AccessorWriteContext<TSchema>,
    filter: Parameters<Collection<TSchema>['findOneAndReplace']>[0],
    replacement: Parameters<Collection<TSchema>['findOneAndReplace']>[1],
    options?: unknown,
): ReturnType<Collection<TSchema>['findOneAndReplace']> {
    assertObjectArgument(filter, 'filter', 'filter 必须是非空对象');
    assertReplacementDocument(replacement);

    const result = await findOneAndReplaceDocument(context.collectionRef, context.cvFilter(filter), context.cvDoc(replacement), options);
    if (result) {
        await context.invalidateAll();
    }
    return result;
}

export async function findOneAndUpdateForAccessor<TSchema extends Document = Document>(
    context: AccessorWriteContext<TSchema>,
    filter: Parameters<Collection<TSchema>['findOneAndUpdate']>[0],
    update: Parameters<Collection<TSchema>['findOneAndUpdate']>[1],
    options?: unknown,
): ReturnType<Collection<TSchema>['findOneAndUpdate']> {
    assertObjectArgument(filter, 'filter', 'filter 必须是非空对象');
    assertUpdateDocument(update);

    const result = await findOneAndUpdateDocument(context.collectionRef, context.cvFilter(filter), context.cvUpdate(update), options);
    if (result) {
        await context.invalidateAll();
    }
    return result;
}

export async function findOneAndDeleteForAccessor<TSchema extends Document = Document>(
    context: AccessorWriteContext<TSchema>,
    filter: Parameters<Collection<TSchema>['findOneAndDelete']>[0],
    options?: unknown,
): ReturnType<Collection<TSchema>['findOneAndDelete']> {
    assertObjectArgument(filter, 'filter', 'filter 必须是非空对象');

    const result = await findOneAndDeleteDocument(context.collectionRef, context.cvFilter(filter), options);
    if (result) {
        await context.invalidateAll();
    }
    return result;
}

export async function upsertOneForAccessor<TSchema extends Document = Document>(
    context: AccessorWriteContext<TSchema>,
    filter: Parameters<Collection<TSchema>['updateOne']>[0],
    update: Parameters<Collection<TSchema>['updateOne']>[1],
    options?: Parameters<Collection<TSchema>['updateOne']>[2],
): ReturnType<Collection<TSchema>['updateOne']> {
    assertObjectArgument(filter, 'filter', 'filter 必须是非空对象');
    assertObjectArgument(update, 'update', 'update 必须是非空对象');

    const updateDoc = Object.keys(update as Record<string, unknown>).some((key) => key.startsWith('$'))
        ? update
        : { $set: update as Record<string, unknown> };
    const result = await upsertOneDocument(
        context.collectionRef,
        context.cvFilter(filter),
        context.cvUpdate(updateDoc) as Parameters<Collection<TSchema>['updateOne']>[1],
        options,
    );
    await context.invalidateAll();
    const normalizedResult = result.upsertedId === null
        ? { ...result, upsertedId: undefined }
        : result;
    return normalizedResult as Awaited<ReturnType<Collection<TSchema>['updateOne']>>;
}

export async function deleteOneForAccessor<TSchema extends Document = Document>(
    context: AccessorWriteContext<TSchema>,
    filter: Parameters<Collection<TSchema>['deleteOne']>[0],
    options?: Parameters<Collection<TSchema>['deleteOne']>[1],
): ReturnType<Collection<TSchema>['deleteOne']> {
    assertObjectArgument(filter, 'filter', 'filter 必须是对象类型');

    const result = await deleteOneDocument(context.collectionRef, context.cvFilter(filter), options);
    if (result.deletedCount > 0) {
        await context.invalidateAll();
    }
    return result;
}

export async function deleteManyForAccessor<TSchema extends Document = Document>(
    context: AccessorWriteContext<TSchema>,
    filter: Parameters<Collection<TSchema>['deleteMany']>[0],
    options?: Parameters<Collection<TSchema>['deleteMany']>[1],
): ReturnType<Collection<TSchema>['deleteMany']> {
    assertObjectArgument(filter, 'filter', 'filter 必须是非空对象');

    const result = await deleteManyDocuments(context.collectionRef, context.cvFilter(filter), options);
    if (result.deletedCount > 0) {
        await context.invalidateAll();
    }
    return result;
}
