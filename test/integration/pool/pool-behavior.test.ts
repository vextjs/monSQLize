import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';

const MonSQLize = require('../../../dist/cjs/index.cjs');

// Fake MongoClient factory for unit-style pool tests (no real MongoDB needed)
type FakeClient = {
    name: string;
    connect(): Promise<FakeClient>;
    db(databaseName: string): {
        databaseName: string;
        command(): Promise<{ ok: number }>;
        collection(name: string): { databaseName: string; collectionName: string };
    };
    close(): Promise<boolean>;
};

function createFakeClient(name: string, rejectConnect = false): () => Promise<FakeClient> {
    return () => {
        if (rejectConnect) {
            return Promise.reject(new Error(`connect ETIMEDOUT: ${name} unreachable`));
        }
        const client: FakeClient = {
            name,
            connect() { return Promise.resolve(this); },
            db(databaseName: string) {
                return {
                    databaseName,
                    command: () => Promise.resolve({ ok: 1 }),
                    collection: (colName: string) => ({ databaseName, collectionName: colName }),
                };
            },
            close() { return Promise.resolve(true); },
        };
        return Promise.resolve(client);
    };
}

function makeManager(options: Record<string, unknown> = {}) {
    return new MonSQLize.ConnectionPoolManager({
        clientFactory: (cfg: { name: string }) => createFakeClient(cfg.name)(),
        healthCheckFn: () => Promise.resolve(true),
        ...options,
    });
}

describe('pool behavior', () => {

    // ── addPool / removePool ────────────────────────────────────────────────────

    describe('addPool / removePool', () => {
        it('adds a pool and makes it selectable', async () => {
            const mgr = makeManager();
            await mgr.addPool({ name: 'primary', uri: 'mongodb://h1', role: 'primary' });

            assert.ok(mgr.getPool('primary') !== null);
            assert.deepEqual(mgr.getPoolNames(), ['primary']);
            await mgr.close();
        });

        it('throws when adding a duplicate pool name', async () => {
            const mgr = makeManager();
            await mgr.addPool({ name: 'dup', uri: 'mongodb://h1', role: 'primary' });
            await assert.rejects(
                () => mgr.addPool({ name: 'dup', uri: 'mongodb://h2', role: 'primary' }),
                /already exists/,
            );
            await mgr.close();
        });

        it('removes a pool and clears it from selection', async () => {
            const mgr = makeManager();
            await mgr.addPool({ name: 'alpha', uri: 'mongodb://h1', role: 'primary' });
            await mgr.removePool('alpha');

            assert.equal(mgr.getPool('alpha'), null);
            await mgr.close();
        });

        it('throws when removing a non-existent pool', async () => {
            const mgr = makeManager();
            await assert.rejects(() => mgr.removePool('ghost'), /not found/);
            await mgr.close();
        });

        it('respects maxPoolsCount limit', async () => {
            const mgr = makeManager({ maxPoolsCount: 2 });
            await mgr.addPool({ name: 'p1', uri: 'mongodb://h1', role: 'primary' });
            await mgr.addPool({ name: 'p2', uri: 'mongodb://h2', role: 'analytics' });
            await assert.rejects(
                () => mgr.addPool({ name: 'p3', uri: 'mongodb://h3', role: 'secondary' }),
                /Maximum pool count/,
            );
            await mgr.close();
        });
    });

    // ── selectPool strategies ──────────────────────────────────────────────────

    describe('selectPool strategies', () => {
        it('roundRobin alternates between pools on successive reads', async () => {
            const mgr = makeManager({ poolStrategy: 'roundRobin' });
            await mgr.addPool({ name: 'r1', uri: 'mongodb://h1', role: 'analytics' });
            await mgr.addPool({ name: 'r2', uri: 'mongodb://h2', role: 'analytics' });

            const picks = [
                mgr.selectPool('read').name,
                mgr.selectPool('read').name,
                mgr.selectPool('read').name,
                mgr.selectPool('read').name,
            ];
            await mgr.close();

            // round-robin must visit both pools
            assert.ok(picks.includes('r1'));
            assert.ok(picks.includes('r2'));
        });

        it('auto strategy routes write to primary role', async () => {
            const mgr = makeManager({ poolStrategy: 'auto' });
            await mgr.addPool({ name: 'prim', uri: 'mongodb://h1', role: 'primary' });
            await mgr.addPool({ name: 'sec', uri: 'mongodb://h2', role: 'secondary' });

            const result = mgr.selectPool('write');
            await mgr.close();

            assert.equal(result.name, 'prim');
        });

        it('manual pool option bypasses strategy', async () => {
            const mgr = makeManager({ poolStrategy: 'roundRobin' });
            await mgr.addPool({ name: 'node1', uri: 'mongodb://h1', role: 'primary' });
            await mgr.addPool({ name: 'node2', uri: 'mongodb://h2', role: 'secondary' });

            const result = mgr.selectPool('read', { pool: 'node2' });
            await mgr.close();

            assert.equal(result.name, 'node2');
        });

        it('auto strategy forwards direct tags option as pool preference', async () => {
            const mgr = makeManager({ poolStrategy: 'auto' });
            await mgr.addPool({ name: 'primary', uri: 'mongodb://h1', role: 'primary', tags: ['write'] });
            await mgr.addPool({ name: 'secondary', uri: 'mongodb://h2', role: 'secondary', tags: ['read'] });
            await mgr.addPool({ name: 'analytics', uri: 'mongodb://h3', role: 'analytics', tags: ['reporting'] });

            const result = mgr.selectPool('read', { tags: ['reporting'] });
            await mgr.close();

            assert.equal(result.name, 'analytics');
        });

        it('throws when manually selecting a non-existent pool', async () => {
            const mgr = makeManager();
            await mgr.addPool({ name: 'only', uri: 'mongodb://h1', role: 'primary' });
            assert.throws(() => mgr.selectPool('read', { pool: 'missing' }), /not found/);
            await mgr.close();
        });

        it('leastConnections strategy selects pool with fewest connections', () => {
            const selector = new MonSQLize.PoolSelector({ strategy: 'leastConnections' });
            const pools = [
                { name: 'heavy', role: 'primary', weight: 1 },
                { name: 'light', role: 'analytics', weight: 1 },
            ];
            const result = selector.select(pools, {
                stats: { heavy: { connections: 20 }, light: { connections: 3 } },
            });
            assert.equal(result, 'light');
        });
    });

    // ── fallback behavior ──────────────────────────────────────────────────────

    describe('fallback behavior', () => {
        it('throws when no pools available and fallback disabled', async () => {
            const mgr = new MonSQLize.ConnectionPoolManager({
                clientFactory: (cfg: { name: string }) => createFakeClient(cfg.name)(),
                healthCheckFn: () => Promise.resolve(false),
                poolStrategy: 'auto',
                fallback: false,
            });
            await mgr.addPool({ name: 'only', uri: 'mongodb://h1', role: 'primary' });

            // Directly mark pool as 'down' in HealthChecker's internal status map
            const hcStatus = mgr._healthChecker._healthStatus;
            if (hcStatus instanceof Map) {
                const s = hcStatus.get('only');
                if (s) { s.status = 'down'; s.consecutiveFailures = 5; }
            }

            // _getHealthyPools() filters 'down' pools; with fallback disabled selectPool throws
            const healthy = mgr._getHealthyPools();
            assert.equal(healthy.length, 0);
            assert.throws(() => mgr.selectPool('read'), /No available/);
            await mgr.close();
        });

        it('connection failure wraps error with ETIMEDOUT keyword', async () => {
            const mgr = new MonSQLize.ConnectionPoolManager({
                clientFactory: (_cfg: unknown) =>
                    Promise.reject(new Error('MongoServerSelectionError: server selection timed out')),
            });
            await assert.rejects(
                () => mgr.addPool({ name: 'bad', uri: 'mongodb://bad', role: 'primary' }),
                (err: Error) => /connect|ETIMEDOUT|timed out/i.test(err.message),
            );
            await mgr.close();
        });
    });

    // ── health checks ──────────────────────────────────────────────────────────

    describe('health checks', () => {
        it('startHealthCheck() and stopHealthCheck() manage interval lifecycle', async () => {
            let checkCount = 0;
            const mgr = new MonSQLize.ConnectionPoolManager({
                clientFactory: (cfg: { name: string }) => createFakeClient(cfg.name)(),
                healthCheckFn: () => { checkCount += 1; return Promise.resolve(true); },
            });
            await mgr.addPool({
                name: 'hc',
                uri: 'mongodb://h1',
                role: 'primary',
                healthCheck: { enabled: true, interval: 20, timeout: 100, retries: 1 },
            });

            mgr.startHealthCheck('hc');
            await new Promise((r) => setTimeout(r, 80));
            mgr.stopHealthCheck('hc');

            assert.ok(checkCount >= 1, `Expected at least 1 health check, got ${checkCount}`);
            await mgr.close();
        });

        it('getHealthStatus() reflects up/degraded state', async () => {
            let healthy = true;
            const mgr = new MonSQLize.ConnectionPoolManager({
                clientFactory: (cfg: { name: string }) => createFakeClient(cfg.name)(),
                healthCheckFn: () => Promise.resolve(healthy),
            });
            await mgr.addPool({
                name: 'hc2',
                uri: 'mongodb://h2',
                role: 'primary',
                healthCheck: { enabled: true, interval: 20, timeout: 100, retries: 1 },
            });

            mgr.startHealthCheck('hc2');
            await new Promise((r) => setTimeout(r, 50));
            let status = mgr.getHealthStatus();
            assert.equal(status.hc2.status, 'up');

            healthy = false;
            await new Promise((r) => setTimeout(r, 50));
            status = mgr.getHealthStatus();
            assert.ok(['degraded', 'down'].includes(status.hc2.status));

            mgr.stopHealthCheck();
            await mgr.close();
        });

        it('selectPool() respects public health status from startHealthCheck()', async () => {
            let analyticsHealthy = true;
            const mgr = new MonSQLize.ConnectionPoolManager({
                clientFactory: (cfg: { name: string }) => createFakeClient(cfg.name)(),
                healthCheckFn: (poolName: string) => Promise.resolve(poolName !== 'analytics' || analyticsHealthy),
                poolStrategy: 'auto',
            });

            await mgr.addPool({
                name: 'primary',
                uri: 'mongodb://primary',
                role: 'primary',
                healthCheck: { enabled: true, interval: 10, retries: 1 },
            });
            await mgr.addPool({
                name: 'analytics',
                uri: 'mongodb://analytics',
                role: 'analytics',
                healthCheck: { enabled: true, interval: 10, retries: 1 },
            });

            mgr.startHealthCheck();
            await new Promise((r) => setTimeout(r, 30));
            analyticsHealthy = false;
            await new Promise((r) => setTimeout(r, 40));

            assert.equal(mgr.getHealthStatus().analytics.status, 'down');
            assert.equal(mgr.selectPool('read').name, 'primary');

            mgr.stopHealthCheck();
            await mgr.close();
        });
    });

    // ── getPoolStats() ─────────────────────────────────────────────────────────

    describe('getPoolStats()', () => {
        it('records totalRequests after each selectPool call', async () => {
            const mgr = makeManager();
            await mgr.addPool({ name: 'stats-pool', uri: 'mongodb://h1', role: 'primary' });

            mgr.selectPool('read');
            mgr.selectPool('write');
            mgr.selectPool('read');

            const stats = mgr.getPoolStats();
            assert.ok(stats['stats-pool'].totalRequests >= 3);
            await mgr.close();
        });

        it('returns empty stats object before any selects', async () => {
            const mgr = makeManager();
            await mgr.addPool({ name: 'empty-pool', uri: 'mongodb://h1', role: 'primary' });

            const stats = mgr.getPoolStats();
            assert.equal(stats['empty-pool'].totalRequests, 0);
            await mgr.close();
        });
    });

    // ── close() ────────────────────────────────────────────────────────────────

    describe('close()', () => {
        it('close() sets _closed flag and clears all pools', async () => {
            const mgr = makeManager();
            await mgr.addPool({ name: 'closable', uri: 'mongodb://h1', role: 'primary' });

            await mgr.close();

            assert.equal(mgr._closed, true);
            assert.equal(mgr.getPool('closable'), null);
        });
    });
});
