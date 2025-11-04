/**
 * 参数标准化工具测试
 * 测试 lib/common/normalize.js
 */

const assert = require('assert');
const { normalizeProjection, normalizeSort } = require('../../../lib/common/normalize');

describe('Normalize Utils', function() {
    describe('normalizeProjection', function() {
        it('should normalize array to object with value 1', function() {
            const input = ['name', 'email', 'age'];
            const expected = { name: 1, email: 1, age: 1 };

            const result = normalizeProjection(input);
            assert.deepStrictEqual(result, expected);
        });

        it('should keep object projection as-is', function() {
            const input = { name: 1, email: 1, password: 0 };
            const result = normalizeProjection(input);
            assert.deepStrictEqual(result, input);
        });

        it('should return undefined for empty array', function() {
            const result = normalizeProjection([]);
            assert.strictEqual(result, undefined);
        });

        it('should return undefined for null', function() {
            const result = normalizeProjection(null);
            assert.strictEqual(result, undefined);
        });

        it('should return undefined for undefined', function() {
            const result = normalizeProjection(undefined);
            assert.strictEqual(result, undefined);
        });

        it('should handle nested field names in array', function() {
            const input = ['user.name', 'user.email', 'profile.avatar'];
            const expected = { 'user.name': 1, 'user.email': 1, 'profile.avatar': 1 };

            const result = normalizeProjection(input);
            assert.deepStrictEqual(result, expected);
        });

        it('should deduplicate fields in array', function() {
            const input = ['name', 'email', 'name', 'age', 'email'];
            const result = normalizeProjection(input);

            assert.strictEqual(Object.keys(result).length, 3);
            assert.strictEqual(result.name, 1);
            assert.strictEqual(result.email, 1);
            assert.strictEqual(result.age, 1);
        });

        it('should handle mixed inclusion and exclusion in object', function() {
            const input = { name: 1, email: 1, password: 0, secret: 0 };
            const result = normalizeProjection(input);
            assert.deepStrictEqual(result, input);
        });

        it('should handle projection with expression objects', function() {
            const input = {
                name: 1,
                fullName: { $concat: ['$firstName', ' ', '$lastName'] },
            };
            const result = normalizeProjection(input);
            assert.deepStrictEqual(result, input);
        });

        it('should return undefined for string input', function() {
            const result = normalizeProjection('name');
            assert.strictEqual(result, undefined);
        });
    });

    describe('normalizeSort', function() {
        it('should keep object sort as-is', function() {
            const input = { name: 1, createdAt: -1, score: -1 };
            const result = normalizeSort(input);
            assert.deepStrictEqual(result, input);
        });

        it('should return array as-is because arrays are objects', function() {
            // JavaScript 中 typeof [] === 'object'，所以 normalizeSort 会返回数组
            const input = ['name', 'createdAt', 'score'];
            const result = normalizeSort(input);
            assert.deepStrictEqual(result, input);
        });

        it('should return undefined for null', function() {
            const result = normalizeSort(null);
            assert.strictEqual(result, undefined);
        });

        it('should return undefined for undefined', function() {
            const result = normalizeSort(undefined);
            assert.strictEqual(result, undefined);
        });

        it('should handle nested field names', function() {
            const input = { 'user.name': 1, 'profile.createdAt': -1 };
            const result = normalizeSort(input);
            assert.deepStrictEqual(result, input);
        });

        it('should preserve sort order in object', function() {
            const input = { score: -1, name: 1, createdAt: -1, _id: 1 };
            const result = normalizeSort(input);

            const keys = Object.keys(result);
            assert.deepStrictEqual(keys, ['score', 'name', 'createdAt', '_id']);
        });

        it('should handle $meta sort (text search)', function() {
            const input = { score: { $meta: 'textScore' }, name: 1 };
            const result = normalizeSort(input);
            assert.deepStrictEqual(result, input);
        });

        it('should return undefined for string input', function() {
            const result = normalizeSort('name');
            assert.strictEqual(result, undefined);
        });
    });

    describe('Edge cases', function() {
        it('should handle very long field names', function() {
            const longField = 'a'.repeat(1000);
            const input = [longField];

            const projection = normalizeProjection(input);
            assert.strictEqual(projection[longField], 1);
        });

        it('should handle special characters in field names', function() {
            const input = ['field.with.dots', 'field-with-dashes', 'field_with_underscores'];

            const projection = normalizeProjection(input);
            assert.strictEqual(Object.keys(projection).length, 3);
        });

        it('should return undefined for number input', function() {
            const projection = normalizeProjection(123);
            assert.strictEqual(projection, undefined);

            const sort = normalizeSort(123);
            assert.strictEqual(sort, undefined);
        });
    });
});

