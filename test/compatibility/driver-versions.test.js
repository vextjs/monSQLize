/**
 * MongoDB Driver 版本兼容性测试
 * 测试 monSQLize 在不同 MongoDB Driver 版本上的功能
 *
 * 运行方式: node test/compatibility/run-driver-test.js
 */

const versionAdapter = require('../utils/version-adapter');
const assert = require('assert');

describe('MongoDB Driver 版本兼容性测试', function() {
  this.timeout(30000);

  let MonSQLize;
  let msq;
  let testCollection;

  before(async function() {
    const report = versionAdapter.generateReport();
    console.log('\n📊 当前测试环境:');
    console.log(`  Node.js: ${report.node.version}`);
    console.log(`  MongoDB Driver: ${report.mongodbDriver.version} (主版本: ${report.mongodbDriver.major})`);
    console.log('\n✨ Driver 特性:');
    console.log(`  简化 findOneAnd: ${report.mongodbDriver.features.simplifiedFindOneAnd ? '✅' : '❌'}`);
    console.log(`  现代连接选项: ${report.mongodbDriver.features.modernConnectionOptions ? '✅' : '❌'}`);
    console.log('');

    // 加载 monSQLize
    MonSQLize = require('../../lib/index');

    // 使用版本适配器推荐的连接选项
    const connectionOptions = versionAdapter.getRecommendedConnectionOptions();

    msq = new MonSQLize({
      type: 'mongodb',
      databaseName: 'test_driver_compat',
      config: {
        useMemoryServer: true,
        ...connectionOptions,
      }
    });

    await msq.connect();
    testCollection = msq.model('driver_test');

    // 清理测试数据
    await testCollection.deleteMany({});
  });

  after(async function() {
    if (msq) {
      await msq.close();
    }
  });

  beforeEach(async function() {
    // 清理测试数据
    await testCollection.deleteMany({});
  });

  describe('连接选项兼容性', function() {
    it('应该使用推荐的连接选项成功连接', function() {
      const options = versionAdapter.getRecommendedConnectionOptions();
      assert.ok(options, '应该返回推荐选项');
      assert.ok(typeof options === 'object', '选项应该是对象');

      const driverInfo = versionAdapter.getDriverInfo();
      if (driverInfo.major >= 6) {
        // Driver 6.x: 不应该包含废弃选项
        assert.strictEqual(options.useNewUrlParser, undefined, 'Driver 6.x 不应该有 useNewUrlParser');
        assert.strictEqual(options.useUnifiedTopology, undefined, 'Driver 6.x 不应该有 useUnifiedTopology');
      } else if (driverInfo.major >= 5) {
        // Driver 5.x: 应该包含这些选项
        assert.strictEqual(options.useNewUrlParser, true, 'Driver 5.x 应该有 useNewUrlParser');
        assert.strictEqual(options.useUnifiedTopology, true, 'Driver 5.x 应该有 useUnifiedTopology');
      }
    });

    it('应该成功连接到数据库', function() {
      assert.ok(msq.isConnected(), '应该已连接');
    });
  });

  describe('findOneAndUpdate 返回值兼容性', function() {
    it('应该正确处理 findOneAndUpdate 返回值（默认选项）', async function() {
      // 插入测试数据
      await testCollection.insertOne({
        _id: 'test1',
        name: 'Alice',
        age: 25
      });

      // 使用 monSQLize 的 findOneAndUpdate
      const result = await testCollection.findOneAndUpdate(
        { _id: 'test1' },
        { $set: { age: 26 } }
      );

      // monSQLize 应该统一返回格式
      assert.ok(result, '应该返回结果');
      assert.ok(result.value || result._id, '应该包含文档数据');

      // 验证更新生效
      const updated = await testCollection.findOne({ _id: 'test1' });
      assert.strictEqual(updated.age, 26, '年龄应该更新为 26');
    });

    it('应该正确处理 findOneAndUpdate 返回值（returnDocument: after）', async function() {
      await testCollection.insertOne({
        _id: 'test2',
        name: 'Bob',
        age: 30
      });

      const result = await testCollection.findOneAndUpdate(
        { _id: 'test2' },
        { $set: { age: 31 } },
        { returnDocument: 'after' }
      );

      assert.ok(result, '应该返回结果');

      // 检查返回的文档
      const doc = result.value || result;
      assert.ok(doc, '应该有文档数据');
      assert.strictEqual(doc.age, 31, '应该返回更新后的文档');
    });

    it('应该正确处理 findOneAndUpdate 返回值（returnDocument: before）', async function() {
      await testCollection.insertOne({
        _id: 'test3',
        name: 'Charlie',
        age: 35
      });

      const result = await testCollection.findOneAndUpdate(
        { _id: 'test3' },
        { $set: { age: 36 } },
        { returnDocument: 'before' }
      );

      assert.ok(result, '应该返回结果');

      // 检查返回的文档
      const doc = result.value || result;
      assert.ok(doc, '应该有文档数据');
      assert.strictEqual(doc.age, 35, '应该返回更新前的文档');
    });

    it('应该正确处理文档不存在的情况', async function() {
      const result = await testCollection.findOneAndUpdate(
        { _id: 'nonexistent' },
        { $set: { age: 40 } }
      );

      // 文档不存在时，result 可能是 null 或包含 value: null
      const doc = result?.value !== undefined ? result.value : result;
      assert.strictEqual(doc, null, '不存在的文档应该返回 null');
    });
  });

  describe('findOneAndReplace 返回值兼容性', function() {
    it('应该正确处理 findOneAndReplace 返回值', async function() {
      await testCollection.insertOne({
        _id: 'test4',
        name: 'David',
        age: 40
      });

      const result = await testCollection.findOneAndReplace(
        { _id: 'test4' },
        { _id: 'test4', name: 'David Updated', age: 41, status: 'active' }
      );

      assert.ok(result, '应该返回结果');

      // 验证替换生效
      const replaced = await testCollection.findOne({ _id: 'test4' });
      assert.strictEqual(replaced.name, 'David Updated');
      assert.strictEqual(replaced.age, 41);
      assert.strictEqual(replaced.status, 'active');
    });
  });

  describe('findOneAndDelete 返回值兼容性', function() {
    it('应该正确处理 findOneAndDelete 返回值', async function() {
      await testCollection.insertOne({
        _id: 'test5',
        name: 'Eve',
        age: 45
      });

      const result = await testCollection.findOneAndDelete({ _id: 'test5' });

      assert.ok(result, '应该返回结果');

      // 检查返回的文档
      const doc = result.value || result;
      assert.ok(doc, '应该返回被删除的文档');
      assert.strictEqual(doc._id, 'test5');
      assert.strictEqual(doc.name, 'Eve');

      // 验证删除生效
      const deleted = await testCollection.findOne({ _id: 'test5' });
      assert.strictEqual(deleted, null, '文档应该被删除');
    });
  });

  describe('CRUD 操作基础兼容性', function() {
    it('应该正确执行 insertOne', async function() {
      const result = await testCollection.insertOne({
        _id: 'crud1',
        name: 'Test Insert'
      });

      assert.ok(result.insertedId, '应该返回插入的 ID');
      assert.strictEqual(result.insertedId, 'crud1');
    });

    it('应该正确执行 insertMany', async function() {
      const result = await testCollection.insertMany([
        { _id: 'crud2', name: 'Test 2' },
        { _id: 'crud3', name: 'Test 3' },
        { _id: 'crud4', name: 'Test 4' },
      ]);

      assert.ok(result.insertedIds, '应该返回插入的 IDs');
      assert.strictEqual(Object.keys(result.insertedIds).length, 3);
    });

    it('应该正确执行 find', async function() {
      await testCollection.insertMany([
        { name: 'Find Test 1', type: 'test' },
        { name: 'Find Test 2', type: 'test' },
        { name: 'Find Test 3', type: 'other' },
      ]);

      const results = await testCollection.find({ type: 'test' });
      assert.strictEqual(results.length, 2, '应该找到 2 个文档');
    });

    it('应该正确执行 updateOne', async function() {
      await testCollection.insertOne({ _id: 'update1', name: 'Before', count: 0 });

      const result = await testCollection.updateOne(
        { _id: 'update1' },
        { $set: { name: 'After' }, $inc: { count: 1 } }
      );

      assert.strictEqual(result.modifiedCount, 1, '应该修改 1 个文档');

      const updated = await testCollection.findOne({ _id: 'update1' });
      assert.strictEqual(updated.name, 'After');
      assert.strictEqual(updated.count, 1);
    });

    it('应该正确执行 updateMany', async function() {
      await testCollection.insertMany([
        { type: 'batch', status: 'pending' },
        { type: 'batch', status: 'pending' },
        { type: 'batch', status: 'pending' },
      ]);

      const result = await testCollection.updateMany(
        { type: 'batch' },
        { $set: { status: 'completed' } }
      );

      assert.strictEqual(result.modifiedCount, 3, '应该修改 3 个文档');
    });

    it('应该正确执行 deleteOne', async function() {
      await testCollection.insertOne({ _id: 'delete1', name: 'To Delete' });

      const result = await testCollection.deleteOne({ _id: 'delete1' });
      assert.strictEqual(result.deletedCount, 1, '应该删除 1 个文档');

      const deleted = await testCollection.findOne({ _id: 'delete1' });
      assert.strictEqual(deleted, null);
    });

    it('应该正确执行 deleteMany', async function() {
      await testCollection.insertMany([
        { type: 'to_delete', name: 'A' },
        { type: 'to_delete', name: 'B' },
        { type: 'keep', name: 'C' },
      ]);

      const result = await testCollection.deleteMany({ type: 'to_delete' });
      assert.strictEqual(result.deletedCount, 2, '应该删除 2 个文档');

      const remaining = await testCollection.find({ type: 'to_delete' });
      assert.strictEqual(remaining.length, 0);
    });
  });

  describe('索引操作兼容性', function() {
    it('应该正确创建索引', async function() {
      const result = await testCollection.createIndex({ name: 1 });
      assert.ok(result, '应该返回索引名称');
    });

    it('应该正确列出索引', async function() {
      await testCollection.createIndex({ age: 1 });

      const indexes = await testCollection.listIndexes();
      assert.ok(Array.isArray(indexes), '应该返回索引数组');
      assert.ok(indexes.length > 0, '应该至少有一个索引（_id）');
    });

    it('应该正确删除索引', async function() {
      await testCollection.createIndex({ email: 1 }, { name: 'email_idx' });

      const result = await testCollection.dropIndex('email_idx');
      assert.ok(result, '应该成功删除索引');
    });
  });

  describe('聚合操作兼容性', function() {
    beforeEach(async function() {
      await testCollection.insertMany([
        { category: 'A', value: 10 },
        { category: 'A', value: 20 },
        { category: 'B', value: 15 },
        { category: 'B', value: 25 },
      ]);
    });

    it('应该正确执行聚合管道', async function() {
      const result = await testCollection.aggregate([
        { $group: { _id: '$category', total: { $sum: '$value' } } },
        { $sort: { _id: 1 } }
      ]);

      assert.ok(Array.isArray(result), '应该返回数组');
      assert.strictEqual(result.length, 2, '应该有 2 个分组');

      const categoryA = result.find(r => r._id === 'A');
      const categoryB = result.find(r => r._id === 'B');

      assert.strictEqual(categoryA.total, 30);
      assert.strictEqual(categoryB.total, 40);
    });
  });

  describe('事务支持兼容性', function() {
    it('应该能够启动事务（如果支持）', async function() {
      try {
        const session = await msq.startSession();
        session.startTransaction();

        await testCollection.insertOne({ _id: 'tx1', name: 'Transaction Test' }, { session });

        await session.commitTransaction();
        await session.endSession();

        const doc = await testCollection.findOne({ _id: 'tx1' });
        assert.ok(doc, '事务提交后应该能找到文档');
      } catch (error) {
        // MongoDB Memory Server 可能不支持事务（需要副本集）
        if (error.message.includes('Transactions are only supported')) {
          console.log('  ⏭️  跳过: 当前环境不支持事务');
          this.skip();
        } else {
          throw error;
        }
      }
    });
  });

  describe('版本适配器功能', function() {
    it('应该正确适配 findOneAndUpdate 返回值', async function() {
      await testCollection.insertOne({ _id: 'adapt1', value: 100 });

      // 获取原生集合
      const nativeCollection = testCollection._collection || testCollection.collection;

      // 直接调用原生 findOneAndUpdate
      const nativeResult = await nativeCollection.findOneAndUpdate(
        { _id: 'adapt1' },
        { $set: { value: 200 } }
      );

      // 使用适配器统一格式
      const adaptedResult = versionAdapter.adaptFindOneAndUpdateResult(nativeResult);

      assert.ok(adaptedResult, '应该返回适配后的结果');
      assert.ok(adaptedResult.value, '应该有 value 字段');
      assert.ok(adaptedResult.ok !== undefined, '应该有 ok 字段');
    });

    it('应该生成完整的版本报告', function() {
      const report = versionAdapter.generateReport();

      assert.ok(report.node, '应该有 Node.js 信息');
      assert.ok(report.mongodbDriver, '应该有 MongoDB Driver 信息');
      assert.ok(report.compatibility, '应该有兼容性信息');

      assert.ok(report.node.version, '应该有 Node.js 版本');
      assert.ok(report.mongodbDriver.version, '应该有 Driver 版本');
      assert.ok(report.compatibility.recommendedConnectionOptions, '应该有推荐连接选项');
    });
  });
});

