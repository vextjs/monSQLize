/**
 * count() example.
 * See: docs/count.md
 */
import { setupExample, teardownExample } from '../helpers/bootstrap.js';

interface OrderDoc {
    status: string;
    amount: number;
    channel: string;
}

async function main() {
    const { msq, server } = await setupExample('example-count');
    const orders = msq.collection<OrderDoc>('orders');

    await orders.insertMany([
        { status: 'paid', amount: 128, channel: 'web' },
        { status: 'paid', amount: 64, channel: 'mobile' },
        { status: 'pending', amount: 32, channel: 'web' },
        { status: 'paid', amount: 256, channel: 'web' },
    ]);

    const total = await orders.count({});
    const paid = await orders.count({ status: 'paid' });
    const paidWeb = await orders.count({ status: 'paid', channel: 'web' });

    console.log('Total orders:', total);
    console.log('Paid orders:', paid);
    console.log('Paid web orders:', paidWeb);

    await teardownExample(msq, server);
    console.log('✅ count example complete');
}

main().catch((err) => {
    console.error('❌ Example failed:', err);
    process.exit(1);
});
