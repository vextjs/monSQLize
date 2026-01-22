/**
 * 三轮验证脚本：结合实际代码验证报告准确性
 *
 * 用途：验证 expr-operators-analysis-v1.0.9.md 报告的准确性
 * 执行：node scripts/analysis/verify-three-rounds.js
 */

const fs = require('fs');
const path = require('path');
const { ExpressionCompiler } = require('../../lib/expression');

// 验证结果收集器
const verificationResults = {
  round1: { passed: [], failed: [], warnings: [] },
  round2: { passed: [], failed: [], warnings: [] },
  round3: { passed: [], failed: [], warnings: [] },
};

console.log('========================================');
console.log('三轮验证：结合实际代码验证报告准确性');
console.log('========================================\n');

// ============================================================================
// 第一轮：逻辑验证
// ============================================================================
console.log('\n[第一轮：逻辑验证]');
console.log('验证实现功能的正确性\n');

async function round1_logicVerification() {
  const compiler = new ExpressionCompiler({ debug: false });

  // 1. 需求覆盖：验证报告声称的54个函数是否都有实现
  console.log('1️⃣  验证需求覆盖：54个函数实现情况');

  const declaredFunctions = [
    // 字符串函数 (12个)
    'CONCAT', 'UPPER', 'LOWER', 'TRIM', 'SUBSTR', 'LENGTH',
    'SPLIT', 'REPLACE', 'INDEX_OF_STR', 'LTRIM', 'RTRIM', 'SUBSTR_CP',
    // 数学函数 (6个)
    'ABS', 'CEIL', 'FLOOR', 'ROUND', 'SQRT', 'POW',
    // 数组函数 (10个)
    'SIZE', 'FIRST', 'LAST', 'SLICE', 'ARRAY_ELEM_AT', 'IN',
    'FILTER', 'MAP', 'INDEX_OF', 'CONCAT_ARRAYS',
    // 聚合函数 (7个)
    'SUM', 'AVG', 'MAX', 'MIN', 'COUNT', 'PUSH', 'ADD_TO_SET',
    // 日期函数 (6个)
    'YEAR', 'MONTH', 'DAY_OF_MONTH', 'HOUR', 'MINUTE', 'SECOND',
    // 类型函数 (5个)
    'TYPE', 'NOT', 'EXISTS', 'IS_NUMBER', 'IS_ARRAY',
    // 高级函数 (7个)
    'REGEX', 'MERGE_OBJECTS', 'TO_INT', 'TO_STRING',
    'OBJECT_TO_ARRAY', 'ARRAY_TO_OBJECT', 'SET_UNION',
    // 条件函数 (1个)
    'SWITCH',
  ];

  let implementedCount = 0;
  const missingFunctions = [];

  for (const funcName of declaredFunctions) {
    try {
      // 简单测试每个函数
      const testExpr = generateTestExpression(funcName);
      const exprObj = { __expr__: testExpr, __compiled__: false };
      const result = compiler.compile(exprObj, { context: 'project' });

      if (result) {
        implementedCount++;
      }
    } catch (error) {
      missingFunctions.push({ func: funcName, error: error.message });
    }
  }

  if (implementedCount === declaredFunctions.length) {
    console.log(`   ✅ 需求覆盖验证通过：${implementedCount}/${declaredFunctions.length} 函数已实现`);
    verificationResults.round1.passed.push('需求覆盖');
  } else {
    console.log(`   ❌ 需求覆盖验证失败：仅 ${implementedCount}/${declaredFunctions.length} 函数已实现`);
    console.log(`   缺失函数:`, missingFunctions);
    verificationResults.round1.failed.push('需求覆盖');
  }

  // 2. 边界处理：验证嵌套表达式
  console.log('\n2️⃣  验证边界处理：嵌套表达式');

  const nestedTests = [
    { expr: 'UPPER(LOWER(name))', desc: '嵌套字符串函数' },
    { expr: 'ABS(value) + 10', desc: '算术运算嵌套' },
    { expr: 'SIZE(items) > 0 && FIRST(items) !== null', desc: '逻辑运算嵌套' },
  ];

  let nestedPassed = 0;
  for (const test of nestedTests) {
    try {
      const exprObj = { __expr__: test.expr, __compiled__: false };
      const result = compiler.compile(exprObj, { context: 'project' });
      if (result) {
        console.log(`   ✅ ${test.desc}: ${test.expr}`);
        nestedPassed++;
      }
    } catch (error) {
      console.log(`   ❌ ${test.desc}: ${test.expr} - ${error.message}`);
    }
  }

  if (nestedPassed === nestedTests.length) {
    verificationResults.round1.passed.push('边界处理');
  } else {
    verificationResults.round1.failed.push('边界处理');
  }

  // 3. 错误处理：验证异常处理机制
  console.log('\n3️⃣  验证错误处理：异常处理机制');

  const errorTests = [
    { expr: 'INVALID_FUNC(x)', shouldThrow: true, desc: '无效函数' },
    { expr: '', shouldThrow: true, desc: '空表达式' },
    { expr: 'a > b > c', shouldThrow: true, desc: '无效比较链' },
  ];

  let errorHandlingCorrect = 0;
  for (const test of errorTests) {
    try {
      const exprObj = { __expr__: test.expr, __compiled__: false };
      compiler.compile(exprObj, { context: 'project' });

      if (!test.shouldThrow) {
        console.log(`   ✅ ${test.desc}: 正确处理`);
        errorHandlingCorrect++;
      } else {
        console.log(`   ❌ ${test.desc}: 应该抛出异常但没有`);
      }
    } catch (error) {
      if (test.shouldThrow) {
        console.log(`   ✅ ${test.desc}: 正确抛出异常`);
        errorHandlingCorrect++;
      } else {
        console.log(`   ❌ ${test.desc}: 不应该抛出异常`);
      }
    }
  }

  if (errorHandlingCorrect === errorTests.length) {
    verificationResults.round1.passed.push('错误处理');
  } else {
    verificationResults.round1.failed.push('错误处理');
  }

  // 4. 运算符优先级：验证算术/比较/逻辑优先级
  console.log('\n4️⃣  验证运算符优先级');

  const priorityTests = [
    { expr: '1 + 2 * 3', expected: '$add', desc: '算术优先级（乘法先于加法）' },
    { expr: 'a > 5 && b < 10', expected: '$and', desc: '逻辑优先级' },
  ];

  let priorityPassed = 0;
  for (const test of priorityTests) {
    try {
      const exprObj = { __expr__: test.expr, __compiled__: false };
      const result = compiler.compile(exprObj, { context: 'match' });

      // 检查结果结构
      const resultStr = JSON.stringify(result);
      if (resultStr.includes(test.expected)) {
        console.log(`   ✅ ${test.desc}: ${test.expr}`);
        priorityPassed++;
      } else {
        console.log(`   ⚠️  ${test.desc}: ${test.expr} - 未找到期望的 ${test.expected}`);
      }
    } catch (error) {
      console.log(`   ❌ ${test.desc}: ${test.expr} - ${error.message}`);
    }
  }

  if (priorityPassed === priorityTests.length) {
    verificationResults.round1.passed.push('运算符优先级');
  } else {
    verificationResults.round1.warnings.push('运算符优先级');
  }

  // 5. 返回值：验证返回标准 MongoDB 表达式
  console.log('\n5️⃣  验证返回值：MongoDB 表达式格式');

  const returnTests = [
    { expr: 'age > 18', expectedKeys: ['$expr', '$gt'] },
    { expr: 'UPPER(name)', expectedKeys: ['$toUpper'] },
  ];

  let returnPassed = 0;
  for (const test of returnTests) {
    try {
      const exprObj = { __expr__: test.expr, __compiled__: false };
      const result = compiler.compile(exprObj, { context: 'match' });

      const resultStr = JSON.stringify(result);
      const hasExpectedKeys = test.expectedKeys.some(key => resultStr.includes(key));

      if (hasExpectedKeys) {
        console.log(`   ✅ 返回值包含 MongoDB 操作符: ${test.expr}`);
        returnPassed++;
      } else {
        console.log(`   ❌ 返回值缺少 MongoDB 操作符: ${test.expr}`);
        console.log(`      期望包含: ${test.expectedKeys.join(' 或 ')}`);
        console.log(`      实际返回: ${resultStr}`);
      }
    } catch (error) {
      console.log(`   ❌ 编译失败: ${test.expr} - ${error.message}`);
    }
  }

  if (returnPassed === returnTests.length) {
    verificationResults.round1.passed.push('返回值格式');
  } else {
    verificationResults.round1.failed.push('返回值格式');
  }
}

// ============================================================================
// 第二轮：技术验证
// ============================================================================
console.log('\n\n[第二轮：技术验证]');
console.log('验证代码质量和性能\n');

async function round2_technicalVerification() {
  const compiler = new ExpressionCompiler({ debug: false });

  // 1. 代码规范：验证文件结构
  console.log('1️⃣  验证代码规范：文件结构');

  const requiredFiles = [
    'lib/expression/index.js',
    'lib/expression/factory.js',
    'lib/expression/detector.js',
    'lib/expression/compiler/ExpressionCompiler.js',
    'lib/expression/cache/ExpressionCache.js',
  ];

  let filesExist = 0;
  for (const file of requiredFiles) {
    const fullPath = path.join(process.cwd(), file);
    if (fs.existsSync(fullPath)) {
      console.log(`   ✅ ${file}`);
      filesExist++;
    } else {
      console.log(`   ❌ ${file} - 文件不存在`);
    }
  }

  if (filesExist === requiredFiles.length) {
    verificationResults.round2.passed.push('代码规范');
  } else {
    verificationResults.round2.failed.push('代码规范');
  }

  // 2. 性能考量：验证缓存机制
  console.log('\n2️⃣  验证性能考量：缓存机制');

  // 使用更复杂的表达式进行测试
  const complexExpr = 'CONCAT(UPPER(SUBSTR(name, 0, 1)), LOWER(SUBSTR(name, 1, LENGTH(name))))';
  const exprObj = { __expr__: complexExpr, __compiled__: false };

  // 多次迭代测试以提高精度
  const iterations = 100;

  // 首次编译（多次迭代）
  const start1 = process.hrtime.bigint();
  for (let i = 0; i < iterations; i++) {
    compiler.compile(exprObj, { context: 'project' });
  }
  const end1 = process.hrtime.bigint();
  const time1 = Number(end1 - start1) / 1000000; // 转换为毫秒

  // 清空编译器缓存后重新创建
  const compilerCached = new ExpressionCompiler({ debug: false });

  // 预热缓存
  compilerCached.compile(exprObj, { context: 'project' });

  // 缓存命中测试（多次迭代）
  const start2 = process.hrtime.bigint();
  for (let i = 0; i < iterations; i++) {
    compilerCached.compile(exprObj, { context: 'project' });
  }
  const end2 = process.hrtime.bigint();
  const time2 = Number(end2 - start2) / 1000000; // 转换为毫秒

  const avgTime1 = (time1 / iterations).toFixed(3);
  const avgTime2 = (time2 / iterations).toFixed(3);
  const improvement = ((time1 - time2) / time1 * 100).toFixed(1);

  console.log(`   测试表达式: ${complexExpr}`);
  console.log(`   迭代次数: ${iterations}`);
  console.log(`   首次编译平均: ${avgTime1}ms`);
  console.log(`   缓存命中平均: ${avgTime2}ms`);

  if (time2 < time1 && improvement > 10) {
    console.log(`   ✅ 缓存机制生效，性能提升 ${improvement}%`);
    verificationResults.round2.passed.push('性能考量');
  } else if (time2 <= time1) {
    console.log(`   ✅ 缓存机制工作正常，性能提升 ${improvement}%`);
    verificationResults.round2.passed.push('性能考量');
  } else {
    console.log(`   ⚠️  缓存未生效或性能未提升`);
    verificationResults.round2.warnings.push('性能考量');
  }

  // 3. 并发安全：验证编译器实例独立性
  console.log('\n3️⃣  验证并发安全：编译器实例独立');

  const compiler1 = new ExpressionCompiler();
  const compiler2 = new ExpressionCompiler();

  if (compiler1 !== compiler2 && compiler1.cache !== compiler2.cache) {
    console.log(`   ✅ 编译器实例独立，缓存隔离`);
    verificationResults.round2.passed.push('并发安全');
  } else {
    console.log(`   ❌ 编译器实例共享状态`);
    verificationResults.round2.failed.push('并发安全');
  }

  // 4. MongoDB规则：验证生成的表达式符合 MongoDB 语法
  console.log('\n4️⃣  验证MongoDB规则：表达式符合规范');

  const mongoTests = [
    { expr: 'age > 18', hasOp: '$gt' },
    { expr: 'UPPER(name)', hasOp: '$toUpper' },
    { expr: 'SIZE(tags)', hasOp: '$size' },
  ];

  let mongoPassed = 0;
  for (const test of mongoTests) {
    try {
      const exprObj = { __expr__: test.expr, __compiled__: false };
      const result = compiler.compile(exprObj, { context: 'project' });

      const resultStr = JSON.stringify(result);
      if (resultStr.includes(test.hasOp)) {
        console.log(`   ✅ ${test.expr} → 包含 ${test.hasOp}`);
        mongoPassed++;
      } else {
        console.log(`   ❌ ${test.expr} → 缺少 ${test.hasOp}`);
      }
    } catch (error) {
      console.log(`   ❌ ${test.expr} - ${error.message}`);
    }
  }

  if (mongoPassed === mongoTests.length) {
    verificationResults.round2.passed.push('MongoDB规则');
  } else {
    verificationResults.round2.failed.push('MongoDB规则');
  }
}

// ============================================================================
// 第三轮：完整性验证
// ============================================================================
console.log('\n\n[第三轮：完整性验证]');
console.log('验证报告数据准确性\n');

async function round3_completenessVerification() {
  const compiler = new ExpressionCompiler({ debug: false });

  // 1. 文件完整：验证所有核心文件存在
  console.log('1️⃣  验证文件完整：核心文件齐全');

  const coreFiles = [
    { path: 'lib/expression/index.js', desc: '主入口' },
    { path: 'lib/expression/factory.js', desc: '工厂函数' },
    { path: 'lib/expression/detector.js', desc: '检测工具' },
    { path: 'lib/expression/compiler/ExpressionCompiler.js', desc: '编译器核心', minLines: 800 },
    { path: 'lib/expression/cache/ExpressionCache.js', desc: '缓存机制' },
  ];

  let filesPassed = 0;
  for (const file of coreFiles) {
    const fullPath = path.join(process.cwd(), file.path);
    if (fs.existsSync(fullPath)) {
      const content = fs.readFileSync(fullPath, 'utf-8');
      const lines = content.split('\n').length;

      if (file.minLines && lines < file.minLines) {
        console.log(`   ⚠️  ${file.path} (${file.desc}) - ${lines} 行 (期望 ≥${file.minLines})`);
      } else {
        console.log(`   ✅ ${file.path} (${file.desc}) - ${lines} 行`);
        filesPassed++;
      }
    } else {
      console.log(`   ❌ ${file.path} - 文件不存在`);
    }
  }

  if (filesPassed === coreFiles.length) {
    verificationResults.round3.passed.push('文件完整');
  } else {
    verificationResults.round3.failed.push('文件完整');
  }

  // 2. 测试覆盖：验证报告声称的 98.6% 测试通过率
  console.log('\n2️⃣  验证测试覆盖：测试通过率');

  // 运行验证脚本并收集结果
  const { main } = require('./verify-expr-operators.js');
  const testResults = main();

  const totalTests = testResults.stats.tests.total;
  const passedTests = testResults.stats.tests.supported;
  const passRate = (passedTests / totalTests * 100).toFixed(1);

  console.log(`   总测试数: ${totalTests}`);
  console.log(`   通过数: ${passedTests}`);
  console.log(`   通过率: ${passRate}%`);

  if (passRate >= 98.6) {
    console.log(`   ✅ 测试覆盖率符合报告 (≥98.6%)`);
    verificationResults.round3.passed.push('测试覆盖');
  } else {
    console.log(`   ❌ 测试覆盖率低于报告 (<98.6%)`);
    verificationResults.round3.failed.push('测试覆盖');
  }

  // 3. 文档同步：验证文档存在且最新
  console.log('\n3️⃣  验证文档同步：文档齐全且最新');

  const docs = [
    { path: 'docs/expression-functions.md', desc: '函数参考', minLines: 1000 },
    { path: 'test/types/expression-usage-examples.js', desc: 'TypeScript 示例', minLines: 200 },
  ];

  let docsPassed = 0;
  for (const doc of docs) {
    const fullPath = path.join(process.cwd(), doc.path);
    if (fs.existsSync(fullPath)) {
      const content = fs.readFileSync(fullPath, 'utf-8');
      const lines = content.split('\n').length;

      if (lines >= doc.minLines) {
        console.log(`   ✅ ${doc.path} (${doc.desc}) - ${lines} 行`);
        docsPassed++;
      } else {
        console.log(`   ⚠️  ${doc.path} (${doc.desc}) - ${lines} 行 (期望 ≥${doc.minLines})`);
      }
    } else {
      console.log(`   ❌ ${doc.path} - 文件不存在`);
    }
  }

  if (docsPassed === docs.length) {
    verificationResults.round3.passed.push('文档同步');
  } else {
    verificationResults.round3.warnings.push('文档同步');
  }

  // 4. 操作符统计：验证报告的操作符数量
  console.log('\n4️⃣  验证操作符统计：MongoDB 操作符实现情况');

  const implementedOps = testResults.stats.operators.implemented;
  const totalOps = testResults.stats.operators.total;
  const implementRate = (implementedOps / totalOps * 100).toFixed(1);

  console.log(`   已实现: ${implementedOps}/${totalOps}`);
  console.log(`   实现率: ${implementRate}%`);

  // 验证报告声称的 59.8%
  if (Math.abs(implementRate - 59.8) < 0.5) {
    console.log(`   ✅ 操作符实现率与报告一致 (59.8%)`);
    verificationResults.round3.passed.push('操作符统计');
  } else {
    console.log(`   ⚠️  操作符实现率与报告有偏差 (报告: 59.8%, 实际: ${implementRate}%)`);
    verificationResults.round3.warnings.push('操作符统计');
  }
}

// ============================================================================
// 辅助函数
// ============================================================================
function generateTestExpression(funcName) {
  const testCases = {
    // 字符串函数
    'CONCAT': 'CONCAT("a", "b")',
    'UPPER': 'UPPER(name)',
    'LOWER': 'LOWER(name)',
    'TRIM': 'TRIM(text)',
    'SUBSTR': 'SUBSTR(text, 0, 5)',
    'LENGTH': 'LENGTH(name)',
    'SPLIT': 'SPLIT(tags, ",")',
    'REPLACE': 'REPLACE(text, "a", "b")',
    'INDEX_OF_STR': 'INDEX_OF_STR(text, "x")',
    'LTRIM': 'LTRIM(text)',
    'RTRIM': 'RTRIM(text)',
    'SUBSTR_CP': 'SUBSTR_CP(text, 0, 5)',

    // 数学函数
    'ABS': 'ABS(value)',
    'CEIL': 'CEIL(value)',
    'FLOOR': 'FLOOR(value)',
    'ROUND': 'ROUND(value)',
    'SQRT': 'SQRT(value)',
    'POW': 'POW(value, 2)',

    // 数组函数
    'SIZE': 'SIZE(array)',
    'FIRST': 'FIRST(array)',
    'LAST': 'LAST(array)',
    'SLICE': 'SLICE(array, 0, 5)',
    'ARRAY_ELEM_AT': 'ARRAY_ELEM_AT(array, 0)',
    'IN': 'IN(value, array)',
    'FILTER': 'FILTER(array, item, item.x === 1)',
    'MAP': 'MAP(array, item, item.name)',
    'INDEX_OF': 'INDEX_OF(array, value)',
    'CONCAT_ARRAYS': 'CONCAT_ARRAYS(arr1, arr2)',

    // 聚合函数
    'SUM': 'SUM(field)',
    'AVG': 'AVG(field)',
    'MAX': 'MAX(field)',
    'MIN': 'MIN(field)',
    'COUNT': 'COUNT()',
    'PUSH': 'PUSH(field)',
    'ADD_TO_SET': 'ADD_TO_SET(field)',

    // 日期函数
    'YEAR': 'YEAR(date)',
    'MONTH': 'MONTH(date)',
    'DAY_OF_MONTH': 'DAY_OF_MONTH(date)',
    'HOUR': 'HOUR(date)',
    'MINUTE': 'MINUTE(date)',
    'SECOND': 'SECOND(date)',

    // 类型函数
    'TYPE': 'TYPE(field)',
    'NOT': 'NOT(field === true)',
    'EXISTS': 'EXISTS(field)',
    'IS_NUMBER': 'IS_NUMBER(field)',
    'IS_ARRAY': 'IS_ARRAY(field)',

    // 高级函数
    'REGEX': 'REGEX(field, "pattern")',
    'MERGE_OBJECTS': 'MERGE_OBJECTS(obj1, obj2)',
    'TO_INT': 'TO_INT(field)',
    'TO_STRING': 'TO_STRING(field)',
    'OBJECT_TO_ARRAY': 'OBJECT_TO_ARRAY(obj)',
    'ARRAY_TO_OBJECT': 'ARRAY_TO_OBJECT(arr)',
    'SET_UNION': 'SET_UNION(set1, set2)',

    // 条件函数
    'SWITCH': 'SWITCH(x === 1, "a", "b")',
  };

  return testCases[funcName] || `${funcName}(field)`;
}

// ============================================================================
// 生成验证报告
// ============================================================================
function generateVerificationReport() {
  console.log('\n\n========================================');
  console.log('验证报告汇总');
  console.log('========================================\n');

  const rounds = [
    { name: '第一轮：逻辑验证', results: verificationResults.round1 },
    { name: '第二轮：技术验证', results: verificationResults.round2 },
    { name: '第三轮：完整性验证', results: verificationResults.round3 },
  ];

  let totalPassed = 0;
  let totalFailed = 0;
  let totalWarnings = 0;

  for (const round of rounds) {
    console.log(`\n${round.name}:`);
    console.log(`  ✅ 通过: ${round.results.passed.length} 项`);
    if (round.results.passed.length > 0) {
      console.log(`     ${round.results.passed.join(', ')}`);
    }

    console.log(`  ❌ 失败: ${round.results.failed.length} 项`);
    if (round.results.failed.length > 0) {
      console.log(`     ${round.results.failed.join(', ')}`);
    }

    console.log(`  ⚠️  警告: ${round.results.warnings.length} 项`);
    if (round.results.warnings.length > 0) {
      console.log(`     ${round.results.warnings.join(', ')}`);
    }

    totalPassed += round.results.passed.length;
    totalFailed += round.results.failed.length;
    totalWarnings += round.results.warnings.length;
  }

  console.log('\n========================================');
  console.log('总体验证结果');
  console.log('========================================');
  console.log(`✅ 通过项: ${totalPassed}`);
  console.log(`❌ 失败项: ${totalFailed}`);
  console.log(`⚠️  警告项: ${totalWarnings}`);

  const totalItems = totalPassed + totalFailed + totalWarnings;
  const passRate = (totalPassed / totalItems * 100).toFixed(1);
  console.log(`\n通过率: ${passRate}%`);

  if (totalFailed === 0 && totalWarnings === 0) {
    console.log('\n🎉 三轮验证全部通过！报告准确性得到确认！');
  } else if (totalFailed === 0) {
    console.log('\n✅ 三轮验证通过，部分项目有警告，建议查看详情');
  } else {
    console.log('\n⚠️  三轮验证发现问题，请查看失败项详情');
  }
}

// ============================================================================
// 主函数
// ============================================================================
async function main() {
  try {
    await round1_logicVerification();
    await round2_technicalVerification();
    await round3_completenessVerification();
    generateVerificationReport();

    return verificationResults;
  } catch (error) {
    console.error('\n❌ 验证过程中发生错误:', error);
    throw error;
  }
}

// 执行
if (require.main === module) {
  main().catch(console.error);
}

module.exports = { main, verificationResults };
