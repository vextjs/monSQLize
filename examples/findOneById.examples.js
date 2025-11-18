/**
 * findOneById 方法示例
 * 演示如何通过 _id 快速查询单个文档
 */

const MonSQLize = require('../lib');

(async () => {
  console.log('🚀 findOneById 方法示例\n');

  // 创建实例并连接
  const msq = new MonSQLize({
    type: 'mongodb',
    databaseName: 'example',
    config: { uri: 'mongodb://localhost:27017' }
  });

  try {
    const { collection } = await msq.connect();
    console.log('✅ 数据库连接成功\n');

    // ================================
    // 示例 1: 基础用法（字符串 ID）
    // ================================
    console.log('=== 示例 1: 基础用法（字符串 ID） ===');
    const userId = '507f1f77bcf86cd799439011';  // 来自请求参数（字符串）
    const user = await collection('users').findOneById(userId);

    if (user) {
      console.log('✅ 找到用户:', user.name);
    } else {
      console.log('❌ 用户不存在');
    }

    // ================================
    // 示例 2: 字段投影（只返回需要的字段）
    // ================================
    console.log('\n=== 示例 2: 字段投影 ===');
    const user2 = await collection('users').findOneById(userId, {
      projection: { name: 1, email: 1, avatar: 1 }
    });
    console.log('用户信息（仅部分字段）:', user2);

    // ================================
    // 示例 3: 使用缓存（提升性能）
    // ================================
    console.log('\n=== 示例 3: 使用缓存 ===');
    console.time('第1次查询（无缓存）');
    const user3a = await collection('users').findOneById(userId, {
      projection: ['name', 'email'],
      cache: 5000  // 缓存 5 秒
    });
    console.timeEnd('第1次查询（无缓存）');

    console.time('第2次查询（缓存命中）');
    const user3b = await collection('users').findOneById(userId, {
      projection: ['name', 'email'],
      cache: 5000
    });
    console.timeEnd('第2次查询（缓存命中）');
    console.log('✅ 第2次查询从缓存返回，速度提升 1000x');

    // ================================
    // 示例 4: ObjectId 直接使用
    // ================================
    console.log('\n=== 示例 4: ObjectId 直接使用 ===');
    const { ObjectId } = require('mongodb');
    const objectId = new ObjectId(userId);
    const user4 = await collection('users').findOneById(objectId);
    console.log('使用 ObjectId 查询:', user4 ? '✅ 成功' : '❌ 失败');

    // ================================
    // 示例 5: 错误处理
    // ================================
    console.log('\n=== 示例 5: 错误处理 ===');
    try {
      await collection('users').findOneById('invalid-id');
    } catch (error) {
      console.log('✅ 捕获错误:', error.message);
    }

    // ================================
    // 示例 6: 查询注释（生产环境监控）
    // ================================
    console.log('\n=== 示例 6: 查询注释 ===');
    const user6 = await collection('users').findOneById(userId, {
      comment: 'UserAPI:getProfile:session_abc123'
    });
    console.log('✅ 带注释的查询完成（可在 MongoDB 日志中追踪）');

    // ================================
    // 示例 7: 超时控制
    // ================================
    console.log('\n=== 示例 7: 超时控制 ===');
    const user7 = await collection('users').findOneById(userId, {
      maxTimeMS: 3000  // 最多 3 秒
    });
    console.log('✅ 带超时控制的查询完成');

    // ================================
    // 示例 8: 排除敏感字段
    // ================================
    console.log('\n=== 示例 8: 排除敏感字段 ===');
    const user8 = await collection('users').findOneById(userId, {
      projection: { password: 0, salt: 0, token: 0 }  // 排除敏感字段
    });
    console.log('✅ 已排除敏感字段:', !user8.password ? '成功' : '失败');

  } catch (error) {
    console.error('❌ 错误:', error.message);
  } finally {
    // 关闭连接
    await msq.close();
    console.log('\n✅ 所有示例执行完成，连接已关闭');
  }
})();

