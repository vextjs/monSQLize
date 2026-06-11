/**
 * Relations example: hasOne, hasMany, and belongsTo.
 * See: docs/relations.md
 *
 * Run:
 *   npm run build && tsc -p tsconfig.examples.json
 *   node .generated/examples-dist/examples/docs/relations.js
 */
import MonSQLize from 'monsqlize';
import { setupExample, teardownExample } from '../helpers/bootstrap.js';

interface RelationUserDoc {
    username: string;
}

interface RelationProfileDoc {
    userId: string;
    title: string;
}

interface RelationPostDoc {
    authorId: string;
    title: string;
    status: string;
}

MonSQLize.Model.define('relation_users', {
    schema: {},
    relations: {
        profile: { from: 'relation_profiles', localField: '_id', foreignField: 'userId', single: true },
        posts: { from: 'relation_posts', localField: '_id', foreignField: 'authorId', single: false },
    },
});

MonSQLize.Model.define('relation_profiles', {
    schema: {},
});

MonSQLize.Model.define('relation_posts', {
    schema: {},
    relations: {
        author: { from: 'relation_users', localField: 'authorId', foreignField: '_id', single: true },
    },
});

async function main() {
    const { msq, server } = await setupExample('example-relations');

    try {
        const Users = msq.model<RelationUserDoc>('relation_users');
        const Profiles = msq.model<RelationProfileDoc>('relation_profiles');
        const Posts = msq.model<RelationPostDoc>('relation_posts');

        const alice = await Users.insertOne({ username: 'alice' });
        const aliceId = String(alice.insertedId);
        await Profiles.insertOne({ userId: aliceId, title: 'Platform engineer' });
        await Posts.insertMany([
            { authorId: aliceId, title: 'Schema-first models', status: 'published' },
            { authorId: aliceId, title: 'Cache invalidation notes', status: 'draft' },
        ]);

        const withProfile = await Users.findOne({ username: 'alice' })
            .populate({ path: 'profile' }) as RelationUserDoc & { profile?: RelationProfileDoc };
        console.log('hasOne profile title:', withProfile.profile?.title);

        const withPosts = await Users.findOne({ username: 'alice' })
            .populate({ path: 'posts', sort: { title: 1 } }) as RelationUserDoc & { posts?: RelationPostDoc[] };
        console.log('hasMany post count:', withPosts.posts?.length ?? 0);
        console.log('hasMany first post:', withPosts.posts?.[0]?.title);

        const postWithAuthor = await Posts.findOne({ title: 'Schema-first models' })
            .populate({ path: 'author' }) as RelationPostDoc & { author?: RelationUserDoc };
        console.log('belongsTo author:', postWithAuthor.author?.username);
    } finally {
        MonSQLize.Model._clear();
        await teardownExample(msq, server);
    }

    console.log('Relations example complete');
}

main().catch((err) => {
    console.error('Example failed:', err);
    process.exit(1);
});
