/**
 * findAndCount() example — combined query + total count.
 * See: docs/find-and-count.md
 *
 * Run:
 *   npm run build && tsc -p tsconfig.examples.json
 *   node .generated/examples-dist/examples/docs/find-and-count.js
 */
import { setupExample, teardownExample } from '../helpers/bootstrap.js';

interface OrderDoc { product: string; status: string; amount: number; }

async function main() {
    const { msq, server } = await setupExample('example-find-and-count');
    const orders = msq.collection<OrderDoc>('orders');

    await orders.insertMany([
        { product: 'Widget', status: 'completed', amount: 29.99 },
        { product: 'Gadget', status: 'completed', amount: 59.99 },
        { product: 'Widget', status: 'pending', amount: 29.99 },
        { product: 'Doohickey', status: 'completed', amount: 9.99 },
        { product: 'Widget', status: 'cancelled', amount: 29.99 },
    ]);

    // ── findAndCount — returns { data, total } ─────────────────────────────
    const result = await orders.findAndCount(
        { status: 'completed' },
        { limit: 2, sort: { amount: -1 } },
    );

    console.log('data (page):', result.data.length);
    console.log('total (all matched):', result.total);
    console.log('Products:', result.data.map((o) => o.product));

    // ── Without limit — returns all + count ───────────────────────────────
    const all = await orders.findAndCount({ status: 'completed' });
    console.log('All completed:', all.data.length, '/', all.total);

    await teardownExample(msq, server);
    console.log('✅ findAndCount example complete');
}

main().catch((err) => {
    console.error('❌ Example failed:', err);
    process.exit(1);
});
