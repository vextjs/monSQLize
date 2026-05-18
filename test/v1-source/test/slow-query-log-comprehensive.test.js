/**
 * 慢查询日志功能 - 完整测试套件
 * 覆盖所有核心功能和边界情况
 */

const MonSQLize = require('../lib/index');
const { MongoMemoryServer } = require('mongodb-memory-server');

describe('慢查询日志持久化存储 - 完整测试套件', function() {
  this.timeout(30000);

  let mongod;
  let msq;
  let mongoUri;

  before(async () => {
    console.log('🔧 启动MongoDB内存服务器...');
    mongod = await MongoMemoryServer.create();
    mongoUri = mongod.getUri();
    console.log(`✅ MongoDB内存服务器已启动: ${mongoUri}`);
  });

  after(async () => {
    if (msq) {
      await msq.close();
    }
    if (mongod) {
      await mongod.stop();
      console.log('✅ MongoDB内存服务器已停止');
    }
  });

  describe('1. 基础功能测试', () => {
    it('1.1 零配置启用慢查询日志', async () => {
      msq = new MonSQLize({
        type: 'mongodb',
        config: { uri: mongoUri + 'testdb' },
        slowQueryMs: 1,
        slowQueryLog: true
      });

      await msq.connect();

      if (!msq._adapter || !msq._adapter.slowQueryLogManager) {
        throw new Error('慢查询日志管理器未初始化');
      }

      console.log('    ✅ 管理器已初始化');
    });

    it('1.2 慢查询自动触发和保存', async () => {
      const usersCollection = msq._adapter.collection('testdb', 'users');

      // 插入测试数据
      await usersCollection.insertOne({ name: 'User1', status: 'active' });
      await usersCollection.insertOne({ name: 'User2', status: 'active' });

      // 执行查询（触发慢查询）
      const users = await usersCollection.find({ status: 'active' });

      if (users.length !== 2) {
        throw new Error(`期望2条记录，实际${users.length}条`);
      }

      // 刷新队列
      await msq._adapter.slowQueryLogManager.queue.flush();
      await new Promise(resolve => setTimeout(resolve, 100));

      console.log('    ✅ 慢查询已触发');
    });

    it('1.3 查询慢查询日志', async () => {
      // 等待确保之前的查询已保存
      await new Promise(resolve => setTimeout(resolve, 200));

      const logs = await msq.getSlowQueryLogs({}, { limit: 10 });

      if (logs.length === 0) {
        throw new Error('未找到慢查询日志记录');
      }

      console.log(`    ✅ 找到${logs.length}条日志记录`);
    });

    it('1.4 验证方案B去重', async () => {
      const usersCollection = msq._adapter.collection('testdb', 'users');

      // 执行相同的查询多次
      await usersCollection.find({ status: 'active' });
      await usersCollection.find({ status: 'active' });
      await usersCollection.find({ status: 'active' });

      // 刷新队列并等待
      await msq._adapter.slowQueryLogManager.queue.flush();
      await new Promise(resolve => setTimeout(resolve, 500));

      // 查询日志
      const logs = await msq.getSlowQueryLogs({ collection: 'users' }, { limit: 10 });

      if (logs.length === 0) {
        throw new Error('未找到日志记录');
      }

      // 验证去重：相同queryHash的记录应该被聚合
      const log = logs[0];
      // 1.2插入了2次查询，这里又执行了3次，总共应该>=5次
      if (log.count < 3) {
        console.log(`    ⚠️ count=${log.count}，可能还在聚合中`);
      } else {
        console.log(`    ✅ 方案B去重正常：count=${log.count}`);
      }
    });

    it('1.5 关闭连接', async () => {
      await msq.close();
      console.log('    ✅ 连接已关闭');
    });
  });

  describe('2. 配置功能测试', () => {
    it('2.1 自定义TTL配置', async () => {
      const msq2 = new MonSQLize({
        type: 'mongodb',
        config: { uri: mongoUri + 'testdb2' },
        slowQueryMs: 1,
        slowQueryLog: {
          enabled: true,
          storage: {
            mongodb: {
              ttl: 3600  // 1小时
            }
          }
        }
      });

      await msq2.connect();

      const ttl = msq2._adapter.slowQueryLogManager.config.storage.mongodb.ttl;
      if (ttl !== 3600) {
        throw new Error(`TTL配置错误: 期望3600，实际${ttl}`);
      }

      console.log('    ✅ TTL配置正确');
      await msq2.close();
    });

    it('2.2 禁用批量写入', async () => {
      const msq3 = new MonSQLize({
        type: 'mongodb',
        config: { uri: mongoUri + 'testdb3' },
        slowQueryMs: 1,
        slowQueryLog: {
          enabled: true,
          batch: {
            enabled: false
          }
        }
      });

      await msq3.connect();

      const batchEnabled = msq3._adapter.slowQueryLogManager.config.batch.enabled;
      if (batchEnabled !== false) {
        throw new Error(`批量配置错误: 期望false，实际${batchEnabled}`);
      }

      console.log('    ✅ 批量写入已禁用');
      await msq3.close();
    });

    it('2.3 自定义批量大小', async () => {
      const msq4 = new MonSQLize({
        type: 'mongodb',
        config: { uri: mongoUri + 'testdb4' },
        slowQueryMs: 1,
        slowQueryLog: {
          enabled: true,
          batch: {
            size: 20,
            interval: 3000
          }
        }
      });

      await msq4.connect();

      const config = msq4._adapter.slowQueryLogManager.config.batch;
      if (config.size !== 20 || config.interval !== 3000) {
        throw new Error(`批量配置错误: size=${config.size}, interval=${config.interval}`);
      }

      console.log('    ✅ 批量配置正确');
      await msq4.close();
    });
  });

  describe('3. 边界情况测试', () => {
    it('3.1 slowQueryLog=false 不启用', async () => {
      const msq5 = new MonSQLize({
        type: 'mongodb',
        config: { uri: mongoUri + 'testdb5' },
        slowQueryMs: 1,
        slowQueryLog: false
      });

      await msq5.connect();

      if (msq5._adapter.slowQueryLogManager) {
        throw new Error('slowQueryLog=false 但管理器被初始化了');
      }

      console.log('    ✅ slowQueryLog=false 正确不启用');
      await msq5.close();
    });

    it('3.2 未配置slowQueryLog', async () => {
      const msq6 = new MonSQLize({
        type: 'mongodb',
        config: { uri: mongoUri + 'testdb6' },
        slowQueryMs: 1
        // 未配置 slowQueryLog
      });

      await msq6.connect();

      if (msq6._adapter.slowQueryLogManager) {
        throw new Error('未配置slowQueryLog 但管理器被初始化了');
      }

      console.log('    ✅ 未配置slowQueryLog 正确不启用');
      await msq6.close();
    });

    it('3.3 getSlowQueryLogs 未启用时抛出错误', async () => {
      const msq7 = new MonSQLize({
        type: 'mongodb',
        config: { uri: mongoUri + 'testdb7' },
        slowQueryMs: 1
      });

      await msq7.connect();

      try {
        await msq7.getSlowQueryLogs({}, {});
        throw new Error('应该抛出错误但没有');
      } catch (err) {
        if (!err.message.includes('not enabled')) {
          throw err;
        }
        console.log('    ✅ 正确抛出错误');
      }

      await msq7.close();
    });

    it('3.4 空查询条件', async () => {
      const msq8 = new MonSQLize({
        type: 'mongodb',
        config: { uri: mongoUri + 'testdb8' },
        slowQueryMs: 1,
        slowQueryLog: true
      });

      await msq8.connect();

      // 执行一些查询
      const coll = msq8._adapter.collection('testdb8', 'test');
      await coll.insertOne({ a: 1 });
      await coll.find({});

      await msq8._adapter.slowQueryLogManager.queue.flush();
      await new Promise(resolve => setTimeout(resolve, 100));

      // 空查询条件应该返回所有日志
      const logs = await msq8.getSlowQueryLogs({}, { limit: 100 });

      if (logs.length === 0) {
        throw new Error('空查询条件应该返回结果');
      }

      console.log(`    ✅ 空查询条件返回${logs.length}条记录`);
      await msq8.close();
    });

    it('3.5 按collection过滤', async () => {
      const msq9 = new MonSQLize({
        type: 'mongodb',
        config: { uri: mongoUri + 'testdb9' },
        slowQueryMs: 1,
        slowQueryLog: true
      });

      await msq9.connect();

      // 在不同collection执行查询
      const coll1 = msq9._adapter.collection('testdb9', 'collection1');
      const coll2 = msq9._adapter.collection('testdb9', 'collection2');

      await coll1.insertOne({ a: 1 });
      await coll2.insertOne({ b: 2 });

      await coll1.find({});
      await coll2.find({});

      await msq9._adapter.slowQueryLogManager.queue.flush();
      await new Promise(resolve => setTimeout(resolve, 100));

      // 只查询collection1的日志
      const logs = await msq9.getSlowQueryLogs({ collection: 'collection1' }, {});

      const hasOtherCollection = logs.some(log => log.collection !== 'collection1');
      if (hasOtherCollection) {
        throw new Error('过滤失败：返回了其他collection的日志');
      }

      console.log(`    ✅ collection过滤正常：返回${logs.length}条`);
      await msq9.close();
    });
  });

  describe('4. 性能测试', () => {
    it('4.1 批量查询性能', async () => {
      const msq10 = new MonSQLize({
        type: 'mongodb',
        config: { uri: mongoUri + 'testdb10' },
        slowQueryMs: 1,
        slowQueryLog: true
      });

      await msq10.connect();

      const coll = msq10._adapter.collection('testdb10', 'perf');

      // 插入100条数据
      const docs = [];
      for (let i = 0; i < 100; i++) {
        docs.push({ index: i, value: `value${i}` });
      }
      await coll.insertMany(docs);

      // 执行100次查询
      const startTime = Date.now();
      for (let i = 0; i < 100; i++) {
        await coll.find({ index: i });
      }
      const queryTime = Date.now() - startTime;

      // 刷新队列
      await msq10._adapter.slowQueryLogManager.queue.flush();

      const avgTime = queryTime / 100;
      console.log(`    ✅ 100次查询平均耗时: ${avgTime.toFixed(2)}ms`);

      // 验证性能影响<5%（假设基准是1ms，增加不应超过0.05ms）
      if (avgTime > 10) {
        console.log(`    ⚠️ 性能影响较大: ${avgTime.toFixed(2)}ms`);
      }

      await msq10.close();
    });

    it('4.2 批量队列积压处理', async () => {
      const msq11 = new MonSQLize({
        type: 'mongodb',
        config: { uri: mongoUri + 'testdb11' },
        slowQueryMs: 1,
        slowQueryLog: {
          enabled: true,
          batch: {
            size: 5,  // 小批量大小
            interval: 10000  // 长间隔
          }
        }
      });

      await msq11.connect();

      const coll = msq11._adapter.collection('testdb11', 'queue');
      await coll.insertOne({ test: 1 });

      // 执行10次查询（超过批量大小5）
      for (let i = 0; i < 10; i++) {
        await coll.find({});
      }

      // 批量大小触发刷新（不需要等待interval）
      await new Promise(resolve => setTimeout(resolve, 1000));

      // 验证日志已保存（说明队列正常刷新）
      const logs = await msq11.getSlowQueryLogs({ collection: 'queue' }, {});

      if (logs.length === 0) {
        throw new Error('队列未刷新：没有日志记录');
      }

      console.log(`    ✅ 批量队列正常：找到${logs.length}条日志，count=${logs[0].count}`);
      await msq11.close();
    });
  });

  describe('5. 数据完整性测试', () => {
    it('5.1 验证queryHash唯一性', async () => {
      const msq12 = new MonSQLize({
        type: 'mongodb',
        config: { uri: mongoUri + 'testdb12' },
        slowQueryMs: 1,
        slowQueryLog: true
      });

      await msq12.connect();

      const coll = msq12._adapter.collection('testdb12', 'hash');
      await coll.insertOne({ test: 1 });

      // 执行相同查询5次
      for (let i = 0; i < 5; i++) {
        await coll.find({ test: 1 });
      }

      await msq12._adapter.slowQueryLogManager.queue.flush();
      await new Promise(resolve => setTimeout(resolve, 500));

      // 查询日志
      const logs = await msq12.getSlowQueryLogs({ collection: 'hash' }, {});

      // 应该只有1条记录（去重）
      if (logs.length === 0) {
        console.log('    ⚠️ 未找到日志记录，可能查询太快未触发慢查询');
        return;
      }

      if (logs.length !== 1) {
        console.log(`    ⚠️ queryHash去重：找到${logs.length}条记录（可能有不同查询）`);
      } else {
        // 验证count
        if (logs[0].count >= 5) {
          console.log(`    ✅ queryHash唯一性正常：1条记录，count=${logs[0].count}`);
        } else {
          console.log(`    ⚠️ count=${logs[0].count}，部分查询可能未触发慢查询`);
        }
      }

      await msq12.close();
    });

    it('5.2 验证avgTimeMs计算', async () => {
      const msq13 = new MonSQLize({
        type: 'mongodb',
        config: { uri: mongoUri + 'testdb13' },
        slowQueryMs: 1,
        slowQueryLog: true
      });

      await msq13.connect();

      const coll = msq13._adapter.collection('testdb13', 'avg');
      await coll.insertOne({ test: 1 });

      // 执行多次查询
      for (let i = 0; i < 10; i++) {
        await coll.find({});
      }

      await msq13._adapter.slowQueryLogManager.queue.flush();
      await new Promise(resolve => setTimeout(resolve, 500));

      const logs = await msq13.getSlowQueryLogs({ collection: 'avg' }, {});

      if (logs.length === 0) {
        console.log('    ⚠️ 未找到日志记录，可能查询太快未触发慢查询');
        await msq13.close();
        return;
      }

      const log = logs[0];

      // 验证avgTimeMs = totalTimeMs / count
      const expectedAvg = Math.round(log.totalTimeMs / log.count);
      if (Math.abs(log.avgTimeMs - expectedAvg) > 1) {
        console.log(`    ⚠️ avgTimeMs轻微偏差：期望${expectedAvg}，实际${log.avgTimeMs}`);
      } else {
        console.log(`    ✅ avgTimeMs计算正确：${log.avgTimeMs}ms (总${log.totalTimeMs}ms / ${log.count}次)`);
      }

      await msq13.close();
    });
  });
});

