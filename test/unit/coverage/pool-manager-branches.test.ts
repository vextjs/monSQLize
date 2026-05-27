import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

const { ConnectionPoolManager, HealthChecker } = require('../../../dist/cjs/index.cjs');

function makeMockClient(name = 'mock') {
    return {
        _name: name,
        close: async () => {},
        db: () => ({ command: async () => ({ ok: 1 }) }),
    };
}

function buildManager(opts: Record<string, unknown> = {}) {
    let callCount = 0;
    const mgr = new ConnectionPoolManager({
        clientFactory: async (_config: unknown) => {
            callCount++;
            return makeMockClient(`client-${callCount}`);
        },
        healthCheckFn: async () => true,
        ...opts,
    });
    return mgr;
}

describe('ConnectionPoolManager — branch coverage', () => {
    it('addPool succeeds with valid config', async () => {
        const mgr = buildManager();
        await mgr.addPool({ name: 'p1', uri: 'mongodb://localhost:27017' });
        assert.ok(mgr.getPool('p1') !== null);
    });

    it('addPool throws when pool already exists', async () => {
        const mgr = buildManager();
        await mgr.addPool({ name: 'p1', uri: 'mongodb://localhost:27017' });
        await assert.rejects(
            () => mgr.addPool({ name: 'p1', uri: 'mongodb://localhost:27017' }),
            /already exists/,
        );
    });

    it('addPool throws when max pool count reached', async () => {
        const mgr = buildManager({ maxPoolsCount: 1 });
        await mgr.addPool({ name: 'p1', uri: 'mongodb://localhost:27017' });
        await assert.rejects(
            () => mgr.addPool({ name: 'p2', uri: 'mongodb://localhost:27017' }),
            /Maximum pool count/,
        );
    });

    it('addPool: clientFactory throws with non-mongo error propagates as-is', async () => {
        const mgr = new ConnectionPoolManager({
            clientFactory: async () => { throw new Error('connect ETIMEDOUT: network issue'); },
            healthCheckFn: async () => true,
        });
        await assert.rejects(
            () => mgr.addPool({ name: 'p1', uri: 'mongodb://localhost:27017' }),
            /ETIMEDOUT/,
        );
    });

    it('addPool: mongo error without network keyword gets enhanced message', async () => {
        const mongoErr = new Error('Server selection timed out');
        (mongoErr as any).name = 'MongoServerSelectionError';
        const mgr = new ConnectionPoolManager({
            clientFactory: async () => { throw mongoErr; },
            healthCheckFn: async () => true,
        });
        await assert.rejects(
            () => mgr.addPool({ name: 'p1', uri: 'mongodb://localhost:27017' }),
            /ETIMEDOUT/,
        );
    });

    it('removePool throws when pool not found', async () => {
        const mgr = buildManager();
        await assert.rejects(
            () => mgr.removePool('missing'),
            /not found/,
        );
    });

    it('removePool cleans up existing pool', async () => {
        const mgr = buildManager();
        await mgr.addPool({ name: 'p1', uri: 'mongodb://localhost:27017' });
        await mgr.removePool('p1');
        assert.equal(mgr.getPool('p1'), null);
    });

    it('getPool returns null for unknown pool', () => {
        const mgr = buildManager();
        assert.equal(mgr.getPool('unknown'), null);
    });

    it('selectPool: named pool option returns that pool', async () => {
        const mgr = buildManager();
        await mgr.addPool({ name: 'p1', uri: 'mongodb://localhost:27017' });
        const result = mgr.selectPool('read', { pool: 'p1' });
        assert.equal(result.name, 'p1');
    });

    it('selectPool: named pool that does not exist throws', async () => {
        const mgr = buildManager();
        assert.throws(() => mgr.selectPool('read', { pool: 'missing' }), /not found/);
    });

    it('selectPool: no pools available without fallback throws', () => {
        const mgr = buildManager();
        assert.throws(() => mgr.selectPool('read'), /No available connection pool/);
    });

    it('selectPool: fallback=true with pools available works', async () => {
        const mgr = buildManager({ fallback: true });
        await mgr.addPool({ name: 'p1', uri: 'mongodb://localhost:27017' });
        const result = mgr.selectPool('read');
        assert.equal(result.name, 'p1');
    });

    it('selectPool: fallback.enabled=false, no pools → throws', () => {
        const mgr = buildManager({ fallback: { enabled: false } });
        assert.throws(() => mgr.selectPool('read'), /No available connection pool/);
    });

    it('getPoolNames returns all pool names', async () => {
        const mgr = buildManager();
        await mgr.addPool({ name: 'p1', uri: 'mongodb://localhost:27017' });
        await mgr.addPool({ name: 'p2', uri: 'mongodb://localhost:27017' });
        const names = mgr.getPoolNames();
        assert.ok(names.includes('p1'));
        assert.ok(names.includes('p2'));
    });

    it('getPoolStats returns stats object for each pool', async () => {
        const mgr = buildManager();
        await mgr.addPool({ name: 'p1', uri: 'mongodb://localhost:27017' });
        const stats = mgr.getPoolStats();
        assert.ok('p1' in stats);
    });

    it('getHealthStatus returns health for each pool', async () => {
        const mgr = buildManager();
        await mgr.addPool({ name: 'p1', uri: 'mongodb://localhost:27017' });
        const health = mgr.getHealthStatus();
        assert.ok('p1' in health);
        assert.equal(health.p1.status, 'up');
    });

    it('close() closes all pools and sets _closed', async () => {
        const mgr = buildManager();
        await mgr.addPool({ name: 'p1', uri: 'mongodb://localhost:27017' });
        await mgr.close();
        assert.equal(mgr._closed, true);
    });

    it('startHealthCheck with disabled=true is skipped', async () => {
        const mgr = buildManager();
        await mgr.addPool({ name: 'p1', uri: 'mongodb://localhost:27017', healthCheck: { enabled: false } });
        mgr.startHealthCheck('p1');
        // no interval should be set for p1
        assert.equal(mgr.intervals?.has('p1') ?? false, false);
    });

    it('stopHealthCheck: no-op when no timer exists', async () => {
        const mgr = buildManager();
        await mgr.addPool({ name: 'p1', uri: 'mongodb://localhost:27017' });
        // p1 has no interval yet
        assert.doesNotThrow(() => mgr.stopHealthCheck('p1'));
    });

    it('stopHealthCheck with no name stops all', async () => {
        const mgr = buildManager();
        await mgr.addPool({ name: 'p1', uri: 'mongodb://localhost:27017' });
        mgr.startHealthCheck();
        mgr.stopHealthCheck();
    });

    it('_handleAllPoolsDown: fallbackStrategy=readonly + write → empty', async () => {
        const mgr = buildManager({ fallback: { enabled: true, fallbackStrategy: 'readonly' } });
        const result = mgr._handleAllPoolsDown('write');
        assert.deepEqual(result, []);
    });

    it('_handleAllPoolsDown: fallbackStrategy=readonly + read → secondaries', async () => {
        const mgr = buildManager({ fallback: { enabled: true, fallbackStrategy: 'readonly' } });
        // Manually register a secondary in _configs
        mgr._configs.set('sec', { name: 'sec', role: 'secondary', uri: 'mongodb://localhost' });
        const result = mgr._handleAllPoolsDown('read');
        assert.ok(result.some((r: any) => r.name === 'sec'));
    });

    it('_handleAllPoolsDown: fallbackStrategy=secondary → returns secondary pools', async () => {
        const mgr = buildManager({ fallback: { enabled: true, fallbackStrategy: 'secondary' } });
        mgr._configs.set('sec', { name: 'sec', role: 'secondary', uri: 'mongodb://localhost' });
        const result = mgr._handleAllPoolsDown('read');
        assert.ok(result.some((r: any) => r.name === 'sec'));
    });

    it('_handleAllPoolsDown: fallbackStrategy=error → returns empty', async () => {
        const mgr = buildManager({ fallback: { enabled: true, fallbackStrategy: 'error' } });
        const result = mgr._handleAllPoolsDown('read');
        assert.deepEqual(result, []);
    });

    it('_getPoolsByRole returns matching pools', async () => {
        const mgr = buildManager();
        await mgr.addPool({ name: 'p1', uri: 'mongodb://localhost:27017', role: 'primary' });
        await mgr.addPool({ name: 'p2', uri: 'mongodb://localhost:27017', role: 'secondary' });
        const primaries = mgr._getPoolsByRole('primary');
        assert.ok(primaries.some((p: any) => p.name === 'p1'));
        assert.equal(primaries.length, 1);
    });

    it('getPoolHealth returns Map of health statuses', async () => {
        const mgr = buildManager();
        await mgr.addPool({ name: 'p1', uri: 'mongodb://localhost:27017' });
        const health = mgr.getPoolHealth();
        assert.ok(health instanceof Map);
        assert.ok(health.has('p1'));
    });

    it('fallback true → object shape with defaults', async () => {
        const mgr = new ConnectionPoolManager({
            clientFactory: async () => makeMockClient(),
            healthCheckFn: async () => true,
            fallback: true,
        });
        assert.equal(mgr._fallback.enabled, true);
        assert.equal(mgr._fallback.fallbackStrategy, 'error');
    });
});

describe('HealthChecker — branch coverage', () => {
    it('register with string: initial status is up', () => {
        const hc = new HealthChecker();
        hc.register('pool1', {});
        const status = hc.getStatus('pool1');
        assert.equal(status.status, 'up');
    });

    it('register with object config: initial status is unknown', () => {
        const hc = new HealthChecker();
        hc.register({ name: 'pool2', healthCheck: { enabled: true } });
        const status = hc.getStatus('pool2');
        assert.equal(status.status, 'unknown');
    });

    it('unregister removes pool from health status', () => {
        const hc = new HealthChecker();
        hc.register('pool1', {});
        hc.unregister('pool1');
        assert.equal(hc.getStatus('pool1'), null);
    });

    it('start() sets _started and starts checks', () => {
        const hc = new HealthChecker();
        hc.register('pool1', { enabled: false });
        hc.start();
        assert.equal(hc._started, true);
        hc.stop();
    });

    it('start() is idempotent', () => {
        const hc = new HealthChecker();
        hc.start();
        hc.start(); // should not throw
        assert.equal(hc._started, true);
        hc.stop();
    });

    it('stop() when not started is no-op', () => {
        const hc = new HealthChecker();
        assert.doesNotThrow(() => hc.stop());
    });

    it('_startCheckForPool skips pool with enabled=false', () => {
        const hc = new HealthChecker();
        hc.register('pool1', { enabled: false });
        hc.start();
        // Interval should NOT be set since enabled=false
        assert.equal(hc._intervals.has('pool1'), false);
        hc.stop();
    });

    it('checkPool runs a health check cycle', async () => {
        const mockPm = {
            _getPool: (_name: string) => ({
                db: (_n: string) => ({ command: async () => ({ ok: 1 }) }),
            }),
        };
        const hc = new HealthChecker({ poolManager: mockPm });
        hc.register('pool1', {});
        await assert.doesNotReject(() => hc.checkPool('pool1'));
    });
});
