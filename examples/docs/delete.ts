/**
 * Delete operations: deleteOne, deleteMany, deleteBatch.
 * See: docs/delete-one.md, docs/delete-many.md, docs/deleteBatch.md
 *
 * Run:
 *   npm run build && tsc -p tsconfig.examples.json
 *   node .generated/examples-dist/examples/docs/delete.js
 */
import { setupExample, teardownExample } from '../helpers/bootstrap.js';

async function main() {
    const { msq, server } = await setupExample('example-delete');
    const sessions = msq.collection('sessions');

    await sessions.insertMany([
        { userId: 'u1', token: 'tok-a', expires: new Date('2024-01-01') },
        { userId: 'u2', token: 'tok-b', expires: new Date('2024-01-01') },
        { userId: 'u3', token: 'tok-c', expires: new Date('2030-12-31') },
        { userId: 'u1', token: 'tok-d', expires: new Date('2030-12-31') },
    ]);

    const before = await sessions.count({});
    console.log('Before delete:', before, 'sessions');

    // ── deleteOne ─────────────────────────────────────────────────────────
    const d1 = await sessions.deleteOne({ token: 'tok-a' });
    console.log('deleteOne — deletedCount:', d1.deletedCount);

    // ── deleteMany ────────────────────────────────────────────────────────
    const d2 = await sessions.deleteMany({ expires: { $lt: new Date() } });
    console.log('deleteMany (expired) — deletedCount:', d2.deletedCount);

    const after = await sessions.count({});
    console.log('After deleteMany:', after, 'sessions remaining');

    // ── deleteBatch — individual filters per item ─────────────────────────
    const d3 = await sessions.deleteBatch([
        { filter: { token: 'tok-d' } },
    ]);
    console.log('deleteBatch — deleted:', d3.deletedCount, '/', d3.totalCount);

    const final = await sessions.count({});
    console.log('Final count:', final);

    await teardownExample(msq, server);
    console.log('✅ Delete example complete');
}

main().catch((err) => {
    console.error('❌ Example failed:', err);
    process.exit(1);
});
