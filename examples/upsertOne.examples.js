/**
 * upsertOne 方法示例
 * 演示"存在则更新，不存在则插入"的便利方法
 */

const MonSQLize = require('../lib');

(async () => {
  console.log('🚀 upsertOne 方法示例\n');

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
    // 示例 1: 基础用法（插入新文档）
    // ================================
    console.log('=== 示例 1: 插入新文档 ===');
    const result1 = await collection('users').upsertOne(
      { userId: 'user123' },
      { name: 'Alice', email: 'alice@example.com', age: 30 }
    );

    console.log('插入结果:', {
      upsertedCount: result1.upsertedCount,
      upsertedId: result1.upsertedId
    });

    // ================================
    // 示例 2: 更新已存在的文档
    // ================================
    console.log('\n=== 示例 2: 更新已存在的文档 ===');
    const result2 = await collection('users').upsertOne(
      { userId: 'user123' },
      { name: 'Alice Updated', age: 31 }
    );

    console.log('更新结果:', {
      matchedCount: result2.matchedCount,
      modifiedCount: result2.modifiedCount
    });

    // ================================
    // 示例 3: 配置项同步
    // ================================
    console.log('\n=== 示例 3: 配置项同步 ===');

    // 第一次：创建配置
    await collection('configs').upsertOne(
      { key: 'theme' },
      { value: 'light', updatedAt: new Date() }
    );
    console.log('✅ 配置已创建');

    // 第二次：更新配置
    await collection('configs').upsertOne(
      { key: 'theme' },
      { value: 'dark', updatedAt: new Date() }
    );
    console.log('✅ 配置已更新');

    // ================================
    // 示例 4: 计数器初始化和递增
    // ================================
    console.log('\n=== 示例 4: 计数器初始化和递增 ===');

    // 第一次：初始化计数器
    await collection('stats').upsertOne(
      { articleId: 'article-1' },
      {
        $setOnInsert: { createdAt: new Date() },
        $inc: { views: 1 },
        $currentDate: { lastViewedAt: true }
      }
    );

    let stats = await collection('stats').findOne({ articleId: 'article-1' });
    console.log('初始浏览量:', stats.views);

    // 第二次：递增计数器
    await collection('stats').upsertOne(
      { articleId: 'article-1' },
      {
        $setOnInsert: { createdAt: new Date() },
        $inc: { views: 1 },
        $currentDate: { lastViewedAt: true }
      }
    );

    stats = await collection('stats').findOne({ articleId: 'article-1' });
    console.log('当前浏览量:', stats.views);

    // ================================
    // 示例 5: OAuth 登录（确保用户记录存在）
    // ================================
    console.log('\n=== 示例 5: OAuth 登录 ===');

    const oauthData = {
      provider: 'google',
      id: 'google-user-123',
      name: 'Bob',
      email: 'bob@gmail.com',
      avatar: 'https://example.com/avatar.jpg'
    };

    const result5 = await collection('users').upsertOne(
      { oauthProvider: oauthData.provider, oauthId: oauthData.id },
      {
        name: oauthData.name,
        email: oauthData.email,
        avatar: oauthData.avatar,
        lastLogin: new Date()
      }
    );

    if (result5.upsertedCount > 0) {
      console.log('✅ 新用户注册成功');
    } else {
      console.log('✅ 用户信息已更新');
    }

    // ================================
    // 示例 6: 使用选项（超时和注释）
    // ================================
    console.log('\n=== 示例 6: 使用选项 ===');

    await collection('users').upsertOne(
      { userId: 'user456' },
      { name: 'Charlie', email: 'charlie@example.com' },
      {
        maxTimeMS: 5000,
        comment: 'UserAPI:syncProfile:session_abc123'
      }
    );
    console.log('✅ 带选项的 upsert 完成');

    // ================================
    // 示例 7: 错误处理
    // ================================
    console.log('\n=== 示例 7: 错误处理 ===');

    try {
      await collection('users').upsertOne(
        null,  // 无效的 filter
        { name: 'Test' }
      );
    } catch (error) {
      console.log('✅ 捕获错误:', error.message);
    }

    // ================================
    // 示例 8: 幂等性操作（订单提交）
    // ================================
    console.log('\n=== 示例 8: 幂等性操作 ===');

    const orderId = 'order-' + Date.now();

    // 第一次提交
    const order1 = await collection('orders').upsertOne(
      { orderId },
      {
        amount: 100,
        userId: 'user123',
        status: 'pending',
        createdAt: new Date()
      }
    );
    console.log('第一次提交:', order1.upsertedCount > 0 ? '创建订单' : '订单已存在');

    // 第二次提交（重复）
    const order2 = await collection('orders').upsertOne(
      { orderId },
      {
        amount: 100,
        userId: 'user123',
        status: 'pending',
        createdAt: new Date()
      }
    );
    console.log('第二次提交:', order2.upsertedCount > 0 ? '创建订单' : '订单已存在');

  } catch (error) {
    console.error('❌ 错误:', error.message);
  } finally {
    // 关闭连接
    await msq.close();
    console.log('\n✅ 所有示例执行完成，连接已关闭');
  }
})();

