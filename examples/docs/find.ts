/**
 * find() example — query, sort, limit, skip, project.
 * See: docs/find.md
 *
 * Run:
 *   npm run build && tsc -p tsconfig.examples.json
 *   node .generated/examples-dist/examples/docs/find.js
 */
import { setupExample, teardownExample } from '../helpers/bootstrap.js';

interface PostDoc { title: string; views: number; category: string; published: boolean; }

async function main() {
    const { msq, server } = await setupExample('example-find');
    const posts = msq.collection<PostDoc>('posts');

    await posts.insertMany([
        { title: 'TypeScript Tips', views: 100, category: 'tech', published: true },
        { title: 'MongoDB Basics', views: 250, category: 'tech', published: true },
        { title: 'Node.js Patterns', views: 75, category: 'tech', published: true },
        { title: 'Draft Post', views: 0, category: 'tech', published: false },
        { title: 'CSS Grid Guide', views: 180, category: 'design', published: true },
    ]);

    // ── Basic find ────────────────────────────────────────────────────────
    const all = await posts.find({ published: true });
    console.log('All published:', all.length);

    // ── find with sort ────────────────────────────────────────────────────
    const byViews = await posts.find({ published: true }).sort({ views: -1 });
    console.log('Most viewed:', byViews[0]?.title);

    // ── find with limit + skip ────────────────────────────────────────────
    const page2 = await posts.find({ published: true }).sort({ views: -1 }).skip(2).limit(2);
    console.log('Page 2 (2 items):', page2.map((p) => p.title));

    // ── find with project ─────────────────────────────────────────────────
    const titles = await posts.find({}).project({ title: 1, views: 1, _id: 0 });
    console.log('Projected fields:', Object.keys(titles[0] ?? {}));

    // ── find with category filter ─────────────────────────────────────────
    const tech = await posts.find({ category: 'tech', published: true });
    console.log('Tech posts:', tech.length);

    // ── Chaining API ──────────────────────────────────────────────────────
    const chain = await posts
        .find({ published: true })
        .sort({ views: -1 })
        .limit(3)
        .project({ title: 1, views: 1, _id: 0 });
    console.log('Chain result:', chain.map((p) => `${p.title}(${p.views})`));

    await teardownExample(msq, server);
    console.log('✅ find example complete');
}

main().catch((err) => {
    console.error('❌ Example failed:', err);
    process.exit(1);
});
