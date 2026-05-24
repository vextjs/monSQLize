import test from 'node:test';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const packageJson = require('../../package.json');
const matrix = require('./matrix.json');

test('compatibility(matrix): package declaration matches manifest', () => {
    assert.equal(packageJson.engines.node, matrix.support.node.declared);
    assert.equal(packageJson.dependencies.mongodb, matrix.support.mongodbDriver.declaredDependency);
    assert.ok(Array.isArray(matrix.support.moduleSystems));
    assert.deepEqual(matrix.support.moduleSystems, ['commonjs', 'esm']);
});

test('compatibility(matrix): CJS advanced static export matrix is complete', () => {
    const MonSQLize = require('../../dist/cjs/index.cjs');

    for (const name of matrix.entryContracts.cjsStatics) {
        assert.ok(name in MonSQLize, `Missing CJS static export: ${name}`);
    }
});

test('compatibility(matrix): ESM advanced named export matrix is complete', async () => {
    const entryUrl = pathToFileURL(path.resolve(__dirname, '../../dist/esm/index.mjs')).href;
    const mod = await import(entryUrl);

    assert.equal(typeof mod.default, 'function');
    assert.equal(mod.default, mod[matrix.entryContracts.esmDefault]);

    for (const name of matrix.entryContracts.esmNamed) {
        assert.ok(name in mod, `Missing ESM named export: ${name}`);
    }
});