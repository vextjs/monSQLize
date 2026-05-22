/**
 * 错误码系统测试
 * 测试统一错误码定义和错误创建函数
 */

const assert = require('assert');
const {
    ErrorCodes,
    createError,
    createValidationError,
    createCursorError,
    createConnectionError,
    createQueryTimeoutError
} = require('../../../lib/errors');

console.log('\n📦 错误码系统测试套件\n');

// 测试套件 1: ErrorCodes 常量定义
console.log('📦 1. ErrorCodes 常量定义');

function testErrorCodesExist() {
    console.log('  ✓ 验证所有错误码常量存在');

    const requiredCodes = [
        'VALIDATION_ERROR',
        'INVALID_COLLECTION_NAME',
        'INVALID_DATABASE_NAME',
        'INVALID_CURSOR',
        'CURSOR_SORT_MISMATCH',
        'JUMP_TOO_FAR',
        'STREAM_NO_JUMP',
        'STREAM_NO_TOTALS',
        'CONNECTION_TIMEOUT',
        'CONNECTION_FAILED',
        'CONNECTION_CLOSED',
        'DATABASE_ERROR',
        'QUERY_TIMEOUT',
        'CACHE_ERROR',
        'CACHE_TIMEOUT',
        'INVALID_CONFIG',
        'UNSUPPORTED_DATABASE',
    ];

    requiredCodes.forEach(code => {
        assert.strictEqual(typeof ErrorCodes[code], 'string', `ErrorCodes.${code} 应该是字符串`);
        assert.strictEqual(ErrorCodes[code], code, `ErrorCodes.${code} 值应该等于 '${code}'`);
    });

    console.log(`    已验证 ${requiredCodes.length} 个错误码`);
}

testErrorCodesExist();

// 测试套件 2: createError 基础功能
console.log('\n📦 2. createError 基础功能');

function testCreateError() {
    console.log('  ✓ 创建基础错误对象');

    const error = createError('TEST_ERROR', '测试错误消息');

    assert.ok(error instanceof Error, '应该是 Error 实例');
    assert.strictEqual(error.code, 'TEST_ERROR', 'code 应该正确设置');
    assert.strictEqual(error.message, '测试错误消息', 'message 应该正确设置');
    assert.strictEqual(error.details, undefined, 'details 默认应该为 undefined');
    assert.strictEqual(error.cause, undefined, 'cause 默认应该为 undefined');
}

function testCreateErrorWithDetails() {
    console.log('  ✓ 创建带 details 的错误');

    const details = [{ path: ['field'], type: 'invalid', message: '字段无效' }];
    const error = createError('TEST_ERROR', '测试错误', details);

    assert.deepStrictEqual(error.details, details, 'details 应该正确设置');
}

function testCreateErrorWithCause() {
    console.log('  ✓ 创建带 cause 的错误');

    const cause = new Error('原始错误');
    const error = createError('TEST_ERROR', '包装错误', null, cause);

    assert.strictEqual(error.cause, cause, 'cause 应该正确设置');
}

testCreateError();
testCreateErrorWithDetails();
testCreateErrorWithCause();

// 测试套件 3: 专用错误创建函数
console.log('\n📦 3. 专用错误创建函数');

function testCreateValidationError() {
    console.log('  ✓ createValidationError');

    const details = [{ path: ['limit'], type: 'number.range', message: '1..500' }];
    const error = createValidationError(details);

    assert.strictEqual(error.code, ErrorCodes.VALIDATION_ERROR);
    assert.strictEqual(error.message, 'Validation failed');
    assert.deepStrictEqual(error.details, details);
}

function testCreateCursorError() {
    console.log('  ✓ createCursorError');

    const error = createCursorError('Cursor expired');

    assert.strictEqual(error.code, ErrorCodes.INVALID_CURSOR);
    assert.strictEqual(error.message, 'Cursor expired');
}

function testCreateCursorErrorDefault() {
    console.log('  ✓ createCursorError default message');

    const error = createCursorError();

    assert.strictEqual(error.code, ErrorCodes.INVALID_CURSOR);
    assert.strictEqual(error.message, 'Invalid cursor');
}

function testCreateConnectionError() {
    console.log('  ✓ createConnectionError');

    const cause = new Error('网络超时');
    const error = createConnectionError('无法连接到数据库', cause);

    assert.strictEqual(error.code, ErrorCodes.CONNECTION_FAILED);
    assert.strictEqual(error.message, '无法连接到数据库');
    assert.strictEqual(error.cause, cause);
}

function testCreateQueryTimeoutError() {
    console.log('  ✓ createQueryTimeoutError');

    const error = createQueryTimeoutError(3000);

    assert.strictEqual(error.code, ErrorCodes.QUERY_TIMEOUT);
    assert.ok(error.message.includes('3000'), '消息应包含超时时间');
}

testCreateValidationError();
testCreateCursorError();
testCreateCursorErrorDefault();
testCreateConnectionError();
testCreateQueryTimeoutError();

// 测试套件 4: 错误对象属性
console.log('\n📦 4. 错误对象属性完整性');

function testErrorStack() {
    console.log('  ✓ 错误堆栈信息');

    const error = createError('TEST_ERROR', '测试错误');

    assert.ok(error.stack, '应该有堆栈信息');
    assert.ok(error.stack.includes('测试错误'), '堆栈应包含错误消息');
}

function testErrorChain() {
    console.log('  ✓ 错误链追踪');

    const originalError = new Error('原始错误');
    const wrappedError = createError('WRAPPED_ERROR', '包装错误', null, originalError);

    assert.strictEqual(wrappedError.cause, originalError);

    // 可以追踪到原始错误
    let current = wrappedError;
    let depth = 0;
    while (current.cause && depth < 10) {
        current = current.cause;
        depth++;
    }
    assert.strictEqual(current, originalError, '应该能追踪到原始错误');
}

testErrorStack();
testErrorChain();

// 测试套件 5: 错误码唯一性
console.log('\n📦 5. 错误码唯一性验证');

function testErrorCodesUnique() {
    console.log('  ✓ 验证错误码无重复');

    const codes = Object.values(ErrorCodes);
    const uniqueCodes = new Set(codes);

    assert.strictEqual(codes.length, uniqueCodes.size, '所有错误码应该是唯一的');
}

testErrorCodesUnique();

console.log('\n✅ 错误码系统测试全部通过\n');

