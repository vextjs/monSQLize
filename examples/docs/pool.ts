/**
 * Multi-pool routing: ConnectionPoolManager with read/write separation.
 * See: docs/multi-pool.md
 *
 * This example demonstrates:
 * - Adding pools with distinct roles (primary, secondary, analytics)
 * - Pool selection strategies (auto)
 * - Health status and pool stats
 * - Graceful pool removal and shutdown
 *
 * In production you would supply separate MongoDB URIs per pool.
 * Here we reuse the same in-memory server with different pool names so
 * the example runs without external infrastructure.
 *
 * Run:
 *   npm run build && tsc -p tsconfig.examples.json
 *   node .generated/examples-dist/examples/docs/pool.js
 */
import type { MongoClient } from 'mongodb';
import MonSQLize from 'monsqlize';
import { setupReplicaSetExample, teardownExample } from '../helpers/bootstrap.js';

interface OrderDoc { orderId: string; amount: number; status: string; region: string; }

async function main() {
    const { msq, server } = await setupReplicaSetExample('example-pool');

    // Get the replica-set URI from the in-memory server
    const uri = server.getUri();

    // ── ConnectionPoolManager setup ───────────────────────────────────────────
    const poolManager = new MonSQLize.ConnectionPoolManager({
        poolStrategy: 'auto',
        poolFallback: { enabled: true, fallbackStrategy: 'primary', retryDelay: 500, maxRetries: 2 },
    });

    // Primary: handles all writes
    await poolManager.addPool({
        name: 'primary',
        uri,
        role: 'primary',
        weight: 3,
        options: { maxPoolSize: 20, minPoolSize: 2 },
        healthCheck: { enabled: false },   // disabled for in-memory demo
    });

    // Secondary: handles general reads (round-robin candidate)
    await poolManager.addPool({
        name: 'secondary-1',
        uri,
        role: 'secondary',
        weight: 2,
        options: { maxPoolSize: 10 },
        healthCheck: { enabled: false },
    });

    // Analytics: dedicated for heavy aggregations
    await poolManager.addPool({
        name: 'analytics',
        uri,
        role: 'analytics',
        weight: 1,
        options: { maxPoolSize: 5 },
        healthCheck: { enabled: false },
    });

    console.log('=== Pool setup ===');
    // getHealthStatus() returns Record<string, PoolHealthStatus> keyed by pool name
    const registeredNames = Object.keys(poolManager.getHealthStatus());
    console.log(`  Registered pools: ${registeredNames.join(', ')}`);

    // ── Pool selection — auto strategy routes by operation context ─────────────
    console.log('\n=== Auto-strategy pool selection ===');
    // selectPool(operation, options?) — first arg is 'read' | 'write'
    const writePool = poolManager.selectPool('write');
    console.log(`  Write => selected: ${writePool.name}`);

    const readPool = poolManager.selectPool('read');
    console.log(`  Read  => selected: ${readPool.name}`);

    const analyticsPool = poolManager.selectPool('read', {
        poolPreference: { role: 'analytics' },
    });
    console.log(`  Analytics read => selected: ${analyticsPool.name}`);

    // ── Direct pool access via MonSQLize collection ────────────────────────────
    console.log('\n=== Direct query through pool client ===');
    // getPool() returns unknown in public types — cast to MongoClient
    const primaryClient = poolManager.getPool('primary') as MongoClient | null;
    if (primaryClient) {
        const db = primaryClient.db('example-pool');
        const orders = msq.collection<OrderDoc>('orders');

        await orders.insertMany([
            { orderId: 'ORD-001', amount: 150.00, status: 'pending',   region: 'us-east' },
            { orderId: 'ORD-002', amount: 320.50, status: 'completed',  region: 'eu-west' },
            { orderId: 'ORD-003', amount: 89.99,  status: 'pending',   region: 'us-east' },
        ]);

        // Use the primary client for a write (via native collection)
        const nativeOrders = db.collection<OrderDoc>('orders');
        await nativeOrders.updateOne({ orderId: 'ORD-001' }, { $set: { status: 'completed' } });
        console.log(`  Orders updated via primary pool client`);

        // Analytics-style aggregation through analytics pool
        const analyticsClient = poolManager.getPool('analytics') as MongoClient | null;
        if (analyticsClient) {
            const analyticsDb = analyticsClient.db('example-pool');
            const summary = await analyticsDb.collection<OrderDoc>('orders').aggregate([
                { $group: { _id: '$status', total: { $sum: '$amount' }, count: { $sum: 1 } } },
                { $sort: { _id: 1 } },
            ]).toArray();
            console.log('  Aggregation (analytics pool):');
            for (const row of summary) {
                console.log(`    ${row._id}: count=${row.count}, total=$${(row.total as number).toFixed(2)}`);
            }
        }
    }

    // ── Pool stats and health ──────────────────────────────────────────────────
    console.log('\n=== Pool stats and health ===');
    const healthMap = poolManager.getHealthStatus();
    for (const [name, health] of Object.entries(healthMap)) {
        console.log(`  ${name}: status=${health.status}`);
    }

    const statsMap = poolManager.getPoolStats();
    for (const [name, stats] of Object.entries(statsMap)) {
        console.log(`  ${name}: totalRequests=${stats.totalRequests}, errorRate=${stats.errorRate}`);
    }

    // ── Pool removal ───────────────────────────────────────────────────────────
    console.log('\n=== Dynamic pool removal ===');
    await poolManager.removePool('analytics');
    const afterRemove = Object.keys(poolManager.getHealthStatus());
    console.log(`  After remove: ${afterRemove.join(', ')}`);

    // ── Graceful shutdown ──────────────────────────────────────────────────────
    await poolManager.close();
    console.log('  ConnectionPoolManager closed');

    await teardownExample(msq, server);
    console.log('\n=== Multi-pool routing example complete ===');
}

main().catch((err) => {
    console.error('Example failed:', err);
    process.exit(1);
});
