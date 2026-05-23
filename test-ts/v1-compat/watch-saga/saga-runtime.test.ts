import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import MonSQLize from 'monsqlize';
import type { SagaContext } from 'monsqlize';

describe('Stage B saga TS migration', () => {
    it('SagaOrchestrator 应保持公开执行链与 v1 兼容别名稳定', async () => {
        const orchestrator = new MonSQLize.SagaOrchestrator();
        const calls: string[] = [];

        await orchestrator.defineSaga({
            name: 'checkout',
            steps: [
                {
                    name: 'reserve',
                    execute: async (ctx: SagaContext) => {
                        calls.push('reserve');
                        assert.equal(ctx.sagaId, ctx.executionId);
                        ctx.set('inventoryReserved', true);
                        return { reserved: true };
                    },
                    compensate: async (ctx: SagaContext, result?: unknown) => {
                        calls.push(`compensate:${String((result as { reserved?: boolean } | undefined)?.reserved)}`);
                        assert.equal(ctx.get<boolean>('inventoryReserved'), true);
                    },
                },
                {
                    name: 'create-order',
                    execute: async (ctx: SagaContext) => {
                        calls.push('create');
                        assert.deepEqual(ctx.getStepResult('reserve'), { reserved: true });
                        ctx.set('orderId', 'ORDER123');
                        return { orderId: 'ORDER123' };
                    },
                    compensate: async (ctx: SagaContext) => {
                        calls.push(`cancel:${ctx.get<string>('orderId')}`);
                    },
                },
                {
                    name: 'charge',
                    execute: async (ctx: SagaContext) => {
                        calls.push('charge');
                        assert.deepEqual(ctx.getCompletedSteps(), ['reserve', 'create-order']);
                        throw new Error('payment failed');
                    },
                },
            ],
        });

        const result = await orchestrator.execute('checkout', { userId: 'u1' });

        assert.equal(result.success, false);
        assert.equal(result.sagaName, 'checkout');
        assert.equal(result.completedSteps, 2);
        assert.deepEqual(result.completedStepNames, ['reserve', 'create-order']);
        assert.deepEqual(result.compensatedSteps, ['create-order', 'reserve']);
        assert.equal(result.error, 'payment failed');
        assert.equal(result.executionId, result.sagaId);
        assert.deepEqual(calls, ['reserve', 'create', 'charge', 'cancel:ORDER123', 'compensate:true']);
        assert.deepEqual(await orchestrator.listSagas(), ['checkout']);
        assert.equal(orchestrator.getSaga('checkout')?.name, 'checkout');

        const stats = orchestrator.getStats();
        assert.equal(stats.totalExecutions, 1);
        assert.equal(stats.failedExecutions, 1);
        assert.equal(stats.compensatedExecutions, 1);
        assert.equal(stats.failureCount, 1);
    });

    it('runtime facade 应复用同一 saga orchestrator 并暴露公开别名', async () => {
        const runtime = new MonSQLize({
            type: 'mongodb',
            databaseName: `stage_b_saga_runtime_${Date.now()}`,
        });

        const orchestrator = runtime.getSagaOrchestrator();
        assert.equal(runtime.saga(), orchestrator);

        runtime.defineSaga({
            name: 'simple',
            steps: [
                {
                    name: 'set-value',
                    execute: async (ctx: SagaContext) => {
                        ctx.set('done', true);
                        return 'ok';
                    },
                },
            ],
        });

        const result = await runtime.executeSaga('simple', { id: 1 });

        assert.equal(result.success, true);
        assert.equal(result.result, 'ok');
        assert.equal(result.executionId, result.sagaId);
        assert.deepEqual(await runtime.listSagas(), ['simple']);
        assert.equal(runtime.getSagaStats().totalExecutions, 1);
        assert.equal(runtime.getSagaStats().successCount, 1);
        assert.equal(orchestrator.getSaga('simple')?.name, 'simple');
    });
});