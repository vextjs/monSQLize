/**
 * findAndCount：返回全量匹配文档 + 总数。
 *
 * 职责：
 * - 并发执行 find + countDocuments
 * - 不限制 findLimit（findAndCount 语义是返回所有匹配）
 * - 返回 v1 兼容结构 { data, total }
 *
 * 注意：不依赖 FindChain，直接通过驱动调用，避免循环引用。
 */

import { Collection, Document } from 'mongodb';

import { normalizeProjection } from '../../../utils/normalize';
import type { RuntimeDefaults } from '../../../types/internal/query';
import type { FindAndCountResult } from '../../../../types/collection';

/**
 * 查询所有匹配文档并同时获取总数。
 * 与 `findPage` 不同，本函数不限制 `findLimit`，返回所有匹配文档。
 * @param collection - 目标 MongoDB 集合。
 * @param query - 过滤条件（默认：`{}`）。
 * @param options - 原生驱动 `find` 选项。
 * @param defaults - 运行时默认值。
 * @returns `{ data, total }` — 全量文档数组 + 总数。
 * @since v1.0.0
 */
export async function findAndCountDocuments<TSchema extends Document = Document>(
    collection: Collection<TSchema>,
    query?: Parameters<Collection<TSchema>['find']>[0],
    options?: Parameters<Collection<TSchema>['find']>[1],
    defaults?: RuntimeDefaults,
): Promise<FindAndCountResult<TSchema>> {
    // v1 兼容：null query 等同于 {} (匹配全部)
    const normalizedQuery = (query == null ? {} : query) as Parameters<Collection<TSchema>['find']>[0];

    // 构建驱动选项（data 的 find 应用 limit/skip/sort/projection，total 只用 query）
    const rawOptions = (options ?? {}) as Record<string, unknown>;
    const driverOptions: Record<string, unknown> = {};

    const projection = normalizeProjection(rawOptions.projection as string[] | Record<string, unknown> | null | undefined);
    if (projection) driverOptions.projection = projection;
    if (rawOptions.sort !== undefined) driverOptions.sort = rawOptions.sort;
    // v1 兼容：limit/skip 应用于 data，不影响 total
    if (rawOptions.limit !== undefined) driverOptions.limit = rawOptions.limit;
    if (rawOptions.skip !== undefined) driverOptions.skip = rawOptions.skip;
    if (rawOptions.maxTimeMS !== undefined) {
        driverOptions.maxTimeMS = rawOptions.maxTimeMS;
    } else if (defaults?.maxTimeMS !== undefined) {
        driverOptions.maxTimeMS = defaults.maxTimeMS;
    }
    if (rawOptions.comment !== undefined) driverOptions.comment = rawOptions.comment;
    if (rawOptions.hint !== undefined) driverOptions.hint = rawOptions.hint;

    const [data, total] = await Promise.all([
        collection.find(
            normalizedQuery,
            driverOptions as Parameters<Collection<TSchema>['find']>[1],
        ).toArray() as Promise<TSchema[]>,
        collection.countDocuments(normalizedQuery as Parameters<Collection<TSchema>['countDocuments']>[0]),
    ]);

    return { data, total };
}
