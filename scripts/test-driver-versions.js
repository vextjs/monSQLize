#!/usr/bin/env node
/**
 * MongoDB Driver 多版本测试脚本
 * 使用 mongodb-memory-server 临时安装不同版本的 MongoDB Driver 并运行测试
 *
 * 使用方式:
 *   node scripts/test-driver-versions.js
 *   node scripts/test-driver-versions.js --drivers=4.17.2,5.9.2,6.17.0
 *
 * 优势:
 *   - 使用 mongodb-memory-server，无需真实 MongoDB Server
 *   - 自动安装和清理不同版本的 Driver
 *   - 快速测试（每个版本约 2-3 分钟）
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// 解析命令行参数
const args = process.argv.slice(2);
const driversArg = args.find(arg => arg.startsWith('--drivers='));
const driverVersions = driversArg
  ? driversArg.split('=')[1].split(',')
  : ['4.17.2', '5.9.2', '6.17.0']; // 默认测试版本

console.log('🚀 MongoDB Driver 多版本测试脚本\n');
console.log('使用 mongodb-memory-server 进行测试');
console.log(`将测试以下 Driver 版本: ${driverVersions.join(', ')}\n`);

// 备份当前的 package.json 和 package-lock.json
const projectRoot = path.join(__dirname, '..');
const packageJsonPath = path.join(projectRoot, 'package.json');
const packageLockPath = path.join(projectRoot, 'package-lock.json');
const nodeModulesPath = path.join(projectRoot, 'node_modules');

const packageJsonBackup = fs.readFileSync(packageJsonPath, 'utf8');
const packageLockExists = fs.existsSync(packageLockPath);
const packageLockBackup = packageLockExists
  ? fs.readFileSync(packageLockPath, 'utf8')
  : null;

console.log('📦 已备份 package.json 和 package-lock.json\n');

const results = [];

// 测试每个 Driver 版本
for (const version of driverVersions) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`🧪 测试 MongoDB Driver ${version}`);
  console.log('='.repeat(60));

  const startTime = Date.now();
  let success = false;
  let error = null;

  try {
    // 1. 卸载当前的 mongodb 包
    console.log('\n📤 卸载当前 mongodb 包...');
    try {
      execSync('npm uninstall mongodb', {
        cwd: projectRoot,
        stdio: 'inherit'
      });
    } catch (e) {
      // 忽略卸载错误
    }

    // 2. 安装指定版本
    console.log(`\n📥 安装 mongodb@${version}...`);
    execSync(`npm install mongodb@${version} --save-exact --legacy-peer-deps`, {
      cwd: projectRoot,
      stdio: 'inherit'
    });

    // 3. 运行兼容性测试
    console.log(`\n🧪 运行兼容性测试...\n`);
    execSync('node test/compatibility/run-driver-test.js', {
      cwd: projectRoot,
      stdio: 'inherit'
    });

    success = true;
    console.log(`\n✅ Driver ${version} 测试通过`);
  } catch (e) {
    success = false;
    error = e.message;
    console.error(`\n❌ Driver ${version} 测试失败`);
    console.error(`错误: ${e.message}`);
  }

  const duration = Date.now() - startTime;

  results.push({
    version,
    success,
    duration,
    error,
  });
}

// 恢复原始的 package.json 和 package-lock.json
console.log('\n\n📦 恢复原始 package.json...');
fs.writeFileSync(packageJsonPath, packageJsonBackup);

if (packageLockBackup) {
  console.log('📦 恢复原始 package-lock.json...');
  fs.writeFileSync(packageLockPath, packageLockBackup);
}

// 重新安装依赖
console.log('\n📥 恢复原始依赖...');
try {
  execSync('npm install', {
    cwd: projectRoot,
    stdio: 'inherit'
  });
} catch (e) {
  console.error('⚠️  恢复依赖失败，请手动运行 npm install');
}

// 生成报告
console.log('\n\n' + '='.repeat(60));
console.log('📊 测试结果汇总');
console.log('='.repeat(60));

const passed = results.filter(r => r.success).length;
const failed = results.filter(r => !r.success).length;
const total = results.length;

console.log(`\n总测试版本数: ${total}`);
console.log(`✅ 通过: ${passed}`);
console.log(`❌ 失败: ${failed}`);
console.log('');

results.forEach(result => {
  const status = result.success ? '✅' : '❌';
  const time = (result.duration / 1000).toFixed(2);
  console.log(`${status} Driver ${result.version} - ${time}s`);
  if (result.error) {
    console.log(`   错误: ${result.error}`);
  }
});

// 保存 JSON 报告
const reportPath = path.join(projectRoot, 'reports', 'monSQLize', `driver-compatibility-${Date.now()}.json`);
const reportDir = path.dirname(reportPath);

if (!fs.existsSync(reportDir)) {
  fs.mkdirSync(reportDir, { recursive: true });
}

const report = {
  timestamp: new Date().toISOString(),
  node: process.version,
  results,
  summary: {
    total,
    passed,
    failed,
    passRate: ((passed / total) * 100).toFixed(2) + '%',
  },
};

fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
console.log(`\n📄 报告已保存: ${reportPath}`);

// 退出码
process.exit(failed > 0 ? 1 : 0);

