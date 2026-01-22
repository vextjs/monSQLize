/**
 * 验证脚本：expr 操作符支持情况分析
 *
 * 用途：深度分析 monSQLize 项目中已实现和未实现的操作符
 * 执行：node scripts/analysis/verify-expr-operators.js
 */

const { ExpressionCompiler } = require('../../lib/expression');

// 测试表达式列表
const testExpressions = {
  // 算术运算符
  arithmetic: {
    add: 'a + b',
    subtract: 'a - b',
    multiply: 'a * b',
    divide: 'a / b',
    modulo: 'a % b',
    power: 'POW(a, 2)',
    abs: 'ABS(a)',
    ceil: 'CEIL(a)',
    floor: 'FLOOR(a)',
    round: 'ROUND(a)',
    sqrt: 'SQRT(a)',
  },

  // 比较运算符
  comparison: {
    equal: 'a === b',
    notEqual: 'a !== b',
    greaterThan: 'a > b',
    greaterThanOrEqual: 'a >= b',
    lessThan: 'a < b',
    lessThanOrEqual: 'a <= b',
  },

  // 逻辑运算符
  logical: {
    and: 'a > 0 && b < 10',
    or: 'a === 1 || b === 2',
    not: 'NOT(active)',
  },

  // 字符串函数
  string: {
    concat: 'CONCAT(firstName, " ", lastName)',
    upper: 'UPPER(name)',
    lower: 'LOWER(name)',
    trim: 'TRIM(email)',
    substr: 'SUBSTR(text, 0, 10)',
    length: 'LENGTH(name)',
    split: 'SPLIT(tags, ",")',
    replace: 'REPLACE(text, "old", "new")',
    indexOf: 'INDEX_OF_STR(text, "hello")',
    ltrim: 'LTRIM(text)',
    rtrim: 'RTRIM(text)',
    substrCP: 'SUBSTR_CP(text, 0, 5)',
  },

  // 数组函数
  array: {
    size: 'SIZE(tags)',
    first: 'FIRST(items)',
    last: 'LAST(items)',
    slice: 'SLICE(items, 0, 5)',
    arrayElemAt: 'ARRAY_ELEM_AT(items, 0)',
    in: 'IN(value, array)',
    filter: 'FILTER(tags, tag, tag.active === true)',
    map: 'MAP(items, item, item.name)',
    indexOf: 'INDEX_OF(array, value)',
    concatArrays: 'CONCAT_ARRAYS(arr1, arr2)',
  },

  // 聚合函数
  aggregation: {
    sum: 'SUM(amount)',
    avg: 'AVG(score)',
    max: 'MAX(value)',
    min: 'MIN(value)',
    count: 'COUNT()',
    push: 'PUSH(item)',
    addToSet: 'ADD_TO_SET(tag)',
  },

  // 日期函数
  date: {
    year: 'YEAR(createdAt)',
    month: 'MONTH(createdAt)',
    dayOfMonth: 'DAY_OF_MONTH(createdAt)',
    hour: 'HOUR(createdAt)',
    minute: 'MINUTE(createdAt)',
    second: 'SECOND(createdAt)',
  },

  // 条件运算符
  conditional: {
    ternary: 'age > 18 ? "adult" : "minor"',
    nullCoalescing: 'value ?? 0',
    switch: 'SWITCH(status === "active", 1, status === "inactive", 0, -1)',
  },

  // 类型函数
  type: {
    type: 'TYPE(field)',
    isNumber: 'IS_NUMBER(value)',
    isArray: 'IS_ARRAY(tags)',
    exists: 'EXISTS(email)',
  },

  // 高级函数
  advanced: {
    regex: 'REGEX(email, ".*@gmail.com$")',
    mergeObjects: 'MERGE_OBJECTS(obj1, obj2)',
    toInt: 'TO_INT(stringValue)',
    toString: 'TO_STRING(numericValue)',
    objectToArray: 'OBJECT_TO_ARRAY(metadata)',
    arrayToObject: 'ARRAY_TO_OBJECT(pairs)',
    setUnion: 'SET_UNION(set1, set2)',
  },
};

// 未实现的 MongoDB 操作符（参考 operators.js）
const mongodbOperators = {
  // 算术运算符（aggregationExpressionOperators.arithmeticOperators）
  arithmetic: [
    '$abs', '$add', '$ceil', '$divide', '$exp', '$floor', '$ln', '$log',
    '$log10', '$mod', '$multiply', '$pow', '$round', '$sqrt', '$subtract', '$trunc'
  ],

  // 数组运算符
  array: [
    '$arrayElemAt', '$arrayToObject', '$concatArrays', '$filter', '$first', '$in',
    '$indexOfArray', '$isArray', '$last', '$map', '$objectToArray', '$range',
    '$reduce', '$reverseArray', '$size', '$slice', '$zip'
  ],

  // 布尔运算符
  boolean: ['$and', '$not', '$or'],

  // 比较运算符
  comparison: ['$cmp', '$eq', '$gt', '$gte', '$lt', '$lte', '$ne'],

  // 条件运算符
  conditional: ['$cond', '$ifNull', '$switch'],

  // 日期运算符
  date: [
    '$dateAdd', '$dateDiff', '$dateFromParts', '$dateFromString', '$dateSubtract',
    '$dateToParts', '$dateToString', '$dayOfMonth', '$dayOfWeek', '$dayOfYear',
    '$hour', '$isoDayOfWeek', '$isoWeek', '$isoWeekYear', '$millisecond',
    '$minute', '$month', '$second', '$week', '$year'
  ],

  // 字符串运算符
  string: [
    '$concat', '$indexOfBytes', '$indexOfCP', '$ltrim', '$regexFind', '$regexFindAll',
    '$regexMatch', '$replaceAll', '$replaceOne', '$rtrim', '$split', '$strcasecmp',
    '$strLenBytes', '$strLenCP', '$substr', '$substrBytes', '$substrCP', '$toLower',
    '$toUpper', '$trim'
  ],

  // 类型转换运算符
  typeConversion: [
    '$convert', '$toBool', '$toDate', '$toDecimal', '$toDouble', '$toInt',
    '$toLong', '$toObjectId', '$toString', '$type'
  ],

  // 累加器运算符（$group）
  accumulatorGroup: [
    '$accumulator', '$addToSet', '$avg', '$count', '$first', '$last', '$max',
    '$mergeObjects', '$min', '$push', '$stdDevPop', '$stdDevSamp', '$sum'
  ],

  // 累加器运算符（$project）
  accumulatorProject: [
    '$avg', '$max', '$min', '$stdDevPop', '$stdDevSamp', '$sum'
  ],

  // 集合运算符
  set: [
    '$setDifference', '$setEquals', '$setIntersection', '$setIsSubset', '$setUnion'
  ],

  // 对象运算符
  object: [
    '$mergeObjects', '$objectToArray'
  ],
};

// 执行测试
function runTests() {
  const compiler = new ExpressionCompiler({ debug: false });
  const results = {
    supported: {},
    unsupported: {},
    errors: {},
  };

  console.log('========================================');
  console.log('开始验证 expr 操作符支持情况');
  console.log('========================================\n');

  for (const [category, expressions] of Object.entries(testExpressions)) {
    console.log(`\n[${category.toUpperCase()}]`);
    results.supported[category] = [];
    results.unsupported[category] = [];
    results.errors[category] = [];

    for (const [name, exprStr] of Object.entries(expressions)) {
      try {
        const exprObj = { __expr__: exprStr, __compiled__: false };
        const compiled = compiler.compile(exprObj, { context: 'project' });

        console.log(`  ✅ ${name.padEnd(20)} ${exprStr}`);
        results.supported[category].push({ name, expression: exprStr, compiled });
      } catch (error) {
        console.log(`  ❌ ${name.padEnd(20)} ${exprStr}`);
        console.log(`     错误: ${error.message}`);
        results.errors[category].push({ name, expression: exprStr, error: error.message });
      }
    }
  }

  return results;
}

// 分析 MongoDB 操作符映射情况
function analyzeMappings(testResults) {
  console.log('\n========================================');
  console.log('MongoDB 操作符映射分析');
  console.log('========================================\n');

  const mappings = {
    implemented: [],
    notImplemented: [],
  };

  // 从编译结果中提取已实现的 MongoDB 操作符
  const implementedOps = new Set();
  for (const category of Object.values(testResults.supported)) {
    for (const { compiled } of category) {
      extractMongoDBOperators(compiled, implementedOps);
    }
  }

  // 对比所有 MongoDB 操作符
  for (const [category, operators] of Object.entries(mongodbOperators)) {
    console.log(`\n[${category.toUpperCase()}]`);

    for (const op of operators) {
      if (implementedOps.has(op)) {
        console.log(`  ✅ ${op}`);
        mappings.implemented.push(op);
      } else {
        console.log(`  ❌ ${op}`);
        mappings.notImplemented.push(op);
      }
    }
  }

  return mappings;
}

// 递归提取 MongoDB 操作符
function extractMongoDBOperators(obj, operatorSet) {
  if (!obj || typeof obj !== 'object') return;

  if (Array.isArray(obj)) {
    obj.forEach(item => extractMongoDBOperators(item, operatorSet));
    return;
  }

  for (const [key, value] of Object.entries(obj)) {
    if (key.startsWith('$')) {
      operatorSet.add(key);
    }
    extractMongoDBOperators(value, operatorSet);
  }
}

// 生成统计报告
function generateStats(testResults, mappings) {
  console.log('\n========================================');
  console.log('统计报告');
  console.log('========================================\n');

  const totalTests = Object.values(testResults.supported).reduce((sum, arr) => sum + arr.length, 0) +
                     Object.values(testResults.errors).reduce((sum, arr) => sum + arr.length, 0);
  const totalSupported = Object.values(testResults.supported).reduce((sum, arr) => sum + arr.length, 0);
  const totalErrors = Object.values(testResults.errors).reduce((sum, arr) => sum + arr.length, 0);

  const totalMongoOps = mappings.implemented.length + mappings.notImplemented.length;
  const implementedMongoOps = mappings.implemented.length;

  console.log(`测试表达式统计:`);
  console.log(`  总测试数: ${totalTests}`);
  console.log(`  支持: ${totalSupported} (${(totalSupported / totalTests * 100).toFixed(1)}%)`);
  console.log(`  不支持/错误: ${totalErrors} (${(totalErrors / totalTests * 100).toFixed(1)}%)`);

  console.log(`\nMongoDB 操作符统计:`);
  console.log(`  总操作符数: ${totalMongoOps}`);
  console.log(`  已实现: ${implementedMongoOps} (${(implementedMongoOps / totalMongoOps * 100).toFixed(1)}%)`);
  console.log(`  未实现: ${mappings.notImplemented.length} (${(mappings.notImplemented.length / totalMongoOps * 100).toFixed(1)}%)`);

  return {
    tests: { total: totalTests, supported: totalSupported, errors: totalErrors },
    operators: { total: totalMongoOps, implemented: implementedMongoOps, notImplemented: mappings.notImplemented.length },
  };
}

// 主函数
function main() {
  try {
    const testResults = runTests();
    const mappings = analyzeMappings(testResults);
    const stats = generateStats(testResults, mappings);

    console.log('\n✅ 验证完成');
    console.log(`\n详细结果已保存到内存，可用于生成报告`);

    return { testResults, mappings, stats };
  } catch (error) {
    console.error('\n❌ 验证过程中发生错误:', error);
    throw error;
  }
}

// 执行
if (require.main === module) {
  main();
}

module.exports = { main, testExpressions, mongodbOperators };
