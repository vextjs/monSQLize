/**
 * incrementOne 方法示例
 * 演示原子递增/递减字段值的功能
 */

const MonSQLize = require('../lib');

(async () => {
  console.log('🚀 incrementOne 方法示例\n');

  const msq = new MonSQLize({
    type: 'mongodb',
    databaseName: 'example',
    config: { uri: 'mongodb://localhost:27017' }
  });

  try {
    const { collection } = await msq.connect();
    console.log('✅ 数据库连接成功\n');

    // 准备测试数据
    await collection('users').insertOne({
      document: {
        userId: 'user123',
        name: 'Alice',
        loginCount: 10,
        points: 100,
        credits: 50
      }
    });

    // 示例 1: 递增（默认 +1）
    console.log('=== 示例 1: 递增登录次数 ===');
    const result1 = await collection('users').incrementOne(
      { userId: 'user123' },
      'loginCount'
    );
    console.log(`登录次数: ${result1.value.loginCount}`);

    // 示例 2: 指定增量
    console.log('\n=== 示例 2: 增加积分 ===');
    const result2 = await collection('users').incrementOne(
      { userId: 'user123' },
      'points',
      50
    );
    console.log(`当前积分: ${result2.value.points}`);

    // 示例 3: 递减
    console.log('\n=== 示例 3: 扣除代币 ===');
    const result3 = await collection('users').incrementOne(
      { userId: 'user123' },
      'credits',
      -20
    );
    console.log(`剩余代币: ${result3.value.credits}`);

    // 示例 4: 多字段操作
    console.log('\n=== 示例 4: 多字段操作 ===');
    const result4 = await collection('users').incrementOne(
      { userId: 'user123' },
      {
        loginCount: 1,
        points: 10,
        credits: -5
      }
    );
    console.log(`登录: ${result4.value.loginCount}, 积分: ${result4.value.points}, 代币: ${result4.value.credits}`);

    // 示例 5: 返回更新前的值
    console.log('\n=== 示例 5: 返回更新前的值 ===');
    const result5 = await collection('users').incrementOne(
      { userId: 'user123' },
      'points',
      5,
      { returnDocument: 'before' }
    );
    console.log(`更新前积分: ${result5.value.points}`);

    console.log('\n✅ 所有示例执行完成');

  } catch (error) {
    console.error('❌ 错误:', error.message);
  } finally {
    await msq.close();
    console.log('✅ 连接已关闭');
  }
})();

