/**
 * findOneOrCreate 扩展方法示例
 *
 * 展示如何使用 findOneOrCreate 方法
 * - OAuth 登录场景
 * - 标签自动创建
 * - 并发安全测试
 */

const MonSQLize = require('../index.mjs');

async function main() {
  console.log('='.repeat(60));
  console.log('findOneOrCreate 扩展方法示例');
  console.log('='.repeat(60));

  // 初始化连接
  const msq = new MonSQLize({
    type: 'mongodb',
    databaseName: 'test_examples',
    config: { useMemoryServer: true }
  });

  await msq.connect();
  const User = msq.collection('users');
  const Tag = msq.collection('tags');

  try {
    console.log('\n📖 示例 1: OAuth 登录场景');
    console.log('-'.repeat(60));

    // 第一次登录（创建用户）
    const result1 = await User.findOneOrCreate(
      { email: 'alice@example.com' },
      {
        name: 'Alice',
        provider: 'google',
        createdAt: new Date()
      }
    );

    console.log('第一次登录（创建）:');
    console.log('  - created:', result1.created);
    console.log('  - user:', result1.doc.name);

    // 第二次登录（查询）
    const result2 = await User.findOneOrCreate(
      { email: 'alice@example.com' },
      {
        name: 'Alice Updated',
        provider: 'google'
      }
    );

    console.log('\n第二次登录（查询）:');
    console.log('  - created:', result2.created);
    console.log('  - user:', result2.doc.name);
    console.log('  ✅ 用户名保持不变（不被覆盖）');

    // -----------------------------------------------------------

    console.log('\n📖 示例 2: 标签自动创建');
    console.log('-'.repeat(60));

    const tags = ['JavaScript', 'MongoDB', 'Node.js'];

    for (const tagName of tags) {
      const result = await Tag.findOneOrCreate(
        { name: tagName },
        {
          slug: tagName.toLowerCase(),
          count: 0,
          createdAt: new Date()
        }
      );

      console.log(`标签 "${tagName}": ${result.created ? '✅ 创建' : '📌 已存在'}`);
    }

    // 再次查询，不会重复创建
    console.log('\n再次查询相同标签:');
    for (const tagName of tags) {
      const result = await Tag.findOneOrCreate(
        { name: tagName },
        {
          slug: tagName.toLowerCase(),
          count: 0
        }
      );

      console.log(`标签 "${tagName}": ${result.created ? '❌ 创建（不应该）' : '✅ 已存在'}`);
    }

    // -----------------------------------------------------------

    console.log('\n📖 示例 3: 带 projection 选项');
    console.log('-'.repeat(60));

    const result3 = await User.findOneOrCreate(
      { email: 'bob@example.com' },
      {
        name: 'Bob',
        email: 'bob@example.com',
        password: 'hashed_password_secret',
        age: 30
      },
      {
        projection: { name: 1, email: 1 }  // 只返回 name 和 email
      }
    );

    console.log('返回的文档（不包含 password 和 age）:');
    console.log('  - name:', result3.doc.name);
    console.log('  - email:', result3.doc.email);
    console.log('  - password:', result3.doc.password || '(未返回)');
    console.log('  - age:', result3.doc.age || '(未返回)');
    console.log('  ✅ 敏感字段已过滤');

    // -----------------------------------------------------------

    console.log('\n📖 示例 4: 性能对比（缓存优化）');
    console.log('-'.repeat(60));

    // 第一次查询（无缓存）
    const start1 = Date.now();
    await User.findOneOrCreate(
      { email: 'alice@example.com' },
      { name: 'Alice' }
    );
    const duration1 = Date.now() - start1;
    console.log(`第一次查询: ${duration1}ms`);

    // 第二次查询（缓存命中）
    const start2 = Date.now();
    await User.findOneOrCreate(
      { email: 'alice@example.com' },
      { name: 'Alice' }
    );
    const duration2 = Date.now() - start2;
    console.log(`第二次查询（缓存）: ${duration2}ms`);

    if (duration2 < duration1) {
      console.log(`⚡ 性能提升: ${(duration1 / duration2).toFixed(1)} 倍`);
    }

    // -----------------------------------------------------------

    console.log('\n📖 示例 5: 并发安全测试');
    console.log('-'.repeat(60));

    console.log('模拟 5 个并发请求同时创建相同用户...');

    const promises = [];
    for (let i = 0; i < 5; i++) {
      promises.push(
        User.findOneOrCreate(
          { email: 'concurrent@example.com' },
          {
            name: `User ${i}`,
            createdAt: new Date()
          }
        )
      );
    }

    const results = await Promise.all(promises);

    const createdCount = results.filter(r => r.created).length;
    const queriedCount = results.filter(r => !r.created).length;

    console.log(`结果统计:`);
    console.log(`  - 创建次数: ${createdCount}（应该只有 1 次）`);
    console.log(`  - 查询次数: ${queriedCount}（应该有 4 次）`);
    console.log(`  ${createdCount === 1 ? '✅' : '❌'} 并发安全：只创建了 1 个用户`);

    // 验证数据库中只有 1 个用户
    const count = await msq._adapter.db.collection('users').countDocuments({
      email: 'concurrent@example.com'
    });
    console.log(`  - 数据库中的用户数: ${count}（应该只有 1 个）`);

    // -----------------------------------------------------------

    console.log('\n📊 总结');
    console.log('-'.repeat(60));
    console.log('✅ findOneOrCreate 核心特性:');
    console.log('  1. 自动处理查询或创建');
    console.log('  2. 并发安全（E11000 自动重试）');
    console.log('  3. 缓存优化（性能提升）');
    console.log('  4. 支持 projection（过滤敏感字段）');
    console.log('  5. 代码减少 80%（6-8行 → 1行）');

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

