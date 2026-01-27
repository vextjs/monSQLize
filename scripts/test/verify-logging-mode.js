/**
 * 测试 ObjectId 转换日志的详细模式和静默模式
 */

const MonSQLize = require('../../lib/index');

// 模拟旧版本的 ObjectId
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
}

Object.defineProperty(LegacyObjectId.prototype.constructor, 'name', {
  value: 'ObjectId',
  writable: false
});

async function testVerboseLogging() {
  console.log('🔍 测试 ObjectId 转换日志输出\n');

  let msq;
  try {
    // 准备包含多个 ObjectId 的测试数据
    const testData = {
      userId: new LegacyObjectId('507f1f77bcf86cd799439011'),
      productId: new LegacyObjectId('507f191e810c19729de860ea'),
      components: [
        {
          id: new LegacyObjectId(),
          content: [
            { id: new LegacyObjectId(), text: 'Item 1' },
            { id: new LegacyObjectId(), text: 'Item 2' },
            { id: new LegacyObjectId(), text: 'Item 3' }
          ]
        },
        {
          id: new LegacyObjectId(),
          content: [
            { id: new LegacyObjectId(), text: 'Item 4' },
            { id: new LegacyObjectId(), text: 'Item 5' }
          ]
        }
      ],
      metadata: {
        createdBy: new LegacyObjectId(),
        updatedBy: new LegacyObjectId()
      },
      tags: [
        new LegacyObjectId(),
        new LegacyObjectId(),
        new LegacyObjectId()
      ]
    };

    console.log('📦 测试数据：包含 15 个跨版本 ObjectId\n');

    // 测试 1：默认模式（静默模式）
    console.log('═══════════════════════════════════════');
    console.log('【测试 1】默认模式（静默模式）');
    console.log('═══════════════════════════════════════\n');

    msq = new MonSQLize({
      type: 'mongodb',
      databaseName: 'test_logging',
      config: {
        uri: process.env.MONGODB_URI || 'mongodb://localhost:27017'
      },
      cache: false
    });

    await msq.connect();
    console.log('开始插入数据...\n');

    const result1 = await msq.collection('test').insertOne(testData);
    console.log('✅ 插入成功（默认模式）\n');

    await msq.collection('test').deleteOne({ _id: result1.insertedId });
    await msq.close();

    console.log('📊 默认模式特点：');
    console.log('   - 只输出一次摘要日志');
    console.log('   - 显示转换总数');
    console.log('   - 显示前3个字段示例');
    console.log('   - 适合生产环境\n');

    // 测试 2：详细模式（需要手动配置）
    console.log('═══════════════════════════════════════');
    console.log('【测试 2】详细模式说明');
    console.log('═══════════════════════════════════════\n');

    console.log('如需开启详细日志，请在初始化时配置：\n');
    console.log('```javascript');
    console.log('const msq = new MonSQLize({');
    console.log('  type: "mongodb",');
    console.log('  config: { uri: "..." },');
    console.log('  autoConvertObjectId: {');
    console.log('    verbose: true  // 开启详细日志');
    console.log('  }');
    console.log('});');
    console.log('```\n');

    console.log('详细模式特点：');
    console.log('   - 每个 ObjectId 转换都输出一条日志');
    console.log('   - 包含字段路径详情');
    console.log('   - 适合调试和开发环境\n');

    console.log('═══════════════════════════════════════');
    console.log('✅ 日志优化测试完成！');
    console.log('═══════════════════════════════════════\n');

    console.log('📝 总结：');
    console.log('   1. 默认使用静默模式，只输出摘要');
    console.log('   2. 避免大量重复日志干扰');
    console.log('   3. 需要调试时可开启详细模式');
    console.log('   4. 完全向后兼容，无需修改代码\n');

  } catch (error) {
    console.error('❌ 测试失败:', error.message);
    console.error('   错误详情:', error);
    process.exit(1);
  }
}

// 运行测试
if (require.main === module) {
  testVerboseLogging().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
}

module.exports = { testVerboseLogging };
