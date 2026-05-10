import { expectAssignable, expectType } from 'tsd';
import MonSQLize, {
    type CachedFunction,
    type CacheStats,
    type WithCacheOptions,
} from 'monsqlize';

const options: WithCacheOptions = {
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
expectType<Promise<boolean>>(cachedUser.invalidate('u1'));
expectAssignable<CacheStats & { errors: number; avgTime: number }>(cachedUser.getCacheStats());

const runtime = new MonSQLize({
    type: 'mongodb',
    databaseName: 'typed-function-cache',
});

const functionCache = new MonSQLize.FunctionCache(runtime, {
    namespace: 'svc',
    defaultTTL: 10_000,
    enableStats: true,
});

functionCache.register('double', async (...args: unknown[]) => Number(args[0]) * 2, {
    ttl: 1_000,
    keyBuilder: (...args: unknown[]) => `double:${String(args[0])}`,
});

expectType<Promise<unknown>>(functionCache.execute('double', 2));
expectType<Promise<boolean>>(functionCache.invalidate('double', 2));
expectType<Promise<number>>(functionCache.invalidatePattern('double:*'));
expectType<Record<string, unknown>>(functionCache.getStats());
expectType<string[]>(functionCache.list());
functionCache.resetStats();
functionCache.clear();


