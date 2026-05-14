/**
 * Insert operations: insertOne, insertMany, insertBatch.
 * See: docs/insert-one.md, docs/insert-many.md, docs/insertBatch.md
 *
 * Run:
 *   npm run build && tsc -p tsconfig.examples.json
 *   node .generated/examples-dist/examples/docs/insert.js
 */
import { setupExample, teardownExample } from '../helpers/bootstrap.js';

async function main() {
    const { msq, server } = await setupExample('example-insert');
    const items = msq.collection('items');

    // ── insertOne ─────────────────────────────────────────────────────────
    const r1 = await items.insertOne({ name: 'Widget', price: 9.99, qty: 100 });
    console.log('insertOne — insertedId:', r1.insertedId ? 'ok' : 'missing');

    // ── insertMany ────────────────────────────────────────────────────────
    const r2 = await items.insertMany([
        { name: 'Gadget', price: 19.99, qty: 50 },
        { name: 'Doohickey', price: 4.99, qty: 200 },
        { name: 'Thingamajig', price: 14.99, qty: 75 },
    ]);
    console.log('insertMany — insertedCount:', r2.insertedCount);

    // ── insertBatch — large dataset in batches ────────────────────────────
    const largeDataset = Array.from({ length: 150 }, (_, i) => ({
        name: `Product-${i + 1}`,
        price: Math.round(Math.random() * 100) + 1,
        qty: Math.floor(Math.random() * 500),
    }));

    const r3 = await items.insertBatch(largeDataset, {
        batchSize: 50,
        onProgress: (progress: import('monsqlize').BatchProgress) => {
            if (progress.currentBatch % 2 === 0) {
                console.log(`insertBatch progress: batch ${progress.currentBatch}/${progress.totalBatches}`);
            }
        },
    });
    console.log('insertBatch — inserted:', r3.insertedCount, '/', r3.totalCount);

    const total = await items.count({});
    console.log('Total items in collection:', total);

    await teardownExample(msq, server);
    console.log('✅ Insert example complete');
}

main().catch((err) => {
    console.error('❌ Example failed:', err);
    process.exit(1);
});
