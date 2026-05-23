import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import MonSQLize from 'monsqlize';

describe('Stage B expression TS migration', () => {
    it('expr/createExpression 应生成标准表达式对象并保持别名一致', () => {
        const fromAlias = MonSQLize.expr('SUM(amount)');
        const fromFactory = MonSQLize.createExpression('  SUM(amount)  ');

        assert.deepEqual(fromAlias, {
            __expr__: 'SUM(amount)',
            __compiled__: false,
        });
        assert.deepEqual(fromFactory, fromAlias);
        assert.equal(MonSQLize.isExpressionObject(fromAlias), true);
    });

    it('hasExpressionInObject / hasExpressionInPipeline 应递归识别嵌套表达式', () => {
        const nestedObject = {
            project: {
                total: MonSQLize.expr('price + tax'),
            },
            meta: [{ active: true }],
        };
        const pipeline = [
            { $match: { status: 'active' } },
            { $project: { total: MonSQLize.expr('price + tax') } },
        ];

        assert.equal(MonSQLize.hasExpressionInObject(nestedObject), true);
        assert.equal(MonSQLize.hasExpressionInObject({ plain: { value: 1 } }), false);
        assert.equal(MonSQLize.hasExpressionInPipeline(pipeline), true);
        assert.equal(MonSQLize.hasExpressionInPipeline([{ $match: { status: 'active' } }]), false);
    });

    it('compilePipelineExpressions 应按 stage context 编译 expression', () => {
        const pipeline = MonSQLize.compilePipelineExpressions([
            {
                $project: {
                    fullName: MonSQLize.expr("CONCAT(firstName, ' ', lastName)"),
                },
            },
            {
                $match: {
                    age: MonSQLize.expr('age > 18'),
                },
            },
            {
                $group: {
                    _id: '$status',
                    totalAmount: MonSQLize.expr('SUM(amount)'),
                    count: MonSQLize.expr('COUNT()'),
                },
            },
        ]);
        const [projectStage, matchStage, groupStage] = pipeline as Array<Record<string, any>>;

        assert.deepEqual(projectStage.$project.fullName, {
            $concat: ['$firstName', ' ', '$lastName'],
        });
        assert.deepEqual(matchStage.$match.age, {
            $expr: { $gt: ['$age', 18] },
        });
        assert.deepEqual(groupStage.$group.totalAmount, {
            $sum: '$amount',
        });
        assert.deepEqual(groupStage.$group.count, {
            $sum: 1,
        });
    });

    it('非法输入应保持当前错误契约', () => {
        assert.throws(
            () => (MonSQLize.createExpression as unknown as (expression: unknown) => unknown)(42),
            TypeError,
        );
        assert.throws(
            () => MonSQLize.expr('   '),
            (error: unknown) => typeof error === 'object' && error !== null && 'code' in error && error.code === 'INVALID_EXPRESSION',
        );
    });
});