/**
 * Function cache example: withCache + FunctionCache.
 * See: docs/function-cache.md
 *
 * Run:
 *   npm run build && tsc -p tsconfig.examples.json
 *   node .generated/examples-dist/examples/docs/function-cache.js
 */
import MonSQLize from 'monsqlize';
import { setupExample, teardownExample } from '../helpers/bootstrap.js';

interface UserDoc {
    userId: string;
    plan: string;
}

interface OrderDoc {
    userId: string;
    total: number;
}

interface Dashboard {
    userId: string;
    plan: string;
    orderCount: number;
    total: number;
}

async function main() {
    const { msq, server } = await setupExample('example-function-cache');

    try {
        const cache = new MonSQLize.MemoryCache({ maxEntries: 100, defaultTtl: 60_000 });
        const users = msq.collection<UserDoc>('function_cache_users');
        const orders = msq.collection<OrderDoc>('function_cache_orders');

        await users.insertMany([
            { userId: 'u1', plan: 'pro' },
            { userId: 'u2', plan: 'free' },
        ]);
        await orders.insertMany([
            { userId: 'u1', total: 25 },
            { userId: 'u1', total: 40 },
            { userId: 'u2', total: 5 },
        ]);

        let dashboardLoads = 0;
        const loadDashboard = MonSQLize.withCache(async (userId: string): Promise<Dashboard> => {
            dashboardLoads += 1;
            const user = await users.findOne({ userId });
            const rows = await orders.find({ userId });
            return {
                userId,
                plan: user?.plan ?? 'free',
                orderCount: rows.length,
                total: rows.reduce((sum, order) => sum + order.total, 0),
            };
        }, {
            cache,
            namespace: 'dashboard',
            ttl: 60_000,
            keyBuilder: (userId: string) => `user:${userId}`,
            condition: (result: Dashboard) => result.orderCount > 0,
        });

        const dashboardA = await loadDashboard('u1');
        const dashboardB = await loadDashboard('u1');
        const dashboardStats = loadDashboard.stats();
        console.log('withCache dashboard loads:', dashboardLoads);
        console.log('withCache dashboard total:', dashboardA.total, dashboardB.total);
        console.log('withCache stats:', `hits=${dashboardStats.hits}`, `misses=${dashboardStats.misses}`);

        const functionCache = new MonSQLize.FunctionCache(cache, {
            namespace: 'analytics',
            ttl: 60_000,
        });

        let totalLoads = 0;
        await functionCache.register('orderTotal', async (...args: unknown[]) => {
            totalLoads += 1;
            const userId = args[0] as string;
            const rows = await orders.find({ userId });
            return rows.reduce((sum, order) => sum + order.total, 0);
        }, {
            keyBuilder: (userId: unknown) => `total:${String(userId)}`,
        });

        const totalA = await functionCache.execute('orderTotal', 'u1') as number;
        const totalB = await functionCache.execute('orderTotal', 'u1') as number;
        await functionCache.invalidate('orderTotal', 'u1');
        const totalC = await functionCache.execute('orderTotal', 'u1') as number;
        const stats = functionCache.getStats('orderTotal') as { hits: number; misses: number; calls: number };

        console.log('FunctionCache totals:', totalA, totalB, totalC);
        console.log('FunctionCache loads after invalidate:', totalLoads);
        console.log('FunctionCache stats:', `hits=${stats.hits}`, `misses=${stats.misses}`, `calls=${stats.calls}`);
    } finally {
        await teardownExample(msq, server);
    }

    console.log('Function cache example complete');
}

main().catch((err) => {
    console.error('Example failed:', err);
    process.exit(1);
});
