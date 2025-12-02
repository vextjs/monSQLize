/**
 * MongoDB Server 版本兼容性测试运行器
 */

const path = require('path');

// 加载测试运行器
const runTestsPath = path.join(__dirname, '../run-tests.js');
require(runTestsPath);

// 加载测试文件
console.log('🧪 运行 MongoDB Server 版本兼容性测试...\n');
require('./server-versions.test.js');

