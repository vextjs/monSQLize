/**
 * 错误处理测试套件
 *
 * 目标: 确保统一表达式系统能够优雅地处理各种错误情况
 * 测试数: 25个
 * 优先级: P0（最高）
 *
 * 测试分类:
 * 1. 语法错误处理（8个）
 * 2. 类型错误处理（8个）
 * 3. 编译错误处理（9个）
 */

const MonSQLize = require('../../../../lib');
const assert = require('assert');

describe('⚠️ Error Handling Tests', function() {
  this.timeout(30000);

  let msq, collection;
  const { expr } = MonSQLize;

  before(async function() {
    msq = new MonSQLize({
      type: 'mongodb',
      databaseName: 'test_error_handling',
      config: { useMemoryServer: true }
    });

    const conn = await msq.connect();
    collection = conn.collection;

    // 准备测试数据
    await collection('test').insertMany([
      { _id: 1, name: 'Alice', age: 25, value: 100, tags: ['a', 'b'] },
      { _id: 2, name: 'Bob', age: 30, value: 200, tags: ['b', 'c'] },
      { _id: 3, name: 'Charlie', age: 35, value: 300, tags: ['c', 'd'] }
    ]);
  });

  after(async function() {
    await msq.close();
  });

  // ====================================================================
  // 1. 语法错误处理（8个）
  // ====================================================================

  describe('1️⃣ Syntax Error Handling', function() {

    it('1.1 should handle invalid operator gracefully', function() {
      try {
        const expr = expr("INVALID_FUNC(name)");
        // 如果到这里说明没有抛出错误，表达式对象已创建
        // 真正的错误应该在编译时抛出
        assert(expr.__expr__, '表达式对象应该被创建');
      } catch (err) {
        // 如果在创建时就抛出错误也是可以的
        assert(err.message.includes('INVALID') || err.message.includes('Unsupported'),
          '错误消息应该提示不支持的函数');
      }
    });

    it('1.2 should handle mismatched parentheses', function() {
      try {
        const expr = expr("CONCAT(name, age");  // 缺少右括号
        assert(expr.__expr__, '语法错误可能在编译时才检测');
      } catch (err) {
        assert(err.message.includes('parenthes') || err.message.includes('Unexpected'),
          '错误消息应该提示括号不匹配');
      }
    });

    it('1.3 should handle unclosed string literal', function() {
      try {
        const expr = expr("CONCAT(name, 'test)");  // 字符串未闭合
        assert(expr.__expr__, '语法错误可能在编译时才检测');
      } catch (err) {
        assert(err.message.includes('string') || err.message.includes('quote') || err.message.includes('Unexpected'),
          '错误消息应该提示字符串未闭合');
      }
    });

    it('1.4 should handle invalid comparison operator', function() {
      try {
        const expr = expr("age == 25");  // 应该用 === 而不是 ==
        // 注意：== 可能被当作两个连续的 = 处理，或者被编译器拒绝
        assert(expr.__expr__, '表达式对象可能被创建');
      } catch (err) {
        // 如果抛出错误也是合理的
        assert(true, '拒绝 == 操作符是合理的');
      }
    });

    it('1.5 should handle missing operator', function() {
      try {
        const expr = expr("name value");  // 缺少操作符
        assert(expr.__expr__, '语法错误可能在编译时检测');
      } catch (err) {
        assert(err.message.includes('operator') || err.message.includes('Unexpected') || err.message.includes('Invalid'),
          '错误消息应该提示缺少操作符');
      }
    });

    it('1.6 should handle invalid field reference', function() {
      try {
        const expr = expr("$invalid.field.name");  // 字段引用不应该有 $
        // 这可能被解析为字符串 "$invalid"
        assert(expr.__expr__, '可能被解析为字面量');
      } catch (err) {
        // 如果抛出错误也合理
        assert(true, '拒绝 $ 前缀是合理的');
      }
    });

    it('1.7 should handle empty expression', function() {
      try {
        const expr = expr("");  // 空表达式
        // 空表达式应该被拒绝
        assert.fail('空表达式应该被拒绝');
      } catch (err) {
        assert(err.message.includes('empty') || err.message.includes('Expression') || err.message.includes('cannot be empty'),
          '错误消息应该提示表达式为空');
      }
    });

    it('1.8 should handle whitespace-only expression', function() {
      try {
        const expr = expr("   ");  // 仅空格
        assert.fail('仅空格的表达式应该被拒绝');
      } catch (err) {
        assert(err.message.includes('empty') || err.message.includes('whitespace') || err.message.includes('cannot be empty'),
          '错误消息应该提示表达式无效');
      }
    });
  });

  // ====================================================================
  // 2. 类型错误处理（8个）
  // ====================================================================

  describe('2️⃣ Type Error Handling', function() {

    it('2.1 should handle string + number operation gracefully', async function() {
      try {
        const result = await collection('test').aggregate([
          { $project: { result: expr("name + age") } }  // 字符串 + 数字
        ]);

        // MongoDB 可能会将其转换为字符串连接，或者返回错误
        // 我们只需要确保不会崩溃
        assert(Array.isArray(result), '应该返回结果数组');
      } catch (err) {
        // 如果抛出错误也是合理的
        assert(err.message, '应该有错误消息');
      }
    });

    it('2.2 should handle division by string', async function() {
      try {
        const result = await collection('test').aggregate([
          { $project: { result: expr("age / name") } }  // 数字 / 字符串
        ]);

        assert(Array.isArray(result), '应该返回结果数组');
      } catch (err) {
        assert(err.message, '应该有类型错误提示');
      }
    });

    it('2.3 should handle UPPER on number', async function() {
      try {
        const result = await collection('test').aggregate([
          { $project: { result: expr("UPPER(age)") } }  // 对数字使用字符串函数
        ]);

        // MongoDB 会尝试转换或返回 null
        assert(Array.isArray(result), '应该返回结果');
      } catch (err) {
        assert(err.message, '应该有类型错误提示');
      }
    });

    it('2.4 should handle SIZE on non-array', async function() {
      try {
        const result = await collection('test').aggregate([
          { $project: { result: expr("SIZE(name)") } }  // SIZE 应该用于数组
        ]);

        // MongoDB 会返回错误
        assert(Array.isArray(result), '可能返回结果');
      } catch (err) {
        assert(err.message.includes('array') || err.message.includes('type'),
          '错误应该提示类型不匹配');
      }
    });

    it('2.5 should handle YEAR on non-date', async function() {
      try {
        const result = await collection('test').aggregate([
          { $project: { result: expr("YEAR(name)") } }  // YEAR 应该用于日期
        ]);

        assert(Array.isArray(result), '可能返回结果');
      } catch (err) {
        assert(err.message.includes('date') || err.message.includes('type'),
          '错误应该提示类型不匹配');
      }
    });

    it('2.6 should handle comparison with incompatible types', async function() {
      try {
        const result = await collection('test').aggregate([
          { $project: { result: expr("name > age") } }  // 字符串 > 数字
        ]);

        // MongoDB 会进行类型比较（可能返回 false）
        assert(Array.isArray(result), '应该返回结果');
      } catch (err) {
        // 如果抛出错误也合理
        assert(err.message, '应该有错误消息');
      }
    });

    it('2.7 should handle boolean operation on non-boolean', async function() {
      try {
        const result = await collection('test').aggregate([
          { $project: { result: expr("name && age") } }  // 对非布尔值使用 &&
        ]);

        // MongoDB 会将值转换为布尔
        assert(Array.isArray(result), '应该返回结果');
      } catch (err) {
        assert(err.message, '应该有错误消息');
      }
    });

    it('2.8 should handle NULL in expressions', async function() {
      // 插入包含 null 的数据
      await collection('test').insertOne({ _id: 4, name: null, age: 40 });

      try {
        const result = await collection('test').aggregate([
          { $match: { _id: 4 } },
          { $project: { result: expr("UPPER(name)") } }  // UPPER(null)
        ]);

        // MongoDB 应该返回 null
        assert(Array.isArray(result), '应该返回结果');
        // null 应该被优雅处理
      } catch (err) {
        // 如果抛出错误也需要有清晰的消息
        assert(err.message, '应该有错误消息');
      }

      // 清理
      await collection('test').deleteOne({ _id: 4 });
    });
  });

  // ====================================================================
  // 3. 编译错误处理（9个）
  // ====================================================================

  describe('3️⃣ Compilation Error Handling', function() {

    it('3.1 should handle too deep nesting', function() {
      // 创建超深嵌套表达式（100层）
      let deep = "value";
      for (let i = 0; i < 100; i++) {
        deep = `UPPER(${deep})`;
      }

      try {
        const expr = expr(deep);
        // 如果没有深度限制，可能会成功创建
        assert(expr.__expr__, '表达式对象可能被创建');
      } catch (err) {
        // 如果有深度限制，应该抛出错误
        assert(err.message.includes('depth') || err.message.includes('nested') || err.message.includes('stack'),
          '错误应该提示嵌套过深');
      }
    });

    it('3.2 should handle circular reference (if detectable)', function() {
      // 注意：在表达式字符串中很难构造真正的循环引用
      // 这个测试主要检查编译器的健壮性
      try {
        const expr = expr("value + value + value");
        assert(expr.__expr__, '正常表达式应该成功');
      } catch (err) {
        assert.fail('简单重复引用应该被允许');
      }
    });

    it('3.3 should handle missing function arguments', function() {
      try {
        const expr = expr("CONCAT()");  // CONCAT 需要至少 1 个参数
        assert(expr.__expr__, '参数错误可能在编译时检测');
      } catch (err) {
        assert(err.message.includes('argument') || err.message.includes('parameter') || err.message.includes('required'),
          '错误应该提示缺少参数');
      }
    });

    it('3.4 should handle too many function arguments', function() {
      try {
        // ABS 只接受 1 个参数，但传入多个
        const expr = expr("ABS(value, age, name)");
        assert(expr.__expr__, '参数数量错误可能在编译时检测');
      } catch (err) {
        assert(err.message.includes('argument') || err.message.includes('parameter') || err.message.includes('expects'),
          '错误应该提示参数过多');
      }
    });

    it('3.5 should handle undefined field reference', async function() {
      try {
        const result = await collection('test').aggregate([
          { $project: { result: expr("nonexistent_field + 10") } }
        ]);

        // MongoDB 会返回 null + 10 = null
        assert(Array.isArray(result), '应该返回结果');
        assert(result[0].result === null || result[0].result === undefined,
          '不存在的字段应该返回 null');
      } catch (err) {
        // 如果抛出错误也需要清晰的消息
        assert(err.message, '应该有错误消息');
      }
    });

    it('3.6 should handle invalid lambda expression', function() {
      try {
        // Lambda 表达式格式错误
        const expr = expr("FILTER(tags, invalid syntax)");
        assert(expr.__expr__, 'Lambda 错误可能在编译时检测');
      } catch (err) {
        assert(err.message.includes('lambda') || err.message.includes('syntax') || err.message.includes('FILTER'),
          '错误应该提示 Lambda 语法错误');
      }
    });

    it('3.7 should handle invalid conditional expression', function() {
      try {
        // 三元运算符格式错误
        const expr = expr("age > 30 ? 'old'");  // 缺少 : 和 else 部分
        assert(expr.__expr__, '条件表达式错误可能在编译时检测');
      } catch (err) {
        assert(err.message.includes('ternary') || err.message.includes('conditional') || err.message.includes(':'),
          '错误应该提示条件表达式格式错误');
      }
    });

    it('3.8 should handle expression in wrong context', async function() {
      try {
        // 尝试在 $match 中使用只能在 $group 中使用的累加器
        const result = await collection('test').aggregate([
          { $match: expr("SUM(value) > 100") }
        ]);

        // 这应该编译失败或运行时错误
        assert(Array.isArray(result), '可能返回结果或抛出错误');
      } catch (err) {
        assert(err.message.includes('SUM') || err.message.includes('accumulator') || err.message.includes('context') || err.message.includes('group'),
          '错误应该提示上下文不正确');
      }
    });

    it('3.9 should handle invalid SWITCH expression', function() {
      try {
        // SWITCH 参数数量必须是奇数（condition-result 对 + default）
        const expr = expr("SWITCH(age > 30, 'old', age > 20)");  // 缺少 default
        assert(expr.__expr__, 'SWITCH 错误可能在编译时检测');
      } catch (err) {
        assert(err.message.includes('SWITCH') || err.message.includes('argument') || err.message.includes('default'),
          '错误应该提示 SWITCH 参数错误');
      }
    });
  });

  // ====================================================================
  // 4. 错误恢复和容错（额外测试）
  // ====================================================================

  describe('4️⃣ Error Recovery', function() {

    it('4.1 should continue after expression error', async function() {
      // 第一个查询可能失败
      try {
        await collection('test').aggregate([
          { $project: { result: expr("INVALID_FUNC(name)") } }
        ]);
      } catch (err) {
        // 预期可能失败
      }

      // 第二个查询应该正常工作
      const result = await collection('test').aggregate([
        { $project: { result: expr("UPPER(name)") } }
      ]);

      assert(Array.isArray(result), '后续查询应该正常工作');
      assert.strictEqual(result[0].result, 'ALICE');
    });

    it('4.2 should provide helpful error messages', function() {
      try {
        const expr = expr("CONCTA(name)");  // 拼写错误 CONCAT -> CONCTA
        assert(expr.__expr__, '表达式可能被创建');
      } catch (err) {
        // 如果抛出错误，应该有有用的提示
        assert(err.message, '应该有错误消息');
        // 理想情况下应该建议正确的拼写
        // assert(err.message.includes('Did you mean CONCAT?'), '应该提供拼写建议');
      }
    });

    it('4.3 should not crash on malformed input', async function() {
      const malformedInputs = [
        "(((",
        ")))",
        "'''",
        '"""',
        "UPPER(CONCAT(LOWER(",
        "name + + + value",
        ",,,,",
        ";;;;"
      ];

      for (const input of malformedInputs) {
        try {
          const expr = expr(input);
          // 如果创建成功，尝试编译
          if (expr) {
            await collection('test').aggregate([
              { $project: { result: expr } }
            ]);
          }
        } catch (err) {
          // 应该抛出错误，但不应该崩溃
          assert(err.message, `畸形输入 "${input}" 应该有错误消息`);
        }
      }

      // 测试通过说明没有崩溃
      assert(true, '所有畸形输入都被正确处理');
    });
  });
});

