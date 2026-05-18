/**
 * ES Module 导入测试
 *
 * 测试 monSQLize 的 ES Module 支持
 *
 * 运行方式:
 *   node test/esm/import.test.mjs
 */

import MonSQLize from '../../index.mjs';
import { Logger, MemoryCache } from '../../index.mjs';

console.log('🧪 ES Module 导入测试\n');

// 测试 1: 默认导出
console.log('✅ 测试 1: 默认导出');
console.log('   MonSQLize:', typeof MonSQLize);
if (typeof MonSQLize !== 'function') {
  console.error('   ❌ 失败: MonSQLize 应该是一个类（函数）');
  process.exit(1);
}
console.log('   ✓ 通过\n');

// 测试 2: 命名导出
console.log('✅ 测试 2: 命名导出');
console.log('   Logger:', typeof Logger);
console.log('   MemoryCache:', typeof MemoryCache);
if (typeof Logger !== 'object' && typeof Logger !== 'function') {
  console.error('   ❌ 失败: Logger 应该是一个对象或函数（类）');
  process.exit(1);
}
console.log('   ✓ 通过\n');

// 测试 3: 创建实例
console.log('✅ 测试 3: 创建实例');
try {
  const db = new MonSQLize({
    type: 'mongodb',
    databaseName: 'test_esm',
    config: {
      useMemoryServer: true
    }
  });
  console.log('   实例创建成功');
  console.log('   类型:', db.type);
  console.log('   数据库名:', db.databaseName);
  console.log('   ✓ 通过\n');
} catch (error) {
  console.error('   ❌ 失败:', error.message);
  process.exit(1);
}

// 测试 4: 连接和基本操作
console.log('✅ 测试 4: 连接和基本操作');
try {
  const db = new MonSQLize({
    type: 'mongodb',
    databaseName: 'test_esm_connect',
    config: {
      useMemoryServer: true
    }
  });

  console.log('   正在连接...');
  const { collection } = await db.connect();
  console.log('   连接成功');

  const testCollection = collection('test_collection');
  console.log('   获取集合成功');

  // 插入测试数据
  const insertResult = await testCollection.insertOne({ name: 'ESM Test', value: 123 });
  console.log('   插入数据成功:', insertResult.insertedId);

  // 查询测试数据
  const findResult = await testCollection.findOne({ name: 'ESM Test' });
  console.log('   查询数据成功:', findResult.name);

  if (findResult.value !== 123) {
    throw new Error('数据验证失败');
  }

  await db.close();
  console.log('   连接关闭成功');
  console.log('   ✓ 通过\n');
} catch (error) {
  console.error('   ❌ 失败:', error.message);
  console.error('   堆栈:', error.stack);
  process.exit(1);
}

console.log('🎉 所有 ES Module 测试通过！\n');
console.log('✅ monSQLize 完全支持 ES Module (import)');
console.log('✅ 可以在 ESM 项目中使用');

