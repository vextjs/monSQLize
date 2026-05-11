/**
 * P2-B 最小 MongoDB queries 适配。
 *
 * 说明：
 * - 先恢复 `find` / `findOne` / `count` / `aggregate` / `distinct` / `findPage` / `watch` 的最小闭环。
 * - 更完整的链式查询、缓存、ObjectId 自动转换和 explain 语义在后续阶段继续补齐。
 */

import { ChangeStream, Collection, Document } from 'mongodb';

import { compilePipelineExpressions, hasExpressionInPipeline } from '../../../core/expression';
import { createError, ErrorCodes } from '../../../core/errors';
import type { FindPageOptions, FindPageResult } from '../../../../types/collection';

export type { FindPageOptions, FindPageResult } from '../../../../types/collection';

/**
 * 查询多个文档并返回数组结果。
 * @since v1.3.0
 */
export async function findDocuments<TSchema extends Document = Document>(
    collection: Collection<TSchema>,
    ...args: Parameters<Collection<TSchema>['find']>
): Promise<TSchema[]> {
    return collection.find(...args).toArray() as Promise<TSchema[]>;
}

/**
 * 查询单个文档。
 * @since v1.3.0
 */
export async function findOneDocument<TSchema extends Document = Document>(
    collection: Collection<TSchema>,
    ...args: Parameters<Collection<TSchema>['findOne']>
): ReturnType<Collection<TSchema>['findOne']> {
    return collection.findOne(...args);
}

/**
 * 统计文档数量。
 * @since v1.3.0
 */
export async function countDocuments<TSchema extends Document = Document>(
    collection: Collection<TSchema>,
    ...args: Parameters<Collection<TSchema>['countDocuments']>
): ReturnType<Collection<TSchema>['countDocuments']> {
    return collection.countDocuments(...args);
}

/**
 * 聚合查询。
 * @since v1.3.0
 */
export async function aggregateDocuments<TSchema extends Document = Document>(
    collection: Collection<TSchema>,
    pipeline: Document[] = [],
    options?: Parameters<Collection<TSchema>['aggregate']>[1],
): Promise<Document[]> {
    const processedPipeline = hasExpressionInPipeline(pipeline)
        ? compilePipelineExpressions(pipeline)
        : pipeline;

    return collection.aggregate(processedPipeline, options).toArray();
}

/**
 * 查询去重字段值。
 * @since v1.3.0
 */
export async function distinctValues<TSchema extends Document = Document>(
    collection: Collection<TSchema>,
    key: string,
    filter?: Document,
    options?: Parameters<Collection<TSchema>['distinct']>[2],
): ReturnType<Collection<TSchema>['distinct']> {
    const normalizedFilter = (filter ?? {}) as Parameters<Collection<TSchema>['distinct']>[1];
    if (options === undefined) {
        return collection.distinct(key, normalizedFilter);
    }
    return collection.distinct(key, normalizedFilter, options);
}

/**
 * 监听集合变更。
 * @since v1.3.0
 */
export function watchDocuments<TSchema extends Document = Document>(
    collection: Collection<TSchema>,
    pipeline: Document[] = [],
    options?: Parameters<Collection<TSchema>['watch']>[1],
): ChangeStream<TSchema> {
    const processedPipeline = hasExpressionInPipeline(pipeline)
        ? compilePipelineExpressions(pipeline)
        : pipeline;

    return collection.watch(processedPipeline, options);
}

/**
 * 简化分页查询。
 * @since v1.3.0
 */
export async function findPageDocuments<TSchema extends Document = Document>(
    collection: Collection<TSchema>,
    options: FindPageOptions<TSchema> = {},
): Promise<FindPageResult<TSchema>> {
    const page = normalizePositiveInteger(options.page, 1, 'page');
    const limit = normalizePositiveInteger(options.limit, 20, 'limit');
    const query = options.query ?? {};
    const skip = (page - 1) * limit;

    const driverOptions = {
        ...(options.options ?? {}),
        ...(options.sort ? { sort: options.sort } : {}),
        ...(options.projection ? { projection: options.projection } : {}),
        skip,
        limit,
    } as Parameters<Collection<TSchema>['find']>[1];
    const queryFilter = query as Parameters<Collection<TSchema>['find']>[0];

    const [data, total] = await Promise.all([
        collection.find(queryFilter, driverOptions).toArray() as Promise<TSchema[]>,
        collection.countDocuments(queryFilter),
    ]);

    return {
        data,
        page: { page, limit },
        totals: {
            total,
            totalPages: total === 0 ? 0 : Math.ceil(total / limit),
        },
    };
}

function normalizePositiveInteger(value: number | undefined, fallback: number, field: string): number {
    if (value === undefined || value === null) {
        return fallback;
    }

    if (!Number.isInteger(value) || value <= 0) {
        throw createError(ErrorCodes.INVALID_PAGINATION, `${field} must be a positive integer.`);
    }

    return value;
}
