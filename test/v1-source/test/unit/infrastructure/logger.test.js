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

// 测试套件 6: withTraceId 嵌套与异步
console.log('\n📦 6. withTraceId 嵌套与异步测试');

function testNestedTraceId() {
    console.log('  ✓ TraceId 嵌套上下文');

    if (!Logger.withTraceId) {
        console.log('    ⚠️  跳过（不支持 AsyncLocalStorage）');
        return;
    }

    const outerTraceId = 'outer-123';
    const innerTraceId = 'inner-456';

    Logger.withTraceId(() => {
        const outer = Logger.getTraceId();
        assert.strictEqual(outer, outerTraceId, '外层应该是 outer traceId');

        // 嵌套调用
        Logger.withTraceId(() => {
            const inner = Logger.getTraceId();
            assert.strictEqual(inner, innerTraceId, '内层应该是 inner traceId');
        }, innerTraceId);

        // 退出嵌套后恢复
        const afterNested = Logger.getTraceId();
        assert.strictEqual(afterNested, outerTraceId, '应该恢复到外层 traceId');
    }, outerTraceId);
}

function testAsyncTraceId() {
    console.log('  ✓ TraceId 异步传递');

    if (!Logger.withTraceId) {
        console.log('    ⚠️  跳过（不支持 AsyncLocalStorage）');
        return;
    }

    return new Promise((resolve) => {
        const traceId = 'async-test-123';

        Logger.withTraceId(async () => {
            // 模拟异步操作
            await new Promise(r => setTimeout(r, 10));

            const currentTraceId = Logger.getTraceId();
            assert.strictEqual(currentTraceId, traceId, '异步中应该保持 traceId');

            resolve();
        }, traceId);
    });
}

testNestedTraceId();
testAsyncTraceId();

// 测试套件 7: createWithTimestamp
console.log('\n📦 7. 带时间戳日志记录器');

function testTimestampLogger() {
    console.log('  ✓ 创建带时间戳日志记录器');

    const messages = [];
    const customLogger = {
        debug: (msg) => messages.push(msg),
        info: (msg) => messages.push(msg),
        warn: (msg) => messages.push(msg),
        error: (msg) => messages.push(msg),
    };

    const logger = Logger.createWithTimestamp(customLogger);

    logger.info('测试消息');

    const lastMessage = messages[messages.length - 1];
    // 应该包含 ISO 格式的时间戳
    assert.ok(lastMessage.match(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/), '应该包含 ISO 时间戳');
    assert.ok(lastMessage.includes('测试消息'), '应该包含原始消息');
}

function testTimestampLoggerDefault() {
    console.log('  ✓ 带时间戳日志记录器（默认）');

    const logger = Logger.createWithTimestamp();

    // 应该不抛错
    logger.debug('debug');
    logger.info('info');
    logger.warn('warn');
    logger.error('error');
}

testTimestampLogger();
testTimestampLoggerDefault();

// 测试套件 8: 边界情况与错误处理
console.log('\n📦 8. 边界情况与错误处理');

function testLoggerWithNullMessage() {
    console.log('  ✓ 处理 null/undefined 消息');

    const logger = Logger.create();

    // 应该不抛错
    logger.info(null);
    logger.info(undefined);
    logger.info('');
}

function testLoggerWithComplexContext() {
    console.log('  ✓ 处理复杂上下文对象');

    const messages = [];
    const customLogger = {
        debug: (msg) => messages.push(msg),
        info: (msg) => messages.push(msg),
        warn: () => {},
        error: () => {},
    };

    const logger = Logger.create(customLogger, { structured: true });

    const complexContext = {
        nested: { deep: { value: 123 } },
        array: [1, 2, 3],
        date: new Date().toISOString(),
        nullValue: null,
        undefinedValue: undefined,
    };

    logger.info('复杂上下文', complexContext);

    const lastMessage = messages[messages.length - 1];
    const parsed = JSON.parse(lastMessage);

    assert.ok(parsed.context, '应该有上下文');
    assert.strictEqual(parsed.context.nested.deep.value, 123, '嵌套对象应该保留');
    assert.deepStrictEqual(parsed.context.array, [1, 2, 3], '数组应该保留');
}

function testLoggerWithInvalidCustomLogger() {
    console.log('  ✓ 处理无效的自定义 logger');

    const invalidLogger = {
        info: () => {},
        // 缺少 debug, warn, error
    };

    // 应该回退到默认 logger
    const logger = Logger.create(invalidLogger);

    assert.ok(typeof logger.debug === 'function', '应该有 debug 方法');
    assert.ok(typeof logger.warn === 'function', '应该有 warn 方法');
}

function testStructuredLoggerWithoutContext() {
    console.log('  ✓ 结构化日志无上下文');

    const messages = [];
    const customLogger = {
        debug: () => {},
        info: (msg) => messages.push(msg),
        warn: () => {},
        error: () => {},
    };

    const logger = Logger.create(customLogger, { structured: true });

    logger.info('纯消息');

    const lastMessage = messages[messages.length - 1];
    const parsed = JSON.parse(lastMessage);

    assert.strictEqual(parsed.message, '纯消息');
    assert.ok(!parsed.context, '不应该有空的 context 字段');
}

testLoggerWithNullMessage();
testLoggerWithComplexContext();
testLoggerWithInvalidCustomLogger();
testStructuredLoggerWithoutContext();

// 测试套件 9: 多种日志级别测试
console.log('\n📦 9. 多种日志级别完整测试');

function testAllLogLevels() {
    console.log('  ✓ 测试所有日志级别');

    const messages = [];
    const customLogger = {
        debug: (msg) => messages.push({ level: 'debug', msg }),
        info: (msg) => messages.push({ level: 'info', msg }),
        warn: (msg) => messages.push({ level: 'warn', msg }),
        error: (msg) => messages.push({ level: 'error', msg }),
    };

    const logger = Logger.create(customLogger, { structured: true });

    logger.debug('调试信息');
    logger.info('普通信息');
    logger.warn('警告信息');
    logger.error('错误信息');

    assert.strictEqual(messages.length, 4, '应该记录 4 条日志');

    const levels = messages.map(m => {
        const parsed = JSON.parse(m.msg);
        return parsed.level;
    });

    assert.deepStrictEqual(levels, ['DEBUG', 'INFO', 'WARN', 'ERROR'], 'level 应该大写');
}

testAllLogLevels();

console.log('\n✅ 日志系统增强测试全部通过\n');

