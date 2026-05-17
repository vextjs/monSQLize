/**
 * findOneById() example.
 * See: docs/find-one-by-id.md
 */
import { setupExample, teardownExample } from '../helpers/bootstrap.js';

interface UserDoc {
    name: string;
    team: string;
}

async function main() {
    const { msq, server } = await setupExample('example-find-one-by-id');
    const users = msq.collection<UserDoc>('users');

    const inserted = await users.insertOne({ name: 'Alice', team: 'platform' });
    const found = await users.findOneById(String(inserted.insertedId));

    console.log('Inserted id:', String(inserted.insertedId));
    console.log('User name:', found?.name);
    console.log('User team:', found?.team);

    await teardownExample(msq, server);
    console.log('✅ findOneById example complete');
}

main().catch((err) => {
    console.error('❌ Example failed:', err);
    process.exit(1);
});
