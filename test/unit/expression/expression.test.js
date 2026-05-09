const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const MonSQLize = require('../../../lib/index.js');

describe('P2-B expression helpers', () => {
    it('expr() / createExpression() 应创建标准表达式对象', () => {
        assert.deepEqual(MonSQLize.expr('SUM(amount)'), {
            __expr__: 'SUM(amount)',
            __compiled__: false,
        });

        assert.deepEqual(MonSQLize.createExpression("CONCAT(firstName, ' ', lastName)"), {
            __expr__: "CONCAT(firstName, ' ', lastName)",
            __compiled__: false,
        });
    });

    it('空表达式应返回 INVALID_EXPRESSION', () => {
        assert.throws(
            () => MonSQLize.expr('   '),
            (error) => error && error.code === 'INVALID_EXPRESSION',
        );
    });
});

