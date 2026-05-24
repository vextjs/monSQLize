import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';

const MonSQLize = require('../../../dist/cjs/index.cjs');

type FakeClient = {
    name: string;
    connect(): Promise<FakeClient>;
    db(databaseName: string): {
        databaseName: string;
        command(): Promise<{ ok: number }>;
        collection(collectionName: string): { databaseName: string; collectionName: string };
    };
    close(): Promise<boolean>;
};

function createFakeClient(name: string): FakeClient {
    return {
        name,
        connect() {
            return Promise.resolve(this);
        },
        db(databaseName: string) {
            return {
                databaseName,
                command: () => Promise.resolve({ ok: 1 }),
                collection(collectionName: string) {
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

    it('supports minimal add/remove/select/stats/health round trip', async () => {
        let unhealthy = false;
        const manager = new MonSQLize.ConnectionPoolManager({
            poolStrategy: 'roundRobin',
            clientFactory: (config: { name: string }) => Promise.resolve(createFakeClient(config.name)),
            healthCheckFn: (poolName: string) => Promise.resolve(!(unhealthy && poolName === 'analytics')),
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

    it('keeps PoolSelector static export and strategy behavior stable', () => {
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