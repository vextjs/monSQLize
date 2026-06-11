/**
 * Transaction optimization example: read-only sessions and cache-invalidation stats.
 * See: docs/transaction-optimizations.md
 *
 * Run:
 *   npm run build && tsc -p tsconfig.examples.json
 *   node .generated/examples-dist/examples/docs/transaction-optimizations.js
 */
import { setupReplicaSetExample, teardownExample } from '../helpers/bootstrap.js';

interface AccountDoc {
    accountId: string;
    balance: number;
    status: string;
}

async function main() {
    const { msq, server } = await setupReplicaSetExample('example-transaction-optimizations');
    const accounts = msq.collection<AccountDoc>('accounts');

    try {
        await accounts.deleteMany({});
        await accounts.insertMany([
            { accountId: 'alice', balance: 1000, status: 'active' },
            { accountId: 'bob', balance: 500, status: 'active' },
        ]);

        const readTx = await msq.startSession({
            readConcern: { level: 'snapshot' },
            readPreference: 'primary',
        });
        await readTx.start();
        const activeAccounts = await accounts.find({ status: 'active' }, { session: readTx.session });
        const readStatsBeforeCommit = readTx.getStats();
        await readTx.commit();
        await readTx.end();

        console.log('Read-only rows:', activeAccounts.length);
        console.log('Read-only has write operation:', readStatsBeforeCommit.hasWriteOperation);
        console.log('Read-only locked keys:', readStatsBeforeCommit.lockedKeysCount);

        const writeTx = await msq.startSession({ enableCacheLock: true });
        await writeTx.start();
        await accounts.updateOne(
            { accountId: 'alice' },
            { $inc: { balance: -100 } },
            { session: writeTx.session },
        );
        await writeTx.recordInvalidation('accounts:alice');
        const writeStatsBeforeCommit = writeTx.getStats();
        await writeTx.commit();
        await writeTx.end();

        const alice = await accounts.findOne({ accountId: 'alice' });
        console.log('Write transaction invalidations:', writeStatsBeforeCommit.operationCount);
        console.log('Write transaction locked keys:', writeStatsBeforeCommit.lockedKeysCount);
        console.log('Alice balance after commit:', alice?.balance);
    } finally {
        await teardownExample(msq, server);
    }

    console.log('Transaction optimizations example complete');
}

main().catch((err) => {
    console.error('Example failed:', err);
    process.exit(1);
});
