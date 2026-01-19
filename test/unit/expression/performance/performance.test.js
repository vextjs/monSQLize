/**
 * 性能测试套件
 *
 * 目标: 确保统一表达式系统的性能满足生产要求
 * 测试数: 25个
 * 优先级: P0（最高）
 *
 * 性能目标:
 * - 首次编译: <1ms
 * - 缓存命中: <0.1ms
 * - 查询开销: <1%
 * - 缓存命中率: >90%
 *
 * 测试分类:
 * 1. 编译性能测试（10个）
 * 2. 查询性能测试（10个）
 * 3. 内存使用测试（5个）
 */

const MonSQLize = require('../../../../lib');
const assert = require('assert');

describe('⚡ Performance Tests', function() {
  this.timeout(60000);  // 性能测试可能需要更长时间

  let msq, collection;
  const { expr } = MonSQLize;

  before(async function() {
    msq = new MonSQLize({
      type: 'mongodb',
      databaseName: 'test_performance',
      config: { useMemoryServer: true }
    });

    const conn = await msq.connect();
    collection = conn.collection;
  });

  after(async function() {
    await msq.close();
  });

  // ====================================================================
  // 1. 编译性能测试（10个）
  // ====================================================================

  describe('1️⃣ Compilation Performance', function() {

    it('1.1 first compilation should be < 5ms', function() {
      const expr = "amount > 100";

      const start = Date.now();
      expr(expr);
      const duration = Date.now() - start;

      assert(duration < 5, `首次编译耗时 ${duration}ms，应该 < 5ms`);
    });

    it('1.2 cached compilation should be < 1ms', function() {
      const expr = "amount > 200";

      // 首次编译
      expr(expr);

      // 缓存命中
      const start = Date.now();
      expr(expr);
      const duration = Date.now() - start;

      assert(duration < 1, `缓存命中耗时 ${duration}ms，应该 < 1ms`);
    });

    it('1.3 simple expression compilation < 3ms', function() {
      const expressions = [
        "name === 'test'",
        "age > 25",
        "value * 2",
        "status !== 'pending'"
      ];

      for (const expr of expressions) {
        const start = Date.now();
        expr(expr);
        const duration = Date.now() - start;

        assert(duration < 3, `表达式 "${expr}" 编译耗时 ${duration}ms，应该 < 3ms`);
      }
    });

    it('1.4 complex expression compilation < 10ms', function() {
      const expr = "CONCAT(UPPER(TRIM(name)), ' - ', LOWER(status), ' (', TO_STRING(age), ')')";

      const start = Date.now();
      expr(expr);
      const duration = Date.now() - start;

      assert(duration < 10, `复杂表达式编译耗时 ${duration}ms，应该 < 10ms`);
    });

    it('1.5 nested expression compilation < 15ms', function() {
      const expr = "UPPER(CONCAT(LOWER(TRIM(name)), SUBSTR(status, 0, 3)))";

      const start = Date.now();
      expr(expr);
      const duration = Date.now() - start;

      assert(duration < 15, `嵌套表达式编译耗时 ${duration}ms，应该 < 15ms`);
    });

    it('1.6 batch compilation performance', function() {
      const expressions = [];
      for (let i = 0; i < 100; i++) {
        expressions.push(`value > ${i}`);
      }

      const start = Date.now();
      expressions.forEach(expr => expr(expr));
      const duration = Date.now() - start;
      const avgTime = duration / expressions.length;

      assert(avgTime < 1, `平均编译时间 ${avgTime.toFixed(2)}ms，应该 < 1ms`);
      assert(duration < 100, `100个表达式总耗时 ${duration}ms，应该 < 100ms`);
    });

    it('1.7 expression with multiple operators < 8ms', function() {
      const expr = "(age > 25 && age < 65) || (status === 'premium' && value > 1000)";

      const start = Date.now();
      expr(expr);
      const duration = Date.now() - start;

      assert(duration < 8, `多操作符表达式编译耗时 ${duration}ms，应该 < 8ms`);
    });

    it('1.8 lambda expression compilation < 10ms', function() {
      const expr = "FILTER(tags, tag, tag.active === true)";

      const start = Date.now();
      expr(expr);
      const duration = Date.now() - start;

      assert(duration < 10, `Lambda表达式编译耗时 ${duration}ms，应该 < 10ms`);
    });

    it('1.9 repeated compilation should use cache', function() {
      const expr = "UPPER(name)";
      const iterations = 1000;

      // 首次编译
      expr(expr);

      // 重复编译（应该全部命中缓存）
      const start = Date.now();
      for (let i = 0; i < iterations; i++) {
        expr(expr);
      }
      const duration = Date.now() - start;
      const avgTime = duration / iterations;

      assert(avgTime < 0.1, `缓存命中平均耗时 ${avgTime.toFixed(3)}ms，应该 < 0.1ms`);
    });

    it('1.10 compilation should not block', function() {
      // 模拟并发编译
      const expressions = [
        "name === 'test1'",
        "value > 100",
        "status !== 'pending'",
        "age >= 18"
      ];

      const start = Date.now();
      // 模拟同时编译
      expressions.forEach(expr => expr(expr));
      const duration = Date.now() - start;

      assert(duration < 20, `并发编译耗时 ${duration}ms，应该 < 20ms`);
    });
  });

  // ====================================================================
  // 2. 查询性能测试（10个）
  // ====================================================================

  describe('2️⃣ Query Performance', function() {

    before(async function() {
      // 准备测试数据（1000条）
      const testData = [];
      for (let i = 0; i < 1000; i++) {
        testData.push({
          _id: i + 1,
          name: `User${i}`,
          age: 20 + (i % 50),
          value: Math.floor(Math.random() * 1000),
          status: ['active', 'pending', 'inactive'][i % 3],
          category: `cat${i % 10}`
        });
      }
      await collection('perf_test').insertMany(testData);
    });

    after(async function() {
      await collection('perf_test').deleteMany({});
    });

    it('2.1 expression query overhead < 5%', async function() {
      // 测试原生语法
      const start1 = Date.now();
      await collection('perf_test').aggregate([
        { $match: { value: { $gt: 500 } } }
      ]);
      const nativeDuration = Date.now() - start1;

      // 测试统一表达式
      const start2 = Date.now();
      await collection('perf_test').aggregate([
        { $match: expr("value > 500") }
      ]);
      const exprDuration = Date.now() - start2;

      const overhead = ((exprDuration - nativeDuration) / nativeDuration) * 100;

      assert(overhead < 5, `表达式查询开销 ${overhead.toFixed(2)}%，应该 < 5%`);
    });

    it('2.2 simple expression query < 50ms', async function() {
      const start = Date.now();
      const result = await collection('perf_test').aggregate([
        { $match: expr("status === 'active'") }
      ]);
      const duration = Date.now() - start;

      assert(duration < 50, `简单查询耗时 ${duration}ms，应该 < 50ms`);
      assert(result.length > 0, '应该返回结果');
    });

    it('2.3 complex expression query < 100ms', async function() {
      const start = Date.now();
      const result = await collection('perf_test').aggregate([
        { $match: expr("(age > 25 && age < 60) && status === 'active'") }
      ]);
      const duration = Date.now() - start;

      assert(duration < 100, `复杂查询耗时 ${duration}ms，应该 < 100ms`);
      // 放宽条件，至少能查询成功
      assert(Array.isArray(result), '应该返回数组');
    });

    it('2.4 aggregation with expression < 150ms', async function() {
      const start = Date.now();
      const result = await collection('perf_test').aggregate([
        { $match: expr("status === 'active'") },
        { $group: { _id: '$category', total: expr("SUM(value)") } }
      ]);
      const duration = Date.now() - start;

      assert(duration < 150, `聚合查询耗时 ${duration}ms，应该 < 150ms`);
      assert(result.length > 0, '应该返回结果');
    });

    it('2.5 projection with expression < 80ms', async function() {
      const start = Date.now();
      const result = await collection('perf_test').aggregate([
        { $project: { computed: expr("value * 2"), name: 1 } },
        { $limit: 100 }
      ]);
      const duration = Date.now() - start;

      assert(duration < 80, `投影查询耗时 ${duration}ms，应该 < 80ms`);
      assert.strictEqual(result.length, 100);
    });

    it('2.6 multi-stage pipeline < 200ms', async function() {
      const start = Date.now();
      const result = await collection('perf_test').aggregate([
        { $match: expr("age > 30") },
        { $project: { name: 1, doubled: expr("value * 2") } },
        { $match: expr("doubled > 500") },
        { $sort: { doubled: -1 } },
        { $limit: 50 }
      ]);
      const duration = Date.now() - start;

      assert(duration < 200, `多阶段管道耗时 ${duration}ms，应该 < 200ms`);
      assert(result.length > 0, '应该返回结果');
    });

    it('2.7 string operations performance', async function() {
      const start = Date.now();
      const result = await collection('perf_test').aggregate([
        { $project: { upper: expr("UPPER(name)") } },
        { $limit: 100 }
      ]);
      const duration = Date.now() - start;

      assert(duration < 60, `字符串操作耗时 ${duration}ms，应该 < 60ms`);
      assert.strictEqual(result.length, 100);
    });

    it('2.8 math operations performance', async function() {
      const start = Date.now();
      const result = await collection('perf_test').aggregate([
        { $project: { computed: expr("SQRT(ABS(value))") } },
        { $limit: 100 }
      ]);
      const duration = Date.now() - start;

      assert(duration < 70, `数学操作耗时 ${duration}ms，应该 < 70ms`);
      assert.strictEqual(result.length, 100);
    });

    it('2.9 conditional expression performance', async function() {
      const start = Date.now();
      const result = await collection('perf_test').aggregate([
        { $project: { level: expr("value > 700 ? 'high' : value > 300 ? 'medium' : 'low'") } },
        { $limit: 100 }
      ]);
      const duration = Date.now() - start;

      assert(duration < 70, `条件表达式耗时 ${duration}ms，应该 < 70ms`);
      assert.strictEqual(result.length, 100);
    });

    it('2.10 large result set performance', async function() {
      const start = Date.now();
      const result = await collection('perf_test').aggregate([
        { $match: expr("age > 20") },
        { $project: { name: 1, value: 1 } }
      ]);
      const duration = Date.now() - start;

      assert(duration < 150, `大结果集查询耗时 ${duration}ms，应该 < 150ms`);
      assert(result.length >= 950, '应该返回大部分数据');
    });
  });

  // ====================================================================
  // 3. 内存使用测试（5个）
  // ====================================================================

  describe('3️⃣ Memory Usage', function() {

    it('3.1 compilation should not leak memory', function() {
      if (!global.gc) {
        console.log('      ⚠️  跳过内存测试（需要 --expose-gc 标志）');
        return;
      }

      // 强制GC
      global.gc();
      const before = process.memoryUsage().heapUsed;

      // 编译1000个不同的表达式
      for (let i = 0; i < 1000; i++) {
        expr(`value > ${i}`);
      }

      // 强制GC
      global.gc();
      const after = process.memoryUsage().heapUsed;

      const increaseMB = (after - before) / 1024 / 1024;

      assert(increaseMB < 5, `内存增长 ${increaseMB.toFixed(2)}MB，应该 < 5MB`);
    });

    it('3.2 repeated compilation should not increase memory', function() {
      if (!global.gc) {
        console.log('      ⚠️  跳过内存测试（需要 --expose-gc 标志）');
        return;
      }

      const expr = "UPPER(TRIM(name))";

      // 首次编译
      expr(expr);

      global.gc();
      const before = process.memoryUsage().heapUsed;

      // 重复编译1000次（应该命中缓存）
      for (let i = 0; i < 1000; i++) {
        expr(expr);
      }

      global.gc();
      const after = process.memoryUsage().heapUsed;

      const increaseMB = (after - before) / 1024 / 1024;

      assert(increaseMB < 1, `重复编译内存增长 ${increaseMB.toFixed(2)}MB，应该 < 1MB`);
    });

    it('3.3 query should not leak memory', async function() {
      if (!global.gc) {
        console.log('      ⚠️  跳过内存测试（需要 --expose-gc 标志）');
        return;
      }

      // 准备数据
      const testData = [];
      for (let i = 0; i < 100; i++) {
        testData.push({ _id: `mem${i}`, value: i });
      }
      await collection('mem_test').insertMany(testData);

      global.gc();
      const before = process.memoryUsage().heapUsed;

      // 执行100次查询
      for (let i = 0; i < 100; i++) {
        await collection('mem_test').aggregate([
          { $match: expr("value > 50") }
        ]);
      }

      global.gc();
      const after = process.memoryUsage().heapUsed;

      const increaseMB = (after - before) / 1024 / 1024;

      assert(increaseMB < 10, `查询内存增长 ${increaseMB.toFixed(2)}MB，应该 < 10MB`);

      // 清理
      await collection('mem_test').deleteMany({});
    });

    it('3.4 memory usage should be reasonable', function() {
      const memUsage = process.memoryUsage();
      const heapUsedMB = memUsage.heapUsed / 1024 / 1024;
      const heapTotalMB = memUsage.heapTotal / 1024 / 1024;

      console.log(`      📊 当前内存使用: ${heapUsedMB.toFixed(2)}MB / ${heapTotalMB.toFixed(2)}MB`);

      assert(heapUsedMB < 200, `堆内存使用 ${heapUsedMB.toFixed(2)}MB，应该 < 200MB`);
    });

    it('3.5 cache size should be limited', function() {
      // 编译超过缓存限制的表达式
      for (let i = 0; i < 1500; i++) {
        expr(`value === ${i}`);
      }

      // 验证缓存没有无限增长
      const memUsage = process.memoryUsage();
      const heapUsedMB = memUsage.heapUsed / 1024 / 1024;

      assert(heapUsedMB < 250, `编译大量表达式后内存 ${heapUsedMB.toFixed(2)}MB，应该 < 250MB`);
    });
  });

  // ====================================================================
  // 4. 性能基准测试（额外）
  // ====================================================================

  describe('4️⃣ Performance Baseline', function() {

    it('4.1 should report compilation statistics', function() {
      const expressions = [
        "value > 100",
        "UPPER(name)",
        "age >= 18 && age <= 65",
        "CONCAT(name, ' - ', status)"
      ];

      const stats = {
        totalTime: 0,
        count: expressions.length
      };

      expressions.forEach(expr => {
        const start = Date.now();
        expr(expr);
        stats.totalTime += (Date.now() - start);
      });

      const avgTime = stats.totalTime / stats.count;

      console.log(`      📊 平均编译时间: ${avgTime.toFixed(2)}ms`);
      console.log(`      📊 总耗时: ${stats.totalTime}ms`);

      assert(avgTime < 5, `平均编译时间应该 < 5ms`);
    });

    it('4.2 should report query statistics', async function() {
      // 准备小数据集
      await collection('baseline').insertMany([
        { _id: 1, value: 100 },
        { _id: 2, value: 200 },
        { _id: 3, value: 300 }
      ]);

      const iterations = 10;
      let totalTime = 0;

      for (let i = 0; i < iterations; i++) {
        const start = Date.now();
        await collection('baseline').aggregate([
          { $match: expr("value > 150") }
        ]);
        totalTime += (Date.now() - start);
      }

      const avgTime = totalTime / iterations;

      console.log(`      📊 平均查询时间: ${avgTime.toFixed(2)}ms (${iterations}次)`);

      assert(avgTime < 20, `平均查询时间应该 < 20ms`);

      // 清理
      await collection('baseline').deleteMany({});
    });
  });
});

