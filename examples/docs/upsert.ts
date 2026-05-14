/**
 * Upsert operations: upsertOne, findOneAndUpdate, findOneAndReplace, replaceOne.
 * See: docs/upsert-one.md, docs/find-one-and-update.md, docs/find-one-and-replace.md, docs/replace-one.md
 *
 * Run:
 *   npm run build && tsc -p tsconfig.examples.json
 *   node .generated/examples-dist/examples/docs/upsert.js
 */
import { setupExample, teardownExample } from '../helpers/bootstrap.js';

interface CounterDoc { key: string; value: number; }
interface ProductDoc { sku: string; name: string; price: number; stock: number; }

async function main() {
    const { msq, server } = await setupExample('example-upsert');
    const counters = msq.collection<CounterDoc>('counters');
    const products = msq.collection<ProductDoc>('products');

    await products.insertOne({ sku: 'X1', name: 'Widget', price: 9.99, stock: 100 });

    // ── upsertOne — insert or update ──────────────────────────────────────
    const u1 = await counters.upsertOne(
        { key: 'page_views' },
        { $inc: { value: 1 } },
        { $setOnInsert: { key: 'page_views', value: 1 } },
    );
    console.log('upsertOne (insert):', u1.upsertedId ? 'inserted' : 'updated');

    // Second call — updates the existing document
    const u2 = await counters.upsertOne(
        { key: 'page_views' },
        { $inc: { value: 1 } },
        { $setOnInsert: { key: 'page_views', value: 1 } },
    );
    console.log('upsertOne (update):', u2.modifiedCount === 1 ? 'updated' : 'inserted');

    const counter = await counters.findOne({ key: 'page_views' });
    console.log('Counter value:', counter?.value);

    // ── findOneAndUpdate — returns the modified document ──────────────────
    const updated = await products.findOneAndUpdate(
        { sku: 'X1' },
        { $set: { price: 12.99 }, $inc: { stock: -1 } },
        { returnDocument: 'after' },
    );
    console.log('findOneAndUpdate — new price:', updated?.price, ', stock:', updated?.stock);

    // ── findOneAndReplace — full document replacement ─────────────────────
    const replaced = await products.findOneAndReplace(
        { sku: 'X1' },
        { sku: 'X1', name: 'Super Widget', price: 14.99, stock: 99 },
        { returnDocument: 'after' },
    );
    console.log('findOneAndReplace — name:', replaced?.name);

    // ── replaceOne ────────────────────────────────────────────────────────
    const r1 = await products.replaceOne(
        { sku: 'X1' },
        { sku: 'X1', name: 'Ultimate Widget', price: 19.99, stock: 95 },
    );
    console.log('replaceOne — modifiedCount:', r1.modifiedCount);

    await teardownExample(msq, server);
    console.log('✅ Upsert example complete');
}

main().catch((err) => {
    console.error('❌ Example failed:', err);
    process.exit(1);
});
