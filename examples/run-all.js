/**
 * 运行所有流式查询示例的测试脚本
 */

const streamBasic = require('./stream-basic');
const streamTransform = require('./stream-transform');
const streamExport = require('./stream-export');
const streamFindPage = require('./stream-findpage');

async function runAllExamples() {
    console.log('=' .repeat(70));
    console.log('🚀 开始运行所有流式查询示例');
    console.log('=' .repeat(70));
    console.log();

    const examples = [
        { name: '基础流式查询', fn: streamBasic },
        { name: '流式数据转换', fn: streamTransform },
        { name: '数据导出', fn: streamExport },
        { name: 'findPage 流式查询', fn: streamFindPage },
    ];

    for (const example of examples) {
        try {
            console.log(`\n🎯 正在运行: ${example.name}`);
            console.log('='.repeat(70));
            await example.fn();
            console.log(`\n✅ ${example.name} 执行完成\n`);
        } catch (error) {
            console.error(`\n❌ ${example.name} 执行失败:`, error.message);
            console.error(error.stack);
        }
    }

    console.log('\n' + '='.repeat(70));
    console.log('🎉 所有示例执行完成！');
    console.log('='.repeat(70));
}

if (require.main === module) {
    runAllExamples().catch(err => {
        console.error('执行失败:', err);
        process.exit(1);
    });
}

module.exports = runAllExamples;

