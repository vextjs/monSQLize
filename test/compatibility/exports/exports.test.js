const test = require('node:test');
const assert = require('node:assert/strict');
const { pathToFileURL } = require('node:url');
const path = require('node:path');

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
];

const EXPECTED_CJS_STATICS = [
    'Model',
    'ConnectionPoolManager',
    'createRedisCacheAdapter',
    'expr',
    'createExpression',
    'withCache',
    'FunctionCache',
];

test('compatibility(exports): ESM 导出矩阵完整', async () => {
    const entryUrl = pathToFileURL(path.resolve(__dirname, '../../../index.mjs')).href;
    const mod = await import(entryUrl);

    for (const name of EXPECTED_ESM_EXPORTS) {
        assert.ok(name in mod, `缺少 ESM 导出: ${name}`);
    }
});

test('compatibility(exports): CJS 静态导出矩阵完整', () => {
    const MonSQLize = require('../../../lib/index.js');

    for (const name of EXPECTED_CJS_STATICS) {
        assert.ok(name in MonSQLize, `缺少 CJS 静态导出: ${name}`);
    }
});

