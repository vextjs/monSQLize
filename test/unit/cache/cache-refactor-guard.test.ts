import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs';

const ROOT = process.cwd();
const LIB = path.join(ROOT, 'dist/cjs/index.cjs');
const CACHE_SRC = path.join(ROOT, 'src/capabilities/cache');

function readProjectSrc(relativePath: string): string {
    return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

function readSrc(fileName: string): string {
    return fs.readFileSync(path.join(CACHE_SRC, fileName), 'utf8');
}

test('cache refactor-guard: MemoryCache exported from public bundle', () => {
    const mod = require(LIB);
    assert.strictEqual(typeof mod.MemoryCache, 'function');
});

test('cache refactor-guard: createRedisCacheAdapter exported from public bundle', () => {
    const mod = require(LIB);
    assert.strictEqual(typeof mod.createRedisCacheAdapter, 'function');
});

test('cache refactor-guard: DistributedCacheInvalidator exported from public bundle', () => {
    const mod = require(LIB);
    assert.strictEqual(typeof mod.DistributedCacheInvalidator, 'function');
});

test('cache refactor-guard: memory-cache.ts does not import sibling cache modules', () => {
    const src = readSrc('memory-cache.ts');
    assert.ok(!src.includes('redis-cache-adapter'));
    assert.ok(!src.includes('distributed-cache-invalidator'));
});

test('cache refactor-guard: redis-cache-adapter.ts does not import sibling cache modules', () => {
    const src = readSrc('redis-cache-adapter.ts');
    assert.ok(!src.includes('memory-cache'));
    assert.ok(!src.includes('distributed-cache-invalidator'));
});

test('cache refactor-guard: distributed-cache-invalidator.ts does not value-import sibling cache modules', () => {
    const src = readSrc('distributed-cache-invalidator.ts');
    assert.ok(!src.includes('memory-cache'), 'must not import memory-cache');
    const valueImport = src.match(/^(?!.*import\s+type\s).*redis-cache-adapter/m);
    assert.ok(!valueImport, 'must not value-import redis-cache-adapter (type import is OK)');
});

test('cache refactor-guard: index.ts barrel re-exports all three modules', () => {
    const src = readSrc('index.ts');
    assert.ok(src.includes('./memory-cache'));
    assert.ok(src.includes('./redis-cache-adapter'));
    assert.ok(src.includes('./distributed-cache-invalidator'));
});

test('cache refactor-guard: MemoryCache satisfies CacheLike contract', () => {
    const { MemoryCache } = require(LIB);
    const inst = new MemoryCache({ defaultTtl: 60000 });
    for (const methodName of ['get', 'set', 'del', 'has', 'clear', 'getStats']) {
        assert.strictEqual(typeof inst[methodName], 'function', `missing: ${methodName}`);
    }
});

test('cache refactor-guard: function-cache uses cache-hub as backing (no standalone in-flight impl)', () => {
    const src = readProjectSrc('src/capabilities/function-cache/index.ts');
    assert.ok(src.includes("from 'cache-hub/function-cache'"), 'must import from cache-hub/function-cache');
    assert.ok(!src.includes('const inflightFunctions = new Map'), 'must not define standalone inflight map');
    const lib = require(LIB);
    const wrapped = lib.withCache((value: unknown) => Promise.resolve(value), { ttl: 1000 });
    assert.strictEqual(typeof wrapped.stats, 'function', 'stats() must exist');
    assert.strictEqual(typeof wrapped.getCacheStats, 'function', 'getCacheStats() v1 compat shim must exist');
});

test('cache refactor-guard: find-page async totals cache uses MemoryCache', () => {
    const src = readProjectSrc('src/adapters/mongodb/queries/find-page.ts');
    assert.ok(src.includes('const _asyncTotalsCache = new MemoryCache('));
    assert.ok(!src.includes('const _asyncTotalsCache = new Map'));
});

test('cache refactor-guard: runtime internal caches use MemoryCache', () => {
    const runtimeCore = readProjectSrc('src/entry/runtime-core.ts');
    const compat = readProjectSrc('src/entry/runtime-compat-accessors.ts');
    const dbFacade = readProjectSrc('src/entry/runtime-db-facade.ts');

    assert.ok(runtimeCore.includes('private _iidCache: MemoryCache | null = null;'));
    assert.ok(runtimeCore.includes('private readonly _modelInstances = new MemoryCache('));
    assert.ok(compat.includes('_modelInstances?: MemoryCache | null;'));
    assert.ok(compat.includes('record._modelInstances = new MemoryCache('));
    assert.ok(dbFacade.includes('config.setIidCache(new MemoryCache('));
});

test('cache refactor-guard: DistributedCacheInvalidator is a constructor', () => {
    const { DistributedCacheInvalidator } = require(LIB);
    assert.strictEqual(typeof DistributedCacheInvalidator, 'function');
    assert.ok(DistributedCacheInvalidator.prototype);
});

test('cache refactor-guard: createRedisCacheAdapter is a function', () => {
    const { createRedisCacheAdapter } = require(LIB);
    assert.strictEqual(typeof createRedisCacheAdapter, 'function');
});