/**
 * Update operations: updateOne, updateMany, updateBatch, incrementOne.
 * See: docs/update-one.md, docs/update-many.md, docs/updateBatch.md, docs/increment-one.md
 *
 * Run:
 *   npm run build && tsc -p tsconfig.examples.json
 *   node .generated/examples-dist/examples/docs/update.js
 */
import { setupExample, teardownExample } from '../helpers/bootstrap.js';

interface ProductDoc { sku: string; name: string; price: number; stock: number; category: string; }

async function main() {
    const { msq, server } = await setupExample('example-update');
    const products = msq.collection<ProductDoc>('products');

    await products.insertMany([
        { sku: 'P001', name: 'Widget', price: 9.99, stock: 100, category: 'tools' },
        { sku: 'P002', name: 'Gadget', price: 19.99, stock: 50, category: 'tools' },
        { sku: 'P003', name: 'Doohickey', price: 4.99, stock: 200, category: 'parts' },
    ]);

    // ── updateOne ─────────────────────────────────────────────────────────
    const u1 = await products.updateOne({ sku: 'P001' }, { $set: { price: 12.99 } });
    console.log('updateOne — modifiedCount:', u1.modifiedCount);
    const p1 = await products.findOne({ sku: 'P001' });
    console.log('Updated price:', p1?.price);

    // ── updateMany ────────────────────────────────────────────────────────
    const u2 = await products.updateMany({ category: 'tools' }, { $inc: { stock: -5 } });
    console.log('updateMany — modifiedCount:', u2.modifiedCount);

    // ── incrementOne — atomic field increment ─────────────────────────────
    const u3 = await products.incrementOne({ sku: 'P002' }, 'stock', 10);
    console.log('incrementOne — acknowledged:', u3.acknowledged, '| new stock:', u3.value?.stock);

    // ── updateBatch — bulk updates with individual conditions ─────────────
    const r = await products.updateBatch(
        { sku: { $in: ['P001', 'P003'] } },
        { $set: { category: 'featured' } },
        { batchSize: 2 },
    );
    console.log('updateBatch — modified:', r.modifiedCount, '| batches:', r.batchCount);

    const final = await products.find({}).project({ sku: 1, name: 1, price: 1, stock: 1, _id: 0 });
    console.log('Final products:', JSON.stringify(final, null, 2));

    await teardownExample(msq, server);
    console.log('✅ Update example complete');
}

main().catch((err) => {
    console.error('❌ Example failed:', err);
    process.exit(1);
});
