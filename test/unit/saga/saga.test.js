const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const MonSQLize = require('../../../lib/index.js');

describe('P4-C saga', () => {
    it('应支持 define / execute / list / stats 的最小闭环', async () => {
        const saga = new MonSQLize.SagaOrchestrator();
        const calls = [];

        saga.define({
            name: 'create-order',
            steps: [
                {
                    name: 'reserve-inventory',
                    execute: (ctx) => {
                        calls.push('reserve');
                        ctx.set('inventoryReserved', true);
                        return Promise.resolve({ reserved: true });
                    },
                    compensate: (ctx) => {
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
        assert.deepEqual(result.compensatedSteps, ['reserve-inventory']);
        assert.deepEqual(calls, ['reserve', 'charge', 'compensate:true']);
        assert.deepEqual(saga.listSagas(), ['create-order']);

        const stats = saga.getStats();
        assert.equal(stats.totalExecutions, 1);
        assert.equal(stats.failureCount, 1);
        assert.equal(stats.compensationCount, 1);
    });

    it('应支持 runtime facade 的 defineSaga / executeSaga / getSagaStats', async () => {
        const runtime = new MonSQLize({ type: 'mongodb', databaseName: 'saga_facade' });
        runtime.defineSaga({
            name: 'simple',
            steps: [
                {
                    name: 'set-value',
                    execute: (ctx) => {
                        ctx.set('done', true);
                        return Promise.resolve('ok');
                    },
                },
            ],
        });

        const result = await runtime.executeSaga('simple', { id: 1 });
        assert.equal(result.success, true);
        assert.equal(result.result, 'ok');
        assert.deepEqual(runtime.listSagas(), ['simple']);
        assert.equal(runtime.getSagaStats().successCount, 1);
    });
});

