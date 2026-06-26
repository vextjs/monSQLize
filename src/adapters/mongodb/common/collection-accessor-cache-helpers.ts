import type { Document } from 'mongodb';
import {
    clearCacheInvalidationBarrier,
    markCacheInvalidationBarrier,
} from '../../../core/cache-invalidation-barrier';
import type { QueryCacheLike, RuntimeDefaults } from '../../../types/internal/query';

type AggregateWriteTarget = {
    dbName?: string;
    collectionName: string;
};

type TransactionInvalidator = {
    recordInvalidation(pattern: string): Promise<void> | void;
};

type SessionWithTransaction = {
    inTransaction?: () => boolean;
    __monSQLizeTransaction?: TransactionInvalidator;
};

type ReadCacheOperation = 'find' | 'findOne' | 'count' | 'findPage' | 'all' | string;

export function isRecord(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function getTransactionInvalidator(options: unknown): TransactionInvalidator | null {
    if (!isRecord(options)) {
        return null;
    }
    const session = options.session as SessionWithTransaction | undefined;
    const transaction = session?.__monSQLizeTransaction;
    if (!transaction) {
        return null;
    }
    if (typeof session.inTransaction === 'function' && !session.inTransaction()) {
        return null;
    }
    return transaction;
}

function resolveCollectionTarget(value: unknown): AggregateWriteTarget | null {
    if (typeof value === 'string' && value.length > 0) {
        return { collectionName: value };
    }
    if (!isRecord(value)) {
        return null;
    }
    const coll = value['coll'] ?? value['collection'];
    if (typeof coll !== 'string' || coll.length === 0) {
        return null;
    }
    const db = value['db'];
    return {
        collectionName: coll,
        ...(typeof db === 'string' && db.length > 0 ? { dbName: db } : {}),
    };
}

export function resolveAggregateWriteTarget(pipeline: Document[]): AggregateWriteTarget | null {
    const lastStage = pipeline[pipeline.length - 1];
    if (!isRecord(lastStage)) {
        return null;
    }
    if (Object.prototype.hasOwnProperty.call(lastStage, '$out')) {
        return resolveCollectionTarget(lastStage['$out']);
    }
    if (!Object.prototype.hasOwnProperty.call(lastStage, '$merge')) {
        return null;
    }
    const mergeStage = lastStage['$merge'];
    if (typeof mergeStage === 'string') {
        return { collectionName: mergeStage };
    }
    return isRecord(mergeStage) ? resolveCollectionTarget(mergeStage['into']) : null;
}

function buildAccessorCacheNamespace(
    dbName: string,
    collectionName: string,
    defaults: RuntimeDefaults | undefined,
): string {
    const namespace = `${dbName}.${collectionName}`;
    const instanceId = defaults?.namespace?.instanceId;
    return instanceId ? `${instanceId}:${namespace}` : namespace;
}

function buildAccessorCacheNamespaces(
    dbName: string,
    collectionName: string,
    defaults: RuntimeDefaults | undefined,
): string[] {
    const namespace = `${dbName}.${collectionName}`;
    const scopedNamespace = buildAccessorCacheNamespace(dbName, collectionName, defaults);
    return scopedNamespace === namespace ? [namespace] : [scopedNamespace, namespace];
}

export function buildReadCacheInvalidationPatterns(
    dbName: string,
    collectionName: string,
    defaults: RuntimeDefaults | undefined,
    operation?: ReadCacheOperation,
): string[] {
    const namespaces = buildAccessorCacheNamespaces(dbName, collectionName, defaults);
    const bookmarkNamespace = `${dbName}:${collectionName}`;
    const legacyNamespacePatterns = defaults?.namespace?.instanceId
        ? [`${defaults.namespace.instanceId}:mongodb:${dbName}:${collectionName}:*`]
        : [];
    const forNamespaces = (prefix: string) => namespaces.map((namespace) => `${prefix}:${namespace}:*`);
    const findPagePatterns = [
        ...forNamespaces('findPage'),
        ...forNamespaces('findPageTotals'),
        `${bookmarkNamespace}:bm:*`,
    ];
    const aggregatePatterns = forNamespaces('aggregate');
    const distinctPatterns = forNamespaces('distinct');
    const patterns = operation === 'find'
        ? forNamespaces('find')
        : operation === 'findOne'
            ? forNamespaces('findOne')
            : operation === 'count'
                ? forNamespaces('count')
                : operation === 'findPage'
                    ? findPagePatterns
                    : operation === 'aggregate'
                        ? aggregatePatterns
                        : operation === 'distinct'
                            ? distinctPatterns
                            : [
                                ...forNamespaces('find'),
                                ...forNamespaces('findOne'),
                                ...forNamespaces('count'),
                                ...forNamespaces('findOneById'),
                                ...forNamespaces('findByIds'),
                                ...findPagePatterns,
                                ...aggregatePatterns,
                                ...distinctPatterns,
                            ];
    patterns.push(...legacyNamespacePatterns);
    return patterns;
}

export async function invalidateReadCachesForNamespace(
    queryCache: QueryCacheLike | null | undefined,
    dbName: string,
    collectionName: string,
    defaults: RuntimeDefaults | undefined,
    operation?: ReadCacheOperation,
): Promise<number> {
    if (!queryCache?.delPattern) {
        return 0;
    }
    let deleted = 0;
    for (const pattern of buildReadCacheInvalidationPatterns(dbName, collectionName, defaults, operation)) {
        deleted += Number(await Promise.resolve(queryCache.delPattern(pattern)));
    }
    return deleted;
}

export async function prepareReadCachesBeforeWrite(
    queryCache: QueryCacheLike | null | undefined,
    dbName: string,
    collectionName: string,
    defaults: RuntimeDefaults | undefined,
    options?: unknown,
): Promise<void> {
    if (getTransactionInvalidator(options) || !queryCache) {
        return;
    }
    const patterns = buildReadCacheInvalidationPatterns(dbName, collectionName, defaults, 'all');
    await markCacheInvalidationBarrier(queryCache, patterns);
    await invalidateReadCachesForNamespace(queryCache, dbName, collectionName, defaults, 'all');
}

export async function clearReadCacheBarrierAfterWrite(
    queryCache: QueryCacheLike | null | undefined,
    dbName: string,
    collectionName: string,
    defaults: RuntimeDefaults | undefined,
    options?: unknown,
): Promise<void> {
    if (getTransactionInvalidator(options) || !queryCache) {
        return;
    }
    await clearCacheInvalidationBarrier(queryCache, buildAccessorCacheNamespaces(dbName, collectionName, defaults));
}

export async function invalidateReadCachesAfterWrite(
    queryCache: QueryCacheLike | null | undefined,
    dbName: string,
    collectionName: string,
    defaults: RuntimeDefaults | undefined,
    options?: unknown,
): Promise<number> {
    const transaction = getTransactionInvalidator(options);
    if (transaction) {
        const patterns = buildReadCacheInvalidationPatterns(dbName, collectionName, defaults, 'all');
        for (const pattern of patterns) {
            await transaction.recordInvalidation(pattern);
        }
        return patterns.length;
    }
    const deleted = await invalidateReadCachesForNamespace(queryCache, dbName, collectionName, defaults, 'all');
    await clearReadCacheBarrierAfterWrite(queryCache, dbName, collectionName, defaults, options);
    return deleted;
}
