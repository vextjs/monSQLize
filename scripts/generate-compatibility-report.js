#!/usr/bin/env node
/**
 * 生成兼容性报告脚本
 * 聚合所有兼容性测试结果，生成最终报告
 *
 * 使用方式:
 *   node scripts/generate-compatibility-report.js [results-dir]
 */

const fs = require('fs');
const path = require('path');

// 解析命令行参数
const args = process.argv.slice(2);
const resultsDir = args[0] || path.join(__dirname, '..', 'reports', 'monSQLize');

console.log('📊 生成兼容性报告\n');
console.log(`结果目录: ${resultsDir}\n`);

// 查找所有 JSON 报告文件
const nodeReports = [];
const driverReports = [];
const serverReports = [];

try {
  const files = fs.readdirSync(resultsDir, { recursive: true });

  files.forEach(file => {
    const filePath = path.join(resultsDir, file);

    if (file.endsWith('.json')) {
      try {
        const content = JSON.parse(fs.readFileSync(filePath, 'utf8'));

        if (file.includes('node-compatibility')) {
          nodeReports.push(content);
        } else if (file.includes('driver-compatibility')) {
          driverReports.push(content);
        } else if (file.includes('server-compatibility')) {
          serverReports.push(content);
        }
      } catch (e) {
        // 忽略无效的 JSON 文件
      }
    }
  });
} catch (e) {
  console.error(`⚠️  读取结果目录失败: ${e.message}`);
}

console.log(`找到测试报告:`);
console.log(`  - Node.js: ${nodeReports.length} 个`);
console.log(`  - MongoDB Driver: ${driverReports.length} 个`);
console.log(`  - MongoDB Server: ${serverReports.length} 个`);
console.log('');

// 生成 Markdown 报告
const lines = [];

lines.push('# monSQLize 兼容性测试报告');
lines.push('');
lines.push(`**生成时间**: ${new Date().toISOString()}`);
lines.push(`**测试环境**: ${process.platform} / ${process.arch}`);
lines.push('');
lines.push('---');
lines.push('');

// Node.js 版本测试结果
if (nodeReports.length > 0) {
  lines.push('## Node.js 版本兼容性');
  lines.push('');
  lines.push('| Node.js 版本 | 测试状态 | 耗时 | 备注 |');
  lines.push('|-------------|---------|------|------|');

  const latestReport = nodeReports[nodeReports.length - 1];
  latestReport.results.forEach(result => {
    const status = result.success ? '✅ 通过' : '❌ 失败';
    const duration = `${(result.duration / 1000).toFixed(2)}s`;
    const notes = result.error || '-';
    const version = result.actualVersion || result.requestedVersion;

    lines.push(`| ${version} | ${status} | ${duration} | ${notes} |`);
  });

  lines.push('');
  lines.push(`**测试时间**: ${latestReport.timestamp}`);
  lines.push(`**版本管理器**: ${latestReport.versionManager || 'N/A'}`);
  lines.push('');
}

// MongoDB Driver 测试结果
if (driverReports.length > 0) {
  lines.push('## MongoDB Driver 版本兼容性');
  lines.push('');
  lines.push('| Driver 版本 | 测试状态 | 耗时 | 备注 |');
  lines.push('|------------|---------|------|------|');

  const latestReport = driverReports[driverReports.length - 1];
  latestReport.results.forEach(result => {
    const status = result.success ? '✅ 通过' : '❌ 失败';
    const duration = `${(result.duration / 1000).toFixed(2)}s`;
    const notes = result.error || '-';

    lines.push(`| ${result.version} | ${status} | ${duration} | ${notes} |`);
  });

  lines.push('');
  lines.push(`**测试时间**: ${latestReport.timestamp}`);
  lines.push(`**Node.js**: ${latestReport.node || 'N/A'}`);
  lines.push('');
}

// MongoDB Server 测试结果
if (serverReports.length > 0) {
  lines.push('## MongoDB Server 版本兼容性');
  lines.push('');
  lines.push('| Server 版本 | 测试状态 | 耗时 | 备注 |');
  lines.push('|------------|---------|------|------|');

  const latestReport = serverReports[serverReports.length - 1];
  latestReport.results.forEach(result => {
    const status = result.success ? '✅ 通过' : '❌ 失败';
    const duration = `${(result.duration / 1000).toFixed(2)}s`;
    const notes = result.error || '-';

    lines.push(`| ${result.version} | ${status} | ${duration} | ${notes} |`);
  });

  lines.push('');
  lines.push(`**测试时间**: ${latestReport.timestamp}`);
  lines.push('');
}

// 总结
lines.push('---');
lines.push('');
lines.push('## 📊 总结');
lines.push('');

const allReports = [...nodeReports, ...driverReports, ...serverReports];
let totalTests = 0;
let totalPassed = 0;
let totalFailed = 0;

allReports.forEach(report => {
  if (report.summary) {
    totalTests += report.summary.total || 0;
    totalPassed += report.summary.passed || 0;
    totalFailed += report.summary.failed || 0;
  }
});

if (totalTests > 0) {
  const passRate = ((totalPassed / totalTests) * 100).toFixed(2);

  lines.push(`- **总测试数**: ${totalTests}`);
  lines.push(`- **通过**: ${totalPassed} (${passRate}%)`);
  lines.push(`- **失败**: ${totalFailed}`);
  lines.push('');

  if (totalFailed === 0) {
    lines.push('✅ **所有测试通过！**');
  } else {
    lines.push(`⚠️ **${totalFailed} 个测试失败，请查看详细报告**`);
  }
} else {
  lines.push('ℹ️ 暂无测试结果');
}

lines.push('');
lines.push('---');
lines.push('');
lines.push('**生成工具**: scripts/generate-compatibility-report.js');

// 保存报告
const reportContent = lines.join('\n');
const outputPath = path.join(resultsDir, 'compatibility-report-latest.md');

try {
  fs.writeFileSync(outputPath, reportContent, 'utf8');
  console.log(`\n✅ 报告已生成: ${outputPath}`);

  // 同时生成带时间戳的副本
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T')[0];
  const timestampPath = path.join(resultsDir, `compatibility-report-${timestamp}.md`);
  fs.writeFileSync(timestampPath, reportContent, 'utf8');
  console.log(`✅ 副本已保存: ${timestampPath}`);
} catch (e) {
  console.error(`❌ 保存报告失败: ${e.message}`);
  process.exit(1);
}

// 输出报告到控制台（用于 CI）
console.log('\n' + '='.repeat(60));
console.log('📄 报告预览');
console.log('='.repeat(60));
console.log(reportContent);

process.exit(0);

