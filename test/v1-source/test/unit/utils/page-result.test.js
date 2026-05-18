/**
 * 分页结果构建工具测试
 * 测试 lib/common/page-result.js
 */

const assert = require('assert');
const { makePageResult } = require('../../../lib/common/page-result');

describe('Page Result Builder', function() {
    // 模拟 pickAnchor 函数
    const pickAnchor = (doc, sort) => {
        const anchor = {};
        for (const field of Object.keys(sort)) {
            anchor[field] = doc[field];
        }
        return anchor;
    };

    describe('makePageResult - forward pagination', function() {
        it('should return items with hasNext=false when rows <= limit', function() {
            const rows = [
                { _id: '1', name: 'Alice' },
                { _id: '2', name: 'Bob' },
            ];
            const options = {
                limit: 5,
                stableSort: { _id: 1 },
                direction: 'after',
                hasCursor: false,
                pickAnchor,
            };

            const result = makePageResult(rows, options);

            assert.strictEqual(result.items.length, 2);
            assert.strictEqual(result.pageInfo.hasNext, false);
            assert.strictEqual(result.pageInfo.startCursor !== null, true);
            assert.strictEqual(result.pageInfo.endCursor !== null, true);
        });

        it('should trim last row and set hasNext=true when rows > limit', function() {
            const rows = [
                { _id: '1', name: 'Alice' },
                { _id: '2', name: 'Bob' },
                { _id: '3', name: 'Charlie' },
            ];
            const options = {
                limit: 2,
                stableSort: { _id: 1 },
                direction: 'after',
                hasCursor: false,
                pickAnchor,
            };

            const result = makePageResult(rows, options);

            assert.strictEqual(result.items.length, 2);
            assert.strictEqual(result.items[0]._id, '1');
            assert.strictEqual(result.items[1]._id, '2');
            assert.strictEqual(result.pageInfo.hasNext, true);
        });

        it('should generate cursors from first and last items', function() {
            const rows = [
                { _id: '1', name: 'Alice' },
                { _id: '2', name: 'Bob' },
                { _id: '3', name: 'Charlie' },
            ];
            const options = {
                limit: 2,
                stableSort: { _id: 1 },
                direction: 'after',
                hasCursor: false,
                pickAnchor,
            };

            const result = makePageResult(rows, options);

            assert.ok(result.pageInfo.startCursor);
            assert.ok(result.pageInfo.endCursor);
            assert.strictEqual(typeof result.pageInfo.startCursor, 'string');
            assert.strictEqual(typeof result.pageInfo.endCursor, 'string');
            assert.ok(result.pageInfo.startCursor.length > 0);
            assert.ok(result.pageInfo.endCursor.length > 0);
        });
    });

    describe('makePageResult - backward pagination', function() {
        it('should keep items order (already reversed by adapter)', function() {
            const rows = [
                { _id: '1', name: 'Alice' },
                { _id: '2', name: 'Bob' },
                { _id: '3', name: 'Charlie' },
            ];
            const options = {
                limit: 3,
                stableSort: { _id: 1 },
                direction: 'before',
                hasCursor: true,
                pickAnchor,
            };

            const result = makePageResult(rows, options);

            assert.strictEqual(result.items.length, 3);
            // makePageResult 不反转数据，保持原样
            assert.strictEqual(result.items[0]._id, '1');
            assert.strictEqual(result.items[1]._id, '2');
            assert.strictEqual(result.items[2]._id, '3');
        });

        it('should set hasPrev correctly for before direction', function() {
            const rows = [
                { _id: '3', name: 'Charlie' },
                { _id: '2', name: 'Bob' },
                { _id: '1', name: 'Alice' },
            ];
            const options = {
                limit: 2,
                stableSort: { _id: 1 },
                direction: 'before',
                hasCursor: true,
                pickAnchor,
            };

            const result = makePageResult(rows, options);

            assert.strictEqual(result.items.length, 2);
            assert.strictEqual(result.pageInfo.hasPrev, true); // hasMore=true
            assert.strictEqual(result.pageInfo.hasNext, true); // hasCursor=true
        });
    });

    describe('makePageResult - complex sort', function() {
        it('should handle multi-field sort', function() {
            const rows = [
                { _id: '1', score: 100, createdAt: new Date('2025-01-01'), name: 'Alice' },
                { _id: '2', score: 90, createdAt: new Date('2025-01-02'), name: 'Bob' },
                { _id: '3', score: 90, createdAt: new Date('2025-01-03'), name: 'Charlie' },
            ];
            const options = {
                limit: 2,
                stableSort: { score: -1, createdAt: -1, _id: 1 },
                direction: 'after',
                hasCursor: false,
                pickAnchor,
            };

            const result = makePageResult(rows, options);

            assert.strictEqual(result.items.length, 2);
            assert.strictEqual(result.pageInfo.hasNext, true);
            assert.ok(result.pageInfo.startCursor);
            assert.ok(result.pageInfo.endCursor);
        });

        it('should preserve cursor with all sort fields', function() {
            const rows = [
                { _id: '1', score: 100, name: 'Alice' },
                { _id: '2', score: 90, name: 'Bob' },
            ];
            const options = {
                limit: 2,
                stableSort: { score: -1, name: 1, _id: 1 },
                direction: 'after',
                hasCursor: false,
                pickAnchor,
            };

            const result = makePageResult(rows, options);

            assert.ok(result.pageInfo.endCursor);
            // cursor 应该包含所有排序字段的信息（通过 pickAnchor 提取）
        });
    });

    describe('makePageResult - edge cases', function() {
        it('should handle empty rows', function() {
            const rows = [];
            const options = {
                limit: 10,
                stableSort: { _id: 1 },
                direction: 'after',
                hasCursor: false,
                pickAnchor,
            };

            const result = makePageResult(rows, options);

            assert.strictEqual(result.items.length, 0);
            assert.strictEqual(result.pageInfo.hasNext, false);
            assert.strictEqual(result.pageInfo.startCursor, null);
            assert.strictEqual(result.pageInfo.endCursor, null);
        });

        it('should handle single row', function() {
            const rows = [{ _id: '1', name: 'Alice' }];
            const options = {
                limit: 10,
                stableSort: { _id: 1 },
                direction: 'after',
                hasCursor: false,
                pickAnchor,
            };

            const result = makePageResult(rows, options);

            assert.strictEqual(result.items.length, 1);
            assert.strictEqual(result.pageInfo.hasNext, false);
        });

        it('should handle exactly limit+1 rows', function() {
            const rows = [
                { _id: '1', name: 'A' },
                { _id: '2', name: 'B' },
                { _id: '3', name: 'C' },
            ];
            const options = {
                limit: 2,
                stableSort: { _id: 1 },
                direction: 'after',
                hasCursor: false,
                pickAnchor,
            };

            const result = makePageResult(rows, options);

            assert.strictEqual(result.items.length, 2);
            assert.strictEqual(result.pageInfo.hasNext, true);
            assert.ok(result.pageInfo.endCursor);
        });

        it('should not modify original rows array', function() {
            const rows = [
                { _id: '1', name: 'Alice' },
                { _id: '2', name: 'Bob' },
                { _id: '3', name: 'Charlie' },
            ];
            const originalLength = rows.length;

            const options = {
                limit: 2,
                stableSort: { _id: 1 },
                direction: 'after',
                hasCursor: false,
                pickAnchor,
            };

            makePageResult(rows, options);

            assert.strictEqual(rows.length, originalLength, 'original array should not be modified');
        });
    });

    describe('makePageResult - cursor generation', function() {
        it('should generate different cursors for different documents', function() {
            const rows1 = [
                { _id: '1', name: 'Alice' },
                { _id: '2', name: 'Bob' },
            ];
            const rows2 = [
                { _id: '3', name: 'Charlie' },
                { _id: '4', name: 'David' },
            ];
            const options = {
                limit: 2,
                stableSort: { _id: 1 },
                direction: 'after',
                hasCursor: false,
                pickAnchor,
            };

            const result1 = makePageResult(rows1, options);
            const result2 = makePageResult(rows2, options);

            assert.notStrictEqual(result1.pageInfo.endCursor, result2.pageInfo.endCursor);
        });

        it('should generate same cursor for same document', function() {
            const rows = [
                { _id: '1', name: 'Alice' },
                { _id: '2', name: 'Bob' },
            ];
            const options = {
                limit: 2,
                stableSort: { _id: 1 },
                direction: 'after',
                hasCursor: false,
                pickAnchor,
            };

            const result1 = makePageResult(rows, options);
            const result2 = makePageResult(rows, options);

            assert.strictEqual(result1.pageInfo.endCursor, result2.pageInfo.endCursor);
        });
    });
});

