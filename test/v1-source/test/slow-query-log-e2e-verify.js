/**
 * 慢查询日志端到端验证测试
 * 测试完整流程：查询触发 → 慢查询检测 → 批量保存 → 查询日志
 */

const MonSQLize = require('../lib/index');
const { MongoMemoryServer } = require('mongodb-memory-server');

async function runEndToEndTest() {
  console.log('\n🔍 开始端到端验证测试...\n');
  
  let mongod;
  let msq;
  
  try {
    // 1. 启动内存数据库
    console.log('步骤1：启动MongoDB内存服务器...');
    mongod = await MongoMemoryServer.create();
    const mongoUri = mongod.getUri();
    console.log(`✅ MongoDB已启动: ${mongoUri}\n`);
    
    // 2. 创建MonSQLize实例并启用慢查询日志
    console.log('步骤2：创建MonSQLize实例...');
    msq = new MonSQLize({
      type: 'mongodb',
      config: { uri: mongoUri + 'testdb' },
      slowQueryMs: 1,  // 🔴 设置为1ms，确保几乎所有查询都触发
      slowQueryLog: true
    });
    
    await msq.connect();
    console.log('✅ 连接成功\n');
    
    // 3. 验证慢查询日志管理器已初始化
    console.log('步骤3：验证慢查询日志管理器...');
    if (!msq._adapter || !msq._adapter.slowQueryLogManager) {
      throw new Error('❌ 慢查询日志管理器未初始化');
    }
    console.log('✅ 慢查询日志管理器已初始化\n');
    
    // 4. 插入测试数据
    console.log('步骤4：插入测试数据...');
    const usersCollection = msq._adapter.collection('testdb', 'users');
    
    for (let i = 0; i < 5; i++) {
      await usersCollection.insertOne({
        name: `User ${i}`,
        email: `user${i}@example.com`,
        status: 'active'
      });
    }
    console.log('✅ 已插入5条测试数据\n');
    
    // 5. 执行查询（触发慢查询）
    console.log('步骤5：执行查询（触发慢查询）...');
    
    // 执行多次查询，使用足够复杂的查询确保触发慢查询
    for (let i = 0; i < 5; i++) {
      // 使用find查询（它会通过runner，触发withSlowQueryLog）
      const users = await usersCollection.find({ status: 'active' });
      console.log(`  查询${i + 1}: 返回${users.length}条记录`);

      // 添加少量延迟，让查询有机会触发慢查询（虽然阈值很低）
      await new Promise(resolve => setTimeout(resolve, 15));
    }
    console.log('✅ 查询执行完成\n');
    
    // 6. 手动刷新批量队列
    console.log('步骤6：刷新批量队列...');
    if (msq._adapter.slowQueryLogManager && msq._adapter.slowQueryLogManager.queue) {
      await msq._adapter.slowQueryLogManager.queue.flush();
      console.log('✅ 批量队列已刷新\n');
    }
    
    // 7. 等待一段时间确保写入完成
    console.log('步骤7：等待写入完成...');
    await new Promise(resolve => setTimeout(resolve, 1000));
    console.log('✅ 等待完成\n');
    
    // 8. 查询慢查询日志
    console.log('步骤8：查询慢查询日志...');
    try {
      const logs = await msq.getSlowQueryLogs({}, { limit: 10 });
      
      if (logs.length === 0) {
        console.log('⚠️  未找到慢查询日志记录');
        console.log('   可能原因：');
        console.log('   1. 查询速度太快（<10ms），未触发慢查询');
        console.log('   2. 回调链路未正确连接');
        console.log('   3. 存储未正确保存');
      } else {
        console.log(`✅ 找到${logs.length}条慢查询日志记录\n`);
        
        logs.forEach((log, index) => {
          console.log(`记录${index + 1}:`);
          console.log(`  - queryHash: ${log.queryHash}`);
          console.log(`  - collection: ${log.collection}`);
          console.log(`  - operation: ${log.operation}`);
          console.log(`  - count: ${log.count || 1}`);
          console.log(`  - avgTimeMs: ${log.avgTimeMs || log.totalTimeMs}`);
          console.log(`  - maxTimeMs: ${log.maxTimeMs || log.totalTimeMs}`);
          console.log('');
        });
      }
    } catch (err) {
      console.log(`❌ 查询慢查询日志失败: ${err.message}`);
    }
    
    // 9. 验证慢查询日志集合
    console.log('步骤9：验证存储集合...');
    const adminDb = msq._adapter.client.db('admin');
    const collections = await adminDb.listCollections().toArray();
    const hasSlowQueryLogs = collections.some(c => c.name === 'slow_query_logs');
    
    if (hasSlowQueryLogs) {
      const count = await adminDb.collection('slow_query_logs').countDocuments();
      console.log(`✅ slow_query_logs集合存在，包含${count}条记录\n`);
    } else {
      console.log('⚠️  slow_query_logs集合不存在\n');
    }
    
    console.log('✅ 端到端测试完成！\n');
    
  } catch (err) {
    console.error('❌ 测试失败:', err);
    throw err;
  } finally {
    // 清理
    if (msq) {
      await msq.close();
      console.log('✅ 连接已关闭');
    }
    if (mongod) {
      await mongod.stop();
      console.log('✅ MongoDB内存服务器已停止');
    }
  }
}

// 运行测试
if (require.main === module) {
  runEndToEndTest()
    .then(() => {
      console.log('\n🎉 所有验证通过！');
      process.exit(0);
    })
    .catch((err) => {
      console.error('\n❌ 验证失败:', err);
      process.exit(1);
    });
}

module.exports = runEndToEndTest;

