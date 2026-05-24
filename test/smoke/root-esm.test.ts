import test from 'node:test';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

test('ESM root entry returns default export and named export matrix', async () => {
    const entryUrl = pathToFileURL(path.resolve(__dirname, '../../dist/esm/index.mjs')).href;
    const mod = await import(entryUrl);

    assert.equal(typeof mod.default, 'function');
    assert.equal(mod.default, mod.MonSQLize);
    assert.equal(typeof mod.Logger, 'function');
    assert.equal(typeof mod.MemoryCache, 'function');
    assert.equal(typeof mod.createRedisCacheAdapter, 'function');
    assert.equal(typeof mod.TransactionManager, 'function');
    assert.equal(typeof mod.CacheLockManager, 'function');
    assert.equal(typeof mod.DistributedCacheInvalidator, 'function');
    assert.equal(typeof mod.ConnectionPoolManager, 'function');
    assert.equal(typeof mod.Model, 'function');
    assert.equal(typeof mod.expr, 'function');
    assert.equal(typeof mod.createExpression, 'function');
    assert.equal(typeof mod.withCache, 'function');
    assert.equal(typeof mod.FunctionCache, 'function');
});