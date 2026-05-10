import { expectAssignable, expectError, expectType } from 'tsd';
import MonSQLize, {
    type AdminAccessor,
    type CacheLike,
    type CacheLockLike,
    type DeleteBatchResult,
    type BookmarkClearResult,
    type BookmarkListResult,
    type BookmarkPrewarmResult,
    expr,
    createExpression,
    withCache,
    type Collection,
    type DeleteResult,
    type DbAccessor,
    type ExpressionObject,
    type IndexCreateResult,
    type InsertBatchResult,
    type InsertManyResult,
    type InsertOneResult,
    type LoggerLike,
    type ModelAccessor,
    type MonSQLizeOptions,
    type UpdateBatchResult,
    type UpdateResult,
} from 'monsqlize';


const expression = expr('COUNT(*)');
expectType<ExpressionObject>(expression);
expectType<ExpressionObject>(createExpression('SUM(price)'));

const cacheable = withCache(async (userId: string) => ({ userId }));
expectType<Promise<{ userId: string; }>>(cacheable('u_1'));

const logger: LoggerLike = {
    info: (...args: unknown[]) => args,
};

const lockManager: CacheLockLike = {
    isLocked: (_key: string) => false,
};

const db = new MonSQLize({
    type: 'mongodb',
    databaseName: 'p1_types',
    logger,
});

expectAssignable<MonSQLizeOptions>({
    type: 'mongodb',
    databaseName: 'p1_types',
    logger,
    cache: new MonSQLize.MemoryCache(),
});

expectType<Promise<{
    collection: <TSchema = unknown>(name: string) => Collection<TSchema>;
    db: (name?: string) => DbAccessor;
    use: (name: string) => {
        collection: <TSchema = unknown>(collectionName: string) => Collection<TSchema>;
        model: <TDocument = Record<string, unknown>>(modelName: string) => ModelAccessor<TDocument>;
    };
    instance: MonSQLize;
}>>(db.connect());
expectType<Collection>(db.collection('users'));
expectType<DbAccessor>(db.db());
expectType<AdminAccessor>(db.db().admin());
expectAssignable<CacheLike>(MonSQLize.createRedisCacheAdapter({ client: { get() { return null; }, set() {}, del() { return 0; }, exists() { return false; }, scan() { return ['0', []]; } } }));

const users = db.collection<{ name: string; }>('users');
expectType<Promise<number>>(users.count({}));
expectType<Promise<InsertOneResult>>(users.insertOne({ name: 'Ada' }));
expectType<Promise<InsertManyResult>>(users.insertMany([{ name: 'Ada' }, { name: 'Grace' }]));
expectType<Promise<InsertBatchResult>>(users.insertBatch([{ name: 'Ada' }, { name: 'Grace' }]));
expectType<Promise<UpdateResult>>(users.updateOne({}, { $set: { name: 'Ada Lovelace' } }));
expectType<Promise<UpdateResult>>(users.updateMany({}, { $set: { active: true } }));
expectType<Promise<UpdateBatchResult>>(users.updateBatch({}, { $set: { active: true } }));
expectType<Promise<UpdateResult>>(users.replaceOne({}, { name: 'Grace' }));
expectType<Promise<{ name: string; } | null>>(users.findOneAndUpdate({}, { $set: { name: 'Grace' } }));
expectType<Promise<{ name: string; } | null>>(users.findOneAndDelete({ name: 'Grace' }));
expectType<Promise<UpdateResult>>(users.upsertOne({}, { $set: { name: 'Upserted' } }));
expectType<Promise<{ name: string; } | null>>(users.incrementOne({}, 'visits'));
expectType<Promise<DeleteResult>>(users.deleteOne({ name: 'Ada Lovelace' }));
expectType<Promise<DeleteResult>>(users.deleteMany({ active: false }));
expectType<Promise<DeleteBatchResult>>(users.deleteBatch({ active: false }));
expectType<Promise<IndexCreateResult>>(users.createIndex({ email: 1 }));
expectType<Promise<string[]>>(users.createIndexes([{ key: { email: 1 }, unique: true }]));
expectType<Promise<Record<string, unknown>[]>>(users.listIndexes());
expectType<Promise<unknown>>(users.dropIndex('email_1'));
expectType<Promise<unknown>>(users.dropIndexes());
expectType<Promise<BookmarkPrewarmResult>>(users.prewarmBookmarks({ query: { name: 'Ada' }, limit: 1 }, [1]));
expectType<Promise<BookmarkListResult>>(users.listBookmarks({ query: { name: 'Ada' }, limit: 1 }));
expectType<Promise<BookmarkClearResult>>(users.clearBookmarks({ query: { name: 'Ada' }, limit: 1 }));
expectType<Promise<unknown[]>>(users.distinct('name'));
expectType<Promise<unknown[]>>(users.aggregate([]));
expectType<Promise<{ data: { name: string; }[]; page: { page: number; limit: number; }; totals: { total: number; totalPages: number; }; }>>(users.findPage({ page: 1, limit: 10 }));
expectType<Promise<boolean>>(db.db().admin().ping());

const memoryCache = new MonSQLize.MemoryCache();
memoryCache.setLockManager(lockManager);
expectType<CacheLockLike | null>(memoryCache.getLockManager());
expectType<Record<string, unknown>>(memoryCache.getMany(['a']));

// 当前仍明确后移的 API。
expectError(users.findOneAndReplace({}, {}));
expectError(db.db().listDatabases());

