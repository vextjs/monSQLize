/**
 * safeDelete 扩展方法示例
 *
 * 展示如何使用 safeDelete 方法
 * - 依赖检查防止孤儿数据
 * - 软删除用于数据审计
 * - 允许部分依赖
 */

const MonSQLize = require('../index.mjs');

async function main() {
  console.log('='.repeat(60));
  console.log('safeDelete 扩展方法示例');
  console.log('='.repeat(60));

  // 初始化连接
  const msq = new MonSQLize({
    type: 'mongodb',
    databaseName: 'test_examples',
    config: { useMemoryServer: true }
  });

  await msq.connect();
  const User = msq.collection('users');
  const Order = msq.collection('orders');
  const Post = msq.collection('posts');
  const Comment = msq.collection('comments');
  const nativeDb = msq._adapter.db;

  try {
    console.log('\n📖 示例 1: 依赖检查（阻止删除）');
    console.log('-'.repeat(60));

    // 创建用户和订单
    const insertResult = await nativeDb.collection('users').insertOne({
      name: 'Alice',
      email: 'alice@example.com'
    });
    const userId = insertResult.insertedId;

    await nativeDb.collection('orders').insertMany([
      { userId, status: 'pending', amount: 100 },
      { userId, status: 'paid', amount: 200 }
    ]);

    console.log('创建了 1 个用户和 2 个未完成订单');

    // 尝试删除用户（应该被阻止）
    try {
      await User.safeDelete(
        { _id: userId },
        {
          checkDependencies: [
            {
              collection: 'orders',
              query: { userId, status: { $in: ['pending', 'paid'] } },
              errorMessage: '用户有未完成的订单'
            }
          ]
        }
      );
      console.log('❌ 删除成功（不应该）');
    } catch (error) {
      console.log('✅ 删除被阻止:', error.message);
    }

    // 验证用户仍然存在
    const userExists = await nativeDb.collection('users').findOne({ _id: userId });
    console.log(`用户是否存在: ${userExists ? '✅ 是（符合预期）' : '❌ 否'}`);

    // -----------------------------------------------------------

    console.log('\n📖 示例 2: 完成订单后成功删除');
    console.log('-'.repeat(60));

    // 完成所有订单
    await nativeDb.collection('orders').updateMany(
      { userId },
      { $set: { status: 'completed' } }
    );
    console.log('已完成所有订单');

    // 再次尝试删除（应该成功）
    const result = await User.safeDelete(
      { _id: userId },
      {
        checkDependencies: [
          {
            collection: 'orders',
            query: { userId, status: { $in: ['pending', 'paid'] } },
            errorMessage: '用户有未完成的订单'
          }
        ]
      }
    );

    console.log('✅ 删除成功');
    console.log('  - 删除数量:', result.deletedCount);
    console.log('  - 依赖检查:', result.dependencyChecks[0].passed ? '✅ 通过' : '❌ 失败');

    // -----------------------------------------------------------

    console.log('\n📖 示例 3: 软删除（数据审计）');
    console.log('-'.repeat(60));

    // 创建新用户
    const insertResult2 = await nativeDb.collection('users').insertOne({
      name: 'Bob',
      email: 'bob@example.com',
      balance: 100
    });
    const userId2 = insertResult2.insertedId;

    console.log('创建了用户 Bob');

    // 软删除
    const adminId = '507f1f77bcf86cd799439011';
    const result2 = await User.safeDelete(
      { _id: userId2 },
      {
        soft: true,
        additionalFields: {
          deletedBy: adminId,
          deleteReason: '用户注销',
          deletedBalance: 100
        }
      }
    );

    console.log('✅ 软删除完成');
    console.log('  - 删除数量:', result2.deletedCount);

    // 查看软删除后的数据
    const deletedUser = await nativeDb.collection('users').findOne({ _id: userId2 });
    console.log('\n软删除后的用户数据:');
    console.log('  - name:', deletedUser.name);
    console.log('  - deletedAt:', deletedUser.deletedAt);
    console.log('  - deletedBy:', deletedUser.deletedBy);
    console.log('  - deleteReason:', deletedUser.deleteReason);
    console.log('  - deletedBalance:', deletedUser.deletedBalance);
    console.log('  ✅ 数据保留用于审计');

    // -----------------------------------------------------------

    console.log('\n📖 示例 4: 允许部分依赖（allowCount）');
    console.log('-'.repeat(60));

    // 创建用户和评论
    const insertResult3 = await nativeDb.collection('users').insertOne({
      name: 'Charlie',
      email: 'charlie@example.com'
    });
    const userId3 = insertResult3.insertedId;

    await nativeDb.collection('comments').insertMany([
      { userId: userId3, content: 'Comment 1' },
      { userId: userId3, content: 'Comment 2' },
      { userId: userId3, content: 'Comment 3' }
    ]);

    console.log('创建了用户 Charlie 和 3 个评论');

    // 删除用户（允许 <= 5 个评论）
    const result3 = await User.safeDelete(
      { _id: userId3 },
      {
        checkDependencies: [
          {
            collection: 'comments',
            query: { userId: userId3 },
            allowCount: 5,  // 允许 <= 5 个评论
            errorMessage: '用户有过多评论'
          }
        ]
      }
    );

    console.log('✅ 删除成功（允许少量评论）');
    console.log('  - 评论数量:', result3.dependencyChecks[0].count);
    console.log('  - 允许数量:', result3.dependencyChecks[0].allowCount);
    console.log('  - 检查结果:', result3.dependencyChecks[0].passed ? '✅ 通过' : '❌ 失败');

    // -----------------------------------------------------------

    console.log('\n📖 示例 5: 多个依赖检查');
    console.log('-'.repeat(60));

    // 创建用户
    const insertResult4 = await nativeDb.collection('users').insertOne({
      name: 'David',
      email: 'david@example.com'
    });
    const userId4 = insertResult4.insertedId;

    // 创建已完成的订单和评论
    await nativeDb.collection('orders').insertMany([
      { userId: userId4, status: 'completed', amount: 100 },
      { userId: userId4, status: 'cancelled', amount: 50 }
    ]);

    await nativeDb.collection('comments').insertMany([
      { userId: userId4, content: 'Comment 1' },
      { userId: userId4, content: 'Comment 2' }
    ]);

    console.log('创建了用户 David、2 个已完成订单、2 个评论');

    // 删除用户（多个依赖检查）
    const result4 = await User.safeDelete(
      { _id: userId4 },
      {
        checkDependencies: [
          {
            collection: 'orders',
            query: { userId: userId4, status: { $in: ['pending', 'paid'] } },
            errorMessage: '用户有未完成的订单'
          },
          {
            collection: 'comments',
            query: { userId: userId4 },
            allowCount: 10,
            errorMessage: '用户有过多评论'
          }
        ]
      }
    );

    console.log('✅ 删除成功（通过所有依赖检查）');
    console.log('依赖检查结果:');
    result4.dependencyChecks.forEach((check, index) => {
      console.log(`  ${index + 1}. ${check.collection}:`);
      console.log(`     - 数量: ${check.count}`);
      console.log(`     - 允许: ${check.allowCount}`);
      console.log(`     - 结果: ${check.passed ? '✅ 通过' : '❌ 失败'}`);
    });

    // -----------------------------------------------------------

    console.log('\n📊 总结');
    console.log('-'.repeat(60));
    console.log('✅ safeDelete 核心特性:');
    console.log('  1. 依赖检查（防止孤儿数据）');
    console.log('  2. 软删除（数据审计）');
    console.log('  3. allowCount（允许部分依赖）');
    console.log('  4. 多依赖检查');
    console.log('  5. 代码减少 80%（10+行 → 3行）');

  } finally {
    await msq.close();
    console.log('\n✅ 示例完成');
  }
}

// 运行示例
if (require.main === module) {
  main().catch(console.error);
}

module.exports = main;

