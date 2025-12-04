/**
 * shape-builders 测试套件
 * 测试通用慢日志形状构造器的去敏功能
 */

const assert = require('assert');
const { buildCommonLogExtra } = require('../../../lib/common/shape-builders');

describe('shape-builders 测试套件', function () {
    this.timeout(5000);

    describe('buildCommonLogExtra - 基本功能', () => {
        it('应该提取安全的元信息字段', () => {
            const options = {
                limit: 10,
                skip: 5,
                maxTimeMS: 2000,
                cache: 5000,
                query: { name: 'Alice' }, // 敏感信息，不应提取
                password: '123456' // 敏感信息，不应提取
            };

            const result = buildCommonLogExtra(options);

            // 应该包含安全字段
            assert.strictEqual(result.limit, 10);
            assert.strictEqual(result.skip, 5);
            assert.strictEqual(result.maxTimeMS, 2000);
            assert.strictEqual(result.cache, 5000);

            // 不应该包含敏感字段
            assert.strictEqual(result.query, undefined);
            assert.strictEqual(result.password, undefined);
        });

        it('应该处理空 options', () => {
            const result = buildCommonLogExtra(null);

            assert.ok(result);
            assert.strictEqual(typeof result, 'object');
            assert.strictEqual(Object.keys(result).length, 0, '空 options 应该返回空对象');
        });

        it('应该处理 undefined options', () => {
            const result = buildCommonLogExtra(undefined);

            assert.ok(result);
            assert.strictEqual(typeof result, 'object');
        });

        it('应该处理部分字段缺失', () => {
            const options = {
                limit: 20
                // skip, maxTimeMS, cache 都缺失
            };

            const result = buildCommonLogExtra(options);

            assert.strictEqual(result.limit, 20);
            assert.strictEqual(result.skip, undefined);
            assert.strictEqual(result.maxTimeMS, undefined);
            assert.strictEqual(result.cache, undefined);
        });

        it('应该忽略不在白名单中的字段', () => {
            const options = {
                limit: 10,
                customField: 'custom-value',
                anotherField: 123
            };

            const result = buildCommonLogExtra(options);

            assert.strictEqual(result.limit, 10);
            assert.strictEqual(result.customField, undefined, 'customField 不应该提取');
            assert.strictEqual(result.anotherField, undefined, 'anotherField 不应该提取');
        });
    });

    describe('buildCommonLogExtra - pipeline 处理', () => {
        it('应该提取 pipeline 阶段名', () => {
            const options = {
                pipeline: [
                    { $match: { status: 'active' } },
                    { $group: { _id: '$userId', count: { $sum: 1 } } },
                    { $sort: { count: -1 } }
                ]
            };

            const result = buildCommonLogExtra(options);

            assert.ok(result.pipelineStages);
            assert.strictEqual(result.pipelineStages.length, 3);
            assert.deepStrictEqual(result.pipelineStages, ['$match', '$group', '$sort']);
        });

        it('应该仅提取阶段名，不包含参数（去敏）', () => {
            const options = {
                pipeline: [
                    { $match: { password: 'secret123' } },
                    { $project: { sensitiveField: 1 } }
                ]
            };

            const result = buildCommonLogExtra(options);

            assert.ok(result.pipelineStages);
            assert.deepStrictEqual(result.pipelineStages, ['$match', '$project']);

            // 验证不包含敏感参数
            const resultStr = JSON.stringify(result);
            assert.ok(!resultStr.includes('secret123'), '不应该包含密码');
            assert.ok(!resultStr.includes('sensitiveField'), '不应该包含敏感字段名');
        });

        it('应该处理空 pipeline', () => {
            const options = {
                pipeline: []
            };

            const result = buildCommonLogExtra(options);

            assert.ok(result.pipelineStages);
            assert.strictEqual(result.pipelineStages.length, 0);
        });

        it('应该处理非数组 pipeline（容错）', () => {
            const options = {
                pipeline: 'invalid'
            };

            const result = buildCommonLogExtra(options);

            // 应该不报错，且不包含 pipelineStages
            assert.strictEqual(result.pipelineStages, undefined);
        });

        it('应该限制 pipeline 阶段数量（最多30个）', () => {
            // 创建 50 个阶段
            const pipeline = Array(50).fill(null).map((_, i) => ({ [`$stage${i}`]: {} }));

            const options = { pipeline };

            const result = buildCommonLogExtra(options);

            assert.ok(result.pipelineStages);
            assert.strictEqual(result.pipelineStages.length, 30, '应该限制为 30 个阶段');
        });

        it('应该处理 pipeline 中的无效阶段（容错）', () => {
            const options = {
                pipeline: [
                    { $match: { status: 'active' } },
                    null, // 无效阶段
                    { $group: { _id: '$userId' } }
                ]
            };

            // 应该不报错
            const result = buildCommonLogExtra(options);

            // 可能包含部分阶段或跳过无效阶段
            assert.ok(result.pipelineStages || result.pipelineStages === undefined);
        });
    });

    describe('buildCommonLogExtra - 游标处理', () => {
        it('应该标记 after 游标', () => {
            const options = {
                after: 'cursor-token-123',
                limit: 10
            };

            const result = buildCommonLogExtra(options);

            assert.strictEqual(result.hasCursor, true);
            assert.strictEqual(result.cursorDirection, 'after');

            // 不应该包含游标值本身（去敏）
            assert.strictEqual(result.after, undefined, '不应该包含游标值');
        });

        it('应该标记 before 游标', () => {
            const options = {
                before: 'cursor-token-456',
                limit: 10
            };

            const result = buildCommonLogExtra(options);

            assert.strictEqual(result.hasCursor, true);
            assert.strictEqual(result.cursorDirection, 'before');

            // 不应该包含游标值本身（去敏）
            assert.strictEqual(result.before, undefined, '不应该包含游标值');
        });

        it('应该优先标记 after（如果同时存在）', () => {
            const options = {
                after: 'cursor-after',
                before: 'cursor-before',
                limit: 10
            };

            const result = buildCommonLogExtra(options);

            assert.strictEqual(result.hasCursor, true);
            assert.strictEqual(result.cursorDirection, 'after', 'after 应该优先');
        });

        it('没有游标时不应该有游标标记', () => {
            const options = {
                limit: 10,
                skip: 5
            };

            const result = buildCommonLogExtra(options);

            assert.strictEqual(result.hasCursor, undefined);
            assert.strictEqual(result.cursorDirection, undefined);
        });
    });

    describe('buildCommonLogExtra - 综合场景', () => {
        it('应该正确处理复杂查询选项', () => {
            const options = {
                limit: 20,
                skip: 10,
                maxTimeMS: 3000,
                cache: 10000,
                after: 'cursor-123',
                pipeline: [
                    { $match: { status: 'active' } },
                    { $sort: { createdAt: -1 } }
                ],
                // 以下字段不应该提取
                query: { name: 'Alice', password: '123' },
                projection: { sensitiveField: 0 },
                customOption: 'custom'
            };

            const result = buildCommonLogExtra(options);

            // 验证安全字段
            assert.strictEqual(result.limit, 20);
            assert.strictEqual(result.skip, 10);
            assert.strictEqual(result.maxTimeMS, 3000);
            assert.strictEqual(result.cache, 10000);

            // 验证游标标记
            assert.strictEqual(result.hasCursor, true);
            assert.strictEqual(result.cursorDirection, 'after');

            // 验证 pipeline 阶段
            assert.deepStrictEqual(result.pipelineStages, ['$match', '$sort']);

            // 验证敏感信息不存在
            assert.strictEqual(result.query, undefined);
            assert.strictEqual(result.projection, undefined);
            assert.strictEqual(result.customOption, undefined);
            assert.strictEqual(result.after, undefined);

            const resultStr = JSON.stringify(result);
            assert.ok(!resultStr.includes('Alice'), '不应该包含查询值');
            assert.ok(!resultStr.includes('password'), '不应该包含密码字段');
            assert.ok(!resultStr.includes('sensitiveField'), '不应该包含敏感字段');
        });

        it('应该返回可序列化的对象', () => {
            const options = {
                limit: 10,
                pipeline: [
                    { $match: { status: 'active' } }
                ],
                after: 'cursor'
            };

            const result = buildCommonLogExtra(options);

            // 应该可以序列化为 JSON
            let serialized;
            assert.doesNotThrow(() => {
                serialized = JSON.stringify(result);
            }, 'JSON.stringify 不应该抛出错误');

            // 应该可以反序列化
            let deserialized;
            assert.doesNotThrow(() => {
                deserialized = JSON.parse(serialized);
            }, 'JSON.parse 不应该抛出错误');

            // 反序列化后应该保持结构
            assert.deepStrictEqual(deserialized, result);
        });

        it('应该处理所有字段都是 0/false 的情况', () => {
            const options = {
                limit: 0,
                skip: 0,
                maxTimeMS: 0,
                cache: 0
            };

            const result = buildCommonLogExtra(options);

            // 0 值应该被保留
            assert.strictEqual(result.limit, 0);
            assert.strictEqual(result.skip, 0);
            assert.strictEqual(result.maxTimeMS, 0);
            assert.strictEqual(result.cache, 0);
        });

        it('应该处理包含循环引用的 pipeline（容错）', () => {
            const circular = {};
            circular.self = circular;

            const options = {
                pipeline: [
                    { $match: { status: 'active' } },
                    circular // 循环引用
                ]
            };

            // 应该不报错（内部有 try-catch）
            const result = buildCommonLogExtra(options);

            // 可能部分提取或完全忽略 pipeline
            assert.ok(result);
        });
    });
});

