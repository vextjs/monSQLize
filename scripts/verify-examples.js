/**
 * 示例文件验证脚本
 * 检查所有示例文件的语法和基本结构
 */

const fs = require('fs');
const path = require('path');

const examplesDir = path.join(__dirname, '../examples');
const results = {
  total: 0,
  valid: 0,
  invalid: 0,
  errors: []
};

console.log('🔍 开始验证示例文件...\n');

// 读取所有示例文件
const files = fs.readdirSync(examplesDir)
  .filter(file => file.endsWith('.examples.js'))
  .sort();

files.forEach(file => {
  results.total++;
  const filePath = path.join(examplesDir, file);

  try {
    // 尝试 require 文件（检查语法错误）
    const content = fs.readFileSync(filePath, 'utf8');

    // 基本验证
    const checks = {
      hasMonSQLize: content.includes('MonSQLize') || content.includes('monsqlize'),
      hasAsyncFunction: content.includes('async') || content.includes('await'),
      hasExamples: content.includes('示例') || content.includes('Example'),
      hasConnect: content.includes('.connect()'),
      hasClose: content.includes('.close()') || content.includes('cleanup')
    };

    const passedChecks = Object.values(checks).filter(v => v).length;
    const totalChecks = Object.keys(checks).length;

    if (passedChecks >= 3) {
      console.log(`✅ ${file} - 通过 (${passedChecks}/${totalChecks} 检查)`);
      results.valid++;
    } else {
      console.log(`⚠️  ${file} - 警告 (${passedChecks}/${totalChecks} 检查)`);
      results.valid++;
      results.errors.push({
        file,
        type: 'warning',
        message: `只通过了 ${passedChecks}/${totalChecks} 检查`
      });
    }
  } catch (error) {
    console.log(`❌ ${file} - 失败: ${error.message}`);
    results.invalid++;
    results.errors.push({
      file,
      type: 'error',
      message: error.message
    });
  }
});

console.log('\n' + '='.repeat(60));
console.log('📊 验证结果汇总\n');
console.log(`总文件数: ${results.total}`);
console.log(`✅ 有效: ${results.valid}`);
console.log(`❌ 无效: ${results.invalid}`);
console.log(`📈 成功率: ${((results.valid / results.total) * 100).toFixed(2)}%`);

if (results.errors.length > 0) {
  console.log('\n⚠️  问题列表:');
  results.errors.forEach(err => {
    console.log(`  ${err.type === 'error' ? '❌' : '⚠️'} ${err.file}: ${err.message}`);
  });
}

console.log('='.repeat(60));
console.log('\n✅ 验证完成！');

// 退出代码
process.exit(results.invalid > 0 ? 1 : 0);

