/**
 * 日期高级函数测试 - P0 新增功能
 * 测试 DATE_ADD, DATE_SUBTRACT, DATE_DIFF, DATE_TO_STRING, DATE_FROM_STRING
 */

const { ExpressionCompiler } = require('../../../lib/expression');
const { createExpression } = require('../../../lib/expression/factory');

describe('表达式 - 日期高级函数（P0）', function () {
  let compiler;

  before(function () {
    compiler = new ExpressionCompiler({ debug: false });
  });

  describe('DATE_ADD - 日期加法', function () {
    it('应该正确编译 DATE_ADD(date, amount, unit)', function () {
      const expr = createExpression('DATE_ADD(createdAt, 7, "day")');
      const result = compiler.compile(expr, { context: 'project' });

      console.log('   DATE_ADD 编译结果:', JSON.stringify(result, null, 2));

      if (!result.$dateAdd) {
        throw new Error('编译结果应包含 $dateAdd');
      }
      if (result.$dateAdd.startDate !== '$createdAt') {
        throw new Error('startDate 应为 $createdAt');
      }
      if (result.$dateAdd.unit !== 'day') {
        throw new Error('unit 应为 day');
      }
      if (result.$dateAdd.amount !== 7) {
        throw new Error('amount 应为 7');
      }
    });

    it('应该支持不同的时间单位', function () {
      const units = ['year', 'month', 'week', 'day', 'hour', 'minute', 'second'];

      for (const unit of units) {
        const expr = createExpression(`DATE_ADD(date, 1, "${unit}")`);
        const result = compiler.compile(expr, { context: 'project' });

        if (!result.$dateAdd) {
          throw new Error(`应支持单位: ${unit}`);
        }
        if (result.$dateAdd.unit !== unit) {
          throw new Error(`unit 应为 ${unit}`);
        }
      }

      console.log(`   ✓ 所有时间单位测试通过: ${units.join(', ')}`);
    });

    it('应该拒绝无效的时间单位', function () {
      try {
        const expr = createExpression('DATE_ADD(date, 1, "invalid")');
        compiler.compile(expr, { context: 'project' });
        throw new Error('应该抛出错误');
      } catch (error) {
        if (!error.message.includes('Invalid time unit')) {
          throw new Error('应该提示无效的时间单位');
        }
      }
    });

    it('应该支持字段引用和数字', function () {
      const expr = createExpression('DATE_ADD(orderDate, daysToAdd, "day")');
      const result = compiler.compile(expr, { context: 'project' });

      if (result.$dateAdd.startDate !== '$orderDate') {
        throw new Error('应支持字段引用');
      }
      if (result.$dateAdd.amount !== '$daysToAdd') {
        throw new Error('应支持动态数量');
      }
    });
  });

  describe('DATE_SUBTRACT - 日期减法', function () {
    it('应该正确编译 DATE_SUBTRACT(date, amount, unit)', function () {
      const expr = createExpression('DATE_SUBTRACT(expireAt, 30, "day")');
      const result = compiler.compile(expr, { context: 'project' });

      console.log('   DATE_SUBTRACT 编译结果:', JSON.stringify(result, null, 2));

      if (!result.$dateSubtract) {
        throw new Error('编译结果应包含 $dateSubtract');
      }
      if (result.$dateSubtract.startDate !== '$expireAt') {
        throw new Error('startDate 应为 $expireAt');
      }
      if (result.$dateSubtract.unit !== 'day') {
        throw new Error('unit 应为 day');
      }
      if (result.$dateSubtract.amount !== 30) {
        throw new Error('amount 应为 30');
      }
    });

    it('应该支持计算过期前提醒时间', function () {
      const expr = createExpression('DATE_SUBTRACT(vipExpireAt, 7, "day")');
      const result = compiler.compile(expr, { context: 'project' });

      if (!result.$dateSubtract) {
        throw new Error('应正确编译提醒时间计算');
      }
    });
  });

  describe('DATE_DIFF - 日期差值计算', function () {
    it('应该正确编译 DATE_DIFF(endDate, startDate, unit)', function () {
      const expr = createExpression('DATE_DIFF(completedAt, createdAt, "day")');
      const result = compiler.compile(expr, { context: 'project' });

      console.log('   DATE_DIFF 编译结果:', JSON.stringify(result, null, 2));

      if (!result.$dateDiff) {
        throw new Error('编译结果应包含 $dateDiff');
      }
      if (result.$dateDiff.startDate !== '$createdAt') {
        throw new Error('startDate 应为 $createdAt');
      }
      if (result.$dateDiff.endDate !== '$completedAt') {
        throw new Error('endDate 应为 $completedAt');
      }
      if (result.$dateDiff.unit !== 'day') {
        throw new Error('unit 应为 day');
      }
    });

    it('应该支持计算处理时长（小时）', function () {
      const expr = createExpression('DATE_DIFF(endTime, startTime, "hour")');
      const result = compiler.compile(expr, { context: 'project' });

      if (result.$dateDiff.unit !== 'hour') {
        throw new Error('应支持小时单位');
      }
    });

    it('应该支持计算活跃天数', function () {
      const expr = createExpression('DATE_DIFF(lastLoginAt, registeredAt, "day")');
      const result = compiler.compile(expr, { context: 'project' });

      if (!result.$dateDiff) {
        throw new Error('应正确编译活跃天数计算');
      }
    });
  });

  describe('DATE_TO_STRING - 日期格式化', function () {
    it('应该正确编译 DATE_TO_STRING(date, format)', function () {
      const expr = createExpression('DATE_TO_STRING(createdAt, "%Y-%m-%d %H:%M:%S")');
      const result = compiler.compile(expr, { context: 'project' });

      console.log('   DATE_TO_STRING 编译结果:', JSON.stringify(result, null, 2));

      if (!result.$dateToString) {
        throw new Error('编译结果应包含 $dateToString');
      }
      if (result.$dateToString.date !== '$createdAt') {
        throw new Error('date 应为 $createdAt');
      }
      if (result.$dateToString.format !== '%Y-%m-%d %H:%M:%S') {
        throw new Error('format 应为 %Y-%m-%d %H:%M:%S');
      }
    });

    it('应该支持中文日期格式', function () {
      const expr = createExpression('DATE_TO_STRING(publishAt, "%Y年%m月%d日")');
      const result = compiler.compile(expr, { context: 'project' });

      if (result.$dateToString.format !== '%Y年%m月%d日') {
        throw new Error('应支持中文格式');
      }
    });

    it('应该支持简单日期格式', function () {
      const expr = createExpression('DATE_TO_STRING(date, "%Y-%m-%d")');
      const result = compiler.compile(expr, { context: 'project' });

      if (result.$dateToString.format !== '%Y-%m-%d') {
        throw new Error('应支持简单日期格式');
      }
    });
  });

  describe('DATE_FROM_STRING - 字符串解析', function () {
    it('应该正确编译 DATE_FROM_STRING(dateString)', function () {
      const expr = createExpression('DATE_FROM_STRING(dateStr)');
      const result = compiler.compile(expr, { context: 'project' });

      console.log('   DATE_FROM_STRING 编译结果:', JSON.stringify(result, null, 2));

      if (!result.$dateFromString) {
        throw new Error('编译结果应包含 $dateFromString');
      }
      if (result.$dateFromString.dateString !== '$dateStr') {
        throw new Error('dateString 应为 $dateStr');
      }
    });

    it('应该支持带格式的解析', function () {
      const expr = createExpression('DATE_FROM_STRING(dateString, "%Y-%m-%d")');
      const result = compiler.compile(expr, { context: 'project' });

      if (!result.$dateFromString.format) {
        throw new Error('应包含 format 参数');
      }
      if (result.$dateFromString.format !== '%Y-%m-%d') {
        throw new Error('format 应为 %Y-%m-%d');
      }
    });

    it('应该支持字符串字面量', function () {
      const expr = createExpression('DATE_FROM_STRING("2026-01-21", "%Y-%m-%d")');
      const result = compiler.compile(expr, { context: 'project' });

      if (result.$dateFromString.dateString !== '2026-01-21') {
        throw new Error('应支持字符串字面量');
      }
    });
  });

  describe('组合使用场景', function () {
    it('应该支持计算并格式化日期', function () {
      // 计算7天后并格式化
      const expr1 = createExpression('DATE_ADD(orderDate, 7, "day")');
      const result1 = compiler.compile(expr1, { context: 'project' });

      if (!result1.$dateAdd) {
        throw new Error('DATE_ADD 应正常工作');
      }

      // 格式化日期
      const expr2 = createExpression('DATE_TO_STRING(createdAt, "%Y-%m-%d")');
      const result2 = compiler.compile(expr2, { context: 'project' });

      if (!result2.$dateToString) {
        throw new Error('DATE_TO_STRING 应正常工作');
      }

      console.log('   ✓ 组合场景测试通过');
    });

    it('应该支持复杂的日期计算场景', function () {
      // 场景1: 订单交货日期（下单后7天）
      const deliveryExpr = createExpression('DATE_ADD(orderDate, 7, "day")');
      const deliveryResult = compiler.compile(deliveryExpr, { context: 'project' });

      // 场景2: 会员到期提醒（到期前30天）
      const reminderExpr = createExpression('DATE_SUBTRACT(vipExpireAt, 30, "day")');
      const reminderResult = compiler.compile(reminderExpr, { context: 'project' });

      // 场景3: 订单处理时长（天数）
      const durationExpr = createExpression('DATE_DIFF(completedAt, createdAt, "day")');
      const durationResult = compiler.compile(durationExpr, { context: 'project' });

      if (!deliveryResult.$dateAdd || !reminderResult.$dateSubtract || !durationResult.$dateDiff) {
        throw new Error('复杂场景测试失败');
      }

      console.log('   ✓ 复杂业务场景测试通过');
    });
  });

  describe('错误处理', function () {
    it('DATE_ADD 缺少参数应抛出错误', function () {
      try {
        const expr = createExpression('DATE_ADD(date, 7)');
        compiler.compile(expr, { context: 'project' });
        throw new Error('应该抛出错误');
      } catch (error) {
        if (!error.message.includes('requires 3 arguments')) {
          throw new Error('应该提示参数不足');
        }
      }
    });

    it('DATE_DIFF 缺少参数应抛出错误', function () {
      try {
        const expr = createExpression('DATE_DIFF(end, start)');
        compiler.compile(expr, { context: 'project' });
        throw new Error('应该抛出错误');
      } catch (error) {
        if (!error.message.includes('requires 3 arguments')) {
          throw new Error('应该提示参数不足');
        }
      }
    });

    it('DATE_TO_STRING 缺少参数应抛出错误', function () {
      try {
        const expr = createExpression('DATE_TO_STRING(date)');
        compiler.compile(expr, { context: 'project' });
        throw new Error('应该抛出错误');
      } catch (error) {
        if (!error.message.includes('requires 2 arguments')) {
          throw new Error('应该提示参数不足');
        }
      }
    });
  });

  describe('缓存机制', function () {
    it('相同表达式应使用缓存', function () {
      const expr = createExpression('DATE_ADD(date, 7, "day")');

      // 首次编译
      const start1 = Date.now();
      const result1 = compiler.compile(expr, { context: 'project' });
      const time1 = Date.now() - start1;

      // 缓存命中
      const start2 = Date.now();
      const result2 = compiler.compile(expr, { context: 'project' });
      const time2 = Date.now() - start2;

      console.log(`   首次编译: ${time1}ms, 缓存命中: ${time2}ms`);

      if (JSON.stringify(result1) !== JSON.stringify(result2)) {
        throw new Error('缓存结果应一致');
      }
    });
  });
});
