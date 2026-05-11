/**
 * P2-C management-core 最小 MongoDB 管理能力。
 *
 * 说明：
 * - 本阶段仅承接 `namespace`、`index`、`admin`、`bookmark` 四组能力。
 * - `collection/database` 级管理能力继续后移，禁止在本阶段静默扩范围。
 */

import { Collection, Db, Document } from 'mongodb';

import { createError, ErrorCodes } from '../../../core/errors';
import type { Logger } from '../../../core/logger';
import type { FindPageOptions, FindPageResult } from '../queries';
import type {
    AdminBuildInfoView,
    BookmarkCacheLike,
    BookmarkClearResult,
    BookmarkKeyDims,
    BookmarkListResult,
    BookmarkPrewarmResult,
    DbStatsView,
    IndexCreateResult,
    ServerStatusView,
} from '../../../../types/collection';

export type {
    AdminBuildInfoView,
    BookmarkCacheLike,
    BookmarkClearResult,
    BookmarkKeyDims,
    BookmarkListResult,
    BookmarkPrewarmResult,
    DbStatsView,
    IndexCreateResult,
    ServerStatusView,
} from '../../../../types/collection';

/**
 * 数据库级 admin façade。
 * @since v1.3.0
 */
export class MongoAdminAccessor {
    constructor(
        private readonly dbRef: Db,
        private readonly logger?: Logger,
    ) {}

    /**
     * 检测数据库连接是否可用。
     * @since v1.3.0
     */
    async ping(): Promise<boolean> {
        try {
            await this.dbRef.admin().ping();
            return true;
        } catch (cause) {
            this.logger?.error('MongoDB ping failed', cause);
            return false;
        }
    }

    /**
     * 获取 MongoDB 版本信息。
     * @since v1.3.0
     */
    async buildInfo(): Promise<AdminBuildInfoView> {
        try {
            const info = await this.dbRef.admin().buildInfo();
            return {
                version: info.version,
                versionArray: info.versionArray,
                gitVersion: info.gitVersion,
                bits: info.bits,
                debug: info.debug,
                maxBsonObjectSize: info.maxBsonObjectSize,
            };
        } catch (cause) {
            throw createError(
                ErrorCodes.MANAGEMENT_OPERATION_FAILED,
                `Failed to get MongoDB build info: ${extractErrorMessage(cause)}`,
                undefined,
                cause instanceof Error ? cause : undefined,
            );
        }
    }

    /**
     * 获取服务器状态快照。
     * @since v1.3.0
     */
    async serverStatus(options: { scale?: number; } = {}): Promise<ServerStatusView> {
        try {
            const status = await this.dbRef.admin().command({
                serverStatus: 1,
                scale: options.scale ?? 1,
            });
            return {
                connections: {
                    current: status.connections?.current,
                    available: status.connections?.available,
                    totalCreated: status.connections?.totalCreated,
                },
                mem: {
                    resident: status.mem?.resident,
                    virtual: status.mem?.virtual,
                    mapped: status.mem?.mapped,
                },
                opcounters: {
                    insert: status.opcounters?.insert,
                    query: status.opcounters?.query,
                    update: status.opcounters?.update,
                    delete: status.opcounters?.delete,
                    getmore: status.opcounters?.getmore,
                    command: status.opcounters?.command,
                },
                network: {
                    bytesIn: status.network?.bytesIn,
                    bytesOut: status.network?.bytesOut,
                    numRequests: status.network?.numRequests,
                },
                uptime: status.uptime,
                localTime: status.localTime,
                version: status.version,
                process: status.process,
            };
        } catch (cause) {
            throw createError(
                ErrorCodes.MANAGEMENT_OPERATION_FAILED,
                `Failed to get MongoDB server status: ${extractErrorMessage(cause)}`,
                undefined,
                cause instanceof Error ? cause : undefined,
            );
        }
    }

    /**
     * 获取当前数据库统计信息。
     * @since v1.3.0
     */
    async stats(options: { scale?: number; } = {}): Promise<DbStatsView> {
        try {
            const stats = await this.dbRef.stats({ scale: options.scale ?? 1 });
            return {
                db: stats.db,
                collections: stats.collections,
                views: stats.views,
                objects: stats.objects,
                avgObjSize: stats.avgObjSize,
                dataSize: stats.dataSize,
                storageSize: stats.storageSize,
                indexes: stats.indexes,
                indexSize: stats.indexSize,
                totalSize: stats.totalSize,
                scaleFactor: stats.scaleFactor,
            };
        } catch (cause) {
            throw createError(
                ErrorCodes.MANAGEMENT_OPERATION_FAILED,
                `Failed to get MongoDB database stats: ${extractErrorMessage(cause)}`,
                undefined,
                cause instanceof Error ? cause : undefined,
            );
        }
    }
}

/**
 * 创建单个索引。
 * @since v1.3.0
 */
export async function createIndexDefinition<TSchema extends Document = Document>(
    collectionRef: Collection<TSchema>,
    keys: Document,
    options?: Parameters<Collection<TSchema>['createIndex']>[1],
): Promise<IndexCreateResult> {
    validateIndexKeys(keys, 'createIndex');
    const name = await collectionRef.createIndex(keys, options);
    return { name };
}

/**
 * 批量创建索引。
 * @since v1.3.0
 */
export async function createIndexDefinitions<TSchema extends Document = Document>(
    collectionRef: Collection<TSchema>,
    specs: Array<{ key: Document; } & Record<string, unknown>>,
): Promise<string[]> {
    if (!Array.isArray(specs) || specs.length === 0) {
        throw createError(ErrorCodes.INVALID_ARGUMENT, 'createIndexes: specs must be a non-empty array.');
    }

    for (const spec of specs) {
        validateIndexKeys(spec?.key, 'createIndexes');
    }

    return collectionRef.createIndexes(specs as Parameters<Collection<TSchema>['createIndexes']>[0]);
}

/**
 * 列出索引。
 * @since v1.3.0
 */
export async function listIndexDefinitions<TSchema extends Document = Document>(
    collectionRef: Collection<TSchema>,
): Promise<Record<string, unknown>[]> {
    return collectionRef.listIndexes().toArray() as Promise<Record<string, unknown>[]>;
}

/**
 * 删除指定索引。
 * @since v1.3.0
 */
export async function dropIndexDefinition<TSchema extends Document = Document>(
    collectionRef: Collection<TSchema>,
    name: string,
): ReturnType<Collection<TSchema>['dropIndex']> {
    if (!name?.trim()) {
        throw createError(ErrorCodes.INVALID_ARGUMENT, 'dropIndex: name must be a non-empty string.');
    }
    if (name === '_id_') {
        throw createError(ErrorCodes.INVALID_ARGUMENT, 'dropIndex: dropping the _id_ index is not allowed.');
    }
    return collectionRef.dropIndex(name);
}

/**
 * 删除所有非 `_id_` 索引。
 * @since v1.3.0
 */
export async function dropIndexDefinitions<TSchema extends Document = Document>(
    collectionRef: Collection<TSchema>,
): ReturnType<Collection<TSchema>['dropIndexes']> {
    return collectionRef.dropIndexes();
}

/**
 * 预热 bookmark 页面缓存。
 * @since v1.3.0
 */
export async function prewarmBookmarks<TSchema extends Document = Document>(params: {
    namespace: string;
    cache?: BookmarkCacheLike | null;
    logger?: Logger;
    keyDims?: BookmarkKeyDims<TSchema>;
    pages?: number[];
    findPage: (options: FindPageOptions<TSchema>) => Promise<FindPageResult<TSchema>>;
}): Promise<BookmarkPrewarmResult> {
    const cache = ensureBookmarkCache(params.cache);
    const pages = params.pages ?? [];
    if (!Array.isArray(pages) || pages.length === 0) {
        throw createError(ErrorCodes.INVALID_ARGUMENT, 'prewarmBookmarks: pages must be a non-empty array.');
    }

    const keyDims = normalizeBookmarkKeyDims(params.keyDims);
    const result: BookmarkPrewarmResult = {
        warmed: 0,
        failed: 0,
        keys: [],
    };

    for (const page of pages) {
        if (!Number.isInteger(page) || page < 1) {
            result.failed += 1;
            params.logger?.warn(`Skip invalid bookmark page: ${page}`);
            continue;
        }

        try {
            const payload = await params.findPage({ ...keyDims, page });
            const key = buildBookmarkKey(params.namespace, keyDims, page);
            await Promise.resolve(cache.set(key, {
                page,
                pageInfo: payload.page,
                totals: payload.totals,
                size: payload.data.length,
                warmedAt: new Date().toISOString(),
            }));
            if (payload.data.length > 0) {
                result.warmed += 1;
            } else {
                result.failed += 1;
            }
        } catch (cause) {
            result.failed += 1;
            params.logger?.warn('Bookmark prewarm failed', cause);
        }
    }

    result.keys = await resolveKeys(cache, buildBookmarkPattern(params.namespace, keyDims));
    return result;
}

/**
 * 列出 bookmark 页面缓存。
 * @since v1.3.0
 */
export async function listBookmarks(params: {
    namespace: string;
    cache?: BookmarkCacheLike | null;
    keyDims?: BookmarkKeyDims;
}): Promise<BookmarkListResult> {
    const cache = ensureBookmarkCache(params.cache);
    const keys = await resolveKeys(cache, buildBookmarkPattern(params.namespace, normalizeBookmarkKeyDims(params.keyDims)));
    const pages = keys
        .map(extractBookmarkPage)
        .filter((page): page is number => page !== null)
        .sort((a, b) => a - b);

    return {
        count: pages.length,
        pages,
        keys,
    };
}

/**
 * 清理 bookmark 页面缓存。
 * @since v1.3.0
 */
export async function clearBookmarks(params: {
    namespace: string;
    cache?: BookmarkCacheLike | null;
    keyDims?: BookmarkKeyDims;
}): Promise<BookmarkClearResult> {
    const cache = ensureBookmarkCache(params.cache);
    const pattern = buildBookmarkPattern(params.namespace, normalizeBookmarkKeyDims(params.keyDims));
    const keysBefore = await resolveKeys(cache, pattern);
    const cleared = await resolveDeletePattern(cache, pattern);

    return {
        cleared,
        pattern,
        keysBefore: keysBefore.length,
    };
}

function validateIndexKeys(keys: Document | undefined, operation: string): void {
    if (!keys || typeof keys !== 'object' || Array.isArray(keys) || Object.keys(keys).length === 0) {
        throw createError(ErrorCodes.INVALID_ARGUMENT, `${operation}: keys must be a non-empty object.`);
    }
}

function ensureBookmarkCache(cache?: BookmarkCacheLike | null): BookmarkCacheLike {
    if (!cache || typeof cache.set !== 'function' || typeof cache.get !== 'function' || typeof cache.keys !== 'function' || typeof cache.delPattern !== 'function') {
        throw createError(ErrorCodes.CACHE_UNAVAILABLE, 'Bookmark operations require a cache implementation with set/get/keys/delPattern.');
    }
    return cache;
}

function normalizeBookmarkKeyDims<TSchema extends Document = Document>(
    keyDims: BookmarkKeyDims<TSchema> | undefined,
): BookmarkKeyDims<TSchema> {
    return {
        ...(keyDims ?? {}),
    };
}

function buildBookmarkKey(namespace: string, keyDims: BookmarkKeyDims, page: number): string {
    return `${buildBookmarkBaseKey(namespace, keyDims)}:page:${page}`;
}

function buildBookmarkPattern(namespace: string, keyDims: BookmarkKeyDims): string {
    return `${buildBookmarkBaseKey(namespace, keyDims)}:page:*`;
}

function buildBookmarkBaseKey(namespace: string, keyDims: BookmarkKeyDims): string {
    return `bookmark:${namespace}:${stableStringify(keyDims)}`;
}

function stableStringify(value: unknown): string {
    if (value === null || value === undefined) {
        return JSON.stringify(value);
    }
    if (Array.isArray(value)) {
        return `[${value.map((item) => stableStringify(item)).join(',')}]`;
    }
    if (value instanceof Date) {
        return JSON.stringify(value.toISOString());
    }
    if (typeof value === 'object') {
        const entries = Object.entries(value as Record<string, unknown>)
            .sort(([left], [right]) => left.localeCompare(right))
            .map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`);
        return `{${entries.join(',')}}`;
    }
    return JSON.stringify(value);
}

async function resolveKeys(cache: BookmarkCacheLike, pattern: string): Promise<string[]> {
    const keys = await Promise.resolve(cache.keys?.(pattern) ?? []);
    return Array.isArray(keys) ? keys : [];
}

async function resolveDeletePattern(cache: BookmarkCacheLike, pattern: string): Promise<number> {
    const deleted = await Promise.resolve(cache.delPattern?.(pattern) ?? 0);
    return typeof deleted === 'number' ? deleted : 0;
}

function extractBookmarkPage(key: string): number | null {
    const match = key.match(/:page:(\d+)$/);
    if (!match) {
        return null;
    }
    return Number.parseInt(match[1], 10);
}

function extractErrorMessage(cause: unknown): string {
    if (cause instanceof Error) {
        return cause.message;
    }
    return String(cause);
}

