const test = require('node:test');
const assert = require('node:assert/strict');
const { pathToFileURL } = require('node:url');
const path = require('node:path');

const packageJson = require('../../package.json');
const matrix = require('./matrix.json');

test('compatibility(matrix): package 声明与 manifest 一致', () => {
    assert.equal(packageJson.engines.node, matrix.support.node.declared);
    assert.equal(packageJson.dependencies.mongodb, matrix.support.mongodbDriver.declaredDependency);
    assert.ok(Array.isArray(matrix.support.moduleSystems));
    assert.deepEqual(matrix.support.moduleSystems, ['commonjs', 'esm']);
});

test('compatibility(matrix): CJS 高级能力静态导出矩阵完整', () => {
    const MonSQLize = require('../../lib/index.js');

    for (const name of matrix.entryContracts.cjsStatics) {
        assert.ok(name in MonSQLize, `缺少 CJS 静态导出: ${name}`);
    }
});

test('compatibility(matrix): ESM 高级能力命名导出矩阵完整', async () => {
    const entryUrl = pathToFileURL(path.resolve(__dirname, '../../index.mjs')).href;
    const mod = await import(entryUrl);

    assert.equal(typeof mod.default, 'function');
    assert.equal(mod.default, mod[matrix.entryContracts.esmDefault]);

    for (const name of matrix.entryContracts.esmNamed) {
        assert.ok(name in mod, `缺少 ESM 命名导出: ${name}`);
    }
});

