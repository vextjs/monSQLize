import { expectAssignable, expectType } from 'tsd';
import MonSQLize, {
    type CachedFunction,
    type WithCacheOptions,
} from '../..';

const options: WithCacheOptions<(userId: string) => Promise<{ userId: string }>> = {
    ttl: 5_000,
    namespace: 'typed-cache',
    cache: new MonSQLize.MemoryCache(),
    keyBuilder: (...args: unknown[]) => `user:${String(args[0])}`,
    condition: (result) => result !== null,
    enableStats: true,
};

const cachedUser = MonSQLize.withCache(async (userId: string) => ({ userId }), options);
expectType<CachedFunction<[string], { userId: string }>>(cachedUser);
expectType<Promise<{ userId: string }>>(cachedUser('u1'));
expectType<Promise<void>>(cachedUser.invalidate('u1'));
expectType<Promise<void>>(cachedUser.invalidateAll());
expectAssignable<{ hits: number; misses: number; errors: number; hitRate: number }>(cachedUser.stats());

const runtime = new MonSQLize({
    type: 'mongodb',
    databaseName: 'typed-function-cache',
});

const functionCache = new MonSQLize.FunctionCache(runtime, {
    namespace: 'svc',
    ttl: 10_000,
});

expectType<Promise<void>>(functionCache.register('double', async (...args: unknown[]) => Number(args[0]) * 2, {
    ttl: 1_000,
    keyBuilder: (...args: unknown[]) => `double:${String(args[0])}`,
}));

expectType<Promise<unknown>>(functionCache.execute('double', 2));
expectType<Promise<void>>(functionCache.invalidate('double', 2));
expectType<Promise<number>>(functionCache.invalidatePattern('double:*'));
expectAssignable<
    | { hits: number; misses: number; errors: number; calls: number; totalTime: number; avgTime: number; hitRate: number }
    | Record<string, { hits: number; misses: number; errors: number; calls: number; totalTime: number; avgTime: number; hitRate: number }>
    | null
>(functionCache.getStats());
expectType<string[]>(functionCache.list());
functionCache.resetStats();
functionCache.clear();

const memoryCache = new MonSQLize.MemoryCache();
const lockManager = { isLocked: (_key: string) => false };
memoryCache.setLockManager(lockManager);
expectType<typeof lockManager | null>(memoryCache.getLockManager());

const multiLevelCache = new MonSQLize.MultiLevelCache({ local: memoryCache });
multiLevelCache.setPublish((_msg) => {});
multiLevelCache.setLockManager(lockManager);


