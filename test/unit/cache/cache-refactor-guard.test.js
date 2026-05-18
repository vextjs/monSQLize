'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');

const ROOT = path.resolve(__dirname, '../../..');
const LIB = path.join(ROOT, 'lib/index.js');
const CACHE_SRC = path.join(ROOT, 'src/capabilities/cache');

// A. 公开 API 导出检查
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

// B. 源码边界检查 — 各模块不应相互引用
function readSrc(f) { return fs.readFileSync(path.join(CACHE_SRC, f), 'utf8'); }
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
    // 允许 type-only import RedisLike；只阻断 value/require 级别引用
    const valueImport = src.match(/^(?!.*import\s+type\s).*redis-cache-adapter/m);
    assert.ok(!valueImport, 'must not value-import redis-cache-adapter (type import is OK)');
});
test('cache refactor-guard: index.ts barrel re-exports all three modules', () => {
    const src = readSrc('index.ts');
    assert.ok(src.includes('./memory-cache'));
    assert.ok(src.includes('./redis-cache-adapter'));
    assert.ok(src.includes('./distributed-cache-invalidator'));
});

// C. Duck-type 合约检查
test('cache refactor-guard: MemoryCache satisfies CacheLike contract', () => {
    const { MemoryCache } = require(LIB);
    const inst = new MemoryCache({ ttl: 60000 });
    for (const m of ['get', 'set', 'delete', 'clear', 'getStats']) {
        assert.strictEqual(typeof inst[m], 'function', 'missing: ' + m);
    }
});

// D & E. 构造函数与工厂函数存在性检查
test('cache refactor-guard: DistributedCacheInvalidator is a constructor', () => {
    const { DistributedCacheInvalidator } = require(LIB);
    assert.strictEqual(typeof DistributedCacheInvalidator, 'function');
    assert.ok(DistributedCacheInvalidator.prototype);
});
test('cache refactor-guard: createRedisCacheAdapter is a function', () => {
    const { createRedisCacheAdapter } = require(LIB);
    assert.strictEqual(typeof createRedisCacheAdapter, 'function');
});