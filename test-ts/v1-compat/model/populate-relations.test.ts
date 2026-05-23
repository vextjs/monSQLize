import { after, afterEach, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';

import MonSQLize from 'monsqlize';

const { createMemoryServerBootstrap } = require(path.join(process.cwd(), 'test', 'bootstrap', 'memory-server'));

type AuthorDoc = {
    username: string;
    email: string;
    posts?: PostDoc[];
    profile?: ProfileDoc;
};

type PostDoc = {
    title: string;
    authorId: string;
    status: string;
    views: number;
    author?: AuthorDoc;
};

type ProfileDoc = {
    bio: string;
    website?: string;
    userId: string;
};

function schema(shape: Record<string, string>) {
    return (dsl: unknown) => (dsl as (input: Record<string, string>) => Record<string, unknown>)(shape);
}

describe('Stage B model populate/relations TS migration', () => {
    const bootstrap = createMemoryServerBootstrap({ dbName: 'monsqlize_stage_b_model_populate' });
    let uri: string;

    before(async () => {
        const context = await bootstrap.setup();
        uri = context.uri;
    });

    after(async () => {
        MonSQLize.Model._clear();
        await bootstrap.teardown();
    });

    afterEach(() => {
        MonSQLize.Model._clear();
    });

    it('find/findOne/findAndCount 应保持 populate + relations 组合路径稳定', async () => {
        const suffix = Date.now();
        const authorModel = `stage_b_authors_${suffix}`;
        const postModel = `stage_b_posts_${suffix}`;
        const profileModel = `stage_b_profiles_${suffix}`;

        MonSQLize.Model.define(authorModel, {
            schema: schema({ username: 'string', email: 'string' }),
            relations: {
                posts: { from: postModel, localField: '_id', foreignField: 'authorId', single: false },
                profile: { from: profileModel, localField: '_id', foreignField: 'userId', single: true },
            },
        });

        MonSQLize.Model.define(postModel, {
            schema: schema({ title: 'string', authorId: 'string', status: 'string', views: 'number' }),
            defaults: { status: 'draft', views: 0 },
            relations: {
                author: { from: authorModel, localField: 'authorId', foreignField: '_id', single: true },
            },
        });

        MonSQLize.Model.define(profileModel, {
            schema: schema({ bio: 'string', website: 'string', userId: 'string' }),
        });

        const msq = new MonSQLize({
            type: 'mongodb',
            databaseName: `stage_b_model_populate_${suffix}`,
            config: { uri },
        });

        try {
            await msq.connect();
            const Author = msq.model<AuthorDoc>(authorModel);
            const Post = msq.model<PostDoc>(postModel);
            const Profile = msq.model<ProfileDoc>(profileModel);

            const alice = await Author.insertOne({ username: 'alice', email: 'alice@example.com' });
            const bob = await Author.insertOne({ username: 'bob', email: 'bob@example.com' });
            const aliceId = String(alice.insertedId);
            const bobId = String(bob.insertedId);

            await Profile.insertOne({ userId: aliceId, bio: 'Full-stack dev', website: 'https://alice.dev' });
            await Profile.insertOne({ userId: bobId, bio: 'Backend engineer' });

            await Post.insertMany([
                { title: 'Intro to MonSQLize', authorId: aliceId, status: 'published', views: 1240 },
                { title: 'Advanced Pipelines', authorId: aliceId, status: 'published', views: 2400 },
                { title: 'Getting Started', authorId: bobId, status: 'published', views: 3200 },
            ]);

            const authorWithRelations = await Author.findOne({ username: 'alice' })
                .populate({ path: 'posts', sort: { views: -1 } })
                .populate({ path: 'profile' }) as (AuthorDoc & { posts?: PostDoc[]; profile?: ProfileDoc; }) | null;

            assert.ok(authorWithRelations);
            assert.equal(authorWithRelations?.posts?.length, 2);
            assert.equal(authorWithRelations?.posts?.[0]?.title, 'Advanced Pipelines');
            assert.equal(authorWithRelations?.profile?.bio, 'Full-stack dev');

            const counted = await Post.findAndCount({ status: 'published' }).populate({ path: 'author' }) as {
                data: Array<PostDoc & { author?: AuthorDoc; }>;
                total: number;
            };

            assert.equal(counted.total, 3);
            assert.equal(counted.data.length, 3);
            assert.equal(counted.data.every((entry) => typeof entry.author?.username === 'string'), true);

            const page = await Post.findPage({ limit: 10 }).populate({ path: 'author' }) as {
                items: Array<PostDoc & { author?: AuthorDoc; }>;
                pageInfo: {
                    hasNext: boolean;
                    hasPrev: boolean;
                    startCursor: string | null;
                    endCursor: string | null;
                    currentPage?: number;
                };
            };

            assert.equal(page.items.length, 3);
            assert.equal(typeof page.pageInfo.hasNext, 'boolean');
            assert.equal(typeof page.items[0]?.author?.username, 'string');
        } finally {
            await msq.close();
        }
    });
});