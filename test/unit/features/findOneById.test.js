/**
 * findOneById 方法完整测试套件
 * 测试 findOneById 便利方法的所有功能和边界情况
 */

const MonSQLize = require('../../../lib');
const assert = require('assert');
const { ObjectId } = require('mongodb');

describe('findOneById 方法测试套件', function () {
  this.timeout(30000);

  let msq;
  let collection;
  let nativeCollection;
  const testDocs = [];
  const testIds = [];

  // 准备测试数据
  before(async function () {
    console.log('🔧 初始化测试环境...');

    msq = new MonSQLize({
      type: 'mongodb',
      databaseName: 'test_find_one_by_id',
      config: { useMemoryServer: true },
      slowQueryMs: 1000
    });

    const conn = await msq.connect();
    collection = conn.collection;

    // 获取原生 MongoDB 集合对象
    const db = msq._adapter.db;
    nativeCollection = db.collection('test_users');

    // 清空并插入测试数据
    await nativeCollection.deleteMany({});

    // 插入 10 个测试用户
    for (let i = 1; i <= 10; i++) {
      const doc = {
        userId: `USER-${String(i).padStart(3, '0')}`,
        name: `用户 ${i}`,
        email: `user${i}@example.com`,
        age: 20 + i,
        role: i % 3 === 0 ? 'admin' : 'user',
        status: i % 2 === 0 ? 'active' : 'inactive',
        createdAt: new Date(Date.now() - i * 86400000)
      };
      testDocs.push(doc);
    }

    const result = await nativeCollection.insertMany(testDocs);
    testIds.push(...Object.values(result.insertedIds));
    console.log(`✅ 测试数据准备完成：${testIds.length} 个用户`);
  });

  after(async function () {
    console.log('🧹 清理测试环境...');
    if (nativeCollection) {
      await nativeCollection.deleteMany({});
    }
    if (msq) {
      await msq.close();
    }
    console.log('✅ 测试环境清理完成');
  });

  describe('1. 基础功能测试', function () {
    it('1.1 应该能通过 ObjectId 查询文档', async function () {
      const id = testIds[0];
      const result = await collection('test_users').findOneById(id);

      assert.ok(result, '应该返回文档');
      assert.equal(result._id.toString(), id.toString(), '_id 应该匹配');
      assert.equal(result.userId, testDocs[0].userId, 'userId 应该匹配');
    });

    it('1.2 应该能通过字符串 ID 查询文档（自动转换）', async function () {
      const id = testIds[1];
      const idString = id.toString();
      const result = await collection('test_users').findOneById(idString);

      assert.ok(result, '应该返回文档');
      assert.equal(result._id.toString(), id.toString(), '_id 应该匹配');
      assert.equal(result.userId, testDocs[1].userId, 'userId 应该匹配');
    });

    it('1.3 应该返回 null 当文档不存在时', async function () {
      const nonExistentId = new ObjectId();
      const result = await collection('test_users').findOneById(nonExistentId);

      assert.strictEqual(result, null, '应该返回 null');
    });

    it('1.4 应该返回 null 当使用不存在的字符串 ID 时', async function () {
      const nonExistentId = '507f1f77bcf86cd799439011';
      const result = await collection('test_users').findOneById(nonExistentId);

      assert.strictEqual(result, null, '应该返回 null');
    });
  });

  describe('2. 选项支持测试', function () {
    it('2.1 应该支持 projection 选项（对象格式）', async function () {
      const id = testIds[2];
      const result = await collection('test_users').findOneById(id, {
        projection: { name: 1, email: 1 }
      });

      assert.ok(result, '应该返回文档');
      assert.ok(result._id, '应该包含 _id');
      assert.ok(result.name, '应该包含 name');
      assert.ok(result.email, '应该包含 email');
      assert.equal(result.userId, undefined, '不应该包含 userId');
      assert.equal(result.age, undefined, '不应该包含 age');
    });

    it('2.2 应该支持 projection 选项（数组格式）', async function () {
      const id = testIds[3];
      const result = await collection('test_users').findOneById(id, {
        projection: ['name', 'email', 'age']
      });

      assert.ok(result, '应该返回文档');
      assert.ok(result._id, '应该包含 _id');
      assert.ok(result.name, '应该包含 name');
      assert.ok(result.email, '应该包含 email');
      assert.ok(typeof result.age === 'number', '应该包含 age');
      assert.equal(result.userId, undefined, '不应该包含 userId');
    });

    it('2.3 应该支持 maxTimeMS 选项', async function () {
      const id = testIds[4];
      const result = await collection('test_users').findOneById(id, {
        maxTimeMS: 5000
      });

      assert.ok(result, '应该返回文档');
    });

    it('2.4 应该支持 comment 选项', async function () {
      const id = testIds[5];
      const result = await collection('test_users').findOneById(id, {
        comment: 'findOneById test query'
      });

      assert.ok(result, '应该返回文档');
    });
  });

  describe('3. 缓存功能测试', function () {
    it('3.1 应该支持缓存（第一次查询）', async function () {
      const id = testIds[6];
      const result1 = await collection('test_users').findOneById(id, {
        cache: 5000
      });

      assert.ok(result1, '应该返回文档');
    });

    it('3.2 应该从缓存返回结果（第二次查询）', async function () {
      const id = testIds[6];

      const startTime = Date.now();
      const result = await collection('test_users').findOneById(id, {
        cache: 5000
      });
      const duration = Date.now() - startTime;

      assert.ok(result, '应该返回文档');
      assert.ok(duration < 50, `缓存查询应该很快（实际：${duration}ms）`);
    });
  });

  describe('4. 参数验证测试', function () {
    it('4.1 应该拒绝空 ID', async function () {
      try {
        await collection('test_users').findOneById(null);
        assert.fail('应该抛出错误');
      } catch (error) {
        assert.ok(error.message.includes('id 参数是必需的'), '错误信息应该正确');
      }
    });

    it('4.2 应该拒绝 undefined ID', async function () {
      try {
        await collection('test_users').findOneById(undefined);
        assert.fail('应该抛出错误');
      } catch (error) {
        assert.ok(error.message.includes('id 参数是必需的'), '错误信息应该正确');
      }
    });

    it('4.3 应该拒绝无效的字符串 ID 格式', async function () {
      try {
        await collection('test_users').findOneById('invalid-id');
        assert.fail('应该抛出错误');
      } catch (error) {
        assert.ok(error.message.includes('无效的 ObjectId 格式'), '错误信息应该正确');
      }
    });

    it('4.4 应该拒绝无效的字符串 ID（长度不对）', async function () {
      try {
        await collection('test_users').findOneById('123');
        assert.fail('应该抛出错误');
      } catch (error) {
        assert.ok(error.message.includes('无效的 ObjectId 格式'), '错误信息应该正确');
      }
    });

    it('4.5 应该拒绝错误的参数类型', async function () {
      try {
        await collection('test_users').findOneById(12345);
        assert.fail('应该抛出错误');
      } catch (error) {
        assert.ok(error.message.includes('id 必须是字符串或 ObjectId 实例'), '错误信息应该正确');
      }
    });

    it('4.6 应该拒绝对象类型的 ID（非 ObjectId）', async function () {
      try {
        await collection('test_users').findOneById({ _id: 'test' });
        assert.fail('应该抛出错误');
      } catch (error) {
        assert.ok(error.message.includes('id 必须是字符串或 ObjectId 实例'), '错误信息应该正确');
      }
    });
  });

  describe('5. 边界情况测试', function () {
    it('5.1 应该处理空集合', async function () {
      // 创建一个空集合
      const emptyCollection = 'test_empty_collection';
      await msq._adapter.db.collection(emptyCollection).deleteMany({});

      const result = await collection(emptyCollection).findOneById(new ObjectId());
      assert.strictEqual(result, null, '应该返回 null');
    });

    it('5.2 应该处理大小写混合的十六进制字符串', async function () {
      const id = testIds[7];
      const idString = id.toString();
      const mixedCaseId = idString.substring(0, 12).toUpperCase() + idString.substring(12).toLowerCase();

      const result = await collection('test_users').findOneById(mixedCaseId);
      assert.ok(result, '应该返回文档');
      assert.equal(result._id.toString(), id.toString(), '_id 应该匹配');
    });
  });

  describe('6. 性能对比测试', function () {
    it('6.1 findOneById 应该与 findOne({ _id }) 性能相当', async function () {
      const id = testIds[8];

      // 测试 findOne
      const start1 = Date.now();
      const result1 = await collection('test_users').findOne({ _id: id });
      const duration1 = Date.now() - start1;

      // 测试 findOneById
      const start2 = Date.now();
      const result2 = await collection('test_users').findOneById(id);
      const duration2 = Date.now() - start2;

      assert.ok(result1, 'findOne 应该返回文档');
      assert.ok(result2, 'findOneById 应该返回文档');
      assert.equal(result1._id.toString(), result2._id.toString(), '结果应该相同');

      console.log(`  📊 性能对比: findOne(${duration1}ms) vs findOneById(${duration2}ms)`);
      // findOneById 性能应该相当或稍慢（因为有参数验证）
      assert.ok(duration2 < duration1 * 2, 'findOneById 性能应该可接受');
    });
  });

  describe('7. 集成测试', function () {
    it('7.1 应该与其他查询方法结合使用', async function () {
      const id = testIds[9];

      // 先用 findOneById 查询
      const user = await collection('test_users').findOneById(id);
      assert.ok(user, '应该找到用户');

      // 再用 find 查询相同条件
      const users = await collection('test_users').find(
        { userId: user.userId },
        { limit: 1 }
      );
      assert.equal(users.length, 1, '应该找到 1 个用户');
      assert.equal(users[0]._id.toString(), id.toString(), '_id 应该匹配');
    });

    it('7.2 应该正确返回所有字段（无 projection）', async function () {
      const id = testIds[0];
      const result = await collection('test_users').findOneById(id);

      assert.ok(result, '应该返回文档');
      assert.ok(result._id, '应该包含 _id');
      assert.ok(result.userId, '应该包含 userId');
      assert.ok(result.name, '应该包含 name');
      assert.ok(result.email, '应该包含 email');
      assert.ok(typeof result.age === 'number', '应该包含 age');
      assert.ok(result.role, '应该包含 role');
      assert.ok(result.status, '应该包含 status');
      assert.ok(result.createdAt, '应该包含 createdAt');
    });
  });
});

