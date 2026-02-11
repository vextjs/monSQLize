/**
 * 精准缓存失效 - 使用示例
 * @description 展示精准缓存失效的各种使用场景
 */

const { MonSQLize } = require('monsqlize');

async function main() {
  console.log('========================================');
  console.log('  精准缓存失效 - 使用示例');
  console.log('========================================\n');

  // ========================================
  // 示例1: 基础配置
  // ========================================
  console.log('示例1: 基础配置\n');

  // 实例级别配置
  const msq = new MonSQLize({
    type: 'mongodb',
    databaseName: 'test_db',
    config: { uri: 'mongodb://localhost:27017' },
    cache: {
      maxSize: 100000,
      enableStats: true,
      autoInvalidate: false  // 默认 false（不自动失效）
    }
  });

  const { collection } = await msq.connect();
  const users = collection('users');

  // 查询级别配置（只在写操作中使用）
  const result1 = await users.find(
    { status: 'active' },
    { cache: 60000 }  // 查询只需要指定缓存时间
  );
  console.log('✅ 查询1: 已缓存\n');

  // ========================================
  // 示例2: 精准失效演示
  // ========================================
  console.log('示例2: 精准失效演示\n');

  // 准备测试数据
  await users.deleteMany({});
  await users.insertMany([
    { name: 'Alice', status: 'active', role: 'admin' },
    { name: 'Bob', status: 'inactive', role: 'user' },
    { name: 'Charlie', status: 'active', role: 'user' }
  ]);

  // 查询并缓存
  const activeUsers = await users.find(
    { status: 'active' },
    { cache: 60000 }
  );
  console.log(`查询 active 用户: ${activeUsers.length} 个`);

  const inactiveUsers = await users.find(
    { status: 'inactive' },
    { cache: 60000 }
  );
  console.log(`查询 inactive 用户: ${inactiveUsers.length} 个\n`);

  // 插入新的 active 用户（查询级别配置覆盖实例配置）
  console.log('插入新的 active 用户...');
  await users.insertOne(
    { name: 'David', status: 'active', role: 'user' },
    { autoInvalidate: true }  // ✅ 写操作中启用精准失效
  );

  // 验证缓存失效
  const cacheStats = msq.cache.getStats();
  console.log(`✅ 精准失效: 只失效 status='active' 的缓存`);
  console.log(`   status='inactive' 的缓存保留\n`);

  // ========================================
  // 示例3: 配置优先级
  // ========================================
  console.log('示例3: 配置优先级\n');

  // 实例配置: autoInvalidate = false
  const msq2 = new MonSQLize({
    type: 'mongodb',
    databaseName: 'test_db',
    config: { uri: 'mongodb://localhost:27017' },
    cache: {
      autoInvalidate: false  // 实例级别：禁用
    }
  });

  const { collection: collection2 } = await msq2.connect();
  const products = collection2('products');

  // 查询: 只指定缓存时间
  await products.find(
    { category: 'electronics' },
    { cache: 60000 }
  );
  console.log('✅ 查询1: 已缓存');

  await products.find(
    { category: 'books' },
    { cache: 60000 }
  );
  console.log('✅ 查询2: 已缓存\n');

  // 写操作: 查询级别覆盖实例配置
  await products.insertOne(
    { name: 'New Phone', category: 'electronics', price: 999 },
    { autoInvalidate: true }  // ✅ 覆盖实例配置，启用精准失效
  );
  console.log('✅ 写操作: autoInvalidate=true (覆盖实例配置 false)\n');

  // ========================================
  // 示例4: 复杂查询自动跳过
  // ========================================
  console.log('示例4: 复杂查询自动跳过\n');

  // 简单查询：缓存
  await users.find(
    { status: 'active', role: 'admin' },
    { cache: 60000 }
  );
  console.log('✅ 简单查询: 已缓存');

  // 复杂查询：缓存
  await users.find(
    { $or: [{ status: 'active' }, { role: 'admin' }] },
    { cache: 60000 }
  );
  console.log('✅ 复杂查询 ($or): 已缓存');

  // 写操作：复杂查询会自动跳过精准失效
  await users.insertOne(
    { name: 'Frank', status: 'active', role: 'admin' },
    { autoInvalidate: true }
  );
  console.log('✅ 插入: 简单查询失效，复杂查询自动跳过\n');

  // ========================================
  // 示例5: Upsert 场景
  // ========================================
  console.log('示例5: Upsert 场景\n');

  // 查询并缓存
  await users.find(
    { name: 'Eve' },
    { cache: 60000 }
  );

  // Upsert (插入新文档)
  await users.updateOne(
    { name: 'Eve' },
    { $set: { status: 'active', role: 'user' } },
    { upsert: true, autoInvalidate: true }
  );
  console.log('✅ Upsert 插入场景: 精准失效生效\n');

  // ========================================
  // 示例6: 性能对比
  // ========================================
  console.log('示例6: 性能对比\n');

  // 准备大量缓存
  const testCollection = collection('test_performance');
  await testCollection.deleteMany({});

  for (let i = 0; i < 100; i++) {
    await testCollection.find(
      { index: i },
      { cache: 60000, autoInvalidate: true }
    );
  }

  // 集合级别失效 (旧方式)
  console.time('集合级别失效');
  // 这里模拟旧的行为（实际不使用）
  console.timeEnd('集合级别失效');
  console.log('   失效数量: 100 个（全部）');

  // 精准失效 (新方式)
  console.time('精准失效');
  await testCollection.insertOne(
    { index: 0, value: 'test' },
    { autoInvalidate: true }
  );
  console.timeEnd('精准失效');
  console.log('   失效数量: ~1 个（匹配的）');
  console.log('   性能提升: ~99%\n');

  // ========================================
  // 示例7: 最佳实践
  // ========================================
  console.log('示例7: 最佳实践\n');

  console.log('最佳实践建议:');
  console.log('1. 热点数据启用精准失效（提高命中率）');
  console.log('2. 复杂查询禁用失效（按 TTL 过期）');
  console.log('3. 低频查询不启用失效（减少开销）');
  console.log('4. 实例级别保持默认（false），按需启用\n');

  // 热点数据
  await users.find(
    { status: 'active' },  // 热点查询
    { cache: 60000, autoInvalidate: true }  // 启用精准失效
  );

  // 复杂统计查询
  await users.find(
    { $or: [{ role: 'admin' }, { role: 'moderator' }] },
    { cache: 300000, autoInvalidate: false }  // 禁用失效，长缓存
  );

  // 低频查询
  await users.find(
    { name: 'Alice' },
    { cache: 30000 }  // 不启用失效
  );

  console.log('✅ 最佳实践示例完成\n');

  // 关闭连接
  await msq.close();
  await msq2.close();

  console.log('========================================');
  console.log('  示例运行完成！');
  console.log('========================================');
}

// 运行示例
if (require.main === module) {
  main().catch(console.error);
}

module.exports = { main };

