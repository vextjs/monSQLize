/**
 * 简单的初始化验证脚本
 * 直接测试配置管理器和初始化逻辑
 */

console.log('\n=== 测试1：验证配置管理器 ===\n');

try {
  const { SlowQueryLogConfigManager } = require('../lib/slow-query-log/config-manager');

  console.log('✅ 配置管理器导入成功');

  // 测试boolean配置
  const config1 = SlowQueryLogConfigManager.mergeConfig(true, 'mongodb');
  console.log('✅ mergeConfig(true, "mongodb"):', JSON.stringify(config1, null, 2));

  // 验证配置
  SlowQueryLogConfigManager.validate(config1, 'mongodb');
  console.log('✅ validate通过');

  // 检查enabled
  console.log('✅ config.enabled:', config1.enabled);

} catch (err) {
  console.error('❌ 配置管理器测试失败:', err.message);
  console.error(err.stack);
}

console.log('\n=== 测试2：验证SlowQueryLogManager ===\n');

try {
  const { SlowQueryLogManager, SlowQueryLogConfigManager } = require('../lib/slow-query-log');

  console.log('✅ SlowQueryLogManager导入成功');

  // 模拟client
  const mockClient = {
    db: (name) => ({
      collection: (name) => ({
        createIndex: async () => console.log('  createIndex called'),
        bulkWrite: async () => console.log('  bulkWrite called')
      })
    })
  };

  // 模拟logger
  const mockLogger = {
    info: console.log,
    error: console.error,
    warn: console.warn,
    debug: console.log
  };

  // 合并配置
  const config = SlowQueryLogConfigManager.mergeConfig(true, 'mongodb');
  console.log('✅ 配置合并完成');

  // 验证配置
  SlowQueryLogConfigManager.validate(config, 'mongodb');
  console.log('✅ 配置验证通过');

  // 创建管理器
  console.log('\n尝试创建SlowQueryLogManager...');
  const manager = new SlowQueryLogManager(
    config,
    mockClient,
    'mongodb',
    mockLogger
  );

  console.log('✅ SlowQueryLogManager创建成功!');
  console.log('  - storage:', !!manager.storage);
  console.log('  - queue:', !!manager.queue);
  console.log('  - config:', !!manager.config);

} catch (err) {
  console.error('❌ SlowQueryLogManager测试失败:', err.message);
  console.error(err.stack);
}

console.log('\n=== 测试3：验证MongoDB适配器初始化逻辑 ===\n');

try {
  const { SlowQueryLogManager, SlowQueryLogConfigManager } = require('../lib/slow-query-log');

  // 模拟defaults对象
  const defaults = {
    slowQueryLog: true,
    slowQueryMs: 500,
    namespace: { scope: 'database' }
  };

  console.log('defaults.slowQueryLog:', defaults.slowQueryLog);

  // 模拟初始化逻辑
  const slowQueryLogConfig = defaults.slowQueryLog;

  if (!slowQueryLogConfig) {
    console.log('❌ config为空，跳过初始化');
    process.exit(1);
  }

  console.log('✅ 配置存在，继续...');

  const mergedConfig = SlowQueryLogConfigManager.mergeConfig(
    slowQueryLogConfig,
    'mongodb'
  );

  console.log('✅ 配置合并完成');
  console.log('  mergedConfig.enabled:', mergedConfig.enabled);

  if (!mergedConfig.enabled) {
    console.log('❌ 配置未启用');
    process.exit(1);
  }

  console.log('✅ 配置已启用');

  SlowQueryLogConfigManager.validate(mergedConfig, 'mongodb');
  console.log('✅ 配置验证通过');

  console.log('\n✅ 初始化逻辑验证通过！');

} catch (err) {
  console.error('❌ 初始化逻辑测试失败:', err.message);
  console.error(err.stack);
}

console.log('\n=== 所有测试完成 ===\n');

