import { expectAssignable, expectError, expectType } from 'tsd';
import MonSQLize, {
    type AdminAccessor,
    type CacheLike,
    type CacheLockLike,
    type LockOptions,
    type LockStats,
    type TransactionOptions,
    type TransactionContract,
    type DeleteBatchResult,
    type BookmarkClearResult,
    type BookmarkListResult,
    type BookmarkPrewarmResult,
    type IncrementOneResult,
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
expectType<Promise<IncrementOneResult<{ name: string; }>>>(users.incrementOne({}, 'visits'));
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
const findChain = users.find({ name: 'Ada' });
expectAssignable<Promise<{ name: string; }[]>>(findChain);
findChain.limit(1);
findChain.skip(0);
findChain.sort({ name: 1 });
findChain.project({ name: 1 });
expectType<Promise<unknown>>(findChain.explain());

const aggregateChain = users.aggregate([]);
expectAssignable<Promise<unknown[]>>(aggregateChain);
aggregateChain.allowDiskUse(true);
aggregateChain.batchSize(100);
expectType<Promise<unknown>>(aggregateChain.explain());

expectType<Promise<{ name: string; } | null>>(users.findOneById('507f1f77bcf86cd799439011'));
expectType<Promise<{ name: string; }[]>>(users.findByIds(['507f1f77bcf86cd799439011']));
expectType<Promise<{ data: { name: string; }[]; total: number }>>(users.findAndCount({ name: 'Ada' }));
expectType<Promise<import('monsqlize').FindPageResult<{ name: string; }>>>(users.findPage({ page: 1, limit: 10 }));
expectType<Promise<{ name: string; } | null>>(users.findOneAndReplace({}, { name: 'Grace' }));
expectType<Promise<boolean>>(db.db().admin().ping());

const memoryCache = new MonSQLize.MemoryCache();
memoryCache.setLockManager(lockManager);
expectType<CacheLockLike | null>(memoryCache.getLockManager());
expectType<Record<string, unknown>>(memoryCache.getMany(['a']));

const txOptions: TransactionOptions = { maxDuration: 1000, maxRetries: 1 };
const lockOptions: LockOptions = { ttl: 1000, retryTimes: 1 };
expectType<Promise<TransactionContract>>(db.startSession(txOptions));
expectType<Promise<string>>(db.withTransaction(async (tx) => tx.id, txOptions));
expectType<Promise<number>>(db.withLock('cron:job', async () => 1, lockOptions));
expectType<Promise<import('monsqlize').LockContract>>(db.acquireLock('cron:job', lockOptions));
expectType<Promise<import('monsqlize').LockContract | null>>(db.tryAcquireLock('cron:job', { ttl: 1000 }));
expectType<LockStats>(new MonSQLize.LockManager().getStats());

expectType<Promise<Array<{ name: string; sizeOnDisk: number; empty: boolean }> | string[]>>(db.db().listDatabases());

