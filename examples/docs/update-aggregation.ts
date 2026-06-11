/**
 * Aggregation pipeline update example.
 * See: docs/update-aggregation.md
 */
import { setupExample, teardownExample } from '../helpers/bootstrap.js';

interface OrderDoc {
    orderId: string;
    status: 'pending' | 'paid';
    unitPrice: number;
    quantity: number;
    taxRate: number;
    subtotal?: number;
    tax?: number;
    total?: number;
    priority?: 'normal' | 'high';
}

async function main() {
    const { msq, server } = await setupExample('example-update-aggregation');
    const orders = msq.collection<OrderDoc>('orders');

    await orders.insertMany([
        { orderId: 'A100', status: 'pending', unitPrice: 25, quantity: 2, taxRate: 0.08 },
        { orderId: 'A101', status: 'pending', unitPrice: 120, quantity: 1, taxRate: 0.08 },
        { orderId: 'A102', status: 'paid', unitPrice: 80, quantity: 1, taxRate: 0.08 },
    ]);

    const one = await orders.updateOne(
        { orderId: 'A100' },
        [
            { $set: { subtotal: { $multiply: ['$unitPrice', '$quantity'] } } },
            { $set: { tax: { $multiply: ['$subtotal', '$taxRate'] } } },
            { $set: { total: { $add: ['$subtotal', '$tax'] } } },
        ],
    );

    const many = await orders.updateMany(
        { status: 'pending' },
        [
            { $set: { subtotal: { $multiply: ['$unitPrice', '$quantity'] } } },
            { $set: { tax: { $multiply: ['$subtotal', '$taxRate'] } } },
            { $set: { total: { $add: ['$subtotal', '$tax'] } } },
            {
                $set: {
                    priority: {
                        $cond: {
                            if: { $gte: ['$total', 100] },
                            then: 'high',
                            else: 'normal',
                        },
                    },
                },
            },
        ],
    );

    const pendingOrders = await orders.find({ status: 'pending' });

    console.log('updateOne modified:', one.modifiedCount);
    console.log('updateMany modified:', many.modifiedCount);
    console.log('pending totals:', pendingOrders.map((order) => `${order.orderId}:${order.total}:${order.priority}`).join(', '));

    await teardownExample(msq, server);
    console.log('Update aggregation example complete');
}

main().catch((err) => {
    console.error('Example failed:', err);
    process.exit(1);
});
