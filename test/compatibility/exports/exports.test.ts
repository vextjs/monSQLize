import test from 'node:test';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const EXPECTED_ESM_EXPORTS = [
    'MonSQLize',
    'Logger',
    'MemoryCache',
    'createRedisCacheAdapter',
    'TransactionManager',
    'CacheLockManager',
    'DistributedCacheInvalidator',
    'expr',
    'createExpression',
    'withCache',
    'FunctionCache',
    'SlowQueryLogMemoryStorage',
    'MongoDBSlowQueryLogStorage',
];

const EXPECTED_CJS_STATICS = [
    'Model',
    'ConnectionPoolManager',
    'PoolSelector',
    'createRedisCacheAdapter',
    'expr',
    'createExpression',
    'withCache',
    'FunctionCache',
    'SlowQueryLogMemoryStorage',
    'MongoDBSlowQueryLogStorage',
];

test('compatibility(exports): ESM export matrix is complete', async () => {
    const entryUrl = pathToFileURL(path.resolve(__dirname, '../../../dist/esm/index.mjs')).href;
    const mod = await import(entryUrl);

    for (const name of EXPECTED_ESM_EXPORTS) {
        assert.ok(name in mod, `Missing ESM export: ${name}`);
    }
});

test('compatibility(exports): CJS static export matrix is complete', () => {
    const MonSQLize = require('../../../dist/cjs/index.cjs');

    for (const name of EXPECTED_CJS_STATICS) {
        assert.ok(name in MonSQLize, `Missing CJS static export: ${name}`);
    }
});

test('compatibility(exports): package metadata subpath remains published', () => {
    const packageJson = require('../../../../../package.json');
    assert.equal(packageJson.exports['./package.json'], './package.json');
});