/**
 * findByIds() example.
 * See: docs/find-by-ids.md
 */
import { setupExample, teardownExample } from '../helpers/bootstrap.js';

interface UserDoc {
    name: string;
    role: string;
}

async function main() {
    const { msq, server } = await setupExample('example-find-by-ids');
    const users = msq.collection<UserDoc>('users');

    const inserted = await users.insertMany([
        { name: 'Alice', role: 'admin' },
        { name: 'Bob', role: 'editor' },
        { name: 'Carol', role: 'viewer' },
    ]);

    const ids = Object.values(inserted.insertedIds as Record<string, unknown>).map(String);
    const found = await users.findByIds(ids.slice(0, 2));

    console.log('Requested ids:', ids.slice(0, 2));
    console.log('Found users:', found.map((user) => `${user.name}:${user.role}`));

    await teardownExample(msq, server);
    console.log('✅ findByIds example complete');
}

main().catch((err) => {
    console.error('❌ Example failed:', err);
    process.exit(1);
});
