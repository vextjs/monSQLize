/**
 * 快速验证 MongoDB Driver 7.0.0 兼容性
 *
 * 重要说明：
 * - mongodb-memory-server: 提供 MongoDB Server（数据库服务器）
 * - mongodb 包: Node.js Driver（客户端库）
 *
 * 要测试 Driver 7.x，需要：
 * 1. 临时安装 mongodb@7.0.0: npm install mongodb@7.0.0 --no-save
 * 2. 运行此脚本
 * 3. 恢复原版本: npm install
 */

console.log('🔍 检查 MongoDB Driver 7.0.0 兼容性\n');
console.log('说明：');
console.log('  - mongodb-memory-server 提供 MongoDB Server');
console.log('  - 需要安装 mongodb@7.0.0 包来测试 Driver 7.x\n');

const MonSQLize = require('../../lib/index');

async function testDriver7() {
  try {
    // 检查当前安装的 mongodb 版本
    const mongodbPackage = require('mongodb/package.json');
    console.log(`📦 当前 MongoDB Driver 版本: ${mongodbPackage.version}`);

    if (!mongodbPackage.version.startsWith('7.')) {
      console.log('⚠️  当前不是 Driver 7.x，无法测试');
      console.log('');
      console.log('要测试 Driver 7.x，请执行：');
      console.log('  1. npm install mongodb@7.0.0 --no-save --legacy-peer-deps');
      console.log('  2. node test/compatibility/verify-driver7.js');
      console.log('  3. npm install  # 恢复原版本');
      console.log('');
      console.log('或使用自动化脚本：');
      console.log('  npm run test:compatibility:driver -- --drivers=7.0.0');
      return;
    }

    console.log('✅ Driver 7.x 已安装，开始测试...\n');

    // 测试 1: 创建实例
    console.log('测试 1: 创建 monSQLize 实例...');
    const db = new MonSQLize({
      type: 'mongodb',
      databaseName: 'test_driver7',
      config: {
        useMemoryServer: true
      }
    });
    console.log('✅ 实例创建成功\n');

    // 测试 2: 连接数据库
    console.log('测试 2: 连接数据库...');
    const { collection } = await db.connect();
    console.log('✅ 连接成功\n');

    // 测试 3: CRUD 操作
    console.log('测试 3: CRUD 操作...');
    const testColl = collection('driver7_test');

    // 插入
    const insertResult = await testColl.insertOne({
      name: 'Driver 7 Test',
      version: '7.0.0',
      timestamp: new Date()
    });
    console.log('  ✓ 插入成功:', insertResult.insertedId);

    // 查询
    const findResult = await testColl.findOne({ name: 'Driver 7 Test' });
    console.log('  ✓ 查询成功:', findResult.name);

    // 更新
    const updateResult = await testColl.updateOne(
      { name: 'Driver 7 Test' },
      { $set: { updated: true } }
    );
    console.log('  ✓ 更新成功, 修改数:', updateResult.modifiedCount);

    // findOneAndUpdate（测试返回值统一）
    const findAndUpdateResult = await testColl.findOneAndUpdate(
      { name: 'Driver 7 Test' },
      { $set: { tested: true } },
      { returnDocument: 'after' }
    );
    console.log('  ✓ findOneAndUpdate 成功:', findAndUpdateResult.tested);

    // 删除
    const deleteResult = await testColl.deleteOne({ name: 'Driver 7 Test' });
    console.log('  ✓ 删除成功, 删除数:', deleteResult.deletedCount);

    console.log('✅ CRUD 操作全部成功\n');

    // 测试 4: 索引操作
    console.log('测试 4: 索引操作...');
    await testColl.createIndex({ name: 1 });
    console.log('  ✓ 创建索引成功');

    const indexes = await testColl.listIndexes();
    console.log('  ✓ 列出索引成功, 数量:', indexes.length);

    console.log('✅ 索引操作成功\n');

    // 关闭连接
    await db.close();
    console.log('✅ 连接已关闭\n');

    console.log('🎉 MongoDB Driver 7.0.0 完全兼容！');
    console.log('✅ 所有测试通过');

  } catch (error) {
    console.error('❌ 测试失败:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

testDriver7().catch(err => {
  console.error('❌ 错误:', err);
  process.exit(1);
});

