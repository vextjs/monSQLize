/**
 * Transaction example using withTransaction().
 *
 * NOTE: MongoDB transactions require a replica-set or sharded cluster.
 * Single-node memory-server does NOT support transactions in the same way,
 * so this example connects to a local MongoDB with replica-set, or skips gracefully.
 *
 * See: docs/transaction.md
 *
 * Run (requires local MongoDB replica-set on port 27017):
 *   npm run build && tsc -p tsconfig.examples.json
 *   MONGO_RS_URI=mongodb://127.0.0.1:27017/?replicaSet=rs0 node .generated/examples-dist/examples/docs/transaction.js
 */
import { MonSQLize } from 'monsqlize';

const MONGO_URI = process.env.MONGO_RS_URI ?? '';

interface AccountDoc { userId: string; balance: number; }

async function main() {
    if (!MONGO_URI) {
        console.log('⚠️  Skipping transaction example — set MONGO_RS_URI to a replica-set URI');
        console.log('   Example: MONGO_RS_URI=mongodb://127.0.0.1:27017/?replicaSet=rs0 node ...');
        process.exit(0);
    }

    const msq = new MonSQLize({ type: 'mongodb', databaseName: 'example-transactions', config: { uri: MONGO_URI } });
    await msq.connect();

    const accounts = msq.collection<AccountDoc>('accounts');

    // Seed accounts
    await accounts.deleteMany({});
    await accounts.insertMany([
        { userId: 'alice', balance: 1000 },
        { userId: 'bob', balance: 500 },
    ]);

    // ── withTransaction — atomic transfer ─────────────────────────────────
    const amount = 200;
    await msq.withTransaction(async (session) => {
        const alice = await accounts.findOne({ userId: 'alice' }, { session });
        const bob = await accounts.findOne({ userId: 'bob' }, { session });

        if (!alice || alice.balance < amount) {
            throw new Error('Insufficient funds');
        }

        await accounts.updateOne(
            { userId: 'alice' },
            { $inc: { balance: -amount } },
            { session },
        );
        await accounts.updateOne(
            { userId: 'bob' },
            { $inc: { balance: amount } },
            { session },
        );
    });

    const alice = await accounts.findOne({ userId: 'alice' });
    const bob = await accounts.findOne({ userId: 'bob' });
    console.log('After transfer:');
    console.log(`  alice: ${alice?.balance} (expected 800)`);
    console.log(`  bob: ${bob?.balance} (expected 700)`);

    // ── Transaction abort on error ─────────────────────────────────────────
    try {
        await msq.withTransaction(async (session) => {
            await accounts.updateOne({ userId: 'alice' }, { $inc: { balance: -9999 } }, { session });
            throw new Error('Simulated failure — transaction should rollback');
        });
    } catch {
        const aliceAfterRollback = await accounts.findOne({ userId: 'alice' });
        console.log('After rollback alice balance:', aliceAfterRollback?.balance, '(should be 800)');
    }

    await msq.close();
    console.log('✅ Transaction example complete');
}

main().catch((err) => {
    console.error('❌ Example failed:', err);
    process.exit(1);
});
