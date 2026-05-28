import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

const MonSQLize = require('../../../dist/cjs/index.cjs');

type SagaContext = {
    set(key: string, value: unknown): void;
    get(key: string): unknown;
};

describe('P4-C saga', () => {
    it('supports minimal define / execute / list / stats round trip', async () => {
        const saga = new MonSQLize.SagaOrchestrator();
        const calls: string[] = [];

        saga.define({
            name: 'create-order',
            steps: [
                {
                    name: 'reserve-inventory',
                    execute: (ctx: SagaContext) => {
                        calls.push('reserve');
                        ctx.set('inventoryReserved', true);
                        return Promise.resolve({ reserved: true });
                    },
                    compensate: (ctx: SagaContext) => {
                        calls.push(`compensate:${ctx.get('inventoryReserved')}`);
                        return Promise.resolve();
                    },
                },
                {
                    name: 'charge-payment',
                    execute: () => {
                        calls.push('charge');
                        return Promise.reject(new Error('payment failed'));
                    },
                },
            ],
        });

        const result = await saga.execute('create-order', { orderId: 'o_1' });
        assert.equal(result.success, false);
        assert.deepEqual(result.completedSteps, ['reserve-inventory']);
        assert.equal(result.completedStepCount, 1);
        assert.deepEqual(result.compensatedSteps, ['reserve-inventory']);
        assert.deepEqual(calls, ['reserve', 'charge', 'compensate:true']);
        assert.deepEqual(await saga.listSagas(), ['create-order']);

        const stats = saga.getStats();
        assert.equal(stats.totalExecutions, 1);
        assert.equal(stats.failureCount, 1);
        assert.equal(stats.compensationCount, 1);
    });

    it('supports runtime facade defineSaga / executeSaga / getSagaStats', async () => {
        const runtime = new MonSQLize({ type: 'mongodb', databaseName: 'saga_facade' });
        runtime.defineSaga({
            name: 'simple',
            steps: [
                {
                    name: 'set-value',
                    execute: (ctx: SagaContext) => {
                        ctx.set('done', true);
                        return Promise.resolve('ok');
                    },
                },
            ],
        });

        const result = await runtime.executeSaga('simple', { id: 1 });
        assert.equal(result.success, true);
        assert.equal(result.result, 'ok');
        assert.deepEqual(await runtime.listSagas(), ['simple']);
        assert.equal(runtime.getSagaStats().successCount, 1);
    });
});