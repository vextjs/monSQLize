#!/usr/bin/env node
/**
 * Node.js 多版本测试脚本
 * 使用 Volta（推荐）或 nvm 切换 Node.js 版本并运行测试
 *
 * 使用方式:
 *   node scripts/test-node-versions.js
 *   node scripts/test-node-versions.js --versions=14,16,18,20,22
 *   node scripts/test-node-versions.js --manager=volta  (强制使用 volta)
 *   node scripts/test-node-versions.js --manager=nvm    (强制使用 nvm)
 *
 * 前置条件:
 *   - 已安装 Volta (推荐) 或 nvm
 *   - 已安装目标 Node.js 版本
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// 解析命令行参数
const args = process.argv.slice(2);
const versionsArg = args.find(arg => arg.startsWith('--versions='));
const managerArg = args.find(arg => arg.startsWith('--manager='));

const nodeVersions = versionsArg
  ? versionsArg.split('=')[1].split(',')
  : ['14', '16', '18', '20', '22']; // 默认测试版本

const preferredManager = managerArg ? managerArg.split('=')[1] : 'volta';

console.log('🚀 Node.js 多版本测试脚本\n');
console.log(`将测试以下 Node.js 版本: ${nodeVersions.join(', ')}\n`);

// 检测版本管理工具（优先 Volta）
let versionManager = null;

if (preferredManager === 'volta') {
  try {
    const voltaVersion = execSync('volta --version', { encoding: 'utf8' }).trim();
    versionManager = 'volta';
    console.log(`✅ 检测到 Volta ${voltaVersion}\n`);
  } catch (e) {
    console.log('⚠️  未检测到 Volta，尝试使用 nvm...\n');
  }
}

if (!versionManager) {
  try {
    const nvmVersion = execSync('nvm --version', { encoding: 'utf8' }).trim();
    versionManager = 'nvm';
    console.log(`✅ 检测到 nvm ${nvmVersion}\n`);
  } catch (e) {
    if (!versionManager && preferredManager === 'nvm') {
      try {
        const voltaVersion = execSync('volta --version', { encoding: 'utf8' }).trim();
        versionManager = 'volta';
        console.log(`⚠️  未检测到 nvm，使用 Volta ${voltaVersion}\n`);
      } catch (e2) {
        // 两者都不存在
      }
    }
  }
}

if (!versionManager) {
  console.error('❌ 未检测到 Volta 或 nvm，请先安装版本管理工具\n');
  console.error('推荐安装 Volta（更快、更稳定）:');
  console.error('   - Windows: winget install Volta.Volta');
  console.error('   - Linux/macOS: curl https://get.volta.sh | bash');
  console.error('   - 官网: https://volta.sh/\n');
  console.error('或安装 nvm:');
  console.error('   - Windows: https://github.com/coreybutler/nvm-windows');
  console.error('   - Linux/macOS: https://github.com/nvm-sh/nvm');
  process.exit(1);
}

const projectRoot = path.join(__dirname, '..');
const results = [];

// 测试每个 Node.js 版本
for (const version of nodeVersions) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`🧪 测试 Node.js ${version}.x`);
  console.log('='.repeat(60));

  const startTime = Date.now();
  let success = false;
  let error = null;
  let actualVersion = null;

  try {
    // 1. 切换 Node.js 版本
    console.log(`\n🔄 切换到 Node.js ${version}.x...`);

    if (versionManager === 'volta') {
      // Volta 切换（推荐）
      // 先安装指定版本（如果未安装）
      try {
        console.log(`   检查 Node.js ${version}.x 是否已安装...`);
        execSync(`volta install node@${version}`, {
          cwd: projectRoot,
          stdio: 'pipe'  // 静默安装
        });
      } catch (installError) {
        // 忽略安装错误，可能已经安装
      }

      // 使用 volta run 运行测试（不修改全局配置）
      console.log(`   使用 Volta 临时切换到 ${version}.x...`);
    } else if (versionManager === 'nvm') {
      // nvm 切换
      execSync(`nvm use ${version}`, {
        cwd: projectRoot,
        stdio: 'inherit',
        shell: true,
      });
    }

    // 2. 获取实际版本
    let versionCheckCmd = 'node --version';
    if (versionManager === 'volta') {
      // Volta: 使用 volta run 获取版本
      versionCheckCmd = `volta run --node ${version} node --version`;
    }

    actualVersion = execSync(versionCheckCmd, {
      encoding: 'utf8',
      cwd: projectRoot
    }).trim();
    console.log(`✅ 当前 Node.js 版本: ${actualVersion}`);

    // 3. 安装依赖（如果需要）
    const nodeModulesPath = path.join(projectRoot, 'node_modules');
    if (!fs.existsSync(nodeModulesPath)) {
      console.log('\n📥 安装依赖...');
      let installCmd = 'npm install';
      if (versionManager === 'volta') {
        installCmd = `volta run --node ${version} npm install`;
      }
      execSync(installCmd, {
        cwd: projectRoot,
        stdio: 'inherit'
      });
    }

    // 4. 运行兼容性测试
    console.log(`\n🧪 运行兼容性测试...\n`);
    let testCmd = 'node test/compatibility/run-node-test.js';
    if (versionManager === 'volta') {
      testCmd = `volta run --node ${version} ${testCmd}`;
    }

    execSync(testCmd, {
      cwd: projectRoot,
      stdio: 'inherit'
    });

    success = true;
    console.log(`\n✅ Node.js ${version}.x (${actualVersion}) 测试通过`);
  } catch (e) {
    success = false;
    error = e.message;
    console.error(`\n❌ Node.js ${version}.x 测试失败`);
    console.error(`错误: ${e.message}`);
  }

  const duration = Date.now() - startTime;

  results.push({
    requestedVersion: `${version}.x`,
    actualVersion,
    success,
    duration,
    error,
  });
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
  const version = result.actualVersion || result.requestedVersion;
  console.log(`${status} Node.js ${version} - ${time}s`);
  if (result.error) {
    console.log(`   错误: ${result.error}`);
  }
});

// 保存 JSON 报告
const reportPath = path.join(projectRoot, 'reports', 'monSQLize', `node-compatibility-${Date.now()}.json`);
const reportDir = path.dirname(reportPath);

if (!fs.existsSync(reportDir)) {
  fs.mkdirSync(reportDir, { recursive: true });
}

const report = {
  timestamp: new Date().toISOString(),
  versionManager,
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

