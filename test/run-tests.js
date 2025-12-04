/**
 * 简单的测试运行器
 * 用于运行 find 和 findPage 测试套件
 */

// 简单的测试框架模拟
global.describe = function (name, fn) {
    console.log(`\n📦 ${name}`);
    // 提供一个带有 timeout 方法的上下文对象
    const context = {
        timeout (ms) {
            // 暂时忽略超时设置
            return this;
        }
    };
    fn.call(context);
};

global.it = function (name, fn) {
    // 提供一个带有 timeout 方法的上下文对象
    const context = {
        timeout (ms) {
            // 暂时忽略超时设置
            return this;
        }
    };

    return new Promise(async (resolve, reject) => {
        try {
            await fn.call(context);
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
global.__beforeEachHooks = [];
global.__afterEachHooks = [];

global.before = function (fn) {
    global.__beforeHooks.push(fn);
};

global.after = function (fn) {
    global.__afterHooks.push(fn);
};

global.beforeEach = function (fn) {
    global.__beforeEachHooks.push(fn);
};

global.afterEach = function (fn) {
    global.__afterEachHooks.push(fn);
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
    } else if (testSuite === 'findOneById') {
        testFiles = ['./unit/features/findOneById.test.js'];
        title = 'findOneById 便利方法测试套件';
    } else if (testSuite === 'findByIds') {
        testFiles = ['./unit/features/findByIds.test.js'];
        title = 'findByIds 便利方法测试套件';
    } else if (testSuite === 'findAndCount') {
        testFiles = ['./unit/features/findAndCount.test.js'];
        title = 'findAndCount 便利方法测试套件';
    } else if (testSuite === 'findOneOrCreate') {
        testFiles = ['./unit/features/findOneOrCreate.test.js'];
        title = 'findOneOrCreate 扩展方法测试套件';
    } else if (testSuite === 'safeDelete') {
        testFiles = ['./unit/features/safeDelete.test.js'];
        title = 'safeDelete 扩展方法测试套件';
    } else if (testSuite === 'updateOrInsert') {
        testFiles = ['./unit/features/updateOrInsert.test.js'];
        title = 'updateOrInsert 扩展方法测试套件';
    } else if (testSuite === 'bulkUpsert') {
        testFiles = ['./unit/features/bulkUpsert.test.js'];
        title = 'bulkUpsert 扩展方法测试套件';
    } else if (testSuite === 'upsertOne') {
        testFiles = ['./unit/features/upsertOne.test.js'];
        title = 'upsertOne 便利方法测试套件';
    } else if (testSuite === 'incrementOne') {
        testFiles = ['./unit/features/incrementOne.test.js'];
        title = 'incrementOne 便利方法测试套件';
    } else if (testSuite === 'count') {
        testFiles = ['./unit/features/count.test.js'];
        title = 'count 方法测试套件';
    } else if (testSuite === 'countQueue') {
        testFiles = ['./count-queue.test.js'];
        title = 'Count 队列控制测试套件';
    } else if (testSuite === 'aggregate') {
        testFiles = ['./unit/features/aggregate.test.js'];
        title = 'aggregate 方法测试套件';
    } else if (testSuite === 'distinct') {
        testFiles = ['./unit/features/distinct.test.js'];
        title = 'distinct 方法测试套件';
    } else if (testSuite === 'explain') {
        testFiles = ['./unit/features/explain.test.js'];
        title = 'Explain API 测试套件';
    } else if (testSuite === 'chaining') {
        testFiles = ['./unit/features/chaining.test.js'];
        title = '链式调用方法测试套件';
    } else if (testSuite === 'bookmarks') {
        testFiles = ['./unit/features/bookmarks.test.js'];
        title = 'Bookmark 维护 APIs 测试套件';
    } else if (testSuite === 'invalidate') {
        testFiles = ['./unit/features/invalidate.test.js'];
        title = 'invalidate() 方法测试套件';
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
            './unit/infrastructure/logger.test.js',
            './unit/infrastructure/index.test.js',
            './unit/infrastructure/mongodb-connect.test.js',
            // Admin/Management 功能测试 (v0.3.0+)
            './unit/infrastructure/admin.test.js',
            './unit/infrastructure/database.test.js',
            './unit/infrastructure/validation.test.js',
            './unit/infrastructure/collection-mgmt.test.js'
        ];
        title = '基础设施测试套件';
    } else if (testSuite === 'logger') {
        testFiles = ['./unit/infrastructure/logger.test.js'];
        title = '日志系统测试套件';
    } else if (testSuite === 'insertOne') {
        testFiles = ['./unit/features/insertOne.test.js'];
        title = 'insertOne 方法测试套件';
    } else if (testSuite === 'insertMany') {
        testFiles = ['./unit/features/insertMany.test.js'];
        title = 'insertMany 方法测试套件';
    } else if (testSuite === 'insertBatch') {
        testFiles = ['./unit/features/insertBatch.test.js'];
        title = 'insertBatch 方法测试套件';
    } else if (testSuite === 'updateOne') {
        testFiles = ['./unit/features/updateOne.test.js'];
        title = 'updateOne 方法测试套件';
    } else if (testSuite === 'updateMany') {
        testFiles = ['./unit/features/updateMany.test.js'];
        title = 'updateMany 方法测试套件';
    } else if (testSuite === 'replaceOne') {
        testFiles = ['./unit/features/replaceOne.test.js'];
        title = 'replaceOne 方法测试套件';
    } else if (testSuite === 'findOneAndUpdate') {
        testFiles = ['./unit/features/findOneAndUpdate.test.js'];
        title = 'findOneAndUpdate 方法测试套件';
    } else if (testSuite === 'findOneAndReplace') {
        testFiles = ['./unit/features/findOneAndReplace.test.js'];
        title = 'findOneAndReplace 方法测试套件';
    } else if (testSuite === 'deleteOne') {
        testFiles = ['./unit/features/deleteOne.test.js'];
        title = 'deleteOne 方法测试套件';
    } else if (testSuite === 'deleteMany') {
        testFiles = ['./unit/features/deleteMany.test.js'];
        title = 'deleteMany 方法测试套件';
    } else if (testSuite === 'findOneAndDelete') {
        testFiles = ['./unit/features/findOneAndDelete.test.js'];
        title = 'findOneAndDelete 方法测试套件';
    } else if (testSuite === 'transaction') {
        testFiles = ['./unit/features/transaction-unit.test.js'];
        title = 'MongoDB 事务单元测试套件';
    } else if (testSuite === 'watch') {
    // watch 测试使用 done 回调，需要用 Mocha 运行
        console.log('\n╔═══════════════════════════════════════════════════════════╗');
        console.log('║            运行 watch 方法单元测试套件                    ║');
        console.log('╚═══════════════════════════════════════════════════════════╝\n');

        const { spawnSync } = require('child_process');
        const result = spawnSync('npx', ['mocha', 'test/unit/queries/watch.test.js', '--reporter', 'spec'], {
            cwd: process.cwd(),
            stdio: 'inherit',
            shell: true
        });

        process.exit(result.status);
    } else if (testSuite === 'all') {
    // all 模式：顺序执行各个测试套件，避免并发初始化问题
        console.log('\n╔═══════════════════════════════════════════════════════════╗');
        console.log('║            运行 所有测试套件（顺序模式）                  ║');
        console.log('╚═══════════════════════════════════════════════════════════╝\n');

        const suites = ['connection', 'find', 'findPage', 'findOne', 'findOneById', 'findByIds', 'findAndCount', 'findOneOrCreate', 'upsertOne', 'incrementOne', 'count', 'countQueue', 'aggregate', 'distinct', 'explain', 'chaining', 'bookmarks', 'invalidate', 'insertOne', 'insertMany', 'insertBatch', 'updateOne', 'updateMany', 'replaceOne', 'findOneAndUpdate', 'findOneAndReplace', 'deleteOne', 'deleteMany', 'findOneAndDelete', 'safeDelete', 'updateOrInsert', 'bulkUpsert', 'transaction', 'watch', 'utils', 'infrastructure'];
        let totalPassed = 0;
        let totalFailed = 0;
        const failedSuites = []; // 收集失败的测试套件
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
                failedSuites.push(suite); // 记录失败的测试套件
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
            console.log('\n失败的测试套件列表:');
            console.log('─'.repeat(60));
            failedSuites.forEach((suite, index) => {
                console.log(`  ${index + 1}. ❌ ${suite}`);
            });
            console.log('─'.repeat(60));
        }
        console.log(`⏱  总耗时: ${(overallDuration / 1000).toFixed(2)} 秒`);
        console.log('═'.repeat(60) + '\n');

        process.exit(totalFailed > 0 ? 1 : 0);
    } else {
        console.error(`\n❌ 未知的测试套件: ${testSuite}`);
        console.error('使用方法: node run-tests.js [connection|find|findPage|findPage-supplement|findPage-all|findOne|findOneById|findByIds|findAndCount|findOneOrCreate|safeDelete|updateOrInsert|bulkUpsert|count|countQueue|aggregate|distinct|explain|chaining|bookmarks|upsertOne|incrementOne|insertOne|insertMany|insertBatch|updateOne|updateMany|replaceOne|findOneAndUpdate|findOneAndReplace|deleteOne|deleteMany|findOneAndDelete|transaction|watch|utils|infrastructure|logger|all]\n');
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
        global.__beforeEachHooks = [];
        global.__afterEachHooks = [];
        const tests = [];

        // 收集此文件的测试
        const originalIt = global.it;
        global.it = function (name, fn) {
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
            // 运行 beforeEach 钩子
            if (global.__beforeEachHooks.length > 0) {
                try {
                    for (const beforeEachHook of global.__beforeEachHooks) {
                        await beforeEachHook();
                    }
                } catch (error) {
                    console.error(`❌ beforeEach 钩子失败 (${testFile}):`, error.message);
                    failed++;
                    allFailedTests.push({ name: test.name, error, file: testFile });
                    continue; // 跳过这个测试
                }
            }

            // 运行测试
            try {
                // 提供 this 上下文，包含 timeout 方法
                const testContext = {
                    timeout (ms) {
                        // 暂时忽略超时设置
                        return this;
                    }
                };
                await test.fn.call(testContext);
                passed++;
            } catch (error) {
                failed++;
                allFailedTests.push({ name: test.name, error, file: testFile });
            }

            // 运行 afterEach 钩子
            if (global.__afterEachHooks.length > 0) {
                try {
                    for (const afterEachHook of global.__afterEachHooks) {
                        await afterEachHook();
                    }
                } catch (error) {
                    console.error(`\n⚠️  afterEach 钩子警告 (${testFile}):`, error.message);
                }
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



