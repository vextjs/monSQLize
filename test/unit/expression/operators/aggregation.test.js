/**
 * 聚合累加器测试（表达式编译）
 */

const MonSQLize = require('../../../../lib');
const assert = require('assert');

describe('Expression - Aggregation Accumulators', function() {
  this.timeout(30000);

  describe('Aggregation Function Compilation', function() {

    it('should compile PUSH function', function() {
      const { expr } = MonSQLize;
      const expr = expr("PUSH(tag)");

      assert(expr.__expr__);
      assert.strictEqual(expr.__expr__, "PUSH(tag)");
    });

    it('should compile ADD_TO_SET function', function() {
      const { expr } = MonSQLize;
      const expr = expr("ADD_TO_SET(category)");

      assert(expr.__expr__);
      assert.strictEqual(expr.__expr__, "ADD_TO_SET(category)");
    });

    it('should compile COUNT function', function() {
      const { expr } = MonSQLize;
      const expr = expr("COUNT()");

      assert(expr.__expr__);
      assert.strictEqual(expr.__expr__, "COUNT()");
    });

    it('should compile SUM function', function() {
      const { expr } = MonSQLize;
      const expr = expr("SUM(amount)");

      assert(expr.__expr__);
      assert.strictEqual(expr.__expr__, "SUM(amount)");
    });

    it('should compile AVG function', function() {
      const { expr } = MonSQLize;
      const expr = expr("AVG(price)");

      assert(expr.__expr__);
      assert.strictEqual(expr.__expr__, "AVG(price)");
    });

    it('should compile MAX function', function() {
      const { expr } = MonSQLize;
      const expr = expr("MAX(score)");

      assert(expr.__expr__);
      assert.strictEqual(expr.__expr__, "MAX(score)");
    });

    it('should compile MIN function', function() {
      const { expr } = MonSQLize;
      const expr = expr("MIN(value)");

      assert(expr.__expr__);
      assert.strictEqual(expr.__expr__, "MIN(value)");
    });
  });
});



