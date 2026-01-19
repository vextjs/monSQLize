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
      const expression = expr("PUSH(tag)");

      assert(expression.__expr__);
      assert.strictEqual(expression.__expr__, "PUSH(tag)");
    });

    it('should compile ADD_TO_SET function', function() {
      const { expr } = MonSQLize;
      const expression = expr("ADD_TO_SET(category)");

      assert(expression.__expr__);
      assert.strictEqual(expression.__expr__, "ADD_TO_SET(category)");
    });

    it('should compile COUNT function', function() {
      const { expr } = MonSQLize;
      const expression = expr("COUNT()");

      assert(expression.__expr__);
      assert.strictEqual(expression.__expr__, "COUNT()");
    });

    it('should compile SUM function', function() {
      const { expr } = MonSQLize;
      const expression = expr("SUM(amount)");

      assert(expression.__expr__);
      assert.strictEqual(expression.__expr__, "SUM(amount)");
    });

    it('should compile AVG function', function() {
      const { expr } = MonSQLize;
      const expression = expr("AVG(price)");

      assert(expression.__expr__);
      assert.strictEqual(expression.__expr__, "AVG(price)");
    });

    it('should compile MAX function', function() {
      const { expr } = MonSQLize;
      const expression = expr("MAX(score)");

      assert(expression.__expr__);
      assert.strictEqual(expression.__expr__, "MAX(score)");
    });

    it('should compile MIN function', function() {
      const { expr } = MonSQLize;
      const expression = expr("MIN(value)");

      assert(expression.__expr__);
      assert.strictEqual(expression.__expr__, "MIN(value)");
    });
  });
});



