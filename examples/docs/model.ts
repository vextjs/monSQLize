/**
 * Model schema, virtuals, methods, relations, and populate example.
 * See: docs/model.md
 *
 * Run:
 *   npm run build && tsc -p tsconfig.examples.json
 *   node .generated/examples-dist/examples/docs/model.js
 */
import { MonSQLize } from 'monsqlize';
import { setupExample, teardownExample } from '../helpers/bootstrap.js';

// ── 1. Define models (static, before connecting) ──────────────────────────
MonSQLize.Model.define('posts', {
    defaults: { status: 'draft' },
    virtuals: {
        titleWithStatus: {
            get(this: Record<string, unknown>) {
                return `${this.title} [${this.status}]`;
            },
        },
    },
});

MonSQLize.Model.define('users', {
    methods: {
        greet(this: Record<string, unknown>) {
            return `Hello, ${this.firstName}!`;
        },
    },
    virtuals: {
        displayName: {
            get(this: Record<string, unknown>) {
                return `${this.firstName} ${this.lastName}`.trim();
            },
        },
    },
    relations: {
        posts: {
            from: 'posts',
            localField: '_id',
            foreignField: 'authorId',
        },
    },
});

async function main() {
    const { msq, server } = await setupExample('example-model');

    const users = msq.model('users');
    const posts = msq.model('posts');

    // ── insertOne via model ───────────────────────────────────────────────
    const alice = await users.insertOne({ firstName: 'Alice', lastName: 'Smith' });
    const adaId = alice.insertedId;
    console.log('Created user id:', adaId ? 'ok' : 'missing');

    await posts.insertOne({ title: 'Hello World', authorId: adaId, status: 'published' });
    await posts.insertOne({ title: 'Draft Post', authorId: adaId });

    // ── findOne + virtuals + methods ──────────────────────────────────────
    const found = await users.findOne({ _id: adaId });
    console.log('displayName virtual:', found?.displayName);
    console.log('greet() method:', (found as Record<string, unknown> & { greet?: () => string })?.greet?.());

    // ── findOneById ───────────────────────────────────────────────────────
    const byId = await users.findOneById(adaId);
    console.log('findOneById:', byId?.firstName);

    // ── findOne + populate ────────────────────────────────────────────────
    const withPosts = await users.findOne({ _id: adaId }).populate({
        path: 'posts',
        sort: { title: 1 },
    });
    const postsList = (withPosts as Record<string, unknown>)?.posts as Record<string, unknown>[] | undefined;
    console.log('populate posts count:', postsList?.length);
    console.log('post virtual:', (postsList?.[0] as Record<string, unknown>)?.titleWithStatus);

    // ── findPage — returns { items, pageInfo } ────────────────────────────
    const page = await users.findPage({ page: 1, limit: 10 });
    console.log('findPage items:', page.items.length, '| endCursor:', typeof page.pageInfo?.endCursor);

    // ── findAndCount — returns { data, total } ────────────────────────────
    const counted = await users.findAndCount({ firstName: 'Alice' });
    console.log('findAndCount total:', counted.total, '| data:', counted.data.length);

    // ── doc.save() — update via model instance ────────────────────────────
    const doc = await users.findOneById(adaId);
    (doc as Record<string, unknown>).nickname = 'Wonderland';
    await doc?.save();
    const reloaded = await users.findOneById(adaId);
    console.log('Saved nickname:', (reloaded as Record<string, unknown>)?.nickname);

    MonSQLize.Model._clear();
    await teardownExample(msq, server);
    console.log('✅ Model example complete');
}

main().catch((err) => {
    console.error('❌ Example failed:', err);
    process.exit(1);
});
