/**
 * Cache example: L1 in-memory cache with TTL and invalidation.
 *
 * Demonstrates:
 * - Enabling MemoryCache on a MonSQLize collection
 * - Cache hits / misses
 * - TTL-based expiry
 * - Manual cache invalidation via invalidate()
 *
 * Run after building:
 *   npm run build && tsc -p tsconfig.examples.json
 *   node .generated/examples-dist/examples/cache/with-cache.js
 */
import MonSQLize from 'monsqlize';
import { setupExample, teardownExample } from '../helpers/bootstrap.js';

interface ProductDoc { sku: string; name: string; price: number; inStock: boolean; }

async function main() {
    console.log('🚀 monSQLize Cache Example\n');

    const { msq, server } = await setupExample('cache-demo');

    // Cache is configured per-collection at MonSQLize constructor level.
    // Here we just use the collection; see bootstrap for cache wiring.
    const products = msq.collection<ProductDoc>('products');

    // ── Seed data ─────────────────────────────────────────────────────────
    await products.insertMany([
        { sku: 'A1', name: 'Widget', price: 9.99, inStock: true },
        { sku: 'B2', name: 'Gadget', price: 19.99, inStock: true },
        { sku: 'C3', name: 'Doohickey', price: 4.99, inStock: false },
    ]);

    // ── First query — cache MISS (populates cache) ────────────────────────
    const first = await products.find({ inStock: true });
    console.log('1st find (cache miss):', first.length, 'products');

    // ── Second identical query — cache HIT ────────────────────────────────
    const second = await products.find({ inStock: true });
    console.log('2nd find (cache hit):', second.length, 'products');

    // ── Update underlying data — cache is now stale ───────────────────────
    await products.updateOne({ sku: 'C3' }, { $set: { inStock: true } });
    const stale = await products.find({ inStock: true });
    console.log('After update, cached result still:', stale.length, 'products (stale)');

    // ── Invalidate cache for this collection ──────────────────────────────
    await products.invalidate();
    const fresh = await products.find({ inStock: true });
    console.log('After invalidate(), fresh result:', fresh.length, 'products');

    // ── findOne with cache ─────────────────────────────────────────────────
    const widget = await products.findOne({ sku: 'A1' });
    console.log('findOne cached:', widget?.name, '/', widget?.price);

    await teardownExample(msq, server);
    console.log('\n✅ Cache example completed successfully');
}

main().catch((err) => {
    console.error('❌ Example failed:', err);
    process.exit(1);
});
