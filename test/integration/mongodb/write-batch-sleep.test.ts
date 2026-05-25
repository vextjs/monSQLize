import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryServerBootstrap } from '../../bootstrap/memory-server';

const MonSQLize = require('../../../dist/cjs/index.cjs');

// Covers write-utils.ts uncovered function:
//   - sleep()  (FNDA:0 — only called when retryDelay > 0 in write-batch retry loop)

describe('write-batch — sleep() coverage via retryDelay > 0', () => {
    const bootstrap = createMemoryServerBootstrap();
    let runtime: any;
    let coll: any;

    before(async () => {
        const { uri } = await bootstrap.setup();
        runtime = new MonSQLize({ type: 'mongodb', databaseName: 'test_sleep_cov', config: { uri } });
        await runtime.connect();
        coll = runtime.collection('sleep_test');
    });

    after(async () => {
        if (runtime) await runtime.close();
        await bootstrap.teardown();
    });

    it('insertBatch with retryDelay=1 and onError=retry → calls sleep(1)', async () => {
        // Insert a doc with a known _id; then insertBatch the same _id → duplicate key error
        // With onError=retry and retryDelay=1, write-batch calls sleep(1) before retrying
        const fixedId = 'sleep-test-fixed-id';
        await coll.insertOne({ _id: fixedId, x: 0 });

        const result = await coll.insertBatch(
            [{ _id: fixedId, x: 1 }],
            { onError: 'retry', retryAttempts: 1, retryDelay: 1 },
        );
        // sleep(1) was called during the retry — verify retry was recorded
        assert.ok(result.retries.length >= 1);
        assert.equal(result.retries[0].delay, 1);
    });
});
