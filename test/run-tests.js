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

      if (testSuite === 'connection') {
    testFiles = ['./connection-simple.test.js'];
    title = '连接管理核心测试';
  } else if (testSuite === 'find') {
    testFiles = ['./find.test.js'];
    title = 'find 方法测试套件';
  } else if (testSuite === 'findPage') {
    testFiles = ['./findPage.test.js'];
    title = 'findPage 方法测试套件';
  } else if (testSuite === 'findOne') {
    testFiles = ['./findOne.test.js'];
    title = 'findOne 方法测试套件';
  } else if (testSuite === 'count') {
    testFiles = ['./count.test.js'];
    title = 'count 方法测试套件';
  } else if (testSuite === 'aggregate') {
      testFiles = ['./aggregate.test.js'];
      title = 'aggregate 方法测试套件';
  } else if (testSuite === 'all') {
    testFiles = ['./connection.test.js', './find.test.js', './findPage.test.js', './findOne.test.js', './count.test.js', './aggregate.test.js'];
    title = '所有测试套件';
  } else {
    console.error(`\n❌ 未知的测试套件: ${testSuite}`);
    console.error('使用方法: node run-tests.js [connection|find|findPage|findOne|count|aggregate|all]\n');
    process.exit(1);
  }

  console.log('\n╔═══════════════════════════════════════════════════════════╗');
  console.log(`║            运行 ${title.padEnd(35)}║`);
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
  for (const testFile of testFiles) {
    try {
      console.log(`📂 加载测试文件: ${testFile}`);
      require(testFile);
    } catch (error) {
      console.error(`❌ 加载测试文件失败: ${testFile}`);
      console.error(`   ${error.message}`);
      process.exit(1);
    }
  }

  // 恢复 it 函数
  global.it = originalIt;

  // 运行 before 钩子
  if (global.__beforeHooks.length > 0) {
    try {
      console.log('🔧 执行测试前准备...\n');
      for (const beforeHook of global.__beforeHooks) {
        await beforeHook();
      }
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
  if (global.__afterHooks.length > 0) {
    try {
      for (const afterHook of global.__afterHooks) {
        await afterHook();
      }
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
