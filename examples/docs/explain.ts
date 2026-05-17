/**
 * explain() example.
 * See: docs/explain.md
 */
import { setupExample, teardownExample } from '../helpers/bootstrap.js';

interface TicketDoc {
    title: string;
    priority: number;
    status: string;
}

async function main() {
    const { msq, server } = await setupExample('example-explain');
    const tickets = msq.collection<TicketDoc>('tickets');

    await tickets.insertMany([
        { title: 'Login issue', priority: 3, status: 'open' },
        { title: 'Billing sync', priority: 1, status: 'open' },
        { title: 'Export bug', priority: 2, status: 'closed' },
        { title: 'UI polish', priority: 4, status: 'open' },
    ]);

    await tickets.createIndex({ status: 1, priority: 1 });

    const plan = await tickets
        .find({ status: 'open' })
        .sort({ priority: 1 })
        .limit(2)
        .explain();

    const winningPlan = (plan as Record<string, unknown>)?.queryPlanner as Record<string, unknown> | undefined;
    console.log('Planner stage available:', Boolean(winningPlan));
    console.log('Top-level keys:', Object.keys(plan as Record<string, unknown>).slice(0, 5));

    await teardownExample(msq, server);
    console.log('✅ explain example complete');
}

main().catch((err) => {
    console.error('❌ Example failed:', err);
    process.exit(1);
});
