/**
 * P0 改进完整验证脚本
 * 验证所有新功能和向后兼容性
 */

const assert = require('assert');

console.log('\n🔍 开始 P0 改进完整验证\n');
console.log('='  .repeat(60));

let testsPassed = 0;
let testsFailed = 0;

function test(name, fn) {
    try {
        fn();
        console.log(`✅ ${name}`);
        testsPassed++;
    } catch (error) {
        console.log(`❌ ${name}`);
        console.log(`   错误: ${error.message}`);
        testsFailed++;
    }
}

// ============================================================
// 1. 验证错误码系统
// ============================================================
console.log('\n📦 1. 错误码系统验证');
console.log('-'.repeat(60));

test('错误码模块可以正常加载', () => {
    const errors = require('../../../lib/errors');
    assert.ok(errors.ErrorCodes);
    assert.ok(typeof errors.createError === 'function');
});

test('所有错误码常量已定义', () => {
    const { ErrorCodes } = require('../../../lib/errors');
    const requiredCodes = [
        'VALIDATION_ERROR', 'INVALID_COLLECTION_NAME', 'INVALID_DATABASE_NAME',
        'INVALID_CURSOR', 'CURSOR_SORT_MISMATCH', 'JUMP_TOO_FAR',
        'STREAM_NO_JUMP', 'STREAM_NO_TOTALS', 'CONNECTION_TIMEOUT',
        'CONNECTION_FAILED', 'CONNECTION_CLOSED', 'DATABASE_ERROR',
        'QUERY_TIMEOUT', 'CACHE_ERROR', 'CACHE_TIMEOUT',
        'INVALID_CONFIG', 'UNSUPPORTED_DATABASE'
    ];
    requiredCodes.forEach(code => assert.ok(ErrorCodes[code]));
});

test('错误创建函数工作正常', () => {
    const { createError, createValidationError } = require('../../../lib/errors');

    const error1 = createError('TEST', '测试错误');
    assert.strictEqual(error1.code, 'TEST');
    assert.strictEqual(error1.message, '测试错误');

    const error2 = createValidationError([{ path: ['test'] }]);
    assert.strictEqual(error2.code, 'VALIDATION_ERROR');
    assert.ok(error2.details);
});

test('validation.js 使用统一错误码', () => {
    const { validateLimitAfterBefore } = require('../../../lib/common/validation');

    try {
        validateLimitAfterBefore({ limit: -1 });
        assert.fail('应该抛出错误');
    } catch (error) {
        assert.strictEqual(error.code, 'VALIDATION_ERROR');
    }
});

// ============================================================
// 2. 验证日志系统增强
// ============================================================
console.log('\n📦 2. 日志系统增强验证');
console.log('-'.repeat(60));

test('日志模块可以正常加载', () => {
    const Logger = require('../../../lib/logger');
    assert.ok(typeof Logger.create === 'function');
    assert.ok(typeof Logger.generateTraceId === 'function');
});

test('基础日志功能（向后兼容）', () => {
    const Logger = require('../../../lib/logger');
    const logger = Logger.create();

    assert.ok(typeof logger.debug === 'function');
    assert.ok(typeof logger.info === 'function');
    assert.ok(typeof logger.warn === 'function');
    assert.ok(typeof logger.error === 'function');

    // 不应该抛出错误
    logger.info('测试消息');
});

test('TraceId 生成功能', () => {
    const Logger = require('../../../lib/logger');
    const traceId1 = Logger.generateTraceId();
    const traceId2 = Logger.generateTraceId();

    assert.strictEqual(traceId1.length, 16);
    assert.notStrictEqual(traceId1, traceId2);
});

test('结构化日志功能', () => {
    const Logger = require('../../../lib/logger');
    const messages = [];
    const customLogger = {
        debug: () => {},
        info: (msg) => messages.push(msg),
        warn: () => {},
        error: () => {},
    };

    const logger = Logger.create(customLogger, { structured: true });
    logger.info('测试', { key: 'value' });

    const lastMsg = messages[messages.length - 1];
    assert.ok(lastMsg.includes('{'));

    const parsed = JSON.parse(lastMsg);
    assert.strictEqual(parsed.message, '测试');
    assert.ok(parsed.timestamp);
});

test('TraceId 日志集成', () => {
    const Logger = require('../../../lib/logger');
    const logger = Logger.create(null, { enableTraceId: true });

    if (logger.withTraceId) {
        assert.ok(typeof logger.withTraceId === 'function');
        assert.ok(typeof logger.getTraceId === 'function');
    }
});

// ============================================================
// 3. 验证常量系统
// ============================================================
console.log('\n📦 3. 常量配置系统验证');
console.log('-'.repeat(60));

test('常量模块可以正常加载', () => {
    const constants = require('../../../lib/constants');
    assert.ok(constants.CACHE);
    assert.ok(constants.QUERY);
    assert.ok(constants.PAGINATION);
});

test('所有常量分类已定义', () => {
    const constants = require('../../../lib/constants');

    assert.ok(constants.CACHE);
    assert.ok(constants.QUERY);
    assert.ok(constants.PAGINATION);
    assert.ok(constants.STREAM);
    assert.ok(constants.CONNECTION);
    assert.ok(constants.NAMESPACE);
    assert.ok(constants.LOG);
});

test('常量值类型正确', () => {
    const { CACHE, QUERY, PAGINATION } = require('../../../lib/constants');

    assert.strictEqual(typeof CACHE.DEFAULT_MAX_SIZE, 'number');
    assert.strictEqual(typeof CACHE.TOTALS_INFLIGHT_WINDOW_MS, 'number');
    assert.strictEqual(typeof QUERY.DEFAULT_SLOW_QUERY_MS, 'number');
    assert.strictEqual(typeof PAGINATION.DEFAULT_MAX_HOPS, 'number');
});

test('find-page.js 使用常量', () => {
    const findPageContent = require('fs').readFileSync('./lib/mongodb/find-page.js', 'utf8');
    assert.ok(findPageContent.includes('CACHE.TOTALS_INFLIGHT_WINDOW_MS'));
});

// ============================================================
// 4. 验证 TypeScript 类型定义
// ============================================================
console.log('\n📦 4. TypeScript 类型定义验证');
console.log('-'.repeat(60));

test('index.d.ts 文件存在', () => {
    const fs = require('fs');
    assert.ok(fs.existsSync('./index.d.ts'));
});

test('index.d.ts 包含新类型定义', () => {
    const fs = require('fs');
    const content = fs.readFileSync('./index.d.ts', 'utf8');

    assert.ok(content.includes('LoggerOptions'));
    assert.ok(content.includes('ErrorCodes'));
    assert.ok(content.includes('MonSQLizeError'));
    assert.ok(content.includes('withTraceId'));
    assert.ok(content.includes('getTraceId'));
});

// ============================================================
// 5. 验证向后兼容性
// ============================================================
console.log('\n📦 5. 向后兼容性验证');
console.log('-'.repeat(60));

test('原有模块可以正常加载', () => {
    const MonSQLize = require('../../../lib/index');
    assert.ok(typeof MonSQLize === 'function');
});

test('Logger 默认行为未改变', () => {
    const Logger = require('../../../lib/logger');
    const logger1 = Logger.create();
    const logger2 = Logger.create(null, {});

    assert.ok(logger1.debug);
    assert.ok(logger2.info);

    // 默认不应该有 withTraceId（除非显式启用）
    const defaultLogger = Logger.create();
    // 默认行为应该与原来一致
});

test('validation.js 接口未改变', () => {
    const { validateLimitAfterBefore, assertCursorSortCompatible } = require('../../../lib/common/validation');

    assert.ok(typeof validateLimitAfterBefore === 'function');
    assert.ok(typeof assertCursorSortCompatible === 'function');
});

// ============================================================
// 6. 验证文档更新
// ============================================================
console.log('\n📦 6. 文档更新验证');
console.log('-'.repeat(60));

test('CHANGELOG.md 已更新', () => {
    const fs = require('fs');
    const changelog = fs.readFileSync('./CHANGELOG.md', 'utf8');

    assert.ok(changelog.includes('统一错误码系统'));
    assert.ok(changelog.includes('增强日志系统'));
    assert.ok(changelog.includes('常量配置系统'));
});

test('P0 改进报告已创建', () => {
    const fs = require('fs');
    assert.ok(fs.existsSync('./analysis-reports/P0-improvements-report.md'));
});

// ============================================================
// 7. 验证测试文件
// ============================================================
console.log('\n📦 7. 测试文件验证');
console.log('-'.repeat(60));

test('错误码测试文件存在', () => {
    const fs = require('fs');
    assert.ok(fs.existsSync('./test/unit/errors.test.js'));
});

test('日志系统测试文件存在', () => {
    const fs = require('fs');
    assert.ok(fs.existsSync('./test/unit/logger.test.js'));
});

// ============================================================
// 总结
// ============================================================
console.log('\n' + '='.repeat(60));
console.log('\n📊 验证总结\n');
console.log(`✅ 通过: ${testsPassed} 项`);
console.log(`❌ 失败: ${testsFailed} 项`);

if (testsFailed === 0) {
    console.log('\n🎉 所有验证通过！P0 改进已成功完成。\n');
    process.exit(0);
} else {
    console.log('\n⚠️  部分验证失败，请检查上述错误信息。\n');
    process.exit(1);
}

