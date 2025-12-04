/**
 * updateOrInsert 扩展方法示例
 *
 * 展示如何使用 updateOrInsert 方法
 * - 深度合并配置管理
 * - 3 种合并策略
 * - 保留未修改字段
 */

const MonSQLize = require('../index.mjs');

async function main() {
  console.log('='.repeat(60));
  console.log('updateOrInsert 扩展方法示例');
  console.log('='.repeat(60));

  // 初始化连接
  const msq = new MonSQLize({
    type: 'mongodb',
    databaseName: 'test_examples',
    config: { useMemoryServer: true }
  });

  await msq.connect();
  const UserConfig = msq.collection('user_configs');
  const SystemConfig = msq.collection('system_configs');
  const nativeDb = msq._adapter.db;

  try {
    console.log('\n📖 示例 1: 用户配置管理（深度合并）');
    console.log('-'.repeat(60));

    // 创建初始配置
    await nativeDb.collection('user_configs').insertOne({
      userId: 100,
      preferences: {
        theme: 'light',
        language: 'en',
        fontSize: 14,
        notifications: {
          email: true,
          push: true,
          sms: false
        },
        shortcuts: {
          save: 'Ctrl+S',
          copy: 'Ctrl+C'
        }
      }
    });

    console.log('初始配置:');
    console.log('  - theme: light');
    console.log('  - language: en');
    console.log('  - fontSize: 14');
    console.log('  - notifications.email: true');
    console.log('  - notifications.push: true');

    // 用户只修改主题和邮件通知
    const result = await UserConfig.updateOrInsert(
      { userId: 100 },
      {
        preferences: {
          theme: 'dark',
          notifications: {
            email: false  // 只改这一项
          }
        }
      },
      { mergeStrategy: 'deep' }
    );

    console.log('\n更新后的配置:');
    const prefs = result.doc.preferences;
    console.log('  - theme:', prefs.theme, '(✅ 已更新)');
    console.log('  - language:', prefs.language, '(✅ 保留)');
    console.log('  - fontSize:', prefs.fontSize, '(✅ 保留)');
    console.log('  - notifications.email:', prefs.notifications.email, '(✅ 已更新)');
    console.log('  - notifications.push:', prefs.notifications.push, '(✅ 保留)');
    console.log('  - notifications.sms:', prefs.notifications.sms, '(✅ 保留)');
    console.log('  - shortcuts:', JSON.stringify(prefs.shortcuts), '(✅ 完整保留)');
    console.log('\n✅ 只更新了 2 个字段，保留了 5 个字段');

    // -----------------------------------------------------------

    console.log('\n📖 示例 2: 系统功能开关');
    console.log('-'.repeat(60));

    // 创建初始系统配置
    await nativeDb.collection('system_configs').insertOne({
      key: 'features',
      settings: {
        maintenance: false,
        maxUploadSize: 10,
        features: {
          chat: true,
          ai: false,
          video: true,
          analytics: false
        }
      }
    });

    console.log('初始功能状态:');
    console.log('  - chat: true');
    console.log('  - ai: false');
    console.log('  - video: true');
    console.log('  - analytics: false');

    // 只启用 AI 功能
    const result2 = await SystemConfig.updateOrInsert(
      { key: 'features' },
      {
        settings: {
          features: {
            ai: true  // 只启用 AI
          }
        }
      },
      { mergeStrategy: 'deep' }
    );

    console.log('\n启用 AI 后的状态:');
    const settings = result2.doc.settings;
    console.log('  - maintenance:', settings.maintenance, '(✅ 保留)');
    console.log('  - maxUploadSize:', settings.maxUploadSize, '(✅ 保留)');
    console.log('  - chat:', settings.features.chat, '(✅ 保留)');
    console.log('  - ai:', settings.features.ai, '(✅ 已启用)');
    console.log('  - video:', settings.features.video, '(✅ 保留)');
    console.log('  - analytics:', settings.features.analytics, '(✅ 保留)');
    console.log('\n✅ 只启用了 AI，其他 5 个配置全部保留');

    // -----------------------------------------------------------

    console.log('\n📖 示例 3: 三种合并策略对比');
    console.log('-'.repeat(60));

    // 准备测试数据
    const testData = {
      config: {
        theme: 'light',
        language: 'en',
        notifications: { email: true, push: false }
      }
    };

    // 策略 1: replace（完全替换）
    await nativeDb.collection('user_configs').deleteMany({ userId: 201 });
    await nativeDb.collection('user_configs').insertOne({
      userId: 201,
      ...testData
    });

    const result3a = await UserConfig.updateOrInsert(
      { userId: 201 },
      {
        config: { theme: 'dark' }  // 只有 theme
      },
      { mergeStrategy: 'replace' }
    );

    console.log('1. replace 策略:');
    console.log('  - theme:', result3a.doc.config.theme);
    console.log('  - language:', result3a.doc.config.language || '(❌ 丢失)');
    console.log('  - notifications:', result3a.doc.config.notifications || '(❌ 丢失)');

    // 策略 2: shallow（浅合并）
    await nativeDb.collection('user_configs').deleteMany({ userId: 202 });
    await nativeDb.collection('user_configs').insertOne({
      userId: 202,
      ...testData
    });

    const result3b = await UserConfig.updateOrInsert(
      { userId: 202 },
      {
        config: { theme: 'dark' }
      },
      { mergeStrategy: 'shallow' }
    );

    console.log('\n2. shallow 策略:');
    console.log('  - theme:', result3b.doc.config.theme);
    console.log('  - language:', result3b.doc.config.language || '(❌ 丢失)');
    console.log('  - notifications:', result3b.doc.config.notifications || '(❌ 丢失)');

    // 策略 3: deep（深度合并）
    await nativeDb.collection('user_configs').deleteMany({ userId: 203 });
    await nativeDb.collection('user_configs').insertOne({
      userId: 203,
      ...testData
    });

    const result3c = await UserConfig.updateOrInsert(
      { userId: 203 },
      {
        config: { theme: 'dark' }
      },
      { mergeStrategy: 'deep' }
    );

    console.log('\n3. deep 策略（推荐）:');
    console.log('  - theme:', result3c.doc.config.theme, '(✅ 更新)');
    console.log('  - language:', result3c.doc.config.language, '(✅ 保留)');
    console.log('  - notifications:', JSON.stringify(result3c.doc.config.notifications), '(✅ 保留)');

    // -----------------------------------------------------------

    console.log('\n📖 示例 4: 数组处理（直接替换）');
    console.log('-'.repeat(60));

    await nativeDb.collection('user_configs').deleteMany({ userId: 301 });
    await nativeDb.collection('user_configs').insertOne({
      userId: 301,
      tags: ['tag1', 'tag2', 'tag3']
    });

    console.log('原始数组:', ['tag1', 'tag2', 'tag3']);

    const result4 = await UserConfig.updateOrInsert(
      { userId: 301 },
      {
        tags: ['tag4', 'tag5']
      },
      { mergeStrategy: 'deep' }
    );

    console.log('更新后的数组:', result4.doc.tags);
    console.log('✅ 数组直接替换（不合并）');

    // -----------------------------------------------------------

    console.log('\n📖 示例 5: 不存在时插入');
    console.log('-'.repeat(60));

    const result5 = await UserConfig.updateOrInsert(
      { userId: 999 },  // 不存在
      {
        preferences: {
          theme: 'dark',
          language: 'zh'
        }
      },
      { mergeStrategy: 'deep' }
    );

    console.log('插入新用户配置:');
    console.log('  - userId:', result5.doc.userId);
    console.log('  - upserted:', result5.upserted, '(✅ 新插入)');
    console.log('  - theme:', result5.doc.preferences.theme);
    console.log('  - language:', result5.doc.preferences.language);

    // -----------------------------------------------------------

    console.log('\n📖 示例 6: 月度统计部分更新');
    console.log('-'.repeat(60));

    const MonthlyStats = msq.collection('monthly_stats');

    await nativeDb.collection('monthly_stats').insertOne({
      month: '2024-12',
      stats: {
        users: { total: 1000, active: 800, new: 50 },
        orders: { total: 500, amount: 100000 },
        revenue: { total: 100000, refund: 5000 }
      }
    });

    console.log('初始统计:');
    console.log('  - users: { total: 1000, active: 800, new: 50 }');
    console.log('  - orders: { total: 500, amount: 100000 }');
    console.log('  - revenue: { total: 100000, refund: 5000 }');

    // 只更新用户统计
    const result6 = await MonthlyStats.updateOrInsert(
      { month: '2024-12' },
      {
        stats: {
          users: { total: 1050, active: 850, new: 50 }
        }
      },
      { mergeStrategy: 'deep' }
    );

    console.log('\n只更新用户统计后:');
    const stats = result6.doc.stats;
    console.log('  - users:', JSON.stringify(stats.users), '(✅ 已更新)');
    console.log('  - orders:', JSON.stringify(stats.orders), '(✅ 保留)');
    console.log('  - revenue:', JSON.stringify(stats.revenue), '(✅ 保留)');
    console.log('\n✅ 只更新了用户数据，订单和营收数据完全保留');

    // -----------------------------------------------------------

    console.log('\n📊 总结');
    console.log('-'.repeat(60));
    console.log('✅ updateOrInsert 核心特性:');
    console.log('  1. 深度合并（保留未修改字段）');
    console.log('  2. 3 种策略（replace/shallow/deep）');
    console.log('  3. 配置管理（只改 1 个，保留 5 个）');
    console.log('  4. 数组直接替换（不合并）');
    console.log('  5. 代码减少 70%（6-8行 → 1-2行）');

  } finally {
    await msq.close();
    console.log('\n✅ 示例完成');
  }
}

// 运行示例
if (require.main === module) {
  main().catch(console.error);
}

module.exports = main;

