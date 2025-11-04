/**
 * 日志系统增强测试
 * 测试 traceId 和结构化日志功能
 */

const assert = require('assert');
const Logger = require('../../../lib/logger');

console.log('\n📦 日志系统增强测试套件\n');

// 测试套件 1: 基础日志功能（向后兼容）
console.log('📦 1. 基础日志功能（向后兼容）');

function testBasicLogger() {
    console.log('  ✓ 创建基础日志记录器');

    const logger = Logger.create();

    assert.ok(typeof logger.debug === 'function', '应该有 debug 方法');
    assert.ok(typeof logger.info === 'function', '应该有 info 方法');
    assert.ok(typeof logger.warn === 'function', '应该有 warn 方法');
    assert.ok(typeof logger.error === 'function', '应该有 error 方法');
}

function testSilentLogger() {
    console.log('  ✓ 创建静默日志记录器');

    const logger = Logger.createSilent();

    // 应该不会抛出错误
    logger.debug('test');
    logger.info('test');
    logger.warn('test');
    logger.error('test');
}

testBasicLogger();
testSilentLogger();

// 测试套件 2: TraceId 功能
console.log('\n📦 2. TraceId 功能');

function testTraceIdGeneration() {
    console.log('  ✓ TraceId 生成');

    const traceId1 = Logger.generateTraceId();
    const traceId2 = Logger.generateTraceId();

    assert.ok(typeof traceId1 === 'string', 'TraceId 应该是字符串');
    assert.strictEqual(traceId1.length, 16, 'TraceId 长度应该是 16');
    assert.notStrictEqual(traceId1, traceId2, '每次生成的 TraceId 应该不同');
}

function testTraceIdLogger() {
    console.log('  ✓ 启用 TraceId 的日志记录器');

    const logger = Logger.create(null, { enableTraceId: true });

    if (logger.withTraceId) {
        assert.ok(typeof logger.withTraceId === 'function', '应该有 withTraceId 方法');
        assert.ok(typeof logger.getTraceId === 'function', '应该有 getTraceId 方法');
    } else {
        console.log('    ⚠️  当前 Node.js 版本不支持 AsyncLocalStorage，跳过 traceId 测试');
    }
}

function testTraceIdContext() {
    console.log('  ✓ TraceId 上下文传递');

    const logger = Logger.create(null, { enableTraceId: true });

    if (logger.withTraceId) {
        const customTraceId = 'custom-trace-123';

        Logger.withTraceId(() => {
            const currentTraceId = Logger.getTraceId();
            // 在上下文中应该能获取到 traceId
            assert.ok(currentTraceId !== null, '上下文中应该有 traceId');
        }, customTraceId);

        // 上下文外应该获取不到
        const outsideTraceId = Logger.getTraceId();
        assert.strictEqual(outsideTraceId, null, '上下文外不应该有 traceId');
    }
}

testTraceIdGeneration();
testTraceIdLogger();
testTraceIdContext();

// 测试套件 3: 结构化日志
console.log('\n📦 3. 结构化日志');

function testStructuredLogger() {
    console.log('  ✓ 创建结构化日志记录器');

    const messages = [];
    const customLogger = {
        debug: (msg) => messages.push({ level: 'debug', msg }),
        info: (msg) => messages.push({ level: 'info', msg }),
        warn: (msg) => messages.push({ level: 'warn', msg }),
        error: (msg) => messages.push({ level: 'error', msg }),
    };

    const logger = Logger.create(customLogger, { structured: true });

    logger.info('测试消息', { db: 'test', collection: 'users' });

    // 应该输出 JSON 格式
    const lastMessage = messages[messages.length - 1];
    assert.ok(lastMessage.msg.includes('{'), '应该是 JSON 格式');

    const parsed = JSON.parse(lastMessage.msg);
    assert.strictEqual(parsed.message, '测试消息', '消息应该正确');
    assert.strictEqual(parsed.level, 'INFO', 'level 应该大写');
    assert.ok(parsed.timestamp, '应该有时间戳');
}

function testStructuredLoggerWithContext() {
    console.log('  ✓ 结构化日志包含上下文');

    const messages = [];
    const customLogger = {
        debug: (msg) => messages.push(msg),
        info: (msg) => messages.push(msg),
        warn: (msg) => messages.push(msg),
        error: (msg) => messages.push(msg),
    };

    const logger = Logger.create(customLogger, { structured: true });

    const context = { db: 'test', collection: 'users', query: { name: 'Alice' } };
    logger.warn('慢查询', context);

    const lastMessage = messages[messages.length - 1];
    const parsed = JSON.parse(lastMessage);

    assert.deepStrictEqual(parsed.context, context, '上下文应该完整保留');
}

testStructuredLogger();
testStructuredLoggerWithContext();

// 测试套件 4: 自定义 Logger 包装
console.log('\n📦 4. 自定义 Logger 包装');

function testCustomLoggerValidation() {
    console.log('  ✓ 自定义 Logger 验证');

    const validLogger = {
        debug: () => {},
        info: () => {},
        warn: () => {},
        error: () => {},
    };

    assert.ok(Logger.isValidLogger(validLogger), '完整的 logger 应该通过验证');

    const invalidLogger = {
        info: () => {},
        warn: () => {},
    };

    assert.strictEqual(Logger.isValidLogger(invalidLogger), false, '不完整的 logger 不应该通过验证');
}

function testCustomLoggerWrapping() {
    console.log('  ✓ 自定义 Logger 包装');

    let called = false;
    const customLogger = {
        debug: () => {},
        info: () => { called = true; },
        warn: () => {},
        error: () => {},
    };

    const logger = Logger.create(customLogger);
    logger.info('测试');

    assert.ok(called, '应该调用自定义 logger 的方法');
}

testCustomLoggerValidation();
testCustomLoggerWrapping();

// 测试套件 5: 综合场景
console.log('\n📦 5. 综合场景测试');

function testCombinedFeatures() {
    console.log('  ✓ TraceId + 结构化日志');

    const messages = [];
    const customLogger = {
        debug: () => {},
        info: (msg) => messages.push(msg),
        warn: () => {},
        error: () => {},
    };

    const logger = Logger.create(customLogger, {
        structured: true,
        enableTraceId: true
    });

    if (logger.withTraceId) {
        Logger.withTraceId(() => {
            logger.info('操作开始', { operation: 'findOne' });

            const lastMessage = messages[messages.length - 1];
            const parsed = JSON.parse(lastMessage);

            assert.ok(parsed.traceId, '应该有 traceId');
            assert.strictEqual(parsed.message, '操作开始');
            assert.deepStrictEqual(parsed.context, { operation: 'findOne' });
        });
    } else {
        console.log('    ⚠️  跳过（不支持 AsyncLocalStorage）');
    }
}

testCombinedFeatures();

console.log('\n✅ 日志系统增强测试全部通过\n');

