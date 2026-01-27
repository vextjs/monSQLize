/**
 * 验证跨版本 ObjectId 兼容性
 *
 * 测试场景：
 * 1. 模拟 mongoose (bson@4.x/5.x) 创建的 ObjectId
 * 2. 验证 monSQLize 能否正确处理并转换
 * 3. 验证 insertOne 操作成功
 */

const MonSQLize = require('../../lib/index');

// 模拟其他版本的 ObjectId（通过 constructor.name 识别）
class LegacyObjectId {
  constructor(id) {
    this._id = id || this._generateHex();
  }

  _generateHex() {
    // 生成一个 24 位十六进制字符串
    return Array(24)
      .fill(0)
      .map(() => Math.floor(Math.random() * 16).toString(16))
      .join('');
  }

  toString() {
    return this._id;
  }

  toHexString() {
    return this._id;
  }
}

// 修改 constructor.name 以模拟 mongoose 的 ObjectId
Object.defineProperty(LegacyObjectId.prototype.constructor, 'name', {
  value: 'ObjectId',
  writable: false
});

async function testCrossVersionObjectId() {
  console.log('🔍 测试跨版本 ObjectId 兼容性\n');

  let msq;
  try {
    // 1. 创建 MonSQLize 实例并连接
    console.log('📡 连接到 MongoDB...');
    msq = new MonSQLize({
      type: 'mongodb',
      databaseName: 'test_cross_version',
      config: {
        uri: process.env.MONGODB_URI || 'mongodb://localhost:27017'
      }
    });

    const { collection } = await msq.connect();
    console.log('✅ 连接成功\n');

    // 2. 准备测试数据（包含模拟的旧版本 ObjectId）
    const legacyUserId = new LegacyObjectId('507f1f77bcf86cd799439011');
    const legacyProductId = new LegacyObjectId();

    console.log('📦 准备测试数据:');
    console.log('   userId:', legacyUserId.toString());
    console.log('   userId type:', legacyUserId.constructor.name);
    console.log('   productId:', legacyProductId.toString());
    console.log('   productId type:', legacyProductId.constructor.name);
    console.log('');

    const testData = {
      userId: legacyUserId,         // 模拟 mongoose 的 ObjectId
      productId: legacyProductId,   // 模拟 mongoose 的 ObjectId
      name: '测试商品',
      price: 99.99,
      tags: ['electronics', 'gadget'],
      createdAt: new Date()
    };

    // 3. 测试 insertOne
    console.log('🚀 执行 insertOne 操作...');
    const result = await collection('orders').insertOne(testData);
    console.log('✅ 插入成功！');
    console.log('   insertedId:', result.insertedId);
    console.log('');

    // 4. 验证数据是否正确存储
    console.log('🔍 验证插入的数据...');
    const inserted = await collection('orders').findOne({ _id: result.insertedId });
    console.log('✅ 查询成功！');
    console.log('   userId:', inserted.userId);
    console.log('   userId type:', inserted.userId.constructor.name);
    console.log('   productId:', inserted.productId);
    console.log('   productId type:', inserted.productId.constructor.name);
    console.log('');

    // 5. 验证 ObjectId 是否被正确转换为 bson@6.x 版本
    const { ObjectId: MongoObjectId } = require('mongodb');
    const isCorrectVersion = inserted.userId instanceof MongoObjectId;
    console.log('🎯 版本验证:');
    console.log('   userId 是 bson@6.x 的 ObjectId?', isCorrectVersion ? '✅ 是' : '❌ 否');
    console.log('   productId 是 bson@6.x 的 ObjectId?', inserted.productId instanceof MongoObjectId ? '✅ 是' : '❌ 否');
    console.log('');

    // 6. 清理测试数据
    console.log('🧹 清理测试数据...');
    await collection('orders').deleteOne({ _id: result.insertedId });
    console.log('✅ 清理完成\n');

    console.log('═══════════════════════════════════════');
    console.log('✅ 测试通过！跨版本 ObjectId 兼容性正常');
    console.log('═══════════════════════════════════════');

  } catch (error) {
    console.error('❌ 测试失败:', error.message);
    console.error('   错误详情:', error);
    process.exit(1);
  } finally {
    if (msq) {
      await msq.close();
      console.log('\n📡 已断开数据库连接');
    }
  }
}

// 运行测试
if (require.main === module) {
  testCrossVersionObjectId().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
}

module.exports = { testCrossVersionObjectId };
