/**
 * 日期高级函数快速验证脚本
 * 验证 DATE_ADD, DATE_SUBTRACT, DATE_DIFF, DATE_TO_STRING, DATE_FROM_STRING
 */

const { ExpressionCompiler } = require('../../lib/expression');
const { createExpression } = require('../../lib/expression/factory');

console.log('========================================');
console.log('日期高级函数（P0）验证测试');
console.log('========================================\n');

const compiler = new ExpressionCompiler({ debug: false });
let passedTests = 0;
let failedTests = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`✅ ${name}`);
    passedTests++;
  } catch (error) {
    console.log(`❌ ${name}`);
    console.log(`   错误: ${error.message}\n`);
    failedTests++;
  }
}

// 1. DATE_ADD 测试
console.log('[1/5] DATE_ADD - 日期加法\n');

test('DATE_ADD(date, 7, "day") 编译正确', () => {
  const expr = createExpression('DATE_ADD(createdAt, 7, "day")');
  const result = compiler.compile(expr, { context: 'project' });

  console.log('   结果:', JSON.stringify(result, null, 2));

  if (!result.$dateAdd) throw new Error('缺少 $dateAdd');
  if (result.$dateAdd.startDate !== '$createdAt') throw new Error('startDate 错误');
  if (result.$dateAdd.unit !== 'day') throw new Error('unit 错误');
  if (result.$dateAdd.amount !== 7) throw new Error('amount 错误');
});

test('DATE_ADD 支持month单位', () => {
  const expr = createExpression('DATE_ADD(date, 1, "month")');
  const result = compiler.compile(expr, { context: 'project' });

  if (result.$dateAdd.unit !== 'month') throw new Error('unit 应为 month');
});

// 2. DATE_SUBTRACT 测试
console.log('\n[2/5] DATE_SUBTRACT - 日期减法\n');

test('DATE_SUBTRACT(date, 30, "day") 编译正确', () => {
  const expr = createExpression('DATE_SUBTRACT(expireAt, 30, "day")');
  const result = compiler.compile(expr, { context: 'project' });

  console.log('   结果:', JSON.stringify(result, null, 2));

  if (!result.$dateSubtract) throw new Error('缺少 $dateSubtract');
  if (result.$dateSubtract.startDate !== '$expireAt') throw new Error('startDate 错误');
  if (result.$dateSubtract.amount !== 30) throw new Error('amount 错误');
});

// 3. DATE_DIFF 测试
console.log('\n[3/5] DATE_DIFF - 日期差值\n');

test('DATE_DIFF(end, start, "day") 编译正确', () => {
  const expr = createExpression('DATE_DIFF(completedAt, createdAt, "day")');
  const result = compiler.compile(expr, { context: 'project' });

  console.log('   结果:', JSON.stringify(result, null, 2));

  if (!result.$dateDiff) throw new Error('缺少 $dateDiff');
  if (result.$dateDiff.startDate !== '$createdAt') throw new Error('startDate 错误');
  if (result.$dateDiff.endDate !== '$completedAt') throw new Error('endDate 错误');
  if (result.$dateDiff.unit !== 'day') throw new Error('unit 错误');
});

test('DATE_DIFF 支持hour单位', () => {
  const expr = createExpression('DATE_DIFF(end, start, "hour")');
  const result = compiler.compile(expr, { context: 'project' });

  if (result.$dateDiff.unit !== 'hour') throw new Error('unit 应为 hour');
});

// 4. DATE_TO_STRING 测试
console.log('\n[4/5] DATE_TO_STRING - 日期格式化\n');

test('DATE_TO_STRING(date, format) 编译正确', () => {
  const expr = createExpression('DATE_TO_STRING(createdAt, "%Y-%m-%d %H:%M:%S")');
  const result = compiler.compile(expr, { context: 'project' });

  console.log('   结果:', JSON.stringify(result, null, 2));

  if (!result.$dateToString) throw new Error('缺少 $dateToString');
  if (result.$dateToString.date !== '$createdAt') throw new Error('date 错误');
  if (result.$dateToString.format !== '%Y-%m-%d %H:%M:%S') throw new Error('format 错误');
});

test('DATE_TO_STRING 支持中文格式', () => {
  const expr = createExpression('DATE_TO_STRING(date, "%Y年%m月%d日")');
  const result = compiler.compile(expr, { context: 'project' });

  if (result.$dateToString.format !== '%Y年%m月%d日') throw new Error('中文格式错误');
});

// 5. DATE_FROM_STRING 测试
console.log('\n[5/5] DATE_FROM_STRING - 字符串解析\n');

test('DATE_FROM_STRING(dateStr) 编译正确', () => {
  const expr = createExpression('DATE_FROM_STRING(dateString)');
  const result = compiler.compile(expr, { context: 'project' });

  console.log('   结果:', JSON.stringify(result, null, 2));

  if (!result.$dateFromString) throw new Error('缺少 $dateFromString');
  if (result.$dateFromString.dateString !== '$dateString') throw new Error('dateString 错误');
});

test('DATE_FROM_STRING 支持format参数', () => {
  const expr = createExpression('DATE_FROM_STRING(str, "%Y-%m-%d")');
  const result = compiler.compile(expr, { context: 'project' });

  if (!result.$dateFromString.format) throw new Error('缺少 format');
  if (result.$dateFromString.format !== '%Y-%m-%d') throw new Error('format 错误');
});

// 错误处理测试
console.log('\n[错误处理测试]\n');

test('无效时间单位应抛出错误', () => {
  try {
    const expr = createExpression('DATE_ADD(date, 1, "invalid")');
    compiler.compile(expr, { context: 'project' });
    throw new Error('应该抛出错误');
  } catch (error) {
    if (!error.message.includes('Invalid time unit')) {
      throw new Error('错误消息不正确');
    }
  }
});

test('参数不足应抛出错误', () => {
  try {
    const expr = createExpression('DATE_ADD(date, 7)');
    compiler.compile(expr, { context: 'project' });
    throw new Error('应该抛出错误');
  } catch (error) {
    if (!error.message.includes('requires 3 arguments')) {
      throw new Error('错误消息不正确');
    }
  }
});

// 总结
console.log('\n========================================');
console.log('测试总结');
console.log('========================================');
console.log(`✅ 通过: ${passedTests}`);
console.log(`❌ 失败: ${failedTests}`);
console.log(`总计: ${passedTests + failedTests}`);
console.log(`通过率: ${((passedTests / (passedTests + failedTests)) * 100).toFixed(1)}%`);
console.log('========================================\n');

if (failedTests > 0) {
  console.log('⚠️  存在失败的测试，请检查！');
  process.exit(1);
} else {
  console.log('🎉 所有测试通过！P0 日期高级函数实现成功！');
  process.exit(0);
}
