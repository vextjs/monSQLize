/**
 * findPage() example — cursor-based and offset-based pagination.
 * See: docs/findPage.md
 *
 * Run:
 *   npm run build && tsc -p tsconfig.examples.json
 *   node .generated/examples-dist/examples/docs/find-page.js
 */
import { setupExample, teardownExample } from '../helpers/bootstrap.js';

interface ArticleDoc { title: string; views: number; published: boolean; }

async function main() {
    const { msq, server } = await setupExample('example-find-page');
    const articles = msq.collection<ArticleDoc>('articles');

    // Seed 15 articles
    await articles.insertMany(
        Array.from({ length: 15 }, (_, i) => ({
            title: `Article ${i + 1}`,
            views: (i + 1) * 10,
            published: true,
        })),
    );

    // ── Cursor-based pagination (default) ─────────────────────────────────
    // findPage() takes a single FindPageOptions object.
    const page1 = await articles.findPage({
        query: { published: true },
        limit: 5,
        sort: { views: -1 },
    });
    console.log('Page 1 — items:', page1.items.length);
    console.log('Page 1 — hasNext:', page1.pageInfo.hasNext);
    console.log('Page 1 — hasPrev:', page1.pageInfo.hasPrev);
    console.log('Page 1 — cursor:', page1.pageInfo.endCursor ? 'present' : 'absent');

    // ── Next page using cursor ─────────────────────────────────────────────
    const page2 = await articles.findPage({
        query: { published: true },
        limit: 5,
        sort: { views: -1 },
        after: page1.pageInfo.endCursor ?? undefined,
    });
    console.log('Page 2 — items:', page2.items.length);
    console.log('Page 2 — hasNext:', page2.pageInfo.hasNext);

    // ── Offset-based pagination via page number ────────────────────────────
    const offset2 = await articles.findPage({
        query: { published: true },
        limit: 5,
        sort: { views: 1 },
        page: 2,
    });
    console.log('Offset page 2 — first title:', offset2.items[0]?.title);

    await teardownExample(msq, server);
    console.log('✅ findPage example complete');
}

main().catch((err) => {
    console.error('❌ Example failed:', err);
    process.exit(1);
});
