/**
 * Transaction rollback example — focus on failure and recovery.
 * See: docs/failure-recovery-examples.md
 *
 * Run:
 *   npm run build && tsc -p tsconfig.examples.json
 *   node .generated/examples-dist/examples/docs/transaction-rollback.js
 */
import { setupReplicaSetExample, teardownExample } from '../helpers/bootstrap.js';

interface AccountDoc {
    owner: string;
    balance: number;
}

async function main() {
    const { msq, server } = await setupReplicaSetExample('example-transaction-rollback');
    const accounts = msq.collection<AccountDoc>('accounts');

    try {
        await accounts.deleteMany({});
        await accounts.insertMany([
            { owner: 'alice', balance: 1000 },
            { owner: 'bob', balance: 500 },
        ]);

        console.log('=== Transaction rollback ===');
        try {
            await msq.withTransaction(async (tx) => {
                await accounts.updateOne(
                    { owner: 'alice' },
                    { $inc: { balance: -250 } },
                    { session: tx.session },
                );
                throw new Error('Simulated downstream failure');
            });
        } catch (error) {
            console.log(`  Caught error: ${(error as Error).message}`);
        }

        const alice = await accounts.findOne({ owner: 'alice' });
        const bob = await accounts.findOne({ owner: 'bob' });
        console.log(`  Alice balance after rollback: ${alice?.balance} (expected 1000)`);
        console.log(`  Bob balance after rollback: ${bob?.balance} (expected 500)`);
        console.log('✅ Transaction rollback example complete');
    } finally {
        await teardownExample(msq, server);
    }
}

main().catch((error) => {
    console.error('❌ Example failed:', error);
    process.exit(1);
});
