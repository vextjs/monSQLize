const { afterEach, describe, it } = require('node:test');
const assert = require('node:assert/strict');

const MonSQLize = require('../../../lib/index.js');

function createFakeClient(name) {
    return {
        name,
        connect() {
            return Promise.resolve(this);
        },
        db(databaseName) {
            return {
                databaseName,
                command: () => Promise.resolve({ ok: 1 }),
                collection(collectionName) {
                    return { databaseName, collectionName };
                },
            };
        },
        close() {
            return Promise.resolve(true);
        },
    };
}

describe('P4-B pool manager', () => {
    afterEach(async () => {
        // no-op, isolated instances per test
    });

    it('应支持 add/remove/select/stats/health 的最小闭环', async () => {
        let unhealthy = false;
        const manager = new MonSQLize.ConnectionPoolManager({
            poolStrategy: 'roundRobin',
            clientFactory: (config) => Promise.resolve(createFakeClient(config.name)),
            healthCheckFn: (poolName) => Promise.resolve(!(unhealthy && poolName === 'analytics')),
        });

        await manager.addPool({
            name: 'primary',
            uri: 'mongodb://primary',
            role: 'primary',
            healthCheck: { interval: 5, retries: 1 },
        });
        await manager.addPool({
            name: 'analytics',
            uri: 'mongodb://analytics',
            role: 'analytics',
            weight: 2,
            healthCheck: { interval: 5, retries: 1 },
        });

        assert.ok(manager.getPool('primary'));
        assert.equal(manager.selectPool('write').name, 'primary');
        assert.equal(manager.selectPool('read').name, 'analytics');

        const readStats = manager.getPoolStats();
        assert.equal(readStats.primary.totalRequests >= 1, true);
        assert.equal(readStats.analytics.totalRequests >= 1, true);

        manager.startHealthCheck();
        await new Promise((resolve) => setTimeout(resolve, 20));
        let health = manager.getHealthStatus();
        assert.equal(health.primary.status, 'up');
        assert.equal(health.analytics.status, 'up');

        unhealthy = true;
        await new Promise((resolve) => setTimeout(resolve, 20));
        health = manager.getHealthStatus();
        assert.equal(['degraded', 'down'].includes(health.analytics.status), true);

        await manager.removePool('analytics');
        assert.equal(manager.getPool('analytics'), null);

        await manager.close();
    });

    it('应保持 PoolSelector 静态导出与策略行为稳定', () => {
        const selector = new MonSQLize.PoolSelector({ strategy: 'auto' });
        const pools = [
            { name: 'primary', role: 'primary', weight: 1, tags: ['prod'] },
            { name: 'analytics', role: 'analytics', weight: 1, tags: ['olap'] },
            { name: 'secondary', role: 'secondary', weight: 2, tags: ['prod', 'read'] },
        ];

        assert.equal(selector.select(pools, { operation: 'write' }), 'primary');
        assert.equal(selector.select(pools, { poolPreference: { tags: ['olap'] } }), 'analytics');

        selector.setStrategy('leastConnections');
        assert.equal(selector.select(pools, {
            stats: {
                primary: { connections: 12 },
                analytics: { connections: 7 },
                secondary: { connections: 2 },
            },
        }), 'secondary');
    });
});



