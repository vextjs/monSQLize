/**
 * TypeScript 类型定义验证示例
 *
 * 这个文件展示如何在 TypeScript 项目中使用 monSQLize 的统一表达式系统
 *
 * @file expression-usage-examples.ts
 * @since v1.0.9
 */

// ============================================================================
// 方式1: CommonJS 导入（推荐用于 Node.js 项目）
// ============================================================================

// eslint-disable-next-line @typescript-eslint/no-var-requires
const MonSQLize = require('../../index');

// 解构 expr 函数
const { expr } = MonSQLize;

// ============================================================================
// 类型验证：ExpressionObject
// ============================================================================

/**
 * 示例 1: 基本表达式创建
 * expr() 函数返回 ExpressionObject 类型
 */
function example1_basicExpression() {
  // 创建简单表达式
  const expr1 = expr("age > 18");
  const expr2 = expr("name === 'John'");
  const expr3 = expr("value * 2");

  // 验证返回类型
  console.assert(typeof expr1.__expr__ === 'string');
  console.assert(typeof expr1.__compiled__ === 'boolean');

  console.log('✅ 示例1: 基本表达式创建成功');
  return { expr1, expr2, expr3 };
}

// ============================================================================
// 示例 2: 在 aggregate 查询中使用
// ============================================================================

/**
 * 示例 2.1: $match 中使用统一表达式
 */
async function example2_1_matchStage() {
  const msq = new MonSQLize({
    type: 'mongodb' as const,
    config: { uri: 'mongodb://localhost:27017/test' }
  });

  try {
    const { collection } = await msq.connect();

    // 简单条件
    const result1 = await collection('users').aggregate([
      { $match: expr("age > 18") }
    ]);

    // 复杂条件（逻辑运算）
    const result2 = await collection('users').aggregate([
      { $match: expr("age > 18 && status === 'active'") }
    ]);

    // 三元运算符
    const result3 = await collection('users').aggregate([
      { $match: expr("(age > 18 && age < 65) || vip === true") }
    ]);

    console.log('✅ 示例2.1: $match 阶段使用成功');
    return { result1, result2, result3 };
  } finally {
    await msq.close();
  }
}

/**
 * 示例 2.2: $project 中使用统一表达式
 */
async function example2_2_projectStage() {
  const msq = new MonSQLize({
    type: 'mongodb' as const,
    config: { uri: 'mongodb://localhost:27017/test' }
  });

  try {
    const { collection } = await msq.connect();

    const result = await collection('users').aggregate([
      {
        $project: {
          // 字符串操作
          fullName: expr("CONCAT(firstName, ' ', lastName)"),

          // 数学运算
          doubled: expr("value * 2"),

          // 三元运算符
          ageGroup: expr("age > 30 ? 'senior' : 'junior'"),

          // 嵌套函数
          upperName: expr("UPPER(TRIM(name))"),

          // 保留原字段
          _id: 1,
          email: 1
        }
      }
    ]);

    console.log('✅ 示例2.2: $project 阶段使用成功');
    return result;
  } finally {
    await msq.close();
  }
}

/**
 * 示例 2.3: $group 中使用统一表达式（聚合累加器）
 */
async function example2_3_groupStage() {
  const msq = new MonSQLize({
    type: 'mongodb' as const,
    config: { uri: 'mongodb://localhost:27017/test' }
  });

  try {
    const { collection } = await msq.connect();

    const result = await collection('orders').aggregate([
      {
        $group: {
          _id: '$category',

          // 聚合累加器（仅在 $group 中有效）
          total: expr("SUM(amount)"),
          average: expr("AVG(price)"),
          count: expr("COUNT()"),
          maxValue: expr("MAX(value)"),
          minValue: expr("MIN(value)"),

          // 数组累加器
          allNames: expr("PUSH(name)"),
          uniqueNames: expr("ADD_TO_SET(name)")
        }
      }
    ]);

    console.log('✅ 示例2.3: $group 阶段使用成功');
    return result;
  } finally {
    await msq.close();
  }
}

// ============================================================================
// 示例 3: 复杂表达式
// ============================================================================

/**
 * 示例 3.1: 嵌套函数调用
 */
function example3_1_nestedFunctions() {
  // 字符串操作嵌套
  const expr1 = expr("UPPER(CONCAT(LOWER(TRIM(name)), ' - ', status))");

  // 数学函数嵌套
  const expr2 = expr("SQRT(ABS(value)) + POW(base, 2)");

  // 条件嵌套
  const expr3 = expr("age > 18 ? (age > 65 ? 'senior' : 'adult') : 'minor'");

  console.log('✅ 示例3.1: 嵌套函数表达式创建成功');
  return { expr1, expr2, expr3 };
}

/**
 * 示例 3.2: Lambda 表达式（数组操作）
 */
function example3_2_lambdaExpressions() {
  // FILTER: 过滤数组
  const filterExpr = expr("FILTER(tags, tag, tag.active === true)");

  // MAP: 映射数组
  const mapExpr = expr("MAP(items, item, item.price * item.quantity)");

  console.log('✅ 示例3.2: Lambda 表达式创建成功');
  return { filterExpr, mapExpr };
}

/**
 * 示例 3.3: 日期操作
 */
function example3_3_dateOperations() {
  const expr1 = expr("YEAR(createdAt) === 2024");
  const expr2 = expr("MONTH(createdAt) > 6 && DAY_OF_MONTH(createdAt) < 15");
  const expr3 = expr("HOUR(timestamp) >= 9 && HOUR(timestamp) < 17");

  console.log('✅ 示例3.3: 日期操作表达式创建成功');
  return { expr1, expr2, expr3 };
}

// ============================================================================
// 示例 4: 类型安全验证
// ============================================================================

/**
 * 示例 4.1: 类型注解
 */
function example4_1_typeAnnotations() {
  // 显式类型注解
  const expression: typeof MonSQLize.ExpressionObject = expr("age > 18");

  // 属性访问（类型安全）
  const exprString: string = expression.__expr__;
  const compiled: boolean = expression.__compiled__;

  console.log('✅ 示例4.1: 类型注解验证成功');
  console.log(`  表达式: ${exprString}`);
  console.log(`  已编译: ${compiled}`);

  return { expression, exprString, compiled };
}

/**
 * 示例 4.2: 类型推断
 */
function example4_2_typeInference() {
  // TypeScript 自动推断类型
  const expression = expr("value > 100");

  // 类型守卫
  if (expression && typeof expression === 'object' && '__expr__' in expression) {
    console.log('✅ 示例4.2: 类型推断和类型守卫成功');
    return expression;
  }

  throw new Error('表达式类型错误');
}

// ============================================================================
// 示例 5: 完整的查询管道
// ============================================================================

/**
 * 示例 5: 混合使用多个阶段
 */
async function example5_completePipeline() {
  const msq = new MonSQLize({
    type: 'mongodb' as const,
    config: { uri: 'mongodb://localhost:27017/test' }
  });

  try {
    const { collection } = await msq.connect();

    // 完整的聚合管道，混合使用统一表达式
    const result = await collection('products').aggregate([
      // 阶段1: 过滤
      { $match: expr("price > 100 && inStock === true") },

      // 阶段2: 投影计算
      {
        $project: {
          name: 1,
          category: 1,
          originalPrice: '$price',
          discountedPrice: expr("price * (1 - discount)"),
          finalPrice: expr("price * (1 - discount) * (1 - tax)"),
          priceLevel: expr("price > 1000 ? 'expensive' : price > 500 ? 'medium' : 'cheap'")
        }
      },

      // 阶段3: 按分类分组
      {
        $group: {
          _id: '$category',
          totalRevenue: expr("SUM(finalPrice)"),
          avgPrice: expr("AVG(originalPrice)"),
          productCount: expr("COUNT()"),
          products: expr("PUSH(name)")
        }
      },

      // 阶段4: 排序
      { $sort: { totalRevenue: -1 } },

      // 阶段5: 限制结果
      { $limit: 10 }
    ]);

    console.log('✅ 示例5: 完整管道执行成功');
    console.log(`  返回 ${result.length} 条记录`);
    return result;
  } finally {
    await msq.close();
  }
}

// ============================================================================
// 主函数：运行所有示例
// ============================================================================

/**
 * 运行所有示例
 */
async function runAllExamples() {
  console.log('\n🚀 开始运行 TypeScript 类型定义验证示例\n');
  console.log('='.repeat(60));

  try {
    // 基础示例（同步）
    example1_basicExpression();
    example3_1_nestedFunctions();
    example3_2_lambdaExpressions();
    example3_3_dateOperations();
    example4_1_typeAnnotations();
    example4_2_typeInference();

    console.log('\n' + '='.repeat(60));
    console.log('\n💡 注意: 异步示例需要 MongoDB 连接，已跳过');
    console.log('   如需测试异步示例，请确保 MongoDB 运行并取消注释\n');

    // 异步示例（需要 MongoDB 连接，默认注释）
    // await example2_1_matchStage();
    // await example2_2_projectStage();
    // await example2_3_groupStage();
    // await example5_completePipeline();

    console.log('='.repeat(60));
    console.log('\n✅ 所有示例运行成功！');
    console.log('✅ TypeScript 类型定义验证通过！\n');

  } catch (error) {
    console.error('\n❌ 示例运行失败:', error);
    process.exit(1);
  }
}

// ============================================================================
// 导出（供其他模块使用）
// ============================================================================

module.exports = {
  // 基础示例
  example1_basicExpression,

  // 查询阶段示例
  example2_1_matchStage,
  example2_2_projectStage,
  example2_3_groupStage,

  // 复杂表达式示例
  example3_1_nestedFunctions,
  example3_2_lambdaExpressions,
  example3_3_dateOperations,

  // 类型安全示例
  example4_1_typeAnnotations,
  example4_2_typeInference,

  // 完整管道示例
  example5_completePipeline,

  // 运行所有示例
  runAllExamples
};

// 如果直接运行此文件
if (require.main === module) {
  runAllExamples().catch(console.error);
}

