/**
 * Basic operations example for the quick-start path.
 * See: docs/basic-operations.md
 *
 * Run:
 *   npm run build && tsc -p tsconfig.examples.json
 *   node .generated/examples-dist/examples/quick-start/basic-operations.js
 */
import { setupExample, teardownExample } from '../helpers/bootstrap.js';

interface UserDoc {
    email: string;
    name: string;
    status: 'active' | 'disabled';
    loginCount: number;
    createdAt: Date;
    lastLoginAt?: Date;
}

async function main() {
    const { msq, server } = await setupExample('example-basic-operations');
    const users = msq.collection<UserDoc>('users');

    await users.insertOne({
        email: 'ada@example.com',
        name: 'Ada',
        status: 'active',
        loginCount: 1,
        createdAt: new Date(),
    });

    await users.insertMany([
        { email: 'lin@example.com', name: 'Lin', status: 'active', loginCount: 3, createdAt: new Date() },
        { email: 'grace@example.com', name: 'Grace', status: 'disabled', loginCount: 0, createdAt: new Date() },
    ]);

    const activeUsers = await users
        .find({ status: 'active' })
        .sort({ createdAt: -1 })
        .limit(10)
        .project({ email: 1, name: 1, status: 1, _id: 0 });
    console.log('Active users:', activeUsers.length);

    const ada = await users.findOne({ email: 'ada@example.com' });
    console.log('Found user:', ada?.name);

    const page = await users.findPage({
        query: { status: 'active' },
        sort: { createdAt: -1 },
        limit: 2,
    });
    console.log('Page items:', page.items.length, '| hasNext:', page.pageInfo.hasNext);

    await users.updateOne(
        { email: 'ada@example.com' },
        { $set: { lastLoginAt: new Date() }, $inc: { loginCount: 1 } },
    );

    await users.upsertOne(
        { email: 'new@example.com' },
        {
            $set: { name: 'New User', status: 'active' },
            $setOnInsert: { loginCount: 0, createdAt: new Date() },
        },
    );

    const totalActive = await users.count({ status: 'active' });
    console.log('Total active users:', totalActive);

    await users.find({ status: 'active' }, { cache: 60_000 }).limit(5);
    await users.updateOne({ email: 'lin@example.com' }, { $set: { name: 'Lin Updated' } });
    await users.find({ status: 'active' }, { cache: 60_000 }).limit(5);
    console.log('Cached reads are invalidated after writes.');

    const deleted = await users.deleteMany({ status: 'disabled' });
    console.log('Deleted disabled users:', deleted.deletedCount);

    await teardownExample(msq, server);
    console.log('✅ Basic operations example complete');
}

main().catch((err) => {
    console.error('❌ Example failed:', err);
    process.exit(1);
});
