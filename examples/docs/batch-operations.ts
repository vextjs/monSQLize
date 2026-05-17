/**
 * Batch write operations: insertBatch, updateBatch, deleteBatch.
 * See: docs/insertBatch.md, docs/updateBatch.md, docs/deleteBatch.md
 *
 * Run:
 *   npm run build && tsc -p tsconfig.examples.json
 *   node .generated/examples-dist/examples/docs/batch-operations.js
 */
import { setupExample, teardownExample } from '../helpers/bootstrap.js';

interface ProductDoc { sku: string; name: string; price: number; stock: number; active: boolean; }

async function main() {
    const { msq, server } = await setupExample('example-batch-operations');
    const products = msq.collection<ProductDoc>('products');

    // ── insertBatch — chunked multi-document insert ───────────────────────
    console.log('=== insertBatch ===');
    const docs = Array.from({ length: 25 }, (_, i) => ({
        sku: `SKU-${String(i + 1).padStart(3, '0')}`,
        name: `Product ${i + 1}`,
        price: Math.round((5 + i * 2.5) * 100) / 100,
        stock: 100 - i * 2,
        active: i < 20,
    }));
    const insertResult = await products.insertBatch(docs, { batchSize: 10 });
    console.log(`  Inserted: ${insertResult.insertedCount} docs in ${insertResult.batchCount} batches`);

    // ── updateBatch — apply update across matched docs in chunks ──────────
    console.log('\n=== updateBatch ===');
    const updateResult = await products.updateBatch(
        { active: true, stock: { $lte: 70 } },
        { $set: { active: false } },
        { batchSize: 5 },
    );
    console.log(`  Modified: ${updateResult.modifiedCount} | Matched: ${updateResult.matchedCount} | Batches: ${updateResult.batchCount}`);

    // ── Verify inactive count after updateBatch ────────────────────────────
    const inactiveCount = await products.count({ active: false });
    console.log(`  Inactive products now: ${inactiveCount}`);

    // ── deleteBatch — delete matched docs in chunks ───────────────────────
    console.log('\n=== deleteBatch ===');
    const deleteResult = await products.deleteBatch(
        { active: false },
        { batchSize: 5 },
    );
    console.log(`  Deleted: ${deleteResult.deletedCount} | Batches: ${deleteResult.batchCount}`);

    const remaining = await products.count({});
    console.log(`  Remaining products: ${remaining}`);

    // ── insertBatch with retry options ────────────────────────────────────
    console.log('\n=== insertBatch with progress ===');
    const newDocs = Array.from({ length: 8 }, (_, i) => ({
        sku: `NEW-${String(i + 1).padStart(3, '0')}`,
        name: `New Product ${i + 1}`,
        price: 9.99,
        stock: 50,
        active: true,
    }));
    const batchResult = await products.insertBatch(newDocs, { batchSize: 3 });
    console.log(`  Inserted ${batchResult.insertedCount} in ${batchResult.batchCount} batches`);
    console.log(`  Errors: ${(batchResult as unknown as Record<string, unknown>).errors ?? 0}`);

    await teardownExample(msq, server);
    console.log('\n✅ Batch operations example complete');
}

main().catch((err) => {
    console.error('❌ Example failed:', err);
    process.exit(1);
});
