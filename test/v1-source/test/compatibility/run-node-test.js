/**
 * Node.js 版本兼容性测试运行器
 */

const path = require('path');
const fs = require('fs');

// 加载测试运行器
const runTestsPath = path.join(__dirname, '../run-tests.js');
require(runTestsPath);

// 加载测试文件
console.log('🧪 运行 Node.js 版本兼容性测试...\n');
require('./node-versions.test.js');

