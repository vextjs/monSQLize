/**
 * Focused index management example.
 * See: docs/create-index.md, docs/create-indexes.md, docs/list-indexes.md, docs/drop-index.md
 */
import { setupExample, teardownExample } from '../helpers/bootstrap.js';

interface ArticleDoc {
    slug: string;
    tenantId: string;
    status: 'draft' | 'published';
    title: string;
    tags: string[];
    publishedAt: Date;
}

async function main() {
    const { msq, server } = await setupExample('example-index-management');
    const articles = msq.collection<ArticleDoc>('articles');

    await articles.insertMany([
        {
            slug: 'mongodb-indexes',
            tenantId: 'acme',
            status: 'published',
            title: 'MongoDB indexes',
            tags: ['mongodb', 'performance'],
            publishedAt: new Date('2026-01-01T00:00:00.000Z'),
        },
        {
            slug: 'draft-query-plan',
            tenantId: 'acme',
            status: 'draft',
            title: 'Draft query plan',
            tags: ['draft'],
            publishedAt: new Date('2026-01-02T00:00:00.000Z'),
        },
    ]);

    const singleIndex = await articles.createIndex(
        { slug: 1 },
        { unique: true, name: 'slug_unique' },
    );
    const batchIndexes = await articles.createIndexes([
        { key: { tenantId: 1, status: 1 }, name: 'tenant_status_idx' },
        { key: { tags: 1 }, name: 'tags_idx' },
    ]);

    const indexesBeforeDrop = await articles.listIndexes();
    const published = await articles.find({ tenantId: 'acme', status: 'published' });
    const dropped = await articles.dropIndex('tags_idx') as { ok?: number };
    const indexesAfterDrop = await articles.listIndexes();

    console.log('createIndex:', singleIndex.name);
    console.log('createIndexes:', batchIndexes.join(', '));
    console.log('indexes before drop:', indexesBeforeDrop.map((index) => index.name).join(', '));
    console.log('published articles:', published.map((article) => article.slug).join(', '));
    console.log('dropIndex ok:', dropped.ok);
    console.log('indexes after drop:', indexesAfterDrop.map((index) => index.name).join(', '));

    await teardownExample(msq, server);
    console.log('Index management example complete');
}

main().catch((err) => {
    console.error('Example failed:', err);
    process.exit(1);
});
