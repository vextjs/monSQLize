/**
 * Quick upsert patterns example.
 * See: docs/quick-upsert.md
 */
import { setupExample, teardownExample } from '../helpers/bootstrap.js';

interface UserPreferenceDoc {
    userId: string;
    theme: string;
    language: string;
    loginCount: number;
    createdAt: Date;
    updatedAt: Date;
}

interface PageStatDoc {
    page: string;
    date: string;
    views: number;
    createdAt: Date;
}

async function main() {
    const { msq, server } = await setupExample('example-quick-upsert');
    const preferences = msq.collection<UserPreferenceDoc>('user_preferences');
    const pageStats = msq.collection<PageStatDoc>('page_stats');

    const firstSaved = await preferences.findOneAndUpdate(
        { userId: 'user-001' },
        {
            $set: {
                theme: 'dark',
                language: 'en-US',
                updatedAt: new Date('2026-01-01T00:00:00.000Z'),
            },
            $setOnInsert: {
                userId: 'user-001',
                loginCount: 0,
                createdAt: new Date('2026-01-01T00:00:00.000Z'),
            },
        },
        { upsert: true, returnDocument: 'after' },
    );

    const secondSaved = await preferences.findOneAndUpdate(
        { userId: 'user-001' },
        {
            $set: {
                theme: 'light',
                language: 'en-US',
                updatedAt: new Date('2026-01-02T00:00:00.000Z'),
            },
            $inc: { loginCount: 1 },
            $setOnInsert: {
                userId: 'user-001',
                createdAt: new Date('2026-01-02T00:00:00.000Z'),
            },
        },
        { upsert: true, returnDocument: 'after' },
    );

    const statInsert = await pageStats.upsertOne(
        { page: '/docs', date: '2026-01-02' },
        {
            $inc: { views: 1 },
            $setOnInsert: {
                page: '/docs',
                date: '2026-01-02',
                createdAt: new Date('2026-01-02T00:00:00.000Z'),
            },
        },
    );
    const statUpdate = await pageStats.upsertOne(
        { page: '/docs', date: '2026-01-02' },
        { $inc: { views: 1 } },
    );
    const finalStat = await pageStats.findOne({ page: '/docs', date: '2026-01-02' });

    console.log('first save theme:', firstSaved?.theme);
    console.log('second save theme:', secondSaved?.theme);
    console.log('login count:', secondSaved?.loginCount);
    console.log('stat inserted:', Boolean(statInsert.upsertedId));
    console.log('stat update modified:', statUpdate.modifiedCount);
    console.log('final views:', finalStat?.views);

    await teardownExample(msq, server);
    console.log('Quick upsert example complete');
}

main().catch((err) => {
    console.error('Example failed:', err);
    process.exit(1);
});
