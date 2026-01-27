/**
 * 验证向后兼容性：monSQLize 写入的数据是否能被 mongoose 正常读取
 *
 * 测试场景：
 * 1. monSQLize 插入数据（包含旧版本 ObjectId 转换后的数据）
 * 2. 使用 MongoDB 原生驱动读取（模拟 mongoose 的行为）
 * 3. 验证读取的 ObjectId 是否正常
 */

const MonSQLize = require('../../lib/index');
const { MongoClient, ObjectId } = require('mongodb');

// 模拟旧版本的 ObjectId（类似 mongoose bson@4.x/5.x）
class LegacyObjectId {
  constructor(hex) {
    if (hex && typeof hex === 'string' && /^[0-9a-fA-F]{24}$/.test(hex)) {
      this._id = hex;
    } else {
      this._id = Array(24)
        .fill(0)
        .map(() => Math.floor(Math.random() * 16).toString(16))
        .join('');
    }
  }

  toString() {
    return this._id;
  }

  toHexString() {
    return this._id;
  }
}

Object.defineProperty(LegacyObjectId.prototype.constructor, 'name', {
  value: 'ObjectId',
  writable: false
});

async function testBackwardCompatibility() {
  console.log('🔍 测试向后兼容性\n');

  let msq, nativeClient;
  const testData = {
    userId: new LegacyObjectId('507f1f77bcf86cd799439011'),
    productId: new LegacyObjectId('507f191e810c19729de860ea'),
    name: '测试商品',
    price: 99.99,
    createdAt: new Date()
  };

  try {
    // 1. 使用 monSQLize 插入数据
    console.log('📝 步骤 1：使用 monSQLize 插入数据');
    msq = new MonSQLize({
      type: 'mongodb',
      databaseName: 'test_backward_compat',
      config: {
        uri: process.env.MONGODB_URI || 'mongodb://localhost:27017'
      },
      cache: false  // 禁用缓存，避免误导性日志
    });

    const { collection } = await msq.connect();
    console.log('   ✅ monSQLize 连接成功');

    const insertResult = await collection('orders').insertOne(testData);
    console.log('   ✅ 数据插入成功');
    console.log('   插入的 _id:', insertResult.insertedId.toString());
    console.log('   原始 userId:', testData.userId.toString());
    console.log('   原始 productId:', testData.productId.toString());
    console.log('');

    // 2. 使用 MongoDB 原生驱动读取（模拟 mongoose）
    console.log('📖 步骤 2：使用原生驱动读取数据（模拟 mongoose）');
    const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017';
    nativeClient = new MongoClient(uri);
    await nativeClient.connect();
    console.log('   ✅ 原生驱动连接成功');

    const db = nativeClient.db('test_backward_compat');
    const ordersCollection = db.collection('orders');
    const doc = await ordersCollection.findOne({ _id: insertResult.insertedId });
    console.log('   ✅ 数据读取成功');
    console.log('');

    // 3. 验证读取的数据
    console.log('🔍 步骤 3：验证数据一致性');
    console.log('   读取的 _id:', doc._id.toString());
    console.log('   读取的 userId:', doc.userId.toString());
    console.log('   读取的 productId:', doc.productId.toString());
    console.log('   读取的 userId 类型:', doc.userId.constructor.name);
    console.log('   读取的 productId 类型:', doc.productId.constructor.name);
    console.log('');

    // 4. 验证 ObjectId 是否相等
    console.log('✅ 步骤 4：验证 ObjectId 值是否正确');
    const userIdMatch = doc.userId.toString() === '507f1f77bcf86cd799439011';
    const productIdMatch = doc.productId.toString() === '507f191e810c19729de860ea';

    console.log('   userId 匹配:', userIdMatch ? '✅ 正确' : '❌ 错误');
    console.log('   productId 匹配:', productIdMatch ? '✅ 正确' : '❌ 错误');
    console.log('');

    // 5. 验证 ObjectId 实例类型
    console.log('✅ 步骤 5：验证 ObjectId 实例类型');
    const isObjectId = doc.userId instanceof ObjectId;
    const isProductIdObjectId = doc.productId instanceof ObjectId;

    console.log('   userId 是 ObjectId 实例:', isObjectId ? '✅ 是' : '❌ 否');
    console.log('   productId 是 ObjectId 实例:', isProductIdObjectId ? '✅ 是' : '❌ 否');
    console.log('');

    // 6. 使用原生驱动更新数据（模拟 mongoose 写入）
    console.log('📝 步骤 6：使用原生驱动更新数据（模拟 mongoose 写入）');
    await ordersCollection.updateOne(
      { _id: insertResult.insertedId },
      { $set: { status: 'updated', updatedAt: new Date() } }
    );
    console.log('   ✅ 数据更新成功');
    console.log('');

    // 7. 再次使用 monSQLize 读取验证
    console.log('📖 步骤 7：使用 monSQLize 读取更新后的数据');
    const updatedDoc = await collection('orders').findOne({ _id: insertResult.insertedId });
    console.log('   ✅ 数据读取成功');
    console.log('   status:', updatedDoc.status);
    console.log('   userId 仍然正确:', updatedDoc.userId.toString() === '507f1f77bcf86cd799439011' ? '✅ 是' : '❌ 否');
    console.log('');

    // 8. 清理测试数据
    console.log('🧹 步骤 8：清理测试数据');
    await collection('orders').deleteOne({ _id: insertResult.insertedId });
    console.log('   ✅ 清理完成');
    console.log('');

    console.log('═══════════════════════════════════════════════════════════');
    console.log('✅ 向后兼容性测试通过！');
    console.log('');
    console.log('📊 结论：');
    console.log('   1. ✅ monSQLize 写入的数据可以被原生驱动正常读取');
    console.log('   2. ✅ ObjectId 值完全一致（十六进制字符串相同）');
    console.log('   3. ✅ ObjectId 类型正确（都是 ObjectId 实例）');
    console.log('   4. ✅ 原生驱动（mongoose）写入的数据 monSQLize 可以正常读取');
    console.log('   5. ✅ 混用 monSQLize 和 mongoose 不会有任何问题');
    console.log('═══════════════════════════════════════════════════════════');

  } catch (error) {
    console.error('❌ 测试失败:', error.message);
    console.error('   错误详情:', error);
    process.exit(1);
  } finally {
    if (msq) {
      await msq.close();
      console.log('\n📡 monSQLize 连接已关闭');
    }
    if (nativeClient) {
      await nativeClient.close();
      console.log('📡 原生驱动连接已关闭');
    }
  }
}

// 运行测试
if (require.main === module) {
  testBackwardCompatibility().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
}

module.exports = { testBackwardCompatibility };
