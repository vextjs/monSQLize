/**
 * 慢查询日志持久化存储 - 使用示例
 * @version 1.3.0
 * @since 2025-12-22
 */

const MonSQLize = require('../index');

// ==================== 示例1：零配置启用（开箱即用） ====================
async function example1_basicUsage() {
  console.log('\n===== 示例1：零配置启用 =====\n');

  const msq = new MonSQLize({
    type: 'mongodb',
    config: { uri: 'mongodb://localhost:27017/test' },
    slowQueryMs: 100,  // 100ms阈值
    slowQueryLog: true  // ✅ 零配置启用
  });

  await msq.connect();

  // 执行查询（如果>100ms，会自动保存到 admin.slow_query_logs）
  const result = await msq.find('users', { status: 'active' });
  console.log('查询结果:', result.length, '条记录');

  // 等待批量刷新
  await new Promise(resolve => setTimeout(resolve, 6000));

  // 查询慢查询日志
  const logs = await msq.getSlowQueryLogs({ collection: 'users' });
  console.log('慢查询日志:', logs);

  await msq.close();
}

// ==================== 示例2：独立连接（隔离资源） ====================
async function example2_dedicatedConnection() {
  console.log('\n===== 示例2：独立连接 =====\n');

  const msq = new MonSQLize({
    type: 'mongodb',
    config: { uri: 'mongodb://localhost:27017/mydb' },
    slowQueryMs: 500,
    slowQueryLog: {
      enabled: true,
      storage: {
        useBusinessConnection: false,  // 不复用连接
        uri: 'mongodb://localhost:27017/admin',  // 独立连接
        mongodb: {
          database: 'admin',
          collection: 'slow_query_logs',
          ttl: 3 * 24 * 3600  // 保留3天
        }
      }
    }
  });

  await msq.connect();
  console.log('慢查询日志使用独立连接');

  await msq.close();
}

// ==================== 示例3：仅修改TTL ====================
async function example3_customTTL() {
  console.log('\n===== 示例3：自定义TTL =====\n');

  const msq = new MonSQLize({
    type: 'mongodb',
    config: { uri: 'mongodb://localhost:27017/mydb' },
    slowQueryMs: 500,
    slowQueryLog: {
      enabled: true,
      storage: {
        mongodb: {
          ttl: 24 * 3600  // 只保留1天
        }
      }
    }
  });

  await msq.connect();
  console.log('慢查询日志保留期：1天');

  await msq.close();
}

// ==================== 示例4：过滤特定集合 ====================
async function example4_filtering() {
  console.log('\n===== 示例4：过滤配置 =====\n');

  const msq = new MonSQLize({
    type: 'mongodb',
    config: { uri: 'mongodb://localhost:27017/mydb' },
    slowQueryMs: 500,
    slowQueryLog: {
      enabled: true,
      filter: {
        excludeCollections: ['logs', 'temp'],  // 排除日志集合
        minExecutionTimeMs: 1000  // 只记录超过1秒的
      }
    }
  });

  await msq.connect();
  console.log('慢查询日志已启用过滤');

  await msq.close();
}

// ==================== 示例5：禁用批量写入（实时模式） ====================
async function example5_realtime() {
  console.log('\n===== 示例5：实时写入 =====\n');

  const msq = new MonSQLize({
    type: 'mongodb',
    config: { uri: 'mongodb://localhost:27017/mydb' },
    slowQueryMs: 500,
    slowQueryLog: {
      enabled: true,
      batch: {
        enabled: false  // 禁用批量，实时写入
      }
    }
  });

  await msq.connect();
  console.log('慢查询日志使用实时写入模式');

  await msq.close();
}

// ==================== 示例6：方案A（不去重） ====================
async function example6_noDeduplication() {
  console.log('\n===== 示例6：方案A（新增记录） =====\n');

  const msq = new MonSQLize({
    type: 'mongodb',
    config: { uri: 'mongodb://localhost:27017/mydb' },
    slowQueryMs: 500,
    slowQueryLog: {
      enabled: true,
      deduplication: {
        enabled: false  // 关闭去重，每次新增记录
      }
    }
  });

  await msq.connect();
  console.log('慢查询日志使用方案A（不去重）');

  await msq.close();
}

// ==================== 示例7：查询慢查询日志 ====================
async function example7_queryLogs() {
  console.log('\n===== 示例7：查询慢查询日志 =====\n');

  const msq = new MonSQLize({
    type: 'mongodb',
    config: { uri: 'mongodb://localhost:27017/mydb' },
    slowQueryMs: 500,
    slowQueryLog: true
  });

  await msq.connect();

  // 查询特定集合的慢查询
  const logs1 = await msq.getSlowQueryLogs(
    { db: 'mydb', collection: 'users' },
    { sort: { count: -1 }, limit: 10 }
  );
  console.log('高频慢查询Top 10:', logs1);

  // 查询最慢的查询
  const logs2 = await msq.getSlowQueryLogs(
    {},
    { sort: { maxTimeMs: -1 }, limit: 10 }
  );
  console.log('最慢查询Top 10:', logs2);

  await msq.close();
}

// ==================== 运行所有示例 ====================
async function runAllExamples() {
  try {
    await example1_basicUsage();
    await example2_dedicatedConnection();
    await example3_customTTL();
    await example4_filtering();
    await example5_realtime();
    await example6_noDeduplication();
    await example7_queryLogs();

    console.log('\n✅ 所有示例运行完成\n');
  } catch (err) {
    console.error('❌ 示例运行失败:', err);
  }
}

// 运行示例
if (require.main === module) {
  runAllExamples().catch(console.error);
}

module.exports = {
  example1_basicUsage,
  example2_dedicatedConnection,
  example3_customTTL,
  example4_filtering,
  example5_realtime,
  example6_noDeduplication,
  example7_queryLogs
};

