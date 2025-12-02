#!/usr/bin/env node
/**
 * MongoDB Server 多版本测试脚本
 * 使用 Docker 启动不同版本的 MongoDB Server 并运行测试
 *
 * 使用方式:
 *   node scripts/test-server-versions.js
 *   node scripts/test-server-versions.js --servers=5.0,6.0,7.0
 *   node scripts/test-server-versions.js --use-memory-server
 *
 * 前置条件:
 *   - 已安装 Docker 和 Docker Compose
 *   - 或使用 --use-memory-server 选项（默认，无需 Docker）
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// 解析命令行参数
const args = process.argv.slice(2);
const serversArg = args.find(arg => arg.startsWith('--servers='));
const useMemoryServer = args.includes('--use-memory-server');

const serverVersions = serversArg
  ? serversArg.split('=')[1].split(',')
  : ['4.4', '5.0', '6.0', '7.0']; // 默认测试版本

console.log('🚀 MongoDB Server 多版本测试脚本\n');

if (useMemoryServer) {
  console.log('⚠️  使用 MongoDB Memory Server 模式');
  console.log('   注意: Memory Server 可能不支持所有特性（如事务、副本集）\n');
} else {
  console.log(`将测试以下 Server 版本: ${serverVersions.join(', ')}`);
  console.log('使用 Docker Compose 启动 MongoDB Server\n');
}

const projectRoot = path.join(__dirname, '..');
const results = [];

// 检查 Docker 是否可用（仅在非 Memory Server 模式）
if (!useMemoryServer) {
  try {
    execSync('docker --version', { stdio: 'ignore' });
    execSync('docker-compose --version', { stdio: 'ignore' });
    console.log('✅ Docker 和 Docker Compose 已就绪\n');
  } catch (e) {
    console.error('❌ 未检测到 Docker 或 Docker Compose');
    console.error('   请安装 Docker Desktop 或使用 --use-memory-server 选项');
    process.exit(1);
  }
}

// Memory Server 模式：直接运行测试
if (useMemoryServer) {
  console.log('🧪 运行 Server 兼容性测试（Memory Server 模式）\n');

  const startTime = Date.now();
  let success = false;
  let error = null;

  try {
    execSync('node test/compatibility/run-server-test.js', {
      cwd: projectRoot,
      stdio: 'inherit'
    });

    success = true;
    console.log('\n✅ Memory Server 测试通过');
  } catch (e) {
    success = false;
    error = e.message;
    console.error('\n❌ Memory Server 测试失败');
  }

  const duration = Date.now() - startTime;

  results.push({
    version: 'Memory Server',
    success,
    duration,
    error,
  });
} else {
  // Docker 模式：测试每个 Server 版本
  for (const version of serverVersions) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`🧪 测试 MongoDB Server ${version}`);
    console.log('='.repeat(60));

    const startTime = Date.now();
    let success = false;
    let error = null;

    try {
      // 1. 启动对应版本的 MongoDB Server
      console.log(`\n🚀 启动 MongoDB ${version}...`);
      execSync(`docker-compose -f test/docker-compose.yml up -d mongo-${version}`, {
        cwd: projectRoot,
        stdio: 'inherit'
      });

      // 2. 等待 MongoDB 启动
      console.log('⏳ 等待 MongoDB 启动（10秒）...');
      execSync('sleep 10', { stdio: 'inherit' });

      // 3. 初始化副本集（事务需要）
      console.log('\n🔧 初始化副本集...');
      try {
        const port = getPortForVersion(version);
        execSync(`docker exec monsqlize-test-mongo-${version} mongosh --eval "rs.initiate()"`, {
          stdio: 'inherit'
        });
        console.log('✅ 副本集初始化成功');
      } catch (e) {
        console.warn('⚠️  副本集初始化失败（可能已初始化）');
      }

      // 4. 运行测试
      console.log('\n🧪 运行兼容性测试...\n');

      // 设置连接字符串环境变量
      const port = getPortForVersion(version);
      process.env.MONGODB_URI = `mongodb://admin:password@localhost:${port}/test?authSource=admin`;

      execSync('node test/compatibility/run-server-test.js', {
        cwd: projectRoot,
        stdio: 'inherit',
        env: process.env
      });

      success = true;
      console.log(`\n✅ MongoDB ${version} 测试通过`);
    } catch (e) {
      success = false;
      error = e.message;
      console.error(`\n❌ MongoDB ${version} 测试失败`);
      console.error(`错误: ${e.message}`);
    } finally {
      // 5. 停止并清理容器
      console.log(`\n🛑 停止 MongoDB ${version}...`);
      try {
        execSync(`docker-compose -f test/docker-compose.yml stop mongo-${version}`, {
          cwd: projectRoot,
          stdio: 'inherit'
        });
        execSync(`docker-compose -f test/docker-compose.yml rm -f mongo-${version}`, {
          cwd: projectRoot,
          stdio: 'inherit'
        });
      } catch (e) {
        console.warn('⚠️  清理容器失败');
      }
    }

    const duration = Date.now() - startTime;

    results.push({
      version,
      success,
      duration,
      error,
    });
  }
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
  console.log(`${status} MongoDB ${result.version} - ${time}s`);
  if (result.error) {
    console.log(`   错误: ${result.error}`);
  }
});

// 保存 JSON 报告
const reportPath = path.join(projectRoot, 'reports', 'monSQLize', `server-compatibility-${Date.now()}.json`);
const reportDir = path.dirname(reportPath);

if (!fs.existsSync(reportDir)) {
  fs.mkdirSync(reportDir, { recursive: true });
}

const report = {
  timestamp: new Date().toISOString(),
  mode: useMemoryServer ? 'memory-server' : 'docker',
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

// 辅助函数：根据版本获取端口
function getPortForVersion(version) {
  const portMap = {
    '4.4': 27017,
    '5.0': 27018,
    '6.0': 27019,
    '7.0': 27020,
  };
  return portMap[version] || 27017;
}

