/**
 * 简单的测试运行器
 * 用于运行 find 和 findPage 测试套件
 */

// 简单的测试框架模拟
global.describe = function(name, fn) {
  console.log(`\n📦 ${name}`);
  // 提供一个带有 timeout 方法的上下文对象
  const context = {
    timeout: function(ms) {
      // 暂时忽略超时设置
      return this;
    }
  };
  fn.call(context);
};

global.it = function(name, fn) {
  return new Promise(async (resolve, reject) => {
    try {
      await fn();
      console.log(`  ✓ ${name}`);
      resolve();
    } catch (error) {
      console.error(`  ✗ ${name}`);
      console.error(`    ${error.message}`);
      if (error.stack) {
        console.error(`    ${error.stack.split('\n').slice(1, 3).join('\n    ')}`);
      }
      reject(error);
    }
  });
};

// 改为支持多个钩子
global.__beforeHooks = [];
global.__afterHooks = [];

global.before = function(fn) {
  global.__beforeHooks.push(fn);
};

global.after = function(fn) {
  global.__afterHooks.push(fn);
};

// 运行测试
async function runTests() {
  // 从命令行参数获取要运行的测试套件
  const args = process.argv.slice(2);
  const testSuite = args[0] || 'all'; // 默认运行所有测试

  let testFiles = [];
  let title = '';

  // 注意：测试文件现在按照规范分类到 features/ 和 infrastructure/ 子目录
  if (testSuite === 'connection') {
    testFiles = ['./unit/infrastructure/connection.test.js'];
    title = '连接管理核心测试';
  } else if (testSuite === 'find') {
    testFiles = ['./unit/features/find.test.js'];
    title = 'find 方法测试套件';
  } else if (testSuite === 'findPage') {
    testFiles = ['./unit/features/findPage.test.js'];
    title = 'findPage 方法测试套件';
  } else if (testSuite === 'findPage-supplement' || testSuite === 'findpage-supplement') {
    testFiles = ['./unit/features/findPage-supplement.test.js'];
    title = 'findPage 补充测试套件';
  } else if (testSuite === 'findPage-all' || testSuite === 'findpage-all') {
    testFiles = ['./unit/features/findPage.test.js', './unit/features/findPage-supplement.test.js'];
    title = 'findPage 完整测试套件';
  } else if (testSuite === 'findOne') {
    testFiles = ['./unit/features/findOne.test.js'];
    title = 'findOne 方法测试套件';
  } else if (testSuite === 'count') {
    testFiles = ['./unit/features/count.test.js'];
    title = 'count 方法测试套件';
  } else if (testSuite === 'aggregate') {
    testFiles = ['./unit/features/aggregate.test.js'];
    title = 'aggregate 方法测试套件';
  } else if (testSuite === 'distinct') {
    testFiles = ['./unit/features/distinct.test.js'];
    title = 'distinct 方法测试套件';
  } else if (testSuite === 'utils') {
    testFiles = [
      './unit/utils/cursor.test.js',
      './unit/utils/normalize.test.js',
      './unit/utils/page-result.test.js',
      './unit/utils/shape-builders.test.js'
    ];
    title = '工具函数测试套件';
  } else if (testSuite === 'infrastructure') {
    testFiles = [
      './unit/infrastructure/connection.test.js',
      './unit/infrastructure/cache.test.js',
      './unit/infrastructure/errors.test.js',
      './unit/infrastructure/logger.test.js'
    ];
    title = '基础设施测试套件';
  } else if (testSuite === 'logger') {
    testFiles = ['./unit/infrastructure/logger.test.js'];
    title = '日志系统测试套件';
  } else if (testSuite === 'all') {
    // all 模式：顺序执行各个测试套件，避免并发初始化问题
    console.log('\n╔═══════════════════════════════════════════════════════════╗');
    console.log(`║            运行 所有测试套件（顺序模式）                  ║`);
    console.log('╚═══════════════════════════════════════════════════════════╝\n');

    const suites = ['connection', 'find', 'findPage', 'findOne', 'count', 'aggregate', 'distinct', 'utils', 'infrastructure'];
    let totalPassed = 0;
    let totalFailed = 0;
    const overallStartTime = Date.now();

    for (const suite of suites) {
      console.log(`\n${'─'.repeat(60)}`);
      console.log(`▶ 运行测试套件: ${suite}`);
      console.log('─'.repeat(60) + '\n');

      // 重新启动子进程运行每个测试套件
      const { spawnSync } = require('child_process');
      const result = spawnSync('node', ['test/run-tests.js', suite], {
        cwd: process.cwd(),
        stdio: 'inherit',
        shell: true
      });

      if (result.status !== 0) {
        console.error(`\n❌ 测试套件 ${suite} 失败\n`);
        totalFailed++;
      } else {
        console.log(`\n✅ 测试套件 ${suite} 通过\n`);
        totalPassed++;
      }
    }

    // 输出总体结果
    const overallDuration = Date.now() - overallStartTime;
    console.log('\n' + '═'.repeat(60));
    console.log('所有测试套件汇总');
    console.log('═'.repeat(60));
    console.log(`✓ 通过: ${totalPassed}/${suites.length} 个测试套件`);
    if (totalFailed > 0) {
      console.log(`✗ 失败: ${totalFailed}/${suites.length} 个测试套件`);
    }
    console.log(`⏱  总耗时: ${(overallDuration / 1000).toFixed(2)} 秒`);
    console.log('═'.repeat(60) + '\n');

    process.exit(totalFailed > 0 ? 1 : 0);
  } else {
    console.error(`\n❌ 未知的测试套件: ${testSuite}`);
    console.error('使用方法: node run-tests.js [connection|find|findPage|findPage-supplement|findPage-all|findOne|count|aggregate|distinct|utils|infrastructure|logger|all]\n');
    process.exit(1);
  }

  console.log('\n╔═══════════════════════════════════════════════════════════╗');
  console.log(`║            运行 ${title.padEnd(35)}║`);
  console.log('╚═══════════════════════════════════════════════════════════╝\n');

  const startTime = Date.now();
  let passed = 0;
  let failed = 0;
  const allFailedTests = [];

  // 为每个测试文件独立处理 before/after 钩子
  for (const testFile of testFiles) {
    console.log(`📂 加载测试文件: ${testFile}`);

    // 为每个文件重置钩子和测试
    global.__beforeHooks = [];
    global.__afterHooks = [];
    const tests = [];

    // 收集此文件的测试
    const originalIt = global.it;
    global.it = function(name, fn) {
      tests.push({ name, fn });
    };

    // 加载测试文件
    let moduleExport;
    try {
      moduleExport = require(testFile);
    } catch (error) {
      console.error(`❌ 加载测试文件失败: ${testFile}`);
      console.error(`   ${error.message}`);
      process.exit(1);
    }

    // 如果测试文件导出了 Promise（异步测试），等待它完成
    if (moduleExport && typeof moduleExport.then === 'function') {
      try {
        await moduleExport;
      } catch (error) {
        console.error(`❌ 异步测试执行失败: ${testFile}`);
        console.error(`   ${error.message}`);
        if (error.stack) {
          console.error(error.stack);
        }
        process.exit(1);
      }
      // 异步测试文件已自行执行完毕，跳过下面的 it() 测试
      continue;
    }

    // 恢复 it 函数
    global.it = originalIt;

    // 运行此文件的 before 钩子
    if (global.__beforeHooks.length > 0) {
      try {
        console.log('🔧 执行测试前准备...\n');
        for (const beforeHook of global.__beforeHooks) {
          await beforeHook();
        }
      } catch (error) {
        console.error(`❌ 测试前准备失败 (${testFile}):`, error.message);
        console.error('   详细信息:', error.stack);
        process.exit(1);
      }
    }

    // 运行此文件的所有测试
    for (const test of tests) {
      try {
        await test.fn();
        passed++;
      } catch (error) {
        failed++;
        allFailedTests.push({ name: test.name, error, file: testFile });
      }
    }

    // 运行此文件的 after 钩子
    if (global.__afterHooks.length > 0) {
      try {
        for (const afterHook of global.__afterHooks) {
          await afterHook();
        }
      } catch (error) {
        console.error(`\n⚠️  测试清理警告 (${testFile}):`, error.message);
      }
    }

    // 清理模块缓存，避免下次加载时冲突
    delete require.cache[require.resolve(testFile)];
  }

  // 输出测试结果
  const duration = Date.now() - startTime;
  console.log('\n' + '═'.repeat(60));
  console.log('测试结果汇总');
  console.log('═'.repeat(60));
  console.log(`✓ 通过: ${passed} 个测试`);
  if (failed > 0) {
    console.log(`✗ 失败: ${failed} 个测试`);
    console.log('\n失败的测试:');
    allFailedTests.forEach(({ name, error, file }) => {
      console.log(`  ✗ ${name} (来自 ${file})`);
      console.log(`    ${error.message}`);
    });
  }
  console.log(`⏱  耗时: ${(duration / 1000).toFixed(2)} 秒`);
  console.log('═'.repeat(60) + '\n');

  if (failed > 0) {
    console.log('❌ 测试失败\n');
    process.exit(1);
  } else {
    console.log('✅ 所有测试通过！\n');
    process.exit(0);
  }
}

// 执行测试
runTests().catch(error => {
  console.error('\n❌ 测试运行器出错:', error);
  console.error('错误详情:', error.stack);
  process.exit(1);
});

