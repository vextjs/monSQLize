#!/usr/bin/env node
/**
 * MongoDB Driver 多版本测试脚本（简化版）
 * 使用 mongodb-memory-server 进行快速测试
 *
 * 使用方式:
 *   node scripts/test-driver-versions-simple.js
 *   node scripts/test-driver-versions-simple.js --drivers=5.9.2,6.17.0
 *
 * 特点:
 *   - 使用 mongodb-memory-server，无需真实 MongoDB
 *   - 每个版本独立测试，互不干扰
 *   - 自动清理，不影响项目依赖
 */

const { execSync, spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// 解析命令行参数
const args = process.argv.slice(2);
const driversArg = args.find(arg => arg.startsWith('--drivers='));
const driverVersions = driversArg
  ? driversArg.split('=')[1].split(',')
  : ['4.17.2', '5.9.2', '6.17.0', '7.0.0']; // 默认测试版本（添加 7.0.0）

console.log('🚀 MongoDB Driver 多版本测试脚本（简化版）\n');
console.log('✨ 使用 mongodb-memory-server 进行测试');
console.log(`📋 测试版本: ${driverVersions.join(', ')}\n`);

const projectRoot = path.join(__dirname, '..');
const results = [];

// 测试每个 Driver 版本
for (const version of driverVersions) {
  console.log(`\n${'='.repeat(70)}`);
  console.log(`🧪 测试 MongoDB Driver ${version}`);
  console.log('='.repeat(70));

  const startTime = Date.now();
  let success = false;
  let error = null;
  let testOutput = '';

  try {
    // 1. 安装指定版本的 Driver（临时，到当前目录）
    console.log(`\n📥 临时安装 mongodb@${version}...`);

    const installResult = spawnSync('npm', [
      'install',
      `mongodb@${version}`,
      '--no-save',
      '--legacy-peer-deps'
    ], {
      cwd: projectRoot,
      encoding: 'utf8',
      shell: true
    });

    if (installResult.status !== 0) {
      throw new Error(`安装失败: ${installResult.stderr}`);
    }

    console.log(`✅ mongodb@${version} 安装成功`);

    // 2. 运行兼容性测试
    console.log(`\n🧪 运行兼容性测试...\n`);

    const testResult = spawnSync('node', [
      'test/compatibility/run-driver-test.js'
    ], {
      cwd: projectRoot,
      encoding: 'utf8',
      shell: true,
      env: {
        ...process.env,
        DRIVER_VERSION: version
      }
    });

    testOutput = testResult.stdout + testResult.stderr;

    if (testResult.status === 0) {
      success = true;
      console.log(`\n✅ Driver ${version} 测试通过`);
    } else {
      // 显示失败的详细信息
      console.log(`\n❌ Driver ${version} 测试失败`);
      console.log(`\n📋 测试输出（最后 30 行）:`);
      const lines = testOutput.split('\n');
      const lastLines = lines.slice(-30).join('\n');
      console.log(lastLines);
      throw new Error(`测试失败，退出码: ${testResult.status}`);
    }

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
    testOutput: testOutput.substring(0, 1000) // 保存前1000字符
  });

  // 3. 清理：删除临时安装的 mongodb 包
  console.log(`\n🧹 清理临时文件...`);
  try {
    const nodeModulesMongoDb = path.join(projectRoot, 'node_modules', 'mongodb');
    if (fs.existsSync(nodeModulesMongoDb)) {
      // 注意：这里不删除，因为 --no-save 不会写入 package.json
      console.log('✅ 使用 --no-save，无需清理');
    }
  } catch (e) {
    console.warn('⚠️  清理失败（可忽略）');
  }
}

// 恢复原始依赖（确保使用正确的版本）
console.log('\n\n📦 确保使用正确的依赖版本...');
try {
  execSync('npm install', {
    cwd: projectRoot,
    stdio: 'inherit'
  });
  console.log('✅ 依赖已恢复');
} catch (e) {
  console.error('⚠️  依赖恢复失败，请手动运行 npm install');
}

// 生成报告
console.log('\n\n' + '='.repeat(70));
console.log('📊 测试结果汇总');
console.log('='.repeat(70));

const passed = results.filter(r => r.success).length;
const failed = results.filter(r => !r.success).length;
const total = results.length;

console.log(`\n📈 统计:`);
console.log(`   总测试版本数: ${total}`);
console.log(`   ✅ 通过: ${passed}`);
console.log(`   ❌ 失败: ${failed}`);
console.log(`   通过率: ${((passed / total) * 100).toFixed(1)}%`);
console.log('');

console.log('📋 详细结果:');
results.forEach(result => {
  const status = result.success ? '✅' : '❌';
  const time = (result.duration / 1000).toFixed(2);
  console.log(`   ${status} Driver ${result.version.padEnd(10)} - ${time}s`);
  if (result.error) {
    console.log(`      ⚠️  ${result.error}`);
  }
});

// 保存 JSON 报告
const timestamp = Date.now();
const reportPath = path.join(
  projectRoot,
  'reports',
  'monSQLize',
  `driver-compatibility-${timestamp}.json`
);
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

