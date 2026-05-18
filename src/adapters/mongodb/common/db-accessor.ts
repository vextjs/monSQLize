import { Db, Document } from 'mongodb';
import type { Logger } from '../../../core/logger';
import type { QueryCacheLike, RuntimeDefaults } from '../../../types/internal/query';
import {
    MongoAdminAccessor,
    type AdminBuildInfoView,
    type BookmarkCacheLike,
    type DbStatsView,
    type ServerStatusView,
} from '../management';
import { MongoCollectionAccessor } from './collection-accessor';

type DbAccessorManagement = {
    cache?: BookmarkCacheLike | null;
    queryCache?: QueryCacheLike | null;
    getCache?: () => BookmarkCacheLike | null | undefined;
    getQueryCache?: () => QueryCacheLike | null | undefined;
    logger?: Logger;
    defaults?: RuntimeDefaults;
    cacheAutoInvalidate?: boolean;
};

/**
 * High-level MongoDB database accessor.
 * Wraps a `Db` reference and delegates to per-collection accessors.
 * @since v1.0.0
 */
export class MongoDbAccessor {
    constructor(
        private readonly dbName: string,
        private readonly dbRef: Db,
        private readonly management: DbAccessorManagement = {},
    ) {}

    /**
     * Returns the collection accessor.
     * @since v1.3.0
     */
    collection<TSchema extends Document = Document>(name: string): MongoCollectionAccessor<TSchema> {
        return new MongoCollectionAccessor<TSchema>(
            this.dbName,
            name,
            this.dbRef.collection<TSchema>(name),
            this.management,
            this.dbRef,
        );
    }

    /**
     * Returns the native MongoDB Db instance.
     * @since v1.3.0
     */
    raw(): Db {
        return this.dbRef;
    }

    /**
     * Returns the database-level admin façade.
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

    /**
     * Lists all databases (v1-compat).
     * @since v1.3.0
     */
    async listDatabases(options: { nameOnly?: boolean } = {}): Promise<Array<{ name: string; sizeOnDisk: number; empty: boolean }> | string[]> {
        const admin = this.dbRef.admin();
        const result = await admin.listDatabases();
        if (options.nameOnly) {
            return result.databases.map((db: { name: string }) => db.name);
        }
        return result.databases.map((db: { name: string; sizeOnDisk?: number; empty?: boolean }) => ({
            name: db.name,
            sizeOnDisk: db.sizeOnDisk ?? 0,
            empty: db.empty ?? false,
        }));
    }

    /**
     * Drops the current database (v1-compat; requires confirm: true).
     * @since v1.3.0
     */
    async dropDatabase(options: { confirm: boolean; allowProduction?: boolean; user?: string } = { confirm: false }): Promise<{ dropped: boolean; database: string; timestamp: Date }> {
        if (!options.confirm) {
            const err = new Error(
                'dropDatabase requires explicit confirmation. Pass { confirm: true } to proceed.\n\n' +
                '⚠️  WARNING: This will DELETE ALL DATA in the database!\n' +
                '⚠️  This operation CANNOT BE UNDONE!',
            ) as Error & { code: string };
            err.code = 'CONFIRMATION_REQUIRED';
            throw err;
        }
        const isProduction = process.env['NODE_ENV'] === 'production';
        if (isProduction && !options.allowProduction) {
            const err = new Error('dropDatabase is blocked in production. Pass { allowProduction: true } to override.') as Error & { code: string };
            err.code = 'PRODUCTION_BLOCKED';
            throw err;
        }
        this.management.logger?.warn?.('[dropDatabase]', { database: this.dbName, user: options.user ?? 'unknown' });
        await this.dbRef.dropDatabase();
        return { dropped: true, database: this.dbName, timestamp: new Date() };
    }

    /**
     * Lists all collections in the current database (v1-compat).
     * @since v1.3.0
     */
    async listCollections(filter: Record<string, unknown> = {}, options: Record<string, unknown> = {}): Promise<Array<{ name: string; type: string }>> {
        const cursor = this.dbRef.listCollections(filter, options as Parameters<Db['listCollections']>[1]);
        return cursor.toArray() as Promise<Array<{ name: string; type: string }>>;
    }

    /**
     * Executes a raw database command (v1-compat).
     * @since v1.3.0
     */
    async runCommand(command: Record<string, unknown>, options: Record<string, unknown> = {}): Promise<Record<string, unknown>> {
        return this.dbRef.command(command, options as Parameters<Db['command']>[1]) as Promise<Record<string, unknown>>;
    }
}
