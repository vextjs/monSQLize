import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

const MonSQLize = require('../../../dist/cjs/index.cjs');

function hasErrorCode(error: unknown, code: string): boolean {
    return Boolean(error && typeof error === 'object' && 'code' in error && (error as any).code === code);
}

describe('SagaOrchestrator behavior', () => {

    // ── successful multi-step saga ────────────────────────────────────────────

    describe('successful execution', () => {
        it('executes all steps in order and returns last step result', async () => {
            const saga = new MonSQLize.SagaOrchestrator();
            const order: string[] = [];

            saga.define({
                name: 'multi-step',
                steps: [
                    { name: 'step-a', execute: () => { order.push('a'); return Promise.resolve('result-a'); } },
                    { name: 'step-b', execute: () => { order.push('b'); return Promise.resolve('result-b'); } },
                    { name: 'step-c', execute: () => { order.push('c'); return Promise.resolve('result-c'); } },
                ],
            });

            const result = await saga.execute('multi-step', {});
            assert.equal(result.success, true);
            assert.equal(result.result, 'result-c');
            assert.deepEqual(order, ['a', 'b', 'c']);
            assert.deepEqual(result.completedSteps, ['step-a', 'step-b', 'step-c']);
            assert.equal(result.completedStepCount, 3);
        });

        it('step results are stored in context and accessible by later steps', async () => {
            const saga = new MonSQLize.SagaOrchestrator();
            let seenValue: unknown = undefined;

            saga.define({
                name: 'ctx-chain',
                steps: [
                    {
                        name: 'producer',
                        execute: (ctx: any) => { ctx.set('token', 'abc123'); return Promise.resolve('abc123'); },
                    },
                    {
                        name: 'consumer',
                        execute: (ctx: any) => {
                            seenValue = ctx.get('token');
                            return Promise.resolve(seenValue);
                        },
                    },
                ],
            });

            const result = await saga.execute('ctx-chain', {});
            assert.equal(result.success, true);
            assert.equal(seenValue, 'abc123');
        });

        it('returns sagaId and executionId on the result', async () => {
            const saga = new MonSQLize.SagaOrchestrator();
            saga.define({
                name: 'id-check',
                steps: [{ name: 's', execute: () => Promise.resolve() }],
            });

            const result = await saga.execute('id-check', {});
            assert.ok(typeof result.sagaId === 'string' && result.sagaId.length > 0);
            assert.equal(result.executionId, result.sagaId);
        });
    });

    // ── compensation on failure ───────────────────────────────────────────────

    describe('compensation', () => {
        it('runs compensation in reverse order when a step fails', async () => {
            const saga = new MonSQLize.SagaOrchestrator();
            const log: string[] = [];

            saga.define({
                name: 'comp-order',
                steps: [
                    {
                        name: 'step-1',
                        execute: () => { log.push('exec-1'); return Promise.resolve('r1'); },
                        compensate: () => { log.push('comp-1'); return Promise.resolve(); },
                    },
                    {
                        name: 'step-2',
                        execute: () => { log.push('exec-2'); return Promise.resolve('r2'); },
                        compensate: () => { log.push('comp-2'); return Promise.resolve(); },
                    },
                    {
                        name: 'step-3',
                        execute: () => { log.push('exec-3'); return Promise.reject(new Error('oops')); },
                    },
                ],
            });

            const result = await saga.execute('comp-order', {});
            assert.equal(result.success, false);
            assert.deepEqual(log, ['exec-1', 'exec-2', 'exec-3', 'comp-2', 'comp-1']);
            assert.deepEqual(result.compensatedSteps, ['step-2', 'step-1']);
        });

        it('step without compensate is skipped with reason=no-compensate-defined', async () => {
            const saga = new MonSQLize.SagaOrchestrator();

            saga.define({
                name: 'no-comp',
                steps: [
                    { name: 'step-1', execute: () => Promise.resolve() },
                    { name: 'step-2', execute: () => Promise.reject(new Error('fail')) },
                ],
            });

            const result = await saga.execute('no-comp', {});
            assert.equal(result.success, false);
            assert.equal(result.compensatedSteps.length, 0);
            const compResult = result.compensation?.results?.[0];
            assert.equal(compResult?.reason, 'no-compensate-defined');
        });

        it('compensation failure is captured but does not throw', async () => {
            const saga = new MonSQLize.SagaOrchestrator();

            saga.define({
                name: 'comp-fail',
                steps: [
                    {
                        name: 'step-1',
                        execute: () => Promise.resolve(),
                        compensate: () => Promise.reject(new Error('comp-err')),
                    },
                    { name: 'step-2', execute: () => Promise.reject(new Error('fail')) },
                ],
            });

            const result = await saga.execute('comp-fail', {});
            assert.equal(result.success, false);
            const compResult = result.compensation?.results?.find((r: any) => r.stepName === 'step-1');
            assert.equal(compResult?.success, false);
            assert.ok(/comp-err/.test(compResult?.error ?? ''));
        });
    });

    // ── retry logic ────────────────────────────────────────────────���──────────

    describe('step retries', () => {
        it('retries a failing step up to the specified count', async () => {
            const saga = new MonSQLize.SagaOrchestrator();
            let attempts = 0;

            saga.define({
                name: 'retry-test',
                steps: [
                    {
                        name: 'flaky',
                        retries: 2,
                        execute: () => {
                            attempts += 1;
                            if (attempts < 3) return Promise.reject(new Error('not yet'));
                            return Promise.resolve('done');
                        },
                    },
                ],
            });

            const result = await saga.execute('retry-test', {});
            assert.equal(result.success, true);
            assert.equal(attempts, 3);
        });

        it('fails after exhausting all retries', async () => {
            const saga = new MonSQLize.SagaOrchestrator();

            saga.define({
                name: 'always-fail',
                steps: [
                    {
                        name: 'bad-step',
                        retries: 1,
                        execute: () => Promise.reject(new Error('permanent')),
                    },
                ],
            });

            const result = await saga.execute('always-fail', {});
            assert.equal(result.success, false);
            assert.match(result.error?.message ?? '', /permanent/);
        });
    });

    // ── step timeout ──────────────────────────────────────────────────────────

    describe('step timeout', () => {
        it('fails with timeout error when step exceeds its timeout', async () => {
            const saga = new MonSQLize.SagaOrchestrator();

            // Use a ref'd timer so the event loop stays alive long enough
            // for the saga's unref'd step-timeout (20ms) to fire.
            saga.define({
                name: 'timeout-test',
                steps: [
                    {
                        name: 'slow-step',
                        timeout: 20,
                        execute: () => new Promise<void>((resolve) => setTimeout(resolve, 500)),
                    },
                ],
            });

            const result = await saga.execute('timeout-test', {});
            assert.equal(result.success, false);
            assert.match(result.error?.message ?? '', /timed out/);
        });

        it('aborts the step context signal when a step times out', async () => {
            const saga = new MonSQLize.SagaOrchestrator();
            let aborted = false;

            saga.define({
                name: 'abort-signal-timeout',
                steps: [
                    {
                        name: 'slow-step',
                        timeout: 20,
                        execute: (ctx: any) => new Promise<void>((resolve) => {
                            ctx.signal?.addEventListener('abort', () => {
                                aborted = true;
                                resolve();
                            });
                        }),
                    },
                ],
            });

            const result = await saga.execute('abort-signal-timeout', {});
            assert.equal(result.success, false);
            assert.equal(aborted, true);
        });
    });

    // ── context API ───────────────────────────────────────────────────────────

    describe('SagaContext API', () => {
        it('has/getAll/completedSteps/getStepResult/getCompletedSteps work correctly', async () => {
            const saga = new MonSQLize.SagaOrchestrator();
            let capturedCtx: any = null;

            saga.define({
                name: 'ctx-api',
                steps: [
                    {
                        name: 'write',
                        execute: (ctx: any) => {
                            ctx.set('x', 42);
                            capturedCtx = ctx;
                            return Promise.resolve('step-result');
                        },
                    },
                ],
            });

            await saga.execute('ctx-api', { input: 'test' });

            assert.equal(capturedCtx.has('x'), true);
            assert.equal(capturedCtx.has('missing'), false);
            assert.deepEqual(capturedCtx.getAll(), { x: 42, write: 'step-result' });
            assert.deepEqual(capturedCtx.getCompletedSteps(), ['write']);
            assert.equal(capturedCtx.getStepResult('write'), 'step-result');
            // sagaId v1 alias
            assert.equal(typeof capturedCtx.sagaId, 'string');
            assert.equal(capturedCtx.sagaId, capturedCtx.executionId);
        });
    });

    // ── stats tracking ────────────────────────────────────────────────────────

    describe('getStats()', () => {
        it('tracks success, failure, and compensation counts', async () => {
            const saga = new MonSQLize.SagaOrchestrator();

            saga.define({
                name: 'stats-saga',
                steps: [{ name: 's', execute: () => Promise.resolve() }],
            });
            saga.define({
                name: 'fail-saga',
                steps: [
                    {
                        name: 'step-ok',
                        execute: () => Promise.resolve('ok'),
                        compensate: () => Promise.resolve(),
                    },
                    {
                        name: 'step-fail',
                        execute: () => Promise.reject(new Error('err')),
                    },
                ],
            });

            await saga.execute('stats-saga', {});
            await saga.execute('stats-saga', {});
            await saga.execute('fail-saga', {});

            const stats = saga.getStats();
            assert.equal(stats.totalExecutions, 3);
            assert.equal(stats.successfulExecutions, 2);
            assert.equal(stats.failedExecutions, 1);
            assert.equal(stats.compensatedExecutions, 1);
            assert.equal(stats.successRate, '67%');
        });
    });

    // ── defineSaga async alias ────────────────────────────────────────────────

    describe('defineSaga() async alias', () => {
        it('defineSaga() returns the registered definition and registers the saga', async () => {
            const saga = new MonSQLize.SagaOrchestrator();
            const def = { name: 'async-saga', steps: [{ name: 's', execute: () => Promise.resolve() }] };

            const registered = await saga.defineSaga(def);
            assert.equal(registered.name, 'async-saga');
            assert.equal(Array.isArray(registered.steps), true);
            assert.ok(saga.getSaga('async-saga') !== undefined);
        });

        it('persists saga metadata when a Redis-like cache is provided', async () => {
            const records = new Map<string, unknown>();
            const cache = {
                set(key: string, value: unknown) { records.set(key, value); },
                keys() { return [...records.keys()]; },
                publish() { },
            };
            const saga = new MonSQLize.SagaOrchestrator({ cache });
            const def = { name: 'cached-saga', steps: [{ name: 's', execute: () => Promise.resolve() }] };

            assert.equal(saga.useRedis, true);
            await saga.defineSaga(def);
            assert.ok(records.has('monsqlize:saga:def:cached-saga'));
        });
    });

    // ── validation ────────────────────────────────────────────────────────────

    describe('validation', () => {
        it('throws INVALID_ARGUMENT when saga name is empty', () => {
            const saga = new MonSQLize.SagaOrchestrator();
            assert.throws(
                () => saga.define({ name: '', steps: [{ name: 's', execute: () => Promise.resolve() }] }),
                (e: unknown) => hasErrorCode(e, 'INVALID_ARGUMENT'),
            );
        });

        it('throws INVALID_ARGUMENT when steps array is empty', () => {
            const saga = new MonSQLize.SagaOrchestrator();
            assert.throws(
                () => saga.define({ name: 'empty-steps', steps: [] }),
                (e: unknown) => hasErrorCode(e, 'INVALID_ARGUMENT'),
            );
        });

        it('throws INVALID_ARGUMENT when step has no execute function', () => {
            const saga = new MonSQLize.SagaOrchestrator();
            assert.throws(
                () => saga.define({
                    name: 'bad-step',
                    steps: [{ name: 's', execute: 'not-a-fn' as any }],
                }),
                (e: unknown) => hasErrorCode(e, 'INVALID_ARGUMENT'),
            );
        });

        it('throws INVALID_ARGUMENT on execute() when saga is not defined', async () => {
            const saga = new MonSQLize.SagaOrchestrator();
            await assert.rejects(
                () => saga.execute('undefined-saga', {}),
                (e: unknown) => hasErrorCode(e, 'INVALID_ARGUMENT'),
            );
        });
    });
});
