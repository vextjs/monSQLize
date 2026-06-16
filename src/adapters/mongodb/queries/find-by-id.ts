/**
 * Document lookup by _id (findOneById / findByIds).
 *
 * Responsibilities:
 * - Parse and validate ObjectId values (single and batch).
 * - Execute findOne / find $in queries.
 * - Support preserveOrder to return results in input order.
 *
 * Depends on query-helpers (parseRequiredObjectId, isHexObjectIdString).
 * Does not depend on FindChain to avoid circular references.
 */

import { Collection, Document, FindOptions, ObjectId } from 'mongodb';

import { createError, ErrorCodes } from '../../../core/errors';
import { normalizeProjection } from '../../../utils/normalize';
import type { QueryCacheLike, RuntimeDefaults } from '../../../types/internal/query';
import {
    buildFindDriverOptions,
    buildResultCacheKeyOptions,
    hasSessionOption,
    isHexObjectIdString,
    parseRequiredObjectId,
    stableCacheKeyString,
} from './query-helpers';

function getCacheTtl(rawOptions: Record<string, unknown>): number {
    return typeof rawOptions.cache === 'number' && rawOptions.cache > 0 ? rawOptions.cache : 0;
}

/**
 * Finds a single document by `_id`.
 * Accepts a string, ObjectId, or any value convertible to an ObjectId.
 * @param collection - Target collection.
 * @param id - Document identifier.
 * @param options - Native driver `findOne` options.
 * @returns The matching document, or `null` if not found.
 * @since v1.0.0
 */
export async function findOneByIdDocument<TSchema extends Document = Document>(
    collection: Collection<TSchema>,
    id: unknown,
    options?: Parameters<Collection<TSchema>['findOne']>[1],
    defaults: RuntimeDefaults = {},
    queryCache?: QueryCacheLike | null,
): Promise<TSchema | null> {
    const objectId = parseRequiredObjectId(id);
    const rawOptions = (options ?? {}) as Record<string, unknown>;

    const projection = normalizeProjection(rawOptions.projection as string[] | Record<string, unknown> | null | undefined);
    const findOptions = buildFindDriverOptions({
        ...(defaults.maxTimeMS !== undefined ? { maxTimeMS: defaults.maxTimeMS } : {}),
        ...rawOptions,
        ...(projection ? { projection } : {}),
    }) as FindOptions;

    const cacheTTL = getCacheTtl(rawOptions);
    if (cacheTTL > 0 && queryCache && !hasSessionOption(rawOptions)) {
        const keyOptions = buildResultCacheKeyOptions({
            ...(defaults.maxTimeMS !== undefined ? { maxTimeMS: defaults.maxTimeMS } : {}),
            ...rawOptions,
            ...(projection ? { projection } : {}),
        });
        const cacheKey = `findOneById:${collection.namespace}:${objectId.toString()}:${stableCacheKeyString(keyOptions)}`;
        const cached = queryCache.get(cacheKey) as TSchema | null | undefined;
        if (cached !== undefined) {
            return cached;
        }
        const result = await collection.findOne(
            { _id: objectId } as Parameters<Collection<TSchema>['findOne']>[0],
            findOptions as Parameters<Collection<TSchema>['findOne']>[1],
        ) as unknown as TSchema | null;
        void queryCache.set(cacheKey, result, cacheTTL);
        return result;
    }

    return collection.findOne(
        { _id: objectId } as Parameters<Collection<TSchema>['findOne']>[0],
        findOptions as Parameters<Collection<TSchema>['findOne']>[1],
    ) as unknown as Promise<TSchema | null>;
}

/**
 * Finds multiple documents by `_id`.
 * @param collection - Target collection.
 * @param ids - Array of document identifiers (string and ObjectId may be mixed).
 * @param options - Native driver `find` options; set `preserveOrder: true` to return results in input order.
 * @param defaults - Runtime-level defaults.
 * @returns Array of matching documents (order not guaranteed unless preserveOrder is enabled).
 * @since v1.0.0
 */
export async function findByIdsDocuments<TSchema extends Document = Document>(
    collection: Collection<TSchema>,
    ids: unknown[],
    options?: Parameters<Collection<TSchema>['find']>[1],
    defaults: RuntimeDefaults = {},
    queryCache?: QueryCacheLike | null,
): Promise<TSchema[]> {
    if (!Array.isArray(ids)) {
        throw createError(
            ErrorCodes.INVALID_ARGUMENT,
            'ids must be an array',
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
            `ids array contains ${invalidIds.length} invalid ID(s)`,
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

    const projection = normalizeProjection(rawOptions.projection as string[] | Record<string, unknown> | null | undefined);
    const driverOptions = buildFindDriverOptions({
        ...(defaults.maxTimeMS !== undefined ? { maxTimeMS: defaults.maxTimeMS } : {}),
        ...rawOptions,
        ...(projection ? { projection } : {}),
    });

    const cacheTTL = getCacheTtl(rawOptions);
    const cacheKey = cacheTTL > 0 && queryCache && !hasSessionOption(rawOptions)
        ? `findByIds:${collection.namespace}:${stableCacheKeyString({
            ids: uniqueIds.map((item) => item.toString()),
            options: buildResultCacheKeyOptions({
                ...(defaults.maxTimeMS !== undefined ? { maxTimeMS: defaults.maxTimeMS } : {}),
                ...rawOptions,
                ...(projection ? { projection } : {}),
            }),
        })}`
        : null;

    let results: TSchema[];
    if (cacheKey && queryCache) {
        const cached = queryCache.get(cacheKey) as TSchema[] | undefined;
        if (cached !== undefined) {
            results = cached;
        } else {
            results = await collection.find({
                _id: { $in: uniqueIds },
            } as Parameters<Collection<TSchema>['find']>[0], driverOptions as Parameters<Collection<TSchema>['find']>[1]).toArray() as TSchema[];
            void queryCache.set(cacheKey, results, cacheTTL);
        }
    } else {
        results = await collection.find({
            _id: { $in: uniqueIds },
        } as Parameters<Collection<TSchema>['find']>[0], driverOptions as Parameters<Collection<TSchema>['find']>[1]).toArray() as TSchema[];
    }

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
        return uniqueIds.map((item) => resultMap.get(item.toString())).filter((item): item is TSchema => item !== undefined);
    }

    return results;
}
