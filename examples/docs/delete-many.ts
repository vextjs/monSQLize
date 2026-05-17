/**
 * deleteMany() example.
 * See: docs/delete-many.md
 */
import { setupExample, teardownExample } from '../helpers/bootstrap.js';

interface SessionDoc {
    userId: string;
    expired: boolean;
}

async function main() {
    const { msq, server } = await setupExample('example-delete-many');
    const sessions = msq.collection<SessionDoc>('sessions');

    await sessions.insertMany([
        { userId: 'u1', expired: true },
        { userId: 'u2', expired: false },
        { userId: 'u3', expired: true },
        { userId: 'u4', expired: true },
    ]);

    const before = await sessions.count({});
    const result = await sessions.deleteMany({ expired: true });
    const after = await sessions.count({});

    console.log('Before delete:', before);
    console.log('Deleted count:', result.deletedCount);
    console.log('After delete:', after);

    await teardownExample(msq, server);
    console.log('✅ deleteMany example complete');
}

main().catch((err) => {
    console.error('❌ Example failed:', err);
    process.exit(1);
});
