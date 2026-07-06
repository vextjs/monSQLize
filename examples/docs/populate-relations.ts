/**
 * Model populate — chained relation queries (hasMany, belongsTo, hasOne).
 * See: docs/populate.md
 *
 * Run:
 *   npm run build && tsc -p tsconfig.examples.json
 *   node .generated/examples-dist/examples/docs/populate.ts must be renamed to avoid conflict
 *   node .generated/examples-dist/examples/docs/populate-relations.js
 */
import MonSQLize from 'monsqlize';
import { setupExample, teardownExample } from '../helpers/bootstrap.js';

interface AuthorDoc { username: string; email: string; }
interface PostDoc { title: string; authorId: string; status: string; views: number; }
interface ProfileDoc { bio: string; website?: string; userId: string; }

// Define models with relations (static, before connect)
MonSQLize.Model.define('blog_authors', {
    schema: (s) => s({
        username: 'string',
        email: 'string',
    }),
    relations: {
        posts: { from: 'blog_posts', localField: '_id', foreignField: 'authorId', single: false },
        profile: { from: 'blog_profiles', localField: '_id', foreignField: 'userId', single: true },
    },
});

MonSQLize.Model.define('blog_posts', {
    schema: (s) => s({
        title: 'string',
        authorId: 'string',
        status: 'string',
        views: 'number',
    }),
    defaults: { status: 'draft', views: 0 },
    relations: {
        author: { from: 'blog_authors', localField: 'authorId', foreignField: '_id', single: true },
    },
});

MonSQLize.Model.define('blog_profiles', {
    schema: (s) => s({
        bio: 'string',
        website: 'string',
        userId: 'string',
    }),
});

async function main() {
    const { msq, server } = await setupExample('example-populate');
    const Author = msq.model<AuthorDoc>('blog_authors');
    const Post = msq.model<PostDoc>('blog_posts');
    const Profile = msq.model<ProfileDoc>('blog_profiles');

    // ── Seed ───────────────────────────────────────────────────────────────
    const alice = await Author.insertOne({ username: 'alice', email: 'alice@example.com' });
    const bob = await Author.insertOne({ username: 'bob', email: 'bob@example.com' });
    const aliceId = alice.insertedId;
    const bobId = bob.insertedId;

    await Profile.insertOne({ userId: String(aliceId), bio: 'Full-stack dev', website: 'https://alice.dev' });
    await Profile.insertOne({ userId: String(bobId), bio: 'Backend engineer' });

    await Post.insertMany([
        { title: 'Intro to MonSQLize', authorId: String(aliceId), status: 'published', views: 1240 },
        { title: 'Advanced Pipelines', authorId: String(aliceId), status: 'published', views: 890 },
        { title: 'Draft Thoughts', authorId: String(aliceId), status: 'draft', views: 0 },
        { title: 'Getting Started', authorId: String(bobId), status: 'published', views: 3200 },
    ]);

    // ── find + populate hasMany (posts) ───────────────────────────────────
    console.log('=== find + populate posts ===');
    const authors = await Author.find({}).populate({
        path: 'posts',
        sort: { views: -1 },
    }) as Array<AuthorDoc & { posts?: PostDoc[] }>;
    for (const a of authors) {
        console.log(`  ${a.username}: ${a.posts?.length ?? 0} post(s)`);
        a.posts?.slice(0, 2).forEach(p => console.log(`    - "${p.title}" (${p.views} views)`));
    }

    // ── findOne + populate multiple relations ─────────────────────────────
    console.log('\n=== findOne + populate posts + profile ===');
    const aliceWithAll = await Author.findOne({ username: 'alice' })
        .populate({ path: 'posts', sort: { views: -1 }, limit: 2 })
        .populate({ path: 'profile' }) as AuthorDoc & { posts?: PostDoc[]; profile?: ProfileDoc };
    console.log(`  alice posts (top 2): ${aliceWithAll?.posts?.map(p => p.title).join(', ')}`);
    console.log(`  alice bio: ${aliceWithAll?.profile?.bio}`);

    // ── findPage + populate ────────────────────────────────────────────────
    console.log('\n=== findPage + populate ===');
    const page = await Post.findPage({ limit: 10 }).populate({ path: 'author' });
    const items = (page as unknown as { items: Array<PostDoc & { author?: AuthorDoc }> }).items;
    console.log(`  Page items: ${items.length}`);
    for (const p of items) {
        console.log(`  - "${p.title}" by ${p.author?.username ?? 'unknown'}`);
    }

    // ── findAndCount + populate ────────────────────────────────────────────
    console.log('\n=== findAndCount + populate published posts ===');
    const counted = await Post.findAndCount({ status: 'published' }).populate({ path: 'author' });
    const data = (counted as unknown as { data: Array<PostDoc & { author?: AuthorDoc }>; total: number });
    console.log(`  Total published: ${data.total}`);
    for (const p of data.data) {
        console.log(`  - "${p.title}" (${p.views} views) by ${p.author?.username ?? 'unknown'}`);
    }

    MonSQLize.Model._clear();
    await teardownExample(msq, server);
    console.log('\n✅ Populate example complete');
}

main().catch((err) => {
    console.error('❌ Example failed:', err);
    process.exit(1);
});
