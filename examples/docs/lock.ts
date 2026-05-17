/**
 * Distributed lock: withLock, acquireLock, tryAcquireLock.
 * See: docs/business-lock.md
 *
 * NOTE: Full distributed locking requires Redis (ioredis).
 * This example uses fallbackToNoLock: true so it runs without Redis,
 * demonstrating the same API patterns used in production.
 *
 * Production setup (with Redis):
 *   const redis = new Redis('redis://localhost:6379');
 *   new MonSQLize({ ..., cache: { transaction: { distributedLock: { redis } } } });
 *
 * Run:
 *   npm run build && tsc -p tsconfig.examples.json
 *   node .generated/examples-dist/examples/docs/lock.js
 */
import { setupReplicaSetExample, teardownExample } from '../helpers/bootstrap.js';

interface ProductDoc { sku: string; stock: number; reserved: number; price: number; }

async function main() {
    const { msq, server } = await setupReplicaSetExample('example-lock');
    const products = msq.collection<ProductDoc>('products');
    const orders = msq.collection('orders');

    await products.insertMany([
        { sku: 'WGT-001', stock: 10, reserved: 0, price: 29.99 },
        { sku: 'GDG-001', stock: 5, reserved: 0, price: 79.99 },
    ]);

    // Option for examples without Redis: fallbackToNoLock executes the callback
    // without locking. In production with Redis configured this flag is omitted.
    const lockOpts = { ttl: 5000, retryTimes: 3, retryDelay: 100, fallbackToNoLock: true };

    // ── withLock — auto-managed lock lifecycle ────────────────────────────
    console.log('=== withLock: inventory deduction ===');
    const orderId = await msq.withLock(`inventory:WGT-001`, async () => {
        const product = await products.findOne({ sku: 'WGT-001' });
        if (!product || product.stock < 2) throw new Error('Insufficient stock');
        await products.updateOne({ sku: 'WGT-001' }, { $inc: { stock: -2, reserved: 2 } });
        const result = await orders.insertOne({ sku: 'WGT-001', qty: 2, status: 'pending' });
        return result.insertedId;
    }, lockOpts);
    console.log(`  Order created: ${orderId ? 'ok' : 'failed'}`);

    const widgetAfter = await products.findOne({ sku: 'WGT-001' });
    console.log(`  Widget stock: ${widgetAfter?.stock} reserved: ${widgetAfter?.reserved}`);

    // ── withLock returning a value ────────────────────────────────────────
    console.log('\n=== withLock returning computed value ===');
    const priceTotal = await msq.withLock(`pricing:GDG-001`, async () => {
        const p = await products.findOne({ sku: 'GDG-001' });
        return (p?.price ?? 0) * 3;
    }, lockOpts);
    console.log(`  Total price for 3x Gadget: $${priceTotal}`);

    // ── tryAcquireLock — non-blocking attempt ────────────────────────────
    console.log('\n=== tryAcquireLock ===');
    const lock = await msq.tryAcquireLock('cron:daily-cleanup', { ttl: 3000, fallbackToNoLock: true });
    if (lock) {
        try {
            console.log('  Lock acquired — running cleanup logic');
            // ... cleanup work ...
            await new Promise(r => setTimeout(r, 10));
        } finally {
            await (lock as unknown as { release(): Promise<void> }).release();
            console.log('  Lock released');
        }
    } else {
        console.log('  Could not acquire lock — another instance is running');
    }

    // ── acquireLock — manual lifecycle with renew ─────────────────────────
    console.log('\n=== acquireLock with manual lifecycle ===');
    const manualLock = await msq.acquireLock('resource:report', { ttl: 5000, retryTimes: 2, fallbackToNoLock: true });
    try {
        console.log('  Lock acquired for report generation');
        // Simulate work that needs lock renewal
        await new Promise(r => setTimeout(r, 10));
        await (manualLock as unknown as { renew(ttl?: number): Promise<void> }).renew(5000);
        console.log('  Lock renewed');
    } finally {
        await (manualLock as unknown as { release(): Promise<void> }).release();
        console.log('  Lock released');
    }

    // ── withLock with error → automatic lock release ───────────────────────
    console.log('\n=== withLock — error auto-releases lock ===');
    try {
        await msq.withLock('order:fail-demo', async () => {
            throw new Error('Business rule violation');
        }, lockOpts);
    } catch (e) {
        console.log(`  Error caught: ${(e as Error).message}`);
        console.log('  Lock was automatically released');
    }

    // ── Lock stats ────────────────────────────────────────────────────────
    console.log('\n=== Lock stats ===');
    const stats = msq.getLockStats();
    console.log(`  Acquired: ${stats?.locksAcquired ?? 0} | Released: ${stats?.locksReleased ?? 0}`);

    await teardownExample(msq, server);
    console.log('\n✅ Lock example complete');
}

main().catch((err) => {
    console.error('❌ Example failed:', err);
    process.exit(1);
});
