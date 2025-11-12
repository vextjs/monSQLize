/**
 * 错误提示优化验证脚本
 * 测试新的错误提示是否包含文档链接和使用提示
 */

const MonSQLize = require('../lib');

async function testErrorMessages() {
    console.log('\n╔═══════════════════════════════════════════════════════════╗');
    console.log('║          错误提示优化验证                                  ║');
    console.log('╚═══════════════════════════════════════════════════════════╝\n');

    const msq = new MonSQLize({
        type: 'mongodb',
        databaseName: 'test',
        config: { useMemoryServer: true }
    });

    const { collection } = await msq.connect();

    let testCount = 0;
    let passCount = 0;

    // 测试函数
    async function testError(description, fn, expectedKeywords) {
        testCount++;
        console.log(`\n${testCount}. ${description}`);
        console.log('─'.repeat(60));

        try {
            await fn();
            console.log('❌ 未抛出错误');
        } catch (error) {
            console.log('✅ 成功抛出错误');
            console.log(`📝 错误消息:\n${error.message}\n`);

            // 验证关键词
            const allKeywordsPresent = expectedKeywords.every(keyword =>
                error.message.includes(keyword)
            );

            if (allKeywordsPresent) {
                passCount++;
                console.log(`✅ 包含所有预期关键词: ${expectedKeywords.join(', ')}`);
            } else {
                console.log(`❌ 缺少某些关键词: ${expectedKeywords.join(', ')}`);
            }
        }
    }

    // 测试 1: limit 参数错误
    await testError(
        'FindChain.limit() 参数错误',
        () => {
            collection('products').find({}).limit(-1);
        },
        ['non-negative number', 'Usage:', 'See:']
    );

    // 测试 2: skip 参数错误
    await testError(
        'FindChain.skip() 参数错误',
        () => {
            collection('products').find({}).skip('invalid');
        },
        ['non-negative number', 'Usage:', 'See:']
    );

    // 测试 3: sort 参数错误
    await testError(
        'FindChain.sort() 参数错误',
        () => {
            collection('products').find({}).sort('invalid');
        },
        ['object or array', 'Usage:', 'See:', '1 for ascending', '-1 for descending']
    );

    // 测试 4: project 参数错误
    await testError(
        'FindChain.project() 参数错误',
        () => {
            collection('products').find({}).project(null);
        },
        ['object or array', 'Usage:', 'See:']
    );

    // 测试 5: hint 参数错误
    await testError(
        'FindChain.hint() 参数错误',
        () => {
            collection('products').find({}).hint('');
        },
        ['index name or specification', 'Usage:', 'See:']
    );

    // 测试 6: comment 参数错误
    await testError(
        'FindChain.comment() 参数错误',
        () => {
            collection('products').find({}).comment(123);
        },
        ['requires a string', 'Usage:', 'See:']
    );

    // 测试 7: maxTimeMS 参数错误
    await testError(
        'FindChain.maxTimeMS() 参数错误',
        () => {
            collection('products').find({}).maxTimeMS(-100);
        },
        ['non-negative number', 'Usage:', 'See:', 'seconds']
    );

    // 测试 8: 重复执行错误
    await testError(
        'FindChain 重复执行',
        async () => {
            const chain = collection('products').find({}).limit(5);
            await chain.toArray();
            await chain.toArray(); // 第二次执行应该抛出错误
        },
        ['already executed', 'Tip:', 'See:', 'Create new chain']
    );

    // 测试 9: AggregateChain allowDiskUse 参数错误
    await testError(
        'AggregateChain.allowDiskUse() 参数错误',
        () => {
            collection('orders').aggregate([]).allowDiskUse('yes');
        },
        ['requires a boolean', 'Usage:', 'See:']
    );

    // 测试 10: AggregateChain batchSize 参数错误
    await testError(
        'AggregateChain.batchSize() 参数错误',
        () => {
            collection('orders').aggregate([]).batchSize(-500);
        },
        ['non-negative number', 'Usage:', 'See:']
    );

    await msq.close();

    // 输出测试结果
    console.log('\n' + '═'.repeat(60));
    console.log('测试结果汇总');
    console.log('═'.repeat(60));
    console.log(`总测试数: ${testCount}`);
    console.log(`通过: ${passCount}`);
    console.log(`失败: ${testCount - passCount}`);
    console.log(`通过率: ${(passCount / testCount * 100).toFixed(1)}%`);
    console.log('═'.repeat(60) + '\n');

    if (passCount === testCount) {
        console.log('✅ 所有错误提示验证通过！\n');
        process.exit(0);
    } else {
        console.log('❌ 部分错误提示验证失败\n');
        process.exit(1);
    }
}

// 运行测试
testErrorMessages().catch(err => {
    console.error('测试执行失败:', err);
    process.exit(1);
});

