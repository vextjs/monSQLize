const MonSQLize = require('../../lib/index.js');

async function main() {
    let originCalls = 0;
    const cache = new MonSQLize.MemoryCache();
    const cached = MonSQLize.withCache((userId) => {
        originCalls += 1;
        return { userId, originCalls };
    }, {
        cache,
        namespace: 'docs-example',
        ttl: 1000,
    });

    const first = await cached('u1');
    const second = await cached('u1');

    const runtime = new MonSQLize({ type: 'mongodb', databaseName: 'docs_function_cache' });
    const functionCache = new MonSQLize.FunctionCache(runtime, {
        namespace: 'svc',
        defaultTTL: 1000,
    });

    functionCache.register('getUser', (userId) => ({ userId, from: 'function-cache' }));
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
    main().catch((error) => {
        console.error(error);
        process.exitCode = 1;
    });
}

module.exports = {
    main,
};

