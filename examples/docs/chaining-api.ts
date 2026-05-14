/**
 * Chaining API example — FindChain and AggregateChain.
 * See: docs/chaining-api.md
 *
 * Run:
 *   npm run build && tsc -p tsconfig.examples.json
 *   node .generated/examples-dist/examples/docs/chaining-api.js
 */
import { setupExample, teardownExample } from '../helpers/bootstrap.js';

async function main() {
    const { msq, server } = await setupExample('example-chaining');
    const products = msq.collection('products');

    await products.insertMany([
        { name: 'Widget A', category: 'tools', price: 9.99, rating: 4.5, inStock: true },
        { name: 'Widget B', category: 'tools', price: 14.99, rating: 3.8, inStock: true },
        { name: 'Gadget X', category: 'electronics', price: 49.99, rating: 4.9, inStock: true },
        { name: 'Gadget Y', category: 'electronics', price: 79.99, rating: 4.2, inStock: false },
        { name: 'Part Z', category: 'parts', price: 2.99, rating: 4.0, inStock: true },
    ]);

    // ── FindChain — chained query builder ────────────────────────────────
    const topTools = await products
        .find({ category: 'tools', inStock: true })
        .sort({ rating: -1 })
        .limit(5)
        .project({ name: 1, price: 1, rating: 1, _id: 0 });

    console.log('Top tools:');
    for (const p of topTools as Record<string, unknown>[]) {
        console.log(`  ${p.name}: $${p.price} (★ ${p.rating})`);
    }

    // ── FindChain — maxTimeMS + comment ───────────────────────────────────
    const withHints = await products
        .find({ inStock: true })
        .sort({ price: 1 })
        .skip(1)
        .limit(3)
        .maxTimeMS(5000)
        .comment('CatalogAPI:getPage');

    console.log('With hints:', (withHints as Record<string, unknown>[]).length, 'items');

    // ── AggregateChain ────────────────────────────────────────────────────
    const aggResult = await products
        .aggregate([
            { $match: { inStock: true } },
            { $group: { _id: '$category', avgPrice: { $avg: '$price' }, count: { $sum: 1 } } },
            { $sort: { avgPrice: -1 } },
        ])
        .allowDiskUse(false)
        .maxTimeMS(10000);

    console.log('Category avg prices:');
    for (const cat of aggResult as Record<string, unknown>[]) {
        console.log(`  ${cat._id}: avg $${(cat.avgPrice as number).toFixed(2)} (${cat.count} items)`);
    }

    await teardownExample(msq, server);
    console.log('✅ Chaining API example complete');
}

main().catch((err) => {
    console.error('❌ Example failed:', err);
    process.exit(1);
});
