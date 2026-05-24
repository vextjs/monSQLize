import test from 'node:test';
import assert from 'node:assert/strict';

const MonSQLize = require('../../dist/cjs/index.cjs');

test('CJS root entry returns default class and static exports', () => {
    assert.equal(typeof MonSQLize, 'function');
    assert.equal(typeof MonSQLize.expr, 'function');
    assert.equal(typeof MonSQLize.createExpression, 'function');
    assert.equal(typeof MonSQLize.withCache, 'function');
    assert.equal(typeof MonSQLize.FunctionCache, 'function');
    assert.equal(typeof MonSQLize.ConnectionPoolManager, 'function');
    assert.equal(typeof MonSQLize.Model, 'function');
});

test('CJS root entry creates a minimal instance and keeps connect / health contracts', async () => {
    const msq = new MonSQLize({
        type: 'mongodb',
        databaseName: 'p1_smoke',
    });

    assert.equal(typeof msq.connect, 'function');
    assert.equal(typeof msq.health, 'function');
    assert.equal((await msq.health()).connected, false);
    await assert.rejects(
        Promise.resolve().then(() => msq.collection('users')),
        (error: unknown) => Boolean(error && typeof error === 'object' && 'code' in error && error.code === 'NOT_CONNECTED'),
    );
});