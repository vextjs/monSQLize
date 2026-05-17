/**
 * Collection management example — collections, indexes, views, and admin stats.
 * See: docs/collection-management.md
 */
import { setupExample, teardownExample } from '../helpers/bootstrap.js';

async function main() {
    const { msq, server } = await setupExample('example-collection-management');
    const products = msq.collection('products');

    await products.createCollection();
    await products.insertMany([
        { name: 'Laptop', category: 'electronics', price: 4999, status: 'published' },
        { name: 'Mouse', category: 'electronics', price: 99, status: 'draft' },
        { name: 'Desk', category: 'furniture', price: 899, status: 'published' },
    ]);

    const createdIndex = await products.createIndex(
        { category: 1, price: -1 },
        { name: 'category_price_idx' },
    );
    const indexes = await products.listIndexes();

    const viewCreated = await products.createView(
        'published_products_view',
        'products',
        [{ $match: { status: 'published' } }, { $project: { _id: 0, name: 1, price: 1 } }],
    );
    const published = await msq.collection('published_products_view').find({});

    const adminStats = await msq.db().admin().stats();
    const droppedIndex = await products.dropIndex('category_price_idx') as { ok?: number };
    const droppedView = await msq.collection('published_products_view').dropCollection();

    console.log('createIndex:', createdIndex.name);
    console.log('index count:', indexes.length);
    console.log('createView:', viewCreated);
    console.log('published view rows:', published.length);
    console.log('db name:', adminStats.db);
    console.log('dropIndex ok:', droppedIndex.ok);
    console.log('dropView:', droppedView);

    await teardownExample(msq, server);
    console.log('✅ Collection management example complete');
}

main().catch((err) => {
    console.error('❌ Example failed:', err);
    process.exit(1);
});
