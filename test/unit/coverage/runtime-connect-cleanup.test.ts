import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { cleanupFailedRuntimeConnection } from '../../../src/entry/runtime-connect-cleanup';

describe('failed runtime connection cleanup', () => {
    it('cleans every initialized resource', async () => {
        const calls: string[] = [];
        const closeable = (name: string) => ({ close: async () => { calls.push(name); } });

        await cleanupFailedRuntimeConnection({
            client: closeable('client'),
            pool: closeable('pool'),
            tunnel: closeable('tunnel'),
            invalidator: closeable('invalidator'),
            sync: { stop: async () => { calls.push('sync'); } },
            slowQuery: closeable('slowQuery'),
            transaction: { abortAll: async () => { calls.push('transaction'); } },
            lock: closeable('lock'),
        }, {});

        assert.deepEqual(calls, [
            'lock',
            'sync',
            'slowQuery',
            'transaction',
            'pool',
            'invalidator',
            'client',
            'tunnel',
        ]);
    });

    it('accepts a connection failure before any resource was initialized', async () => {
        await assert.doesNotReject(() => cleanupFailedRuntimeConnection({
            client: null,
            pool: null,
            tunnel: null,
            invalidator: null,
            sync: null,
            slowQuery: null,
            transaction: null,
            lock: null,
        }, {}));
    });

    it('collects synchronous and asynchronous cleanup failures without rejecting', async () => {
        const warnings: unknown[][] = [];
        const rejected = (name: string) => ({ close: async () => { throw new Error(name); } });

        await assert.doesNotReject(() => cleanupFailedRuntimeConnection({
            client: rejected('client'),
            pool: rejected('pool'),
            tunnel: rejected('tunnel'),
            invalidator: rejected('invalidator'),
            sync: { stop: async () => { throw new Error('sync'); } },
            slowQuery: rejected('slowQuery'),
            transaction: { abortAll: async () => { throw new Error('transaction'); } },
            lock: { close: () => { throw new Error('lock'); } },
        }, { warn: (...args: unknown[]) => { warnings.push(args); } }));

        assert.equal(warnings.length, 8);
        assert.match(String(warnings[0]?.[0]), /lock cleanup error/);
        assert.ok(warnings.slice(1).every(([message]) => String(message).includes('cleanup error after failed connect')));
    });

    it('does not require a warning logger while swallowing cleanup failures', async () => {
        await assert.doesNotReject(() => cleanupFailedRuntimeConnection({
            client: { close: async () => { throw new Error('client'); } },
            pool: null,
            tunnel: null,
            invalidator: null,
            sync: null,
            slowQuery: null,
            transaction: null,
            lock: { close: () => { throw new Error('lock'); } },
        }, {}));
    });
});
