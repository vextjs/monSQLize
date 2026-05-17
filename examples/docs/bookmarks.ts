/**
 * Bookmark maintenance example — prewarm, list, and clear bookmark cache.
 * See: docs/bookmarks.md
 */
import { setupExample, teardownExample } from '../helpers/bootstrap.js';

async function main() {
    const { msq, server } = await setupExample('example-bookmarks');
    const posts = msq.collection('posts');

    await posts.insertMany([
        { title: 'A', status: 'published', createdAt: new Date('2026-05-01T00:00:00Z') },
        { title: 'B', status: 'published', createdAt: new Date('2026-05-02T00:00:00Z') },
        { title: 'C', status: 'published', createdAt: new Date('2026-05-03T00:00:00Z') },
        { title: 'D', status: 'published', createdAt: new Date('2026-05-04T00:00:00Z') },
    ]);

    const keyDims = {
        query: { status: 'published' },
        sort: { createdAt: 1 },
        limit: 1,
    };

    const prewarmed = await posts.prewarmBookmarks(keyDims, [1, 2, 3]);
    const listed = await posts.listBookmarks(keyDims);
    const cleared = await posts.clearBookmarks(keyDims);

    console.log('prewarm warmed:', prewarmed.warmed, '| failed:', prewarmed.failed);
    console.log('listed pages:', listed.pages?.join(', ') ?? 'none');
    console.log('clear result:', cleared.cleared, '| keysBefore:', cleared.keysBefore);

    await teardownExample(msq, server);
    console.log('✅ Bookmarks example complete');
}

main().catch((err) => {
    console.error('❌ Example failed:', err);
    process.exit(1);
});
