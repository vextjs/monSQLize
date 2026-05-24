import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

const MonSQLize = require('../../../dist/cjs/index.cjs');

describe('P2-B expression helpers', () => {
    it('expr() / createExpression() creates standard expression objects', () => {
        assert.deepEqual(MonSQLize.expr('SUM(amount)'), {
            __expr__: 'SUM(amount)',
            __compiled__: false,
        });

        assert.deepEqual(MonSQLize.createExpression("CONCAT(firstName, ' ', lastName)"), {
            __expr__: "CONCAT(firstName, ' ', lastName)",
            __compiled__: false,
        });
    });

    it('empty expression returns INVALID_EXPRESSION', () => {
        assert.throws(
            () => MonSQLize.expr('   '),
            (error: unknown) => Boolean(error && typeof error === 'object' && 'code' in error && error.code === 'INVALID_EXPRESSION'),
        );
    });
});