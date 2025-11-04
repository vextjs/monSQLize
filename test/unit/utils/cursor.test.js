/**
 * 游标编解码工具测试
 * 测试 lib/common/cursor.js
 */

const assert = require('assert');
const { encodeCursor, decodeCursor } = require('../../../lib/common/cursor');

describe('Cursor Utils', function() {
    describe('encodeCursor', function() {
        it('should encode cursor data to base64 string', function() {
            const anchor = { _id: '507f1f77bcf86cd799439011', name: 'test' };
            const sort = { _id: 1 };
            const cursor = encodeCursor({ v: 1, s: sort, a: anchor });

            assert.strictEqual(typeof cursor, 'string');
            assert.ok(cursor.length > 0);
            assert.ok(!cursor.includes('{'), 'cursor should not contain JSON');
        });

        it('should encode different data to different cursors', function() {
            const data1 = { _id: '507f1f77bcf86cd799439011' };
            const data2 = { _id: '507f1f77bcf86cd799439012' };
            const sort = { _id: 1 };

            const cursor1 = encodeCursor({ v: 1, s: sort, a: data1 });
            const cursor2 = encodeCursor({ v: 1, s: sort, a: data2 });

            assert.notStrictEqual(cursor1, cursor2);
        });

        it('should include sort information in cursor', function() {
            const data = { _id: '507f1f77bcf86cd799439011' };
            const sort1 = { _id: 1 };
            const sort2 = { _id: -1 };

            const cursor1 = encodeCursor({ v: 1, s: sort1, a: data });
            const cursor2 = encodeCursor({ v: 1, s: sort2, a: data });

            assert.notStrictEqual(cursor1, cursor2);
        });

        it('should handle complex sort with multiple fields', function() {
            const data = { _id: '507f1f77bcf86cd799439011', createdAt: new Date(), score: 100 };
            const sort = { score: -1, createdAt: -1, _id: 1 };

            const cursor = encodeCursor({ v: 1, s: sort, a: data });
            assert.strictEqual(typeof cursor, 'string');
            assert.ok(cursor.length > 0);
        });

        it('should throw error for missing anchor', function() {
            const sort = { _id: 1 };

            assert.throws(() => {
                encodeCursor({ v: 1, s: sort });
            }, /requires sort .* and anchor/);
        });

        it('should throw error for missing sort', function() {
            const anchor = { _id: '507f1f77bcf86cd799439011' };

            assert.throws(() => {
                encodeCursor({ v: 1, a: anchor });
            }, /requires sort .* and anchor/);
        });
    });

    describe('decodeCursor', function() {
        it('should decode cursor back to original data', function() {
            const originalData = { _id: '507f1f77bcf86cd799439011', name: 'test', score: 100 };
            const sort = { score: -1, _id: 1 };

            const cursor = encodeCursor({ v: 1, s: sort, a: originalData });
            const decoded = decodeCursor(cursor);

            assert.ok(decoded);
            assert.strictEqual(decoded.a._id, originalData._id);
            assert.strictEqual(decoded.a.score, originalData.score);
            assert.deepStrictEqual(decoded.s, sort);
        });

        it('should throw for invalid cursor', function() {
            assert.throws(() => {
                decodeCursor('invalid-cursor-string');
            }, /游标无效/);
        });

        it('should throw for empty cursor', function() {
            assert.throws(() => {
                decodeCursor('');
            }, /游标无效/);
        });

        it('should throw for non-base64 cursor', function() {
            assert.throws(() => {
                decodeCursor('not!valid@base64#string');
            }, /游标无效/);
        });

        it('should handle cursor with Date objects', function() {
            const originalData = {
                _id: '507f1f77bcf86cd799439011',
                createdAt: new Date('2025-01-01T00:00:00Z'),
            };
            const sort = { createdAt: -1, _id: 1 };

            const cursor = encodeCursor({ v: 1, s: sort, a: originalData });
            const decoded = decodeCursor(cursor);

            assert.ok(decoded);
            // 注意：Date 在 JSON 序列化后变成字符串
            assert.ok(decoded.a.createdAt);
        });

        it('should preserve sort order information', function() {
            const data = { _id: '507f1f77bcf86cd799439011', score: 100 };
            const sort = { score: -1, name: 1, _id: 1 };

            const cursor = encodeCursor({ v: 1, s: sort, a: data });
            const decoded = decodeCursor(cursor);

            assert.ok(decoded);
            assert.deepStrictEqual(decoded.s, sort);
        });
    });

    describe('Round-trip encoding/decoding', function() {
        it('should survive round-trip for simple data', function() {
            const data = { _id: '507f1f77bcf86cd799439011' };
            const sort = { _id: 1 };

            const cursor = encodeCursor({ v: 1, s: sort, a: data });
            const decoded = decodeCursor(cursor);

            assert.deepStrictEqual(decoded.a, data);
            assert.deepStrictEqual(decoded.s, sort);
        });

        it('should survive round-trip for complex data', function() {
            const data = {
                _id: '507f1f77bcf86cd799439011',
                name: 'Alice',
                score: 95.5,
                tags: ['javascript', 'node'],
            };
            const sort = { score: -1, _id: 1 };

            const cursor = encodeCursor({ v: 1, s: sort, a: data });
            const decoded = decodeCursor(cursor);

            assert.ok(decoded);
            assert.strictEqual(decoded.a._id, data._id);
            assert.strictEqual(decoded.a.name, data.name);
            assert.strictEqual(decoded.a.score, data.score);
            assert.deepStrictEqual(decoded.a.tags, data.tags);
            assert.deepStrictEqual(decoded.s, sort);
        });

        it('should handle multiple round-trips', function() {
            let data = { _id: '507f1f77bcf86cd799439011', value: 42 };
            const sort = { value: -1, _id: 1 };

            // 第一次编码/解码
            let cursor = encodeCursor({ v: 1, s: sort, a: data });
            let decoded = decodeCursor(cursor);
            assert.deepStrictEqual(decoded.a, data);

            // 第二次编码/解码
            cursor = encodeCursor({ v: 1, s: sort, a: decoded.a });
            decoded = decodeCursor(cursor);
            assert.deepStrictEqual(decoded.a, data);

            // 第三次编码/解码
            cursor = encodeCursor({ v: 1, s: sort, a: decoded.a });
            decoded = decodeCursor(cursor);
            assert.deepStrictEqual(decoded.a, data);
        });
    });

    describe('Edge cases', function() {
        it('should handle null values in anchor', function() {
            const data = { _id: '507f1f77bcf86cd799439011', nullable: null };
            const sort = { _id: 1 };

            const cursor = encodeCursor({ v: 1, s: sort, a: data });
            const decoded = decodeCursor(cursor);

            assert.ok(decoded);
            assert.strictEqual(decoded.a.nullable, null);
        });

        it('should handle special characters in values', function() {
            const data = {
                _id: '507f1f77bcf86cd799439011',
                text: 'Special: \n\t\r"\'\\/',
            };
            const sort = { _id: 1 };

            const cursor = encodeCursor({ v: 1, s: sort, a: data });
            const decoded = decodeCursor(cursor);

            assert.ok(decoded);
            assert.strictEqual(decoded.a.text, data.text);
        });

        it('should handle very long cursor strings', function() {
            const data = {
                _id: '507f1f77bcf86cd799439011',
                longText: 'x'.repeat(1000),
                array: new Array(100).fill({ key: 'value' }),
            };
            const sort = { _id: 1 };

            const cursor = encodeCursor({ v: 1, s: sort, a: data });
            const decoded = decodeCursor(cursor);

            assert.ok(decoded);
            assert.strictEqual(decoded.a.longText, data.longText);
            assert.strictEqual(decoded.a.array.length, data.array.length);
        });
    });
});

