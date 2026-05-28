import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

const { SagaOrchestrator } = require('../../../dist/cjs/index.cjs');

describe('SagaOrchestrator — branch coverage', () => {
    it('throws when saga not defined', async () => {
        const orch = new SagaOrchestrator();
        await assert.rejects(() => orch.execute('missing', {}), /not defined/);
    });

    it('executes simple saga successfully', async () => {
        const orch = new SagaOrchestrator();
        orch.define({
            name: 'simple',
            steps: [
                { name: 's1', execute: async () => 'result1' },
                { name: 's2', execute: async () => 'result2' },
            ],
        });
        const result = await orch.execute('simple', { data: 1 });
        assert.equal(result.success, true);
        assert.deepEqual(result.completedSteps, ['s1', 's2']);
        assert.equal(result.completedStepCount, 2);
    });

    it('step returning undefined does not set context value (undefined branch)', async () => {
        const orch = new SagaOrchestrator();
        orch.define({
            name: 'undef',
            steps: [
                { name: 's1', execute: async () => undefined },
            ],
        });
        const result = await orch.execute('undef', {});
        assert.equal(result.success, true);
    });

    it('failed step triggers compensation for completed steps', async () => {
        const orch = new SagaOrchestrator();
        const compensated: string[] = [];
        orch.define({
            name: 'fail-saga',
            steps: [
                {
                    name: 's1',
                    execute: async () => 'done',
                    compensate: async () => { compensated.push('s1'); },
                },
                {
                    name: 's2',
                    execute: async () => { throw new Error('step 2 failed'); },
                },
            ],
        });
        const result = await orch.execute('fail-saga', {});
        assert.equal(result.success, false);
        assert.ok(compensated.includes('s1'));
    });

    it('compensation that throws is caught and recorded as failed', async () => {
        const orch = new SagaOrchestrator({ logger: { error: () => { }, warn: () => { }, info: () => { }, debug: () => { } } });
        orch.define({
            name: 'comp-throw',
            steps: [
                {
                    name: 's1',
                    execute: async () => 'ok',
                    compensate: async () => { throw new Error('compensation error'); },
                },
                {
                    name: 's2',
                    execute: async () => { throw new Error('step 2 failed'); },
                },
            ],
        });
        const result = await orch.execute('comp-throw', {});
        assert.equal(result.success, false);
        const compResult = result.compensation.results.find((r: any) => r.stepName === 's1');
        assert.ok(compResult);
        assert.equal(compResult.success, false);
        assert.ok(compResult.error?.includes('compensation error'));
    });

    it('step without compensate: no-compensate-defined reason', async () => {
        const orch = new SagaOrchestrator();
        orch.define({
            name: 'no-comp',
            steps: [
                { name: 's1', execute: async () => 'ok' },
                { name: 's2', execute: async () => { throw new Error('fail'); } },
            ],
        });
        const result = await orch.execute('no-comp', {});
        assert.equal(result.success, false);
        const compResult = result.compensation?.results?.find((r: any) => r.stepName === 's1');
        assert.equal(compResult?.reason, 'no-compensate-defined');
    });

    it('getStats reflects execution counts', async () => {
        const orch = new SagaOrchestrator();
        orch.define({
            name: 'stat-saga',
            steps: [{ name: 's1', execute: async () => 'ok' }],
        });
        orch.define({
            name: 'fail-saga',
            steps: [{ name: 's1', execute: async () => { throw new Error(); } }],
        });
        await orch.execute('stat-saga', {});
        await orch.execute('stat-saga', {});
        await orch.execute('fail-saga', {});
        const stats = orch.getStats();
        assert.equal(stats.totalExecutions, 3);
        assert.equal(stats.successfulExecutions, 2);
        assert.equal(stats.failedExecutions, 1);
    });

    it('listSagas returns registered saga names', async () => {
        const orch = new SagaOrchestrator();
        orch.define({ name: 'saga1', steps: [{ name: 's1', execute: async () => { } }] });
        orch.define({ name: 'saga2', steps: [{ name: 's1', execute: async () => { } }] });
        const list = await orch.listSagas();
        assert.ok(list.includes('saga1'));
        assert.ok(list.includes('saga2'));
    });

    it('defineSaga (async compat) returns full saga definition', async () => {
        const orch = new SagaOrchestrator();
        const execute = async () => { };
        const result = await orch.defineSaga({
            name: 'ds1',
            timeout: 123,
            logging: true,
            steps: [{ name: 's1', execute }],
        });
        assert.equal(result.name, 'ds1');
        assert.equal(result.timeout, 123);
        assert.equal(result.logging, true);
        assert.equal(result.steps.length, 1);
        assert.equal(result.steps[0].name, 's1');
        assert.equal(result.steps[0].execute, execute);
    });

    it('compensation success is false when compensation step fails', async () => {
        const orch = new SagaOrchestrator();
        orch.define({
            name: 'full-comp-fail',
            steps: [
                {
                    name: 's1',
                    execute: async () => 'ok',
                    compensate: async () => { throw new Error('comp-error'); },
                },
                { name: 's2', execute: async () => { throw new Error('fail'); } },
            ],
        });
        const result = await orch.execute('full-comp-fail', {});
        assert.equal(result.success, false);
        assert.equal(result.compensation.success, false);
    });

    it('execute with error that is not Error instance', async () => {
        const orch = new SagaOrchestrator();
        orch.define({
            name: 'non-error',
            steps: [
                { name: 's1', execute: async () => { throw 'string error'; } },
            ],
        });
        const result = await orch.execute('non-error', {});
        assert.equal(result.success, false);
        assert.equal(result.error?.message, 'string error');
        assert.equal(result.errorMessage, 'string error');
    });

    it('compensatedSteps only includes steps with compensate function', async () => {
        const orch = new SagaOrchestrator();
        orch.define({
            name: 'mixed-comp',
            steps: [
                { name: 's1', execute: async () => 'ok' }, // no compensate
                {
                    name: 's2',
                    execute: async () => 'ok',
                    compensate: async () => { },
                },
                { name: 's3', execute: async () => { throw new Error('fail'); } },
            ],
        });
        const result = await orch.execute('mixed-comp', {});
        assert.equal(result.success, false);
        assert.ok(result.compensatedSteps.includes('s2'));
        assert.ok(!result.compensatedSteps.includes('s1'));
    });
});
