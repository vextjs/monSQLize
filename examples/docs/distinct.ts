/**
 * distinct() example.
 * See: docs/distinct.md
 */
import { setupExample, teardownExample } from '../helpers/bootstrap.js';

interface ProductDoc {
    name: string;
    category: string;
    brand: string;
    active: boolean;
}

async function main() {
    const { msq, server } = await setupExample('example-distinct');
    const products = msq.collection<ProductDoc>('products');

    await products.insertMany([
        { name: 'Keyboard', category: 'peripherals', brand: 'Acme', active: true },
        { name: 'Mouse', category: 'peripherals', brand: 'Acme', active: true },
        { name: 'Monitor', category: 'display', brand: 'Vision', active: true },
        { name: 'Dock', category: 'accessories', brand: 'Acme', active: false },
    ]);

    const brands = await products.distinct('brand');
    const activeCategories = await products.distinct('category', { active: true });

    console.log('Brands:', brands);
    console.log('Active categories:', activeCategories);

    await teardownExample(msq, server);
    console.log('✅ distinct example complete');
}

main().catch((err) => {
    console.error('❌ Example failed:', err);
    process.exit(1);
});
