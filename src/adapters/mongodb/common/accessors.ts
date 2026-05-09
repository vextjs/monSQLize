/**
 * P2-B / P2-C MongoDB accessor 适配。
 *
 * 说明：
 * - 在 P2-A 的 db/collection 基础上，补齐最小 query façade。
 * - P2-C 已开始把原生写入透传下沉到 `writes/**` 模块，便于后续继续扩展 convenience / batch / management。
 */

import { ChangeStream, Collection, Db, Document } from 'mongodb';
import type { Logger } from '../../../core/logger';
import {
    clearBookmarks,
    createIndexDefinition,
    createIndexDefinitions,
    dropIndexDefinition,
    dropIndexDefinitions,
    listBookmarks,
    listIndexDefinitions,
    MongoAdminAccessor,
    prewarmBookmarks,
    type BookmarkCacheLike,
    type BookmarkClearResult,
    type BookmarkKeyDims,
    type BookmarkListResult,
    type BookmarkPrewarmResult,
    type DbStatsView,
    type IndexCreateResult,
    type ServerStatusView,
    type AdminBuildInfoView,
} from '../management';

import {
    aggregateDocuments,
    countDocuments,
    distinctValues,
    findDocuments,
    findOneDocument,
    findPageDocuments,
    type FindPageOptions,
    type FindPageResult,
    watchDocuments,
} from '../queries';
import {
    deleteManyDocuments,
    deleteOneDocument,
    findOneAndDeleteDocument,
    findOneAndUpdateDocument,
    insertManyDocuments,
    insertOneDocument,
    replaceOneDocument,
    upsertOneDocument,
    updateManyDocuments,
    updateOneDocument,
} from '../writes';

export class MongoCollectionAccessor<TSchema extends Document = Document> {
    constructor(
        private readonly dbName: string,
        private readonly collectionName: string,
        private readonly collectionRef: Collection<TSchema>,
        private readonly management: {
            cache?: BookmarkCacheLike | null;
            logger?: Logger;
        } = {},
    ) {}

    /**
     * 获取命名空间。
     * @since v1.3.0
     */
    getNamespace(): { iid: string; type: 'mongodb'; db: string; collection: string; } {
        return {
            iid: `${this.dbName}:${this.collectionName}`,
            type: 'mongodb',
            db: this.dbName,
            collection: this.collectionName,
        };
    }

    /**
     * 透传原生 MongoDB Collection。
     * @since v1.3.0
     */
    raw(): Collection<TSchema> {
        return this.collectionRef;
    }

    /**
     * 查询单个文档（P2-A 先恢复原生透传）。
     * @since v1.3.0
     */
    async findOne(...args: Parameters<Collection<TSchema>['findOne']>): ReturnType<Collection<TSchema>['findOne']> {
        return findOneDocument(this.collectionRef, ...args);
    }

    /**
     * 查询多个文档（当前阶段先恢复最小数组结果）。
     * @since v1.3.0
     */
    async find(...args: Parameters<Collection<TSchema>['find']>): Promise<TSchema[]> {
        return findDocuments(this.collectionRef, ...args);
    }

    /**
     * 统计符合条件的文档数量。
     * @since v1.3.0
     */
    async count(...args: Parameters<Collection<TSchema>['countDocuments']>): ReturnType<Collection<TSchema>['countDocuments']> {
        return countDocuments(this.collectionRef, ...args);
    }

    /**
     * 聚合查询。
     * @since v1.3.0
     */
    async aggregate(
        pipeline: Document[] = [],
        options?: Parameters<Collection<TSchema>['aggregate']>[1],
    ): Promise<Document[]> {
        return aggregateDocuments(this.collectionRef, pipeline, options);
    }

    /**
     * 查询去重字段值。
     * @since v1.3.0
     */
    async distinct(
        key: string,
        query?: Document,
        options?: Parameters<Collection<TSchema>['distinct']>[2],
    ): ReturnType<Collection<TSchema>['distinct']> {
        return distinctValues(this.collectionRef, key, query, options);
    }

    /**
     * 简化分页查询。
     * @since v1.3.0
     */
    async findPage(options: FindPageOptions<TSchema> = {}): Promise<FindPageResult<TSchema>> {
        return findPageDocuments(this.collectionRef, options);
    }

    /**
     * 监听集合变更。
     * @since v1.3.0
     */
    watch(
        pipeline: Document[] = [],
        options?: Parameters<Collection<TSchema>['watch']>[1],
    ): ChangeStream<TSchema> {
        return watchDocuments(this.collectionRef, pipeline, options);
    }

    /**
     * 原生插入透传。
     * @since v1.3.0
     */
    async insertOne(...args: Parameters<Collection<TSchema>['insertOne']>): ReturnType<Collection<TSchema>['insertOne']> {
        return insertOneDocument(this.collectionRef, ...args);
    }

    /**
     * 原生批量插入透传。
     * @since v1.3.0
     */
    async insertMany(...args: Parameters<Collection<TSchema>['insertMany']>): ReturnType<Collection<TSchema>['insertMany']> {
        return insertManyDocuments(this.collectionRef, ...args);
    }

    /**
     * 原生更新透传。
     * @since v1.3.0
     */
    async updateOne(...args: Parameters<Collection<TSchema>['updateOne']>): ReturnType<Collection<TSchema>['updateOne']> {
        return updateOneDocument(this.collectionRef, ...args);
    }

    /**
     * 原生批量更新透传。
     * @since v1.3.0
     */
    async updateMany(...args: Parameters<Collection<TSchema>['updateMany']>): ReturnType<Collection<TSchema>['updateMany']> {
        return updateManyDocuments(this.collectionRef, ...args);
    }

    /**
     * 原生替换单个文档透传。
     * @since v1.3.0
     */
    async replaceOne(...args: Parameters<Collection<TSchema>['replaceOne']>): ReturnType<Collection<TSchema>['replaceOne']> {
        return replaceOneDocument(this.collectionRef, ...args);
    }

    /**
     * 原子查找并更新单个文档。
     * @since v1.3.0
     */
    async findOneAndUpdate(
        ...args: Parameters<Collection<TSchema>['findOneAndUpdate']>
    ): ReturnType<Collection<TSchema>['findOneAndUpdate']> {
        return findOneAndUpdateDocument(this.collectionRef, ...args);
    }

    /**
     * 原子查找并删除单个文档。
     * @since v1.3.0
     */
    async findOneAndDelete(
        ...args: Parameters<Collection<TSchema>['findOneAndDelete']>
    ): ReturnType<Collection<TSchema>['findOneAndDelete']> {
        return findOneAndDeleteDocument(this.collectionRef, ...args);
    }

    /**
     * 便利 upsert 包装。
     * @since v1.3.0
     */
    async upsertOne(
        filter: Parameters<Collection<TSchema>['updateOne']>[0],
        update: Parameters<Collection<TSchema>['updateOne']>[1],
        options?: Parameters<Collection<TSchema>['updateOne']>[2],
    ): ReturnType<Collection<TSchema>['updateOne']> {
        return upsertOneDocument(this.collectionRef, filter, update, options);
    }

    /**
     * 原生删除透传。
     * @since v1.3.0
     */
    async deleteOne(...args: Parameters<Collection<TSchema>['deleteOne']>): ReturnType<Collection<TSchema>['deleteOne']> {
        return deleteOneDocument(this.collectionRef, ...args);
    }

    /**
     * 原生批量删除透传。
     * @since v1.3.0
     */
    async deleteMany(...args: Parameters<Collection<TSchema>['deleteMany']>): ReturnType<Collection<TSchema>['deleteMany']> {
        return deleteManyDocuments(this.collectionRef, ...args);
    }

    /**
     * 创建单个索引。
     * @since v1.3.0
     */
    async createIndex(
        keys: Document,
        options?: Parameters<Collection<TSchema>['createIndex']>[1],
    ): Promise<IndexCreateResult> {
        return createIndexDefinition(this.collectionRef, keys, options);
    }

    /**
     * 批量创建索引。
     * @since v1.3.0
     */
    async createIndexes(specs: Array<{ key: Document; } & Record<string, unknown>>): Promise<string[]> {
        return createIndexDefinitions(this.collectionRef, specs);
    }

    /**
     * 列出集合索引。
     * @since v1.3.0
     */
    async listIndexes(): Promise<Record<string, unknown>[]> {
        return listIndexDefinitions(this.collectionRef);
    }

    /**
     * 删除指定索引。
     * @since v1.3.0
     */
    async dropIndex(name: string): ReturnType<Collection<TSchema>['dropIndex']> {
        return dropIndexDefinition(this.collectionRef, name);
    }

    /**
     * 删除所有非 `_id_` 索引。
     * @since v1.3.0
     */
    async dropIndexes(): ReturnType<Collection<TSchema>['dropIndexes']> {
        return dropIndexDefinitions(this.collectionRef);
    }

    /**
     * 预热 findPage 书签缓存。
     * @since v1.3.0
     */
    async prewarmBookmarks(
        keyDims: BookmarkKeyDims<TSchema> = {},
        pages: number[] = [],
    ): Promise<BookmarkPrewarmResult> {
        return prewarmBookmarks({
            namespace: `${this.dbName}:${this.collectionName}`,
            cache: this.management.cache,
            logger: this.management.logger,
            keyDims,
            pages,
            findPage: (options) => this.findPage(options),
        });
    }

    /**
     * 列出 findPage 书签缓存。
     * @since v1.3.0
     */
    async listBookmarks(keyDims?: BookmarkKeyDims<TSchema>): Promise<BookmarkListResult> {
        return listBookmarks({
            namespace: `${this.dbName}:${this.collectionName}`,
            cache: this.management.cache,
            keyDims,
        });
    }

    /**
     * 清理 findPage 书签缓存。
     * @since v1.3.0
     */
    async clearBookmarks(keyDims?: BookmarkKeyDims<TSchema>): Promise<BookmarkClearResult> {
        return clearBookmarks({
            namespace: `${this.dbName}:${this.collectionName}`,
            cache: this.management.cache,
            keyDims,
        });
    }
}

export class MongoDbAccessor {
    constructor(
        private readonly dbName: string,
        private readonly dbRef: Db,
        private readonly management: {
            cache?: BookmarkCacheLike | null;
            logger?: Logger;
        } = {},
    ) {}

    /**
     * 获取集合访问器。
     * @since v1.3.0
     */
    collection<TSchema extends Document = Document>(name: string): MongoCollectionAccessor<TSchema> {
        return new MongoCollectionAccessor<TSchema>(
            this.dbName,
            name,
            this.dbRef.collection<TSchema>(name),
            this.management,
        );
    }

    /**
     * 透传原生 MongoDB Db。
     * @since v1.3.0
     */
    raw(): Db {
        return this.dbRef;
    }

    /**
     * 获取数据库级 admin façade。
     * @since v1.3.0
     */
    admin(): {
        ping: () => Promise<boolean>;
        buildInfo: () => Promise<AdminBuildInfoView>;
        serverStatus: (options?: { scale?: number; }) => Promise<ServerStatusView>;
        stats: (options?: { scale?: number; }) => Promise<DbStatsView>;
    } {
        const admin = new MongoAdminAccessor(this.dbRef, this.management.logger);
        return {
            ping: () => admin.ping(),
            buildInfo: () => admin.buildInfo(),
            serverStatus: (options) => admin.serverStatus(options),
            stats: (options) => admin.stats(options),
        };
    }
}

