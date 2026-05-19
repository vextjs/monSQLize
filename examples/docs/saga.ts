/**
 * Saga orchestration: defineSaga, executeSaga, compensation flow.
 * See: docs/saga-transaction.md
 *
 * Run:
 *   npm run build && tsc -p tsconfig.examples.json
 *   node .generated/examples-dist/examples/docs/saga.js
 */
import type { SagaContext } from 'monsqlize';
import { setupExample, teardownExample } from '../helpers/bootstrap.js';

async function main() {
    const { msq, server } = await setupExample('example-saga');
    const orders = msq.collection('orders');
    const inventory = msq.collection('inventory');
    const payments = msq.collection('payments');

    // ── Seed inventory ────────────────────────────────────────────────────
    await inventory.insertMany([
        { sku: 'WGT-001', name: 'Widget', stock: 10, reserved: 0 },
        { sku: 'GDG-001', name: 'Gadget', stock: 0, reserved: 0 },   // out of stock
    ]);

    // ── Define a Saga: reserve → create order → charge payment ────────────
    msq.defineSaga({
        name: 'checkout',
        steps: [
            {
                name: 'reserve-inventory',
                execute: async (ctx: SagaContext) => {
                    const { sku, qty } = ctx.data as { sku: string; qty: number };
                    const item = await inventory.findOne({ sku, stock: { $gte: qty } });
                    if (!item) throw new Error(`Insufficient stock for ${sku}`);
                    await inventory.updateOne({ sku }, { $inc: { stock: -qty, reserved: qty } });
                    ctx.set('reservedSku', sku);
                    ctx.set('reservedQty', qty);
                    return { reserved: true };
                },
                compensate: async (ctx: SagaContext) => {
                    const sku = ctx.get<string>('reservedSku');
                    const qty = ctx.get<number>('reservedQty');
                    if (sku && qty) {
                        await inventory.updateOne({ sku }, { $inc: { stock: qty, reserved: -qty } });
                        console.log(`  [compensate] Unreserved ${qty}x ${sku}`);
                    }
                },
            },
            {
                name: 'create-order',
                execute: async (ctx: SagaContext) => {
                    const { userId, sku, qty, price } = ctx.data as { userId: string; sku: string; qty: number; price: number };
                    const result = await orders.insertOne({ userId, sku, qty, price, status: 'pending', createdAt: new Date() });
                    ctx.set('orderId', String(result.insertedId));
                    return { orderId: result.insertedId };
                },
                compensate: async (ctx: SagaContext) => {
                    const orderId = ctx.get<string>('orderId');
                    if (orderId) {
                        await orders.updateOne({ _id: orderId as unknown }, { $set: { status: 'cancelled' } });
                        console.log(`  [compensate] Cancelled order ${orderId}`);
                    }
                },
            },
            {
                name: 'charge-payment',
                execute: async (ctx: SagaContext) => {
                    const { userId, price } = ctx.data as { userId: string; price: number };
                    const orderId = ctx.get<string>('orderId');
                    const simulateFail = (ctx.data as Record<string, unknown>).simulatePaymentFailure;
                    if (simulateFail) throw new Error('Payment gateway error');
                    await payments.insertOne({ userId, orderId, amount: price, status: 'charged', ts: new Date() });
                    ctx.set('paymentCharged', true);
                    await orders.updateOne({ _id: orderId as unknown }, { $set: { status: 'paid' } });
                    return { charged: true };
                },
                compensate: async (ctx: SagaContext) => {
                    if (ctx.get('paymentCharged')) {
                        const orderId = ctx.get<string>('orderId');
                        await payments.updateOne({ orderId }, { $set: { status: 'refunded' } });
                        console.log(`  [compensate] Refunded payment for order ${orderId}`);
                    }
                },
            },
        ],
    });

    // ── Run 1: successful checkout ────────────────────────────────────────
    console.log('=== Successful checkout ===');
    const ok = await msq.executeSaga('checkout', { userId: 'u1', sku: 'WGT-001', qty: 2, price: 59.98 });
    console.log(`  Success: ${ok.success} | Steps: ${ok.completedSteps}`);
    const widget = await inventory.findOne({ sku: 'WGT-001' });
    console.log(`  Widget stock remaining: ${(widget as Record<string, unknown>)?.stock} (expected 8)`);

    // ── Run 2: out-of-stock → compensation ────────────────────────────────
    console.log('\n=== Out-of-stock (fails at reserve step) ===');
    const fail1 = await msq.executeSaga('checkout', { userId: 'u2', sku: 'GDG-001', qty: 1, price: 99.99 });
    console.log(`  Success: ${fail1.success} | Completed steps: ${fail1.completedSteps} | Compensated: ${(fail1.compensatedSteps ?? []).length}`);

    // ── Run 3: payment failure with full rollback compensation ─────────────
    console.log('\n=== Payment failure — full compensation ===');
    const fail2 = await msq.executeSaga('checkout', {
        userId: 'u3', sku: 'WGT-001', qty: 1, price: 29.99, simulatePaymentFailure: true,
    });
    console.log(`  Success: ${fail2.success} | Compensated steps: ${(fail2.compensatedSteps ?? []).join(', ')}`);
    const widgetAfter = await inventory.findOne({ sku: 'WGT-001' });
    console.log(`  Widget stock after compensation: ${(widgetAfter as Record<string, unknown>)?.stock} (should be restored to 8)`);
    const cancelledOrders = await orders.count({ status: 'cancelled' });
    console.log(`  Cancelled orders: ${cancelledOrders}`);

    // ── Saga stats ─────────────────────────────────────────────────────────
    console.log('\n=== Saga stats ===');
    const stats = msq.getSagaStats();
    console.log(`  Total: ${stats.totalExecutions} | OK: ${stats.successfulExecutions} | Failed: ${stats.failedExecutions}`);

    await teardownExample(msq, server);
    console.log('\n✅ Saga example complete');
}

main().catch((err) => {
    console.error('❌ Example failed:', err);
    process.exit(1);
});
