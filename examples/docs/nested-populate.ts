/**
 * Nested populate example: author -> posts -> comments -> comment author.
 * See: docs/model/nested-populate.md
 *
 * Run:
 *   npm run build && tsc -p tsconfig.examples.json
 *   node .generated/examples-dist/examples/docs/nested-populate.js
 */
import MonSQLize from 'monsqlize';
import { setupExample, teardownExample } from '../helpers/bootstrap.js';

interface NestedAuthorDoc {
    username: string;
}

interface NestedPostDoc {
    authorId: string;
    title: string;
}

interface NestedCommentDoc {
    postId: string;
    authorId: string;
    body: string;
}

MonSQLize.Model.define('nested_authors', {
    schema: {},
    relations: {
        posts: { from: 'nested_posts', localField: '_id', foreignField: 'authorId', single: false },
    },
});

MonSQLize.Model.define('nested_posts', {
    schema: {},
    relations: {
        comments: { from: 'nested_comments', localField: '_id', foreignField: 'postId', single: false },
    },
});

MonSQLize.Model.define('nested_comments', {
    schema: {},
    relations: {
        author: { from: 'nested_authors', localField: 'authorId', foreignField: '_id', single: true },
    },
});

async function main() {
    const { msq, server } = await setupExample('example-nested-populate');

    try {
        const Authors = msq.model<NestedAuthorDoc>('nested_authors');
        const Posts = msq.model<NestedPostDoc>('nested_posts');
        const Comments = msq.model<NestedCommentDoc>('nested_comments');

        const alice = await Authors.insertOne({ username: 'alice' });
        const bob = await Authors.insertOne({ username: 'bob' });
        const aliceId = String(alice.insertedId);
        const bobId = String(bob.insertedId);
        const post = await Posts.insertOne({ authorId: aliceId, title: 'Nested populate guide' });
        const postId = String(post.insertedId);

        await Comments.insertMany([
            { postId, authorId: bobId, body: 'Looks useful' },
            { postId, authorId: aliceId, body: 'Thanks for reading' },
        ]);

        const result = await Authors.findOne({ username: 'alice' }).populate({
            path: 'posts',
            populate: {
                path: 'comments',
                sort: { body: 1 },
                populate: 'author',
            },
        }) as NestedAuthorDoc & {
            posts?: Array<NestedPostDoc & {
                comments?: Array<NestedCommentDoc & { author?: NestedAuthorDoc }>;
            }>;
        };

        const firstPost = result.posts?.[0];
        const commentAuthors = firstPost?.comments?.map((comment) => comment.author?.username).join(', ');
        console.log('author:', result.username);
        console.log('post:', firstPost?.title);
        console.log('nested comment count:', firstPost?.comments?.length ?? 0);
        console.log('nested comment authors:', commentAuthors);
    } finally {
        MonSQLize.Model._clear();
        await teardownExample(msq, server);
    }

    console.log('Nested populate example complete');
}

main().catch((err) => {
    console.error('Example failed:', err);
    process.exit(1);
});
