/**
 * MongoDB Server 版本兼容性测试
 * 测试 monSQLize 在不同 MongoDB Server 版本上的功能
 *
 * 运行方式: node test/compatibility/run-server-test.js
 */

const ServerFeatures = require('../../lib/common/server-features');
const assert = require('assert');

describe('MongoDB Server 版本兼容性测试', function() {
  this.timeout(30000);

  let MonSQLize;
  let msq;
  let testCollection;
  let serverFeatures;

  before(async function() {
    console.log('\n📊 MongoDB Server 版本兼容性测试\n');

    // 加载 monSQLize
    MonSQLize = require('../../lib/index');

    msq = new MonSQLize({
      type: 'mongodb',
      databaseName: 'test_server_compat',
      config: {
        useMemoryServer: true,
      }
    });

    await msq.connect();
    testCollection = msq.model('server_test');

    // 创建 Server 特性探测器（传入 monSQLize 实例）
    serverFeatures = new ServerFeatures(msq);

    // 获取并显示 Server 信息
    const serverInfo = await serverFeatures.getServerInfo();
    console.log(`  MongoDB Server: ${serverInfo.version}`);
    console.log(`  Bits: ${serverInfo.bits}`);
    console.log('');

    // 生成特性报告
    const featureReport = await serverFeatures.generateFeatureReport();
    console.log('✨ 支持的特性:');
    Object.entries(featureReport.features).forEach(([feature, supported]) => {
      console.log(`  ${feature}: ${supported ? '✅' : '❌'}`);
    });
    console.log('');

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

  describe('Server 信息获取', function() {
    it('应该能够获取 Server 版本信息', async function() {
      const info = await serverFeatures.getServerInfo();

      assert.ok(info, '应该返回 Server 信息');
      assert.ok(info.version, '应该有版本号');
      assert.ok(Array.isArray(info.versionArray), '应该有版本数组');
      assert.ok(info.versionArray.length >= 3, '版本数组应该至少有 3 个元素');
    });

    it('应该能够获取主版本号', async function() {
      const major = await serverFeatures.getMajorVersion();

      assert.ok(typeof major === 'number', '主版本号应该是数字');
      assert.ok(major > 0, '主版本号应该大于 0');
    });

    it('应该能够获取次版本号', async function() {
      const minor = await serverFeatures.getMinorVersion();

      assert.ok(typeof minor === 'number', '次版本号应该是数字');
      assert.ok(minor >= 0, '次版本号应该 >= 0');
    });
  });

  describe('基础 CRUD 操作兼容性', function() {
    it('应该支持 insertOne', async function() {
      const result = await testCollection.insertOne({
        _id: 'test1',
        name: 'Test Document',
        value: 100,
      });

      assert.ok(result.insertedId, '应该返回插入的 ID');
      assert.strictEqual(result.insertedId, 'test1');
    });

    it('应该支持 find', async function() {
      await testCollection.insertMany([
        { name: 'Doc 1', type: 'test' },
        { name: 'Doc 2', type: 'test' },
        { name: 'Doc 3', type: 'other' },
      ]);

      const results = await testCollection.find({ type: 'test' });
      assert.strictEqual(results.length, 2);
    });

    it('应该支持 updateOne', async function() {
      await testCollection.insertOne({ _id: 'update1', value: 1 });

      const result = await testCollection.updateOne(
        { _id: 'update1' },
        { $inc: { value: 10 } }
      );

      assert.strictEqual(result.modifiedCount, 1);

      const doc = await testCollection.findOne({ _id: 'update1' });
      assert.strictEqual(doc.value, 11);
    });

    it('应该支持 deleteOne', async function() {
      await testCollection.insertOne({ _id: 'delete1', name: 'To Delete' });

      const result = await testCollection.deleteOne({ _id: 'delete1' });
      assert.strictEqual(result.deletedCount, 1);

      const doc = await testCollection.findOne({ _id: 'delete1' });
      assert.strictEqual(doc, null);
    });
  });

  describe('索引操作兼容性', function() {
    it('应该支持创建单字段索引', async function() {
      const indexName = await testCollection.createIndex({ name: 1 });
      assert.ok(indexName, '应该返回索引名称');
    });

    it('应该支持创建复合索引', async function() {
      const indexName = await testCollection.createIndex({
        name: 1,
        value: -1
      });
      assert.ok(indexName, '应该返回索引名称');
    });

    it('应该支持列出索引', async function() {
      await testCollection.createIndex({ email: 1 });

      const indexes = await testCollection.listIndexes();
      assert.ok(Array.isArray(indexes), '应该返回索引数组');
      assert.ok(indexes.length >= 1, '应该至少有一个索引（_id）');
    });

    it('应该支持通配符索引（如果 Server 支持）', async function() {
      const supportsWildcard = await serverFeatures.supportsWildcardIndexes();

      if (!supportsWildcard) {
        console.log('  ⏭️  跳过: Server 不支持通配符索引（需要 4.2+）');
        this.skip();
        return;
      }

      try {
        const indexName = await testCollection.createIndex({ '$**': 1 });
        assert.ok(indexName, '应该成功创建通配符索引');
      } catch (error) {
        // MongoDB Memory Server 可能不支持某些索引类型
        if (error.message.includes('not supported')) {
          console.log('  ⏭️  跳过: 当前环境不支持通配符索引');
          this.skip();
        } else {
          throw error;
        }
      }
    });
  });

  describe('聚合操作兼容性', function() {
    beforeEach(async function() {
      await testCollection.insertMany([
        { category: 'A', value: 10, date: new Date('2024-01-01') },
        { category: 'A', value: 20, date: new Date('2024-01-02') },
        { category: 'B', value: 15, date: new Date('2024-01-03') },
        { category: 'B', value: 25, date: new Date('2024-01-04') },
      ]);
    });

    it('应该支持基础聚合操作（$group, $sort）', async function() {
      const result = await testCollection.aggregate([
        { $group: { _id: '$category', total: { $sum: '$value' } } },
        { $sort: { _id: 1 } }
      ]);

      assert.ok(Array.isArray(result));
      assert.strictEqual(result.length, 2);

      const categoryA = result.find(r => r._id === 'A');
      assert.strictEqual(categoryA.total, 30);
    });

    it('应该支持 $match 和 $project', async function() {
      const result = await testCollection.aggregate([
        { $match: { category: 'A' } },
        { $project: { category: 1, value: 1, _id: 0 } }
      ]);

      assert.strictEqual(result.length, 2);
      assert.ok(result[0].category);
      assert.ok(result[0].value);
      assert.strictEqual(result[0]._id, undefined);
    });

    it('应该支持 $function 操作符（如果 Server 支持）', async function() {
      const supportsFunction = await serverFeatures.supportsFunctionOperator();

      if (!supportsFunction) {
        console.log('  ⏭️  跳过: Server 不支持 $function（需要 4.4+）');
        this.skip();
        return;
      }

      try {
        const result = await testCollection.aggregate([
          {
            $addFields: {
              doubled: {
                $function: {
                  body: 'function(value) { return value * 2; }',
                  args: ['$value'],
                  lang: 'js'
                }
              }
            }
          },
          { $limit: 1 }
        ]);

        assert.ok(result.length > 0);
        assert.strictEqual(result[0].doubled, result[0].value * 2);
      } catch (error) {
        // MongoDB Memory Server 可能不支持 $function
        if (error.message.includes('not supported') || error.message.includes('$function')) {
          console.log('  ⏭️  跳过: 当前环境不支持 $function');
          this.skip();
        } else {
          throw error;
        }
      }
    });

    it('应该支持 $setWindowFields（如果 Server 支持）', async function() {
      const supportsWindowFields = await serverFeatures.supportsSetWindowFields();

      if (!supportsWindowFields) {
        console.log('  ⏭️  跳过: Server 不支持 $setWindowFields（需要 5.0+）');
        this.skip();
        return;
      }

      try {
        const result = await testCollection.aggregate([
          { $sort: { date: 1 } },
          {
            $setWindowFields: {
              sortBy: { date: 1 },
              output: {
                runningTotal: {
                  $sum: '$value',
                  window: {
                    documents: ['unbounded', 'current']
                  }
                }
              }
            }
          }
        ]);

        assert.ok(result.length > 0);
        assert.ok(result[0].runningTotal !== undefined);
      } catch (error) {
        // MongoDB Memory Server 可能不支持 $setWindowFields
        if (error.message.includes('not supported') || error.message.includes('$setWindowFields')) {
          console.log('  ⏭️  跳过: 当前环境不支持 $setWindowFields');
          this.skip();
        } else {
          throw error;
        }
      }
    });
  });

  describe('事务支持兼容性', function() {
    it('应该能够检测事务支持', async function() {
      const supportsTransactions = await serverFeatures.supportsTransactions();
      const major = await serverFeatures.getMajorVersion();

      if (major >= 4) {
        assert.strictEqual(supportsTransactions, true, 'MongoDB 4.0+ 应该支持事务');
      }
    });

    it('应该能够启动和提交事务（如果支持）', async function() {
      const supportsTransactions = await serverFeatures.supportsTransactions();

      if (!supportsTransactions) {
        console.log('  ⏭️  跳过: Server 不支持事务（需要 4.0+）');
        this.skip();
        return;
      }

      try {
        const session = await msq.startSession();
        session.startTransaction();

        await testCollection.insertOne(
          { _id: 'tx1', name: 'Transaction Test' },
          { session }
        );

        await session.commitTransaction();
        await session.endSession();

        const doc = await testCollection.findOne({ _id: 'tx1' });
        assert.ok(doc, '事务提交后应该能找到文档');
        assert.strictEqual(doc.name, 'Transaction Test');
      } catch (error) {
        // MongoDB Memory Server 可能不支持事务（需要副本集）
        if (error.message.includes('Transactions') ||
            error.message.includes('replica set')) {
          console.log('  ⏭️  跳过: 当前环境不支持事务（需要副本集）');
          this.skip();
        } else {
          throw error;
        }
      }
    });

    it('应该能够回滚事务（如果支持）', async function() {
      const supportsTransactions = await serverFeatures.supportsTransactions();

      if (!supportsTransactions) {
        console.log('  ⏭️  跳过: Server 不支持事务（需要 4.0+）');
        this.skip();
        return;
      }

      try {
        const session = await msq.startSession();
        session.startTransaction();

        await testCollection.insertOne(
          { _id: 'tx2', name: 'Should Rollback' },
          { session }
        );

        await session.abortTransaction();
        await session.endSession();

        const doc = await testCollection.findOne({ _id: 'tx2' });
        assert.strictEqual(doc, null, '事务回滚后不应该找到文档');
      } catch (error) {
        if (error.message.includes('Transactions') ||
            error.message.includes('replica set')) {
          console.log('  ⏭️  跳过: 当前环境不支持事务（需要副本集）');
          this.skip();
        } else {
          throw error;
        }
      }
    });
  });

  describe('特性探测功能', function() {
    it('应该生成完整的特性报告', async function() {
      const report = await serverFeatures.generateFeatureReport();

      assert.ok(report, '应该返回报告');
      assert.ok(report.serverVersion, '应该有 Server 版本');
      assert.ok(report.features, '应该有特性列表');

      // 验证特性列表的结构
      assert.ok(typeof report.features.transactions === 'boolean');
      assert.ok(typeof report.features.wildcardIndexes === 'boolean');
      assert.ok(typeof report.features.functionOperator === 'boolean');
      assert.ok(typeof report.features.timeSeriesCollections === 'boolean');
    });

    it('应该能够检测聚合表达式支持', async function() {
      const supportsDateAdd = await serverFeatures.supportsAggregationExpression('$dateAdd');
      const major = await serverFeatures.getMajorVersion();

      if (major >= 5) {
        assert.strictEqual(supportsDateAdd, true, 'MongoDB 5.0+ 应该支持 $dateAdd');
      } else {
        assert.strictEqual(supportsDateAdd, false, 'MongoDB 5.0 以下不应该支持 $dateAdd');
      }
    });
  });
});

