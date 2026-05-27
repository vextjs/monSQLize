import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

const { PoolSelector } = require('../../../dist/cjs/index.cjs');

type Pool = { name: string; role?: string; weight?: number; tags?: string[] };

describe('PoolSelector — branch coverage', () => {
    it('throws when no pools provided', () => {
        const sel = new PoolSelector();
        assert.throws(() => sel.select([], {}), /No available pools/);
    });

    it('throws when pools is null/undefined', () => {
        const sel = new PoolSelector();
        assert.throws(() => sel.select(null as unknown as Pool[], {}), /No available pools/);
    });

    it('strategy auto: read → prefers secondary pool', () => {
        const sel = new PoolSelector({ strategy: 'auto' });
        const pools: Pool[] = [
            { name: 'primary', role: 'primary' },
            { name: 'secondary', role: 'secondary' },
        ];
        const result = sel.select(pools, { operation: 'read' });
        assert.equal(result, 'secondary');
    });

    it('strategy auto: write → prefers primary pool', () => {
        const sel = new PoolSelector({ strategy: 'auto' });
        const pools: Pool[] = [
            { name: 'primary', role: 'primary' },
            { name: 'secondary', role: 'secondary' },
        ];
        const result = sel.select(pools, { operation: 'write' });
        assert.equal(result, 'primary');
    });

    it('strategy auto: read but no secondaries → all pools used', () => {
        const sel = new PoolSelector({ strategy: 'auto' });
        const pools: Pool[] = [{ name: 'p1', role: 'primary' }, { name: 'p2', role: 'primary' }];
        const result = sel.select(pools, { operation: 'read' });
        assert.ok(pools.some((p) => p.name === result));
    });

    it('strategy auto: poolPreference.role filters candidates', () => {
        const sel = new PoolSelector({ strategy: 'auto' });
        const pools: Pool[] = [{ name: 'p1', role: 'primary' }, { name: 'p2', role: 'analytics' }];
        const result = sel.select(pools, { poolPreference: { role: 'analytics' } });
        assert.equal(result, 'p2');
    });

    it('strategy auto: poolPreference.role not matching → uses all', () => {
        const sel = new PoolSelector({ strategy: 'auto' });
        const pools: Pool[] = [{ name: 'p1', role: 'primary' }];
        const result = sel.select(pools, { poolPreference: { role: 'nonexistent' } });
        assert.equal(result, 'p1');
    });

    it('strategy auto: single tag filter (some match)', () => {
        const sel = new PoolSelector({ strategy: 'auto' });
        const pools: Pool[] = [
            { name: 'p1', tags: ['eu'] },
            { name: 'p2', tags: ['us'] },
        ];
        const result = sel.select(pools, { poolPreference: { tags: ['eu'] } });
        assert.equal(result, 'p1');
    });

    it('strategy auto: multiple tag filter (every must match)', () => {
        const sel = new PoolSelector({ strategy: 'auto' });
        const pools: Pool[] = [
            { name: 'p1', tags: ['eu', 'cache'] },
            { name: 'p2', tags: ['eu'] },
        ];
        const result = sel.select(pools, { poolPreference: { tags: ['eu', 'cache'] } });
        assert.equal(result, 'p1');
    });

    it('strategy auto: pool with no tags is excluded from tag filter', () => {
        const sel = new PoolSelector({ strategy: 'auto' });
        const pools: Pool[] = [{ name: 'p1' }, { name: 'p2', tags: ['eu'] }];
        const result = sel.select(pools, { poolPreference: { tags: ['eu'] } });
        assert.equal(result, 'p2');
    });

    it('strategy auto: single candidate skips weighted selection', () => {
        const sel = new PoolSelector({ strategy: 'auto' });
        const pools: Pool[] = [{ name: 'only' }];
        const result = sel.select(pools, {});
        assert.equal(result, 'only');
    });

    it('strategy roundRobin: cycles through pools', () => {
        const sel = new PoolSelector({ strategy: 'roundRobin' });
        const pools: Pool[] = [{ name: 'p1' }, { name: 'p2' }];
        const first = sel.select(pools, {});
        const second = sel.select(pools, {});
        assert.notEqual(first, second);
    });

    it('strategy roundRobin: read prefers secondary/analytics', () => {
        const sel = new PoolSelector({ strategy: 'roundRobin' });
        const pools: Pool[] = [
            { name: 'primary', role: 'primary' },
            { name: 'secondary', role: 'secondary' },
            { name: 'analytics', role: 'analytics' },
        ];
        const result = sel.select(pools, { operation: 'read' });
        assert.ok(['secondary', 'analytics'].includes(result));
    });

    it('strategy roundRobin: write prefers primary', () => {
        const sel = new PoolSelector({ strategy: 'roundRobin' });
        const pools: Pool[] = [
            { name: 'primary', role: 'primary' },
            { name: 'secondary', role: 'secondary' },
        ];
        const result = sel.select(pools, { operation: 'write' });
        assert.equal(result, 'primary');
    });

    it('strategy leastConnections: without stats falls back to round-robin', () => {
        const sel = new PoolSelector({ strategy: 'leastConnections' });
        const pools: Pool[] = [{ name: 'p1' }, { name: 'p2' }];
        const result = sel.select(pools, {});
        assert.ok(['p1', 'p2'].includes(result));
    });

    it('strategy leastConnections: with stats picks least connections', () => {
        const sel = new PoolSelector({ strategy: 'leastConnections' });
        const pools: Pool[] = [{ name: 'p1' }, { name: 'p2' }];
        const stats = { p1: { connections: 10 }, p2: { connections: 2 } };
        const result = sel.select(pools, { stats });
        assert.equal(result, 'p2');
    });

    it('strategy leastConnections: pool missing from stats is skipped', () => {
        const sel = new PoolSelector({ strategy: 'leastConnections' });
        const pools: Pool[] = [{ name: 'p1' }, { name: 'p2' }];
        const stats = { p2: { connections: 5 } };
        const result = sel.select(pools, { stats });
        assert.equal(result, 'p2');
    });

    it('strategy weighted: returns one of the pools', () => {
        const sel = new PoolSelector({ strategy: 'weighted' });
        const pools: Pool[] = [{ name: 'p1', weight: 1 }, { name: 'p2', weight: 3 }];
        const result = sel.select(pools, {});
        assert.ok(['p1', 'p2'].includes(result));
    });

    it('strategy manual: always returns first pool', () => {
        const sel = new PoolSelector({ strategy: 'manual' });
        const pools: Pool[] = [{ name: 'first' }, { name: 'second' }];
        assert.equal(sel.select(pools, {}), 'first');
        assert.equal(sel.select(pools, {}), 'first');
    });

    it('unknown strategy falls back to auto', () => {
        const warnings: unknown[] = [];
        const logger = { warn: (...args: unknown[]) => warnings.push(args), info: () => {} };
        const sel = new PoolSelector({ strategy: 'unknown-strategy', logger });
        const pools: Pool[] = [{ name: 'p1' }];
        const result = sel.select(pools, {});
        assert.equal(result, 'p1');
        assert.ok(warnings.length > 0);
    });

    it('setStrategy() changes strategy and logs', () => {
        const logged: unknown[] = [];
        const logger = { warn: () => {}, info: (...args: unknown[]) => logged.push(args) };
        const sel = new PoolSelector({ strategy: 'auto', logger });
        sel.setStrategy('manual');
        assert.equal(sel.getStrategy(), 'manual');
        assert.ok(logged.length > 0);
    });

    it('selectByLeastConnections: connections field missing uses 0', () => {
        const sel = new PoolSelector({ strategy: 'leastConnections' });
        const pools: Pool[] = [{ name: 'p1' }, { name: 'p2' }];
        const stats = { p1: {}, p2: {} };
        const result = sel.select(pools, { stats });
        assert.ok(['p1', 'p2'].includes(result));
    });
});
