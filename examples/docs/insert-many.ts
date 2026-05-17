/**
 * insertMany() example.
 * See: docs/insert-many.md
 */
import { setupExample, teardownExample } from '../helpers/bootstrap.js';

interface ProductDoc {
    sku: string;
    name: string;
    price: number;
}

async function main() {
    const { msq, server } = await setupExample('example-insert-many');
    const products = msq.collection<ProductDoc>('products');

    const result = await products.insertMany([
        { sku: 'KB-01', name: 'Keyboard', price: 99 },
        { sku: 'MS-02', name: 'Mouse', price: 49 },
        { sku: 'MN-03', name: 'Monitor', price: 399 },
    ]);

    const stored = await products.find({}).sort({ price: 1 });
    console.log('Inserted count:', result.insertedCount);
    console.log('Stored SKUs:', stored.map((product) => product.sku));

    await teardownExample(msq, server);
    console.log('✅ insertMany example complete');
}

main().catch((err) => {
    console.error('❌ Example failed:', err);
    process.exit(1);
});
