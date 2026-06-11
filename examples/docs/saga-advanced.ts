/**
 * Advanced Saga example: retry, timeout, context sharing, compensation, and stats.
 * See: docs/saga-advanced.md
 *
 * Run:
 *   npm run build && tsc -p tsconfig.examples.json
 *   node .generated/examples-dist/examples/docs/saga-advanced.js
 */
import type { SagaContext } from 'monsqlize';
import { setupExample, teardownExample } from '../helpers/bootstrap.js';

function sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
    const { msq, server } = await setupExample('example-saga-advanced');
    let retryAttempts = 0;
    const compensationLog: string[] = [];

    try {
        await msq.defineSaga({
            name: 'advanced-order',
            steps: [
                {
                    name: 'prepare-context',
                    execute: async (ctx: SagaContext) => {
                        const data = ctx.data as { orderId: string; userId: string };
                        ctx.set('orderId', data.orderId);
                        ctx.set('reservationId', `${data.orderId}-reservation`);
                        return { userId: data.userId };
                    },
                    compensate: async () => {},
                },
                {
                    name: 'reserve-inventory',
                    retries: 2,
                    execute: async (ctx: SagaContext) => {
                        retryAttempts += 1;
                        if (retryAttempts < 2) {
                            throw new Error('temporary inventory lock');
                        }
                        return { reservationId: ctx.get('reservationId') };
                    },
                    compensate: async (ctx: SagaContext) => {
                        compensationLog.push(`release:${ctx.get('reservationId')}`);
                    },
                },
                {
                    name: 'send-confirmation',
                    timeout: 1000,
                    execute: async (ctx: SagaContext) => ({
                        orderId: ctx.get('orderId'),
                        sent: true,
                    }),
                    compensate: async () => {},
                },
            ],
        });

        await msq.defineSaga({
            name: 'compensation-demo',
            steps: [
                {
                    name: 'create-order',
                    execute: async (ctx: SagaContext) => {
                        ctx.set('createdOrderId', 'ord-compensate');
                        return { created: true };
                    },
                    compensate: async (ctx: SagaContext) => {
                        compensationLog.push(`cancel:${ctx.get('createdOrderId')}`);
                    },
                },
                {
                    name: 'charge-card',
                    execute: async () => {
                        throw new Error('payment declined');
                    },
                    compensate: async () => {},
                },
            ],
        });

        await msq.defineSaga({
            name: 'timeout-demo',
            steps: [
                {
                    name: 'slow-provider',
                    timeout: 10,
                    execute: async () => {
                        await sleep(50);
                        return { ok: true };
                    },
                    compensate: async () => {},
                },
            ],
        });

        const success = await msq.executeSaga('advanced-order', { orderId: 'ord-1001', userId: 'u1' });
        const compensated = await msq.executeSaga('compensation-demo', {});
        const timedOut = await msq.executeSaga('timeout-demo', {});
        const stats = msq.getSagaStats();

        console.log('Retry attempts:', retryAttempts);
        console.log('Successful saga:', success.success);
        console.log('Successful steps:', success.completedSteps.join(', '));
        console.log('Compensated saga:', compensated.success);
        console.log('Compensated steps:', compensated.compensatedSteps.join(', '));
        console.log('Timeout saga:', timedOut.success);
        console.log('Timeout message:', timedOut.errorMessage);
        console.log('Compensation log:', compensationLog.join(', '));
        console.log('Saga stats:', `${stats.totalExecutions}/${stats.successRate}`);
    } finally {
        await teardownExample(msq, server);
    }

    console.log('Advanced Saga example complete');
}

main().catch((err) => {
    console.error('Example failed:', err);
    process.exit(1);
});
