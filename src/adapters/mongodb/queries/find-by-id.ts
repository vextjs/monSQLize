/**
 * 按 _id 查询文档（findOneById / findByIds）。
 *
 * 职责：
 * - 解析并校验 ObjectId（单条 / 批量）
 * - 执行 findOne / find $in 查询
 * - 支持 preserveOrder（按入参顺序返回）
 *
 * 依赖：query-helpers（parseRequiredObjectId、isHexObjectIdString）
 * 不依赖 FindChain，避免循环引用。
 */

import { Collection, Document, FindOptions, ObjectId } from 'mongodb';

import { createError, ErrorCodes } from '../../../core/errors';
import { normalizeProjection } from '../../../utils/normalize';
import type { RuntimeDefaults } from '../../../types/internal/query';
import { isHexObjectIdString, parseRequiredObjectId } from './query-helpers';

/**
 * 按 `_id` 查询单条文档。
 * 接受 string / ObjectId / 或任何可转换为 ObjectId 的值。
 * @param collection - 目标集合。
 * @param id - 文档标识符。
 * @param options - 原生驱动 `findOne` 选项。
 * @returns 匹配的文档，未找到时返回 `null`。
 * @since v1.0.0
 */
export async function findOneByIdDocument<TSchema extends Document = Document>(
    collection: Collection<TSchema>,
    id: unknown,
    options?: Parameters<Collection<TSchema>['findOne']>[1],
): Promise<TSchema | null> {
    const objectId = parseRequiredObjectId(id);
    const rawOptions = (options ?? {}) as Record<string, unknown>;
    const findOptions: FindOptions<TSchema> = {};

    const projection = normalizeProjection(rawOptions.projection as string[] | Record<string, unknown> | null | undefined);
    if (projection) findOptions.projection = projection;
    if (rawOptions.maxTimeMS !== undefined) findOptions.maxTimeMS = rawOptions.maxTimeMS as number;
    if (rawOptions.comment !== undefined) findOptions.comment = rawOptions.comment as string;

    return collection.findOne(
        { _id: objectId } as Parameters<Collection<TSchema>['findOne']>[0],
        findOptions as Parameters<Collection<TSchema>['findOne']>[1],
    ) as unknown as Promise<TSchema | null>;
}

/**
 * 批量按 `_id` 查询文档。
 * @param collection - 目标集合。
 * @param ids - 文档标识符数组（支持 string / ObjectId 混合）。
 * @param options - 原生驱动 `find` 选项；`preserveOrder: true` 时按入参顺序返回。
 * @param defaults - 运行时默认值。
 * @returns 匹配文档数组（默认顺序不保证；开启 preserveOrder 时按 ids 顺序）。
 * @since v1.0.0
 */
export async function findByIdsDocuments<TSchema extends Document = Document>(
    collection: Collection<TSchema>,
    ids: unknown[],
    options?: Parameters<Collection<TSchema>['find']>[1],
    defaults: RuntimeDefaults = {},
): Promise<TSchema[]> {
    if (!Array.isArray(ids)) {
        throw createError(
            ErrorCodes.INVALID_ARGUMENT,
            'ids 必须是数组',
            [{ field: 'ids', type: 'type', message: 'ids must be an array', received: typeof ids }],
        );
    }

    if (ids.length === 0) {
        return [];
    }

    const objectIds: ObjectId[] = [];
    const invalidIds: Array<{ index: number; value: unknown; }> = [];

    for (const [index, id] of ids.entries()) {
        if (id instanceof ObjectId) {
            objectIds.push(id);
            continue;
        }

        if (typeof id === 'string' && isHexObjectIdString(id)) {
            objectIds.push(new ObjectId(id));
            continue;
        }

        if (id && typeof id === 'object' && typeof (id as { toHexString?: () => string; }).toHexString === 'function') {
            const hex = (id as { toHexString: () => string; }).toHexString();
            if (isHexObjectIdString(hex)) {
                objectIds.push(new ObjectId(hex));
                continue;
            }
        }

        invalidIds.push({ index, value: id });
    }

    if (invalidIds.length > 0) {
        throw createError(
            ErrorCodes.INVALID_ARGUMENT,
            `ids 数组包含 ${invalidIds.length} 个无效 ID`,
            invalidIds.map((item) => ({
                field: `ids[${item.index}]`,
                type: 'format',
                message: 'invalid ID',
                received: item.value,
            })),
        );
    }

    const uniqueIds = [...new Set(objectIds.map((item) => item.toString()))].map((item) => new ObjectId(item));
    const rawOptions = (options ?? {}) as Record<string, unknown>;
    const driverOptions: Record<string, unknown> = {};

    const projection = normalizeProjection(rawOptions.projection as string[] | Record<string, unknown> | null | undefined);
    if (projection) driverOptions.projection = projection;
    if (rawOptions.sort !== undefined) driverOptions.sort = rawOptions.sort;
    if (rawOptions.comment !== undefined) driverOptions.comment = rawOptions.comment;
    if (rawOptions.maxTimeMS !== undefined) {
        driverOptions.maxTimeMS = rawOptions.maxTimeMS;
    } else if (defaults.maxTimeMS !== undefined) {
        driverOptions.maxTimeMS = defaults.maxTimeMS;
    }

    const results = await collection.find({
        _id: { $in: uniqueIds },
    } as Parameters<Collection<TSchema>['find']>[0], driverOptions as Parameters<Collection<TSchema>['find']>[1]).toArray() as TSchema[];

    if (rawOptions.preserveOrder === true) {
        const resultMap = new Map<string, TSchema>();
        for (const doc of results) {
            const docId = (doc as Record<string, unknown>)._id;
            if (docId instanceof ObjectId) {
                resultMap.set(docId.toString(), doc);
            } else if (docId !== undefined && docId !== null) {
                resultMap.set(String(docId), doc);
            }
        }
        return objectIds.map((item) => resultMap.get(item.toString())).filter((item): item is TSchema => item !== undefined);
    }

    return results;
}
