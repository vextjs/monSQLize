import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';

import MonSQLize from 'monsqlize';

const { createReplSetBootstrap } = require(path.join(process.cwd(), 'test', 'bootstrap', 'replset-server'));

function wait(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

describe('Stage B connection pool manager TS migration', () => {
    const bootstrap = createReplSetBootstrap({ dbName: 'monsqlize_stage_b_pool_sync_pool' });
    let uri: string;

    before(async () => {
        const context = await bootstrap.setup();
        uri = context.uri;
    });

    after(async () => {
        await bootstrap.teardown();
    });

    it('ConnectionPoolManager 应支持 add/remove/select/stats/health 的最小闭环', async () => {
        const manager = new MonSQLize.ConnectionPoolManager({
            poolStrategy: 'roundRobin',
        });

        try {
            await manager.addPool({
                name: 'primary',
                uri,
                role: 'primary',
                healthCheck: { interval: 10, retries: 1 },
            });
            await manager.addPool({
                name: 'analytics',
                uri,
                role: 'analytics',
                weight: 2,
                healthCheck: { interval: 10, retries: 1 },
            });

            assert.deepEqual(manager.getPoolNames().sort(), ['analytics', 'primary']);
            assert.notEqual(manager.getPool('primary'), null);
            assert.equal(manager.selectPool('write').name, 'primary');
            assert.equal(manager.selectPool('read').name, 'analytics');

            const stats = manager.getPoolStats();
            assert.equal(stats.primary.totalRequests >= 1, true);
            assert.equal(stats.analytics.totalRequests >= 1, true);

            manager.startHealthCheck();
            await wait(40);

            const health = manager.getHealthStatus();
            assert.equal(health.primary.status, 'up');
            assert.equal(health.analytics.status, 'up');

            await manager.removePool('analytics');
            assert.equal(manager.getPool('analytics'), null);
        } finally {
            await manager.close();
        }
    });
});