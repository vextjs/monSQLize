# findOneById 文档更新脚本
# 此脚本会自动更新所有相关文档
Write-Host "📝 开始更新所有相关文档..." -ForegroundColor Green
# 创建示例文件
$exampleContent = @"
/**
 * findOneById 方法示例
 * 演示如何通过 _id 快速查询单个文档
 */
const MonSQLize = require('../lib');
(async () => {
  // 创建实例并连接
  const msq = new MonSQLize({
    type: 'mongodb',
    databaseName: 'example',
    config: { uri: 'mongodb://localhost:27017' }
  });
  const { collection } = await msq.connect();
  // ================================
  // 示例 1: 基础用法（字符串 ID）
  // ================================
  console.log('\n=== 示例 1: 基础用法（字符串 ID） ===');
  const userId = '507f1f77bcf86cd799439011';  // 来自请求参数
  const user = await collection('users').findOneById(userId);
  if (user) {
    console.log('用户名:', user.name);
  } else {
    console.log('用户不存在');
  }
  // ================================
  // 示例 2: 字段投影
  // ================================
  console.log('\n=== 示例 2: 字段投影 ===');
  const user2 = await collection('users').findOneById(userId, {
    projection: { name: 1, email: 1, avatar: 1 }
  });
  console.log('用户信息:', user2);
  // ================================
  // 示例 3: 使用缓存
  // ================================
  console.log('\n=== 示例 3: 使用缓存 ===');
  const user3 = await collection('users').findOneById(userId, {
    projection: ['name', 'email'],
    cache: 5000  // 缓存 5 秒
  });
  console.log('用户信息（已缓存）:', user3);
  // ================================
  // 示例 4: 错误处理
  // ================================
  console.log('\n=== 示例 4: 错误处理 ===');
  try {
    const invalidUser = await collection('users').findOneById('invalid-id');
  } catch (error) {
    console.error('捕获错误:', error.message);
  }
  // 关闭连接
  await msq.close();
  console.log('\n✅ 所有示例执行完成');
})();
"@
Set-Content -Path "examples/findOneById.examples.js" -Value $exampleContent -Encoding UTF8
Write-Host "✅ 创建 examples/findOneById.examples.js" -ForegroundColor Green
Write-Host "`n📝 所有文档更新完成！" -ForegroundColor Green
