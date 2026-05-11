import MonSQLize from 'monsqlize';

/**
 * 运行最小缓存与函数缓存示例。
 *
 * @returns {Promise<void>}
 * @since v1.3.0
 */
async function main(): Promise<void> {
    let originCalls = 0;
    const cache = new MonSQLize.MemoryCache();
    const cached = MonSQLize.withCache(async (userId: string) => {
        originCalls += 1;
        return { userId, originCalls };
    }, {
        cache,
        namespace: 'docs-example-ts',
        ttl: 1000,
    });

    const first = await cached('u1');
    const second = await cached('u1');

    const runtime = new MonSQLize({ type: 'mongodb', databaseName: 'docs_function_cache_ts' });
    const functionCache = new MonSQLize.FunctionCache(runtime, {
        namespace: 'svc',
        defaultTTL: 1000,
    });

    functionCache.register('getUser', async (...args: unknown[]) => {
        const [userId] = args as [string];
        return { userId, from: 'function-cache' as const };
    });
    const functionFirst = await functionCache.execute('getUser', 'u1');
    const functionSecond = await functionCache.execute('getUser', 'u1');

    console.log(JSON.stringify({
        ok: true,
        withCache: {
            first,
            second,
            originCalls,
        },
        functionCache: {
            first: functionFirst,
            second: functionSecond,
            registered: functionCache.list(),
        },
    }, null, 2));

    functionCache.clear();
}

if (require.main === module) {
    void main().catch((error) => {
        console.error(error);
        process.exitCode = 1;
    });
}

export { main };

