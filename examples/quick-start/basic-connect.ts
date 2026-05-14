/**
 * Quick-start example: connect, insert, query, and close.
 *
 * This file demonstrates the minimum path to using monSQLize:
 * 1. Start an in-memory MongoDB (via mongodb-memory-server)
 * 2. Connect a MonSQLize instance
 * 3. Insert and query documents
 * 4. Close the connection
 *
 * Run after building the project:
 *   npm run build && tsc -p tsconfig.examples.json
 *   node .generated/examples-dist/examples/quick-start/basic-connect.js
 */
import { setupExample, teardownExample } from '../helpers/bootstrap.js';

interface UserDoc { name: string; email: string; role: string; active: boolean; }

async function main() {
    const { msq, server } = await setupExample('quickstart-demo');
    const users = msq.collection<UserDoc>('users');

    console.log('🚀 monSQLize Quick-Start Example\n');

    // ── 2. Insert ─────────────────────────────────────────────────────────
    await users.insertOne({ name: 'Alice', email: 'alice@example.com', role: 'admin', active: true });
    await users.insertOne({ name: 'Bob', email: 'bob@example.com', role: 'user', active: true });
    await users.insertOne({ name: 'Carol', email: 'carol@example.com', role: 'user', active: false });
    console.log('✅ Inserted 3 users');

    // ── 3. findOne ────────────────────────────────────────────────────────
    const alice = await users.findOne({ email: 'alice@example.com' });
    console.log('🔍 findOne result:', alice?.name, '/', alice?.role);

    // ── 4. find (multiple) ────────────────────────────────────────────────
    const activeUsers = await users.find({ active: true }).sort({ name: 1 });
    console.log('🔍 Active users:', activeUsers.map((u) => u.name).join(', '));

    // ── 5. count ──────────────────────────────────────────────────────────
    const total = await users.count({});
    console.log('🔢 Total users:', total);

    // ── 6. updateOne ─────────────────────────────────────────────────────
    await users.updateOne({ name: 'Bob' }, { $set: { role: 'moderator' } });
    const bob = await users.findOne({ name: 'Bob' });
    console.log('✏️  Updated Bob role:', bob?.role);

    // ── 7. deleteOne ─────────────────────────────────────────────────────
    await users.deleteOne({ name: 'Carol' });
    const remaining = await users.count({});
    console.log('🗑️  After delete, count:', remaining);

    // ── 8. Close ─────────────────────────────────────────────────────────
    await teardownExample(msq, server);
    console.log('\n✅ Quick-start example completed successfully');
}

main().catch((err) => {
    console.error('❌ Example failed:', err);
    process.exit(1);
});
