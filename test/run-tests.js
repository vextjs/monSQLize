/**
 * 简单的测试运行器
 * 用于运行 findPage 测试套件
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

global.before = function(fn) {
  global.__beforeHook = fn;
};

global.after = function(fn) {
  global.__afterHook = fn;
};

// 运行测试
async function runTests() {
  console.log('\n╔═══════════════════════════════════════════════════════════╗');
  console.log('║            运行 findPage 方法测试套件                    ║');
  console.log('╚═══════════════════════════════════════════════════════════╝\n');

  const startTime = Date.now();
  let passed = 0;
  let failed = 0;
  const tests = [];

  // 收集所有测试
  const originalIt = global.it;
  global.it = function(name, fn) {
    tests.push({ name, fn });
  };

  // 加载测试文件
  require('./findPage.test.js');

  // 恢复 it 函数
  global.it = originalIt;

  // 运行 before 钩子
  if (global.__beforeHook) {
    try {
      console.log('🔧 执行测试前准备...\n');
      await global.__beforeHook();
    } catch (error) {
      console.error('❌ 测试前准备失败:', error.message);
      process.exit(1);
    }
  }

  // 运行所有测试
  const failedTests = [];
  for (const test of tests) {
    try {
      await test.fn();
      passed++;
    } catch (error) {
      failed++;
      failedTests.push({ name: test.name, error });
    }
  }

  // 运行 after 钩子
  if (global.__afterHook) {
    try {
      await global.__afterHook();
    } catch (error) {
      console.error('\n❌ 测试清理失败:', error.message);
    }
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
    failedTests.forEach(({ name, error }) => {
      console.log(`  ✗ ${name}`);
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
  process.exit(1);
});
