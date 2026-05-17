/**
 * Transaction example using withTransaction().
 *
 * See: docs/transaction.md
 *
 * Run:
 *   npm run build && tsc -p tsconfig.examples.json
 *   node .generated/examples-dist/examples/docs/transaction.js
 */
import { setupReplicaSetExample, teardownExample } from '../helpers/bootstrap.js';

interface AccountDoc { userId: string; balance: number; }

async function main() {
    const { msq, server } = await setupReplicaSetExample('example-transactions');

    const accounts = msq.collection<AccountDoc>('accounts');

    // Seed accounts
    await accounts.deleteMany({});
    await accounts.insertMany([
        { userId: 'alice', balance: 1000 },
        { userId: 'bob', balance: 500 },
    ]);

    // ── withTransaction — atomic transfer ─────────────────────────────────
    const amount = 200;
    await msq.withTransaction(async (tx) => {
        const alice = await accounts.findOne({ userId: 'alice' }, { session: tx.session });
        const bob = await accounts.findOne({ userId: 'bob' }, { session: tx.session });

        if (!alice || alice.balance < amount) {
            throw new Error('Insufficient funds');
        }

        await accounts.updateOne(
            { userId: 'alice' },
            { $inc: { balance: -amount } },
            { session: tx.session },
        );
        await accounts.updateOne(
            { userId: 'bob' },
            { $inc: { balance: amount } },
            { session: tx.session },
        );
    });

    const alice = await accounts.findOne({ userId: 'alice' });
    const bob = await accounts.findOne({ userId: 'bob' });
    console.log('After transfer:');
    console.log(`  alice: ${alice?.balance} (expected 800)`);
    console.log(`  bob: ${bob?.balance} (expected 700)`);

    // ── Transaction abort on error ─────────────────────────────────────────
    try {
        await msq.withTransaction(async (tx) => {
            await accounts.updateOne({ userId: 'alice' }, { $inc: { balance: -9999 } }, { session: tx.session });
            throw new Error('Simulated failure — transaction should rollback');
        });
    } catch {
        const aliceAfterRollback = await accounts.findOne({ userId: 'alice' });
        console.log('After rollback alice balance:', aliceAfterRollback?.balance, '(should be 800)');
    }

    await teardownExample(msq, server);
    console.log('✅ Transaction example complete');
}

main().catch((err) => {
    console.error('❌ Example failed:', err);
    process.exit(1);
});
