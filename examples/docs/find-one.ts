/**
 * findOne, findOneById, findByIds example.
 * See: docs/findOne.md, docs/find-one-by-id.md, docs/find-by-ids.md
 *
 * Run:
 *   npm run build && tsc -p tsconfig.examples.json
 *   node .generated/examples-dist/examples/docs/find-one.js
 */
import { setupExample, teardownExample } from '../helpers/bootstrap.js';

interface UserDoc { name: string; email: string; role: string; }

async function main() {
    const { msq, server } = await setupExample('example-find-one');
    const users = msq.collection<UserDoc>('users');

    const inserted = await users.insertMany([
        { name: 'Alice', email: 'alice@example.com', role: 'admin' },
        { name: 'Bob', email: 'bob@example.com', role: 'user' },
        { name: 'Carol', email: 'carol@example.com', role: 'user' },
    ]);
    const ids = inserted.insertedIds as Record<string, unknown>;
    const aliceId = ids[0] as { toString(): string };

    // ── findOne ────────────────────────────────────────────────────────────
    const admin = await users.findOne({ role: 'admin' });
    console.log('findOne admin:', admin?.name);

    // ── findOne — returns null when not found ─────────────────────────────
    const missing = await users.findOne({ name: 'Nonexistent' });
    console.log('findOne missing:', missing); // null

    // ── findOneById ────────────────────────────────────────────────────────
    const byId = await users.findOneById(String(aliceId));
    console.log('findOneById:', byId?.name);

    // ── findByIds ──────────────────────────────────────────────────────────
    const allIds = Object.values(ids).map(String);
    const byIds = await users.findByIds(allIds);
    console.log('findByIds count:', byIds.length);
    console.log('findByIds names:', byIds.map((u) => u.name));

    await teardownExample(msq, server);
    console.log('✅ findOne / findOneById / findByIds example complete');
}

main().catch((err) => {
    console.error('❌ Example failed:', err);
    process.exit(1);
});
