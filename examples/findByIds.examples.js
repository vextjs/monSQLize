/**
 * findByIds 方法示例
 * 演示批量通过 _id 查询多个文档的功能
 */

const MonSQLize = require('../lib');
const { ObjectId } = require('mongodb');

(async () => {
  console.log('🚀 findByIds 方法示例\n');

  // 创建实例并连接
  const msq = new MonSQLize({
    type: 'mongodb',
    databaseName: 'example',
    config: { uri: 'mongodb://localhost:27017' }
  });

  try {
    const { collection } = await msq.connect();
    console.log('✅ 数据库连接成功\n');

    // 准备测试数据
    const insertResult = await collection('users').insertMany({
      documents: [
        { name: 'Alice', role: 'admin', age: 30 },
        { name: 'Bob', role: 'user', age: 25 },
        { name: 'Charlie', role: 'moderator', age: 35 },
        { name: 'David', role: 'user', age: 28 },
        { name: 'Eve', role: 'user', age: 32 }
      ]
    });

    const testIds = Object.values(insertResult.insertedIds);
    console.log(`已插入 ${testIds.length} 个测试文档\n`);

    // ================================
    // 示例 1: 批量查询（字符串 ID）
    // ================================
    console.log('=== 示例 1: 批量查询（字符串 ID） ===');
    const userIds1 = [
      testIds[0].toString(),
      testIds[1].toString(),
      testIds[2].toString()
    ];
    
    const users1 = await collection('users').findByIds(userIds1);
    console.log(`查询到 ${users1.length} 个用户:`);
    users1.forEach(user => console.log(`  - ${user.name} (${user.role})`));

    // ================================
    // 示例 2: 批量查询（ObjectId）
    // ================================
    console.log('\n=== 示例 2: 批量查询（ObjectId） ===');
    const userIds2 = [testIds[0], testIds[1]];
    const users2 = await collection('users').findByIds(userIds2);
    console.log(`查询到 ${users2.length} 个用户`);

    // ================================
    // 示例 3: 使用 projection（只返回特定字段）
    // ================================
    console.log('\n=== 示例 3: 使用 projection ===');
    const users3 = await collection('users').findByIds(
      [testIds[0].toString(), testIds[1].toString()],
      { projection: { name: 1, role: 1 } }
    );
    console.log('只返回 name 和 role:');
    console.log(users3);

    // ================================
    // 示例 4: 使用 sort（排序结果）
    // ================================
    console.log('\n=== 示例 4: 使用 sort ===');
    const users4 = await collection('users').findByIds(
      testIds.slice(0, 3).map(id => id.toString()),
      { sort: { age: 1 } }  // 按年龄升序
    );
    console.log('按年龄排序:');
    users4.forEach(user => console.log(`  - ${user.name}: ${user.age} 岁`));

    // ================================
    // 示例 5: 保持原始顺序
    // ================================
    console.log('\n=== 示例 5: preserveOrder（保持顺序） ===');
    const orderedIds = [testIds[2], testIds[0], testIds[1]];
    const users5 = await collection('users').findByIds(
      orderedIds.map(id => id.toString()),
      { preserveOrder: true }
    );
    console.log('结果顺序与输入一致:');
    users5.forEach((user, i) => {
      console.log(`  ${i + 1}. ${user.name} (期望: ${orderedIds[i].toString().slice(0, 8)}...)`);
    });

    // ================================
    // 示例 6: 自动去重
    // ================================
    console.log('\n=== 示例 6: 自动去重 ===');
    const duplicateIds = [
      testIds[0].toString(),
      testIds[0].toString(),  // 重复
      testIds[1].toString(),
      testIds[1].toString()   // 重复
    ];
    const users6 = await collection('users').findByIds(duplicateIds);
    console.log(`输入 ${duplicateIds.length} 个 ID（含重复），实际查询 ${users6.length} 个`);

    // ================================
    // 示例 7: 处理不存在的 ID
    // ================================
    console.log('\n=== 示例 7: 处理不存在的 ID ===');
    const mixedIds = [
      testIds[0].toString(),
      new ObjectId().toString(),  // 不存在
      testIds[1].toString()
    ];
    const users7 = await collection('users').findByIds(mixedIds);
    console.log(`输入 3 个 ID（1 个不存在），找到 ${users7.length} 个用户`);

    // ================================
    // 示例 8: 批量查询用户资料（关联查询）
    // ================================
    console.log('\n=== 示例 8: 批量查询用户资料（关联查询） ===');
    
    // 模拟评论数据
    const comments = [
      { id: 1, userId: testIds[0].toString(), content: 'Great article!' },
      { id: 2, userId: testIds[1].toString(), content: 'Thanks for sharing!' },
      { id: 3, userId: testIds[0].toString(), content: 'Very helpful!' }
    ];

    // 提取唯一用户 ID
    const commentUserIds = [...new Set(comments.map(c => c.userId))];
    
    // 批量查询用户
    const commentUsers = await collection('users').findByIds(commentUserIds, {
      projection: { name: 1, role: 1 }
    });

    // 构建用户映射
    const userMap = new Map(commentUsers.map(u => [u._id.toString(), u]));

    // 填充评论的用户信息
    const commentsWithUser = comments.map(comment => ({
      ...comment,
      user: userMap.get(comment.userId)
    }));

    console.log('评论列表（含用户信息）:');
    commentsWithUser.forEach(c => {
      console.log(`  - ${c.user.name}: "${c.content}"`);
    });

    // ================================
    // 示例 9: 批量权限验证
    // ================================
    console.log('\n=== 示例 9: 批量权限验证 ===');
    
    async function checkUsersPermission(userIds, requiredRole) {
      const users = await collection('users').findByIds(userIds, {
        projection: { name: 1, role: 1 }
      });

      const authorized = users.filter(user => 
        user.role === 'admin' || user.role === requiredRole
      );

      return {
        total: userIds.length,
        authorized: authorized.length,
        authorizedUsers: authorized.map(u => u.name)
      };
    }

    const permissionCheck = await checkUsersPermission(
      testIds.slice(0, 4).map(id => id.toString()),
      'moderator'
    );
    
    console.log(`权限检查结果: ${permissionCheck.authorized}/${permissionCheck.total} 用户有权限`);
    console.log('有权限的用户:', permissionCheck.authorizedUsers.join(', '));

    // ================================
    // 示例 10: 错误处理
    // ================================
    console.log('\n=== 示例 10: 错误处理 ===');
    
    try {
      await collection('users').findByIds(['invalid-id']);
    } catch (error) {
      console.log('✅ 捕获错误:', error.message);
    }

    try {
      await collection('users').findByIds('not-an-array');
    } catch (error) {
      console.log('✅ 捕获错误:', error.message);
    }

    // ================================
    // 示例 11: 性能对比
    // ================================
    console.log('\n=== 示例 11: 性能对比 ===');
    
    const testIdsForPerf = testIds.slice(0, 5).map(id => id.toString());

    // 方法 1: findByIds
    const start1 = Date.now();
    await collection('users').findByIds(testIdsForPerf);
    const duration1 = Date.now() - start1;

    // 方法 2: 多次 findOneById
    const start2 = Date.now();
    await Promise.all(testIdsForPerf.map(id => 
      collection('users').findOneById(id)
    ));
    const duration2 = Date.now() - start2;

    console.log(`findByIds (1次查询): ${duration1}ms`);
    console.log(`findOneById x5 (5次查询): ${duration2}ms`);
    console.log(`性能提升: ${Math.round((duration2 / duration1 - 1) * 100)}%`);

  } catch (error) {
    console.error('❌ 错误:', error.message);
  } finally {
    // 关闭连接
    await msq.close();
    console.log('\n✅ 所有示例执行完成，连接已关闭');
  }
})();

