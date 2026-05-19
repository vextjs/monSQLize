/**
 * findAndCount: returns all matching documents along with the total count.
 *
 * Responsibilities:
 * - Runs find + countDocuments concurrently.
 * - Does not apply findLimit (findAndCount semantics: return all matches).
 * - Returns a v1-compatible structure: { data, total }.
 *
 * Note: does not depend on FindChain; calls the driver directly to avoid circular references.
 */

import { Collection, Document } from 'mongodb';

import { normalizeProjection } from '../../../utils/normalize';
import type { RuntimeDefaults } from '../../../types/internal/query';
import type { FindAndCountResult } from '../../../../types/collection';

/**
 * Queries all matching documents and fetches the total count concurrently.
 * Unlike `findPage`, this function does not apply `findLimit` and returns all matches.
 * @param collection - Target MongoDB collection.
 * @param query - Filter predicate (default: `{}`).
 * @param options - Native driver `find` options.
 * @param defaults - Runtime-level defaults.
 * @returns `{ data, total }` — full document array and total count.
 * @since v1.0.0
 */
export async function findAndCountDocuments<TSchema extends Document = Document>(
    collection: Collection<TSchema>,
    query?: Parameters<Collection<TSchema>['find']>[0],
    options?: Parameters<Collection<TSchema>['find']>[1],
    defaults?: RuntimeDefaults,
): Promise<FindAndCountResult<TSchema>> {
    // v1 compat: null query is treated as {} (match all)
    const normalizedQuery = (query == null ? {} : query) as Parameters<Collection<TSchema>['find']>[0];

    // Build driver options (limit/skip/sort/projection apply to data; total uses query only)
    const rawOptions = (options ?? {}) as Record<string, unknown>;
    const driverOptions: Record<string, unknown> = {};

    const projection = normalizeProjection(rawOptions.projection as string[] | Record<string, unknown> | null | undefined);
    if (projection) driverOptions.projection = projection;
    if (rawOptions.sort !== undefined) driverOptions.sort = rawOptions.sort;
    // v1 compat: limit/skip apply to data only, not to total
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

    // v1 compat: expose `documents` as an alias for `data`
    return { data, total, documents: data };
}
