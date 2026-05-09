/**
 * P2-C 原生写入对齐模块。
 *
 * 说明：
 * - 本阶段先抽离并恢复 `insertOne` / `insertMany` / `updateOne` / `updateMany` / `deleteOne` / `deleteMany` / `replaceOne` / `findOneAnd*` / `upsertOne`，保持 MongoDB 原生返回结构不变。
 * - 更完整的 batch 扩展与 `findOneAndReplace` 在后续继续补齐。
 */

import { Collection, Document } from 'mongodb';

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

