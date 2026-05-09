const test = require('node:test');
const assert = require('node:assert/strict');

const MonSQLize = require('../../lib/index.js');

test('CJS 根入口返回默认类并附带静态导出', () => {
    assert.equal(typeof MonSQLize, 'function');
    assert.equal(typeof MonSQLize.expr, 'function');
    assert.equal(typeof MonSQLize.createExpression, 'function');
    assert.equal(typeof MonSQLize.withCache, 'function');
    assert.equal(typeof MonSQLize.FunctionCache, 'function');
    assert.equal(typeof MonSQLize.ConnectionPoolManager, 'function');
    assert.equal(typeof MonSQLize.Model, 'function');
});

test('CJS 根入口可创建最小实例并保留 connect / health 契约', async () => {
    const msq = new MonSQLize({
        type: 'mongodb',
        databaseName: 'p1_smoke',
    });

    assert.equal(typeof msq.connect, 'function');
    assert.equal(typeof msq.health, 'function');
    assert.equal((await msq.health()).connected, false);
    await assert.rejects(
        Promise.resolve().then(() => msq.collection('users')),
        (error) => error && error.code === 'NOT_CONNECTED',
    );
});

