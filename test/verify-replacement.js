#!/usr/bin/env node

/**
 * 验证 $ 到 expr 替换后的功能
 */

console.log('\n🔍 开始验证功能...\n');

// 测试1: 验证 expr 导出
const MonSQLize = require('../lib/index');
console.log('✅ 测试1: MonSQLize 导入成功');

if (typeof MonSQLize.expr !== 'function') {
  console.error('❌ 错误: MonSQLize.expr 不存在或不是函数');
  process.exit(1);
}
console.log('✅ 测试2: MonSQLize.expr 存在且是函数');

// 测试2: 验证 expr 函数工作正常
const { expr } = MonSQLize;
const testExpr = expr("age > 18");
console.log('✅ 测试3: expr() 函数调用成功');

// 测试3: 验证返回值结构
if (typeof testExpr !== 'object' || testExpr === null) {
  console.error('❌ 错误: expr() 返回值不是对象');
  process.exit(1);
}
console.log('✅ 测试4: expr() 返回对象');

if (typeof testExpr.__expr__ !== 'string') {
  console.error('❌ 错误: 返回值缺少 __expr__ 字符串属性');
  process.exit(1);
}
console.log('✅ 测试5: 返回值包含 __expr__ 属性');

if (typeof testExpr.__compiled__ !== 'boolean') {
  console.error('❌ 错误: 返回值缺少 __compiled__ 布尔属性');
  process.exit(1);
}
console.log('✅ 测试6: 返回值包含 __compiled__ 属性');

// 测试4: 验证表达式内容
if (testExpr.__expr__ !== 'age > 18') {
  console.error(`❌ 错误: 表达式内容不匹配，期望 "age > 18"，实际 "${testExpr.__expr__}"`);
  process.exit(1);
}
console.log('✅ 测试7: 表达式内容正确');

// 测试5: 验证 createExpression 别名
if (typeof MonSQLize.createExpression !== 'function') {
  console.error('❌ 错误: MonSQLize.createExpression 不存在');
  process.exit(1);
}
console.log('✅ 测试8: createExpression 别名存在');

// 测试6: 验证 $ 已被移除
if (typeof MonSQLize.$ !== 'undefined') {
  console.error('❌ 错误: MonSQLize.$ 仍然存在（应该已被移除）');
  process.exit(1);
}
console.log('✅ 测试9: $ 已成功移除');

// 测试7: 验证复杂表达式
const complexExpr = expr("UPPER(CONCAT(firstName, ' ', lastName))");
if (complexExpr.__expr__ !== "UPPER(CONCAT(firstName, ' ', lastName))") {
  console.error('❌ 错误: 复杂表达式解析失败');
  process.exit(1);
}
console.log('✅ 测试10: 复杂表达式解析正常');

console.log('\n' + '='.repeat(60));
console.log('✅ 所有功能测试通过！');
console.log('✅ $ 已成功替换为 expr！');
console.log('✅ 功能正常，无受影响！');
console.log('='.repeat(60) + '\n');

