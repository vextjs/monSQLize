/**
 * updateOne() example.
 * See: docs/update-one.md
 */
import { setupExample, teardownExample } from '../helpers/bootstrap.js';

interface AccountDoc {
    email: string;
    plan: string;
    loginCount: number;
}

async function main() {
    const { msq, server } = await setupExample('example-update-one');
    const accounts = msq.collection<AccountDoc>('accounts');

    await accounts.insertOne({ email: 'alice@example.com', plan: 'free', loginCount: 1 });

    const result = await accounts.updateOne(
        { email: 'alice@example.com' },
        { $set: { plan: 'pro' }, $inc: { loginCount: 1 } },
    );
    const updated = await accounts.findOne({ email: 'alice@example.com' });

    console.log('Matched:', result.matchedCount);
    console.log('Modified:', result.modifiedCount);
    console.log('Updated account:', updated);

    await teardownExample(msq, server);
    console.log('✅ updateOne example complete');
}

main().catch((err) => {
    console.error('❌ Example failed:', err);
    process.exit(1);
});
