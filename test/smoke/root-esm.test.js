const test = require('node:test');
const assert = require('node:assert/strict');
const { pathToFileURL } = require('node:url');
const path = require('node:path');

test('ESM 根入口返回默认导出与命名导出矩阵', async () => {
    const entryUrl = pathToFileURL(path.resolve(__dirname, '../../index.mjs')).href;
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

