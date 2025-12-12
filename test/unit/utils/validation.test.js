/**
 * 参数验证工具测试
 * 测试 lib/common/validation.js 的所有验证函数
 */

const assert = require('assert');
const { validateRange, validatePositiveInteger } = require('../../../lib/common/validation');
const { ErrorCodes } = require('../../../lib/errors');

describe('Validation Utils', function() {

    describe('validateRange()', function() {

        it('should accept valid values within range', function() {
            assert.strictEqual(validateRange(100, 1, 200, 'test'), 100);
            assert.strictEqual(validateRange(1, 1, 200, 'test'), 1);
            assert.strictEqual(validateRange(200, 1, 200, 'test'), 200);
        });

        it('should reject values below minimum', function() {
            try {
                validateRange(0, 1, 200, 'test');
                assert.fail('Should throw error');
            } catch (error) {
                assert.strictEqual(error.code, ErrorCodes.INVALID_ARGUMENT);
                assert.ok(error.message.includes('必须在 1 到 200 之间'));
            }
        });

        it('should reject values above maximum', function() {
            try {
                validateRange(201, 1, 200, 'test');
                assert.fail('Should throw error');
            } catch (error) {
                assert.strictEqual(error.code, ErrorCodes.INVALID_ARGUMENT);
                assert.ok(error.message.includes('必须在 1 到 200 之间'));
            }
        });

        it('should reject non-numeric values', function() {
            try {
                validateRange('100', 1, 200, 'test');
                assert.fail('Should throw error');
            } catch (error) {
                assert.strictEqual(error.code, ErrorCodes.INVALID_ARGUMENT);
                assert.ok(error.message.includes('必须是一个有效的数字'));
            }
        });

        it('should reject NaN', function() {
            try {
                validateRange(NaN, 1, 200, 'test');
                assert.fail('Should throw error');
            } catch (error) {
                assert.strictEqual(error.code, ErrorCodes.INVALID_ARGUMENT);
                assert.ok(error.message.includes('必须是一个有效的数字'));
            }
        });

        it('should reject Infinity', function() {
            try {
                validateRange(Infinity, 1, 200, 'test');
                assert.fail('Should throw error');
            } catch (error) {
                assert.strictEqual(error.code, ErrorCodes.INVALID_ARGUMENT);
                assert.ok(error.message.includes('必须是有限数字'));
            }
        });

        it('should reject -Infinity', function() {
            try {
                validateRange(-Infinity, 1, 200, 'test');
                assert.fail('Should throw error');
            } catch (error) {
                assert.strictEqual(error.code, ErrorCodes.INVALID_ARGUMENT);
                assert.ok(error.message.includes('必须是有限数字'));
            }
        });
    });

    describe('validatePositiveInteger()', function() {

        it('should accept positive integers', function() {
            assert.strictEqual(validatePositiveInteger(1, 'test'), 1);
            assert.strictEqual(validatePositiveInteger(100, 'test'), 100);
            assert.strictEqual(validatePositiveInteger(999999, 'test'), 999999);
        });

        it('should reject zero', function() {
            try {
                validatePositiveInteger(0, 'test');
                assert.fail('Should throw error');
            } catch (error) {
                assert.strictEqual(error.code, ErrorCodes.INVALID_ARGUMENT);
                assert.ok(error.message.includes('必须是正整数'));
            }
        });

        it('should reject negative numbers', function() {
            try {
                validatePositiveInteger(-1, 'test');
                assert.fail('Should throw error');
            } catch (error) {
                assert.strictEqual(error.code, ErrorCodes.INVALID_ARGUMENT);
                assert.ok(error.message.includes('必须是正整数'));
            }
        });

        it('should reject decimal numbers', function() {
            try {
                validatePositiveInteger(1.5, 'test');
                assert.fail('Should throw error');
            } catch (error) {
                assert.strictEqual(error.code, ErrorCodes.INVALID_ARGUMENT);
                assert.ok(error.message.includes('必须是正整数'));
            }
        });
    });

    describe('Constructor parameter validation', function() {
        const MonSQLize = require('../../../lib/index');

        it('should accept valid maxTimeMS', function() {
            const db = new MonSQLize({
                type: 'mongodb',
                config: { url: 'mongodb://localhost:27017' },
                maxTimeMS: 5000
            });
            assert.strictEqual(db.defaults.maxTimeMS, 5000);
        });

        it('should reject maxTimeMS above limit', function() {
            try {
                new MonSQLize({
                    type: 'mongodb',
                    config: { url: 'mongodb://localhost:27017' },
                    maxTimeMS: 500000 // > 300000
                });
                assert.fail('Should throw error');
            } catch (error) {
                assert.strictEqual(error.code, ErrorCodes.INVALID_ARGUMENT);
                assert.ok(error.message.includes('maxTimeMS'));
            }
        });

        it('should accept valid findLimit', function() {
            const db = new MonSQLize({
                type: 'mongodb',
                config: { url: 'mongodb://localhost:27017' },
                findLimit: 100
            });
            assert.strictEqual(db.defaults.findLimit, 100);
        });

        it('should reject findLimit above limit', function() {
            try {
                new MonSQLize({
                    type: 'mongodb',
                    config: { url: 'mongodb://localhost:27017' },
                    findLimit: 20000 // > 10000
                });
                assert.fail('Should throw error');
            } catch (error) {
                assert.strictEqual(error.code, ErrorCodes.INVALID_ARGUMENT);
                assert.ok(error.message.includes('findLimit'));
            }
        });

        it('should reject maxTimeMS below minimum', function() {
            try {
                new MonSQLize({
                    type: 'mongodb',
                    config: { url: 'mongodb://localhost:27017' },
                    maxTimeMS: 0 // < 1
                });
                assert.fail('Should throw error');
            } catch (error) {
                assert.strictEqual(error.code, ErrorCodes.INVALID_ARGUMENT);
                assert.ok(error.message.includes('maxTimeMS'));
            }
        });
    });
});

