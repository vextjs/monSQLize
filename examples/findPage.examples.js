/**
 * findPage 方法完整示例集
 * 演示各种使用场景和最佳实践
 */

const MonSQLize = require('../lib');
const { stopMemoryServer } = require('../lib/mongodb/connect');

// ============================================================================
// 常量配置
// ============================================================================

// MongoDB 连接配置
const DB_CONFIG = {
    type: 'mongodb',
    databaseName: 'ecommerce',
    config: { useMemoryServer: true }
};

// 集合名称常量
const COLLECTIONS = {
    USERS: 'users',
    PRODUCTS: 'products',
    ORDERS: 'orders',
    CATEGORIES: 'categories',
    SETTINGS: 'settings'
};

// 数据量配置
const DATA_SIZE = {
    USERS: 50,
    PRODUCTS: 100,
    ORDERS: 150
};

// ============================================================================
// 数据准备和清理工具函数
// ============================================================================

// 全局标志：标记索引是否已经检查过
let indexesChecked = false;
// 全局标志：标记是否已经提示过数据存在
let dataExistenceNotified = false;
// 全局标志：标记是否已经提示过无需清理
let cleanupNotified = false;

/**
 * 创建 MonSQLize 实例
 * @returns {MonSQLize} MonSQLize 实例
 */
function createMonSQLizeInstance() {
    return new MonSQLize(DB_CONFIG);
}

/**
 * 生成用户数据
 * @param {number} count - 生成数量
 * @returns {Array} 用户数据数组
 */
function generateUsers(count) {
    const users = [];
    for (let i = 1; i <= count; i++) {
        users.push({
            userId: `USER-${String(i).padStart(5, '0')}`,
            name: `用户${i}`,
            username: i % 2 === 0 ? `user${i}` : `User${i}`,
            email: `user${i}@example.com`,
            status: i % 5 === 0 ? 'inactive' : 'active',
            active: i % 5 !== 0,
            role: i % 10 === 0 ? 'admin' : i % 15 === 0 ? 'vip' : 'user',
            totalSpent: Math.floor(Math.random() * 20000),
            orderCount: Math.floor(Math.random() * 100),
            level: Math.floor(Math.random() * 10) + 1,
            verified: i % 3 !== 0,
            avatar: `avatar${i}.jpg`,
            createdAt: new Date(Date.now() - i * 86400000 * 2),
            updatedAt: new Date()
        });
    }
    return users;
}

/**
 * 生成商品数据
 * @param {number} count - 生成数量
 * @returns {Array} 商品数据数组
 */
function generateProducts(count) {
    const products = [];
    const categories = ['electronics', 'books', 'clothing'];
    for (let i = 1; i <= count; i++) {
        products.push({
            productId: `PROD-${String(i).padStart(5, '0')}`,
            name: `商品${i}`,
            description: `这是商品${i}的详细描述`,
            category: categories[i % 3],
            language: i % 5 === 0 ? 'zh' : 'en',
            price: Math.floor(Math.random() * 1000) + 50,
            inStock: i % 4 !== 0,
            sales: Math.floor(Math.random() * 2000),
            hot: i % 10 === 0,
            rating: 3 + Math.random() * 2,
            tags: i % 3 === 0 ? ['electronics', 'sale'] : ['test'],
            image: `product${i}.jpg`,
            publishDate: new Date(Date.now() - Math.random() * 365 * 86400000),
            reviews: [{ rating: 4.5 }],
            createdAt: new Date(Date.now() - i * 43200000),
            updatedAt: new Date()
        });
    }
    return products;
}

/**
 * 生成订单数据
 * @param {number} count - 生成数量
 * @returns {Array} 订单数据数组
 */
function generateOrders(count) {
    const orders = [];
    const statuses = ['pending', 'paid', 'completed'];
    for (let i = 1; i <= count; i++) {
        const status = statuses[i % 3];
        const createdAt = new Date(Date.now() - i * 21600000);
        orders.push({
            orderId: `ORD-${String(i).padStart(5, '0')}`,
            status,
            amount: Math.floor(Math.random() * 2000) + 100,
            items: Math.floor(Math.random() * 5) + 1,
            priority: Math.floor(Math.random() * 3),
            customerId: `USER-${String((i % 50) + 1).padStart(5, '0')}`,
            createdAt,
            completedAt: status === 'completed' ? new Date(createdAt.getTime() + 3600000) : null,
            updatedAt: new Date()
        });
    }
    return orders;
}

/**
 * 准备示例数据
 * @param {Object} msq - MonSQLize 实例
 * @param {boolean} [skipIndexCheck=false] - 是否跳过索引检查（默认不跳过）
 */
async function prepareExampleData(msq, skipIndexCheck = false) {
    // 只在第一次准备数据时输出提示
    if (!dataExistenceNotified) {
        console.log('🔧 准备示例数据...');
    }

    const db = msq._adapter.db;

    // 检查是否已有数据
    const usersCount = await db.collection(COLLECTIONS.USERS).countDocuments();
    const productsCount = await db.collection(COLLECTIONS.PRODUCTS).countDocuments();
    const ordersCount = await db.collection(COLLECTIONS.ORDERS).countDocuments();

    if (usersCount > 0 && productsCount > 0 && ordersCount > 0) {
        // 只在第一次发现数据时提示
        if (!dataExistenceNotified) {
            console.log('✅ 数据库已有数据，跳过插入');
            dataExistenceNotified = true;
        }

        // 只在需要时检查索引（且未检查过）
        if (!skipIndexCheck && !indexesChecked) {
            await ensureIndexes(db);
            indexesChecked = true;
        }

        return { needCleanup: false };
    }

    console.log('📝 插入示例数据...');
    dataExistenceNotified = true;

    // 插入用户数据
    const users = generateUsers(DATA_SIZE.USERS);
    await db.collection(COLLECTIONS.USERS).insertMany(users);
    console.log(`  ✅ 插入 ${users.length} 条用户数据`);

    // 插入商品数据
    const products = generateProducts(DATA_SIZE.PRODUCTS);
    await db.collection(COLLECTIONS.PRODUCTS).insertMany(products);
    console.log(`  ✅ 插入 ${products.length} 条商品数据`);

    // 插入订单数据
    const orders = generateOrders(DATA_SIZE.ORDERS);
    await db.collection(COLLECTIONS.ORDERS).insertMany(orders);
    console.log(`  ✅ 插入 ${orders.length} 条订单数据`);

    // 插入分类数据
    const categories_data = [
        { name: '电子产品', slug: 'electronics', enabled: true, order: 1 },
        { name: '图书', slug: 'books', enabled: true, order: 2 },
        { name: '服装', slug: 'clothing', enabled: true, order: 3 },
        { name: '食品', slug: 'food', enabled: false, order: 4 }
    ];
    await db.collection(COLLECTIONS.CATEGORIES).insertMany(categories_data);
    console.log(`  ✅ 插入 ${categories_data.length} 条分类数据`);

    // 插入配置数据
    const settings = [
        { type: 'system', key: 'siteName', value: 'My Shop' },
        { type: 'system', key: 'language', value: 'zh-CN' },
        { type: 'user', key: 'theme', value: 'dark' }
    ];
    await db.collection(COLLECTIONS.SETTINGS).insertMany(settings);
    console.log(`  ✅ 插入 ${settings.length} 条配置数据`);

    console.log('✅ 示例数据准备完成\n');

    // 创建必要的索引（只在未检查过时执行）
    if (!skipIndexCheck && !indexesChecked) {
        await ensureIndexes(db);
        indexesChecked = true;
    }

    return { needCleanup: true };
}

/**
 * 确保所有必要的索引存在
 */
async function ensureIndexes(db) {
    console.log('🔧 检查并创建索引...');

    const indexes = [
        {
            collection: COLLECTIONS.ORDERS,
            spec: { status: 1, createdAt: -1 },
            name: 'status_createdAt_idx',
            description: '订单状态和创建时间索引'
        },
        {
            collection: COLLECTIONS.ORDERS,
            spec: { status: 1, amount: 1 },
            name: 'status_amount_idx',
            description: '订单状态和金额索引'
        },
        {
            collection: COLLECTIONS.PRODUCTS,
            spec: { category: 1, price: -1 },
            name: 'category_price_idx',
            description: '商品分类和价格索引'
        },
        {
            collection: COLLECTIONS.PRODUCTS,
            spec: { inStock: 1, sales: -1 },
            name: 'inStock_sales_idx',
            description: '商品库存和销量索引'
        },
        {
            collection: COLLECTIONS.PRODUCTS,
            spec: { hot: 1, inStock: 1 },
            name: 'hot_inStock_idx',
            description: '热门商品和库存索引'
        },
        {
            collection: COLLECTIONS.USERS,
            spec: { status: 1, createdAt: -1 },
            name: 'status_createdAt_idx',
            description: '用户状态和创建时间索引'
        },
        {
            collection: COLLECTIONS.CATEGORIES,
            spec: { enabled: 1, order: 1 },
            name: 'enabled_order_idx',
            description: '分类启用状态和排序索引'
        },
        {
            collection: COLLECTIONS.SETTINGS,
            spec: { type: 1, key: 1 },
            name: 'type_key_idx',
            description: '配置类型和键索引'
        },
        // findPage 示例8需要的演示索引
        {
            collection: COLLECTIONS.ORDERS,
            spec: { status: 1, createdAt: -1 },
            name: 'demo_status_createdAt_idx',
            description: '示例8演示用：订单状态和时间复合索引',
            demo: true
        },
        {
            collection: COLLECTIONS.PRODUCTS,
            spec: { category: 1, price: 1 },
            name: 'demo_category_price_idx',
            description: '示例8演示用：商品分类和价格复合索引',
            demo: true
        }
    ];

    for (const indexDef of indexes) {
        try {
            const coll = db.collection(indexDef.collection);

            // 检查索引是否已存在
            const existingIndexes = await coll.indexes();
            const indexExists = existingIndexes.some(idx => idx.name === indexDef.name);

            if (!indexExists) {
                await coll.createIndex(indexDef.spec, { name: indexDef.name });
                console.log(`  ✅ 创建索引: ${indexDef.collection}.${indexDef.name}${indexDef.demo ? ' (演示用)' : ''}`);
            } else {
                console.log(`  ⏭️  索引已存在: ${indexDef.collection}.${indexDef.name}`);
            }
        } catch (error) {
            console.log(`  ⚠️  索引创建失败 ${indexDef.collection}.${indexDef.name}: ${error.message}`);
            // 继续创建其他索引，不中断流程
        }
    }

    console.log('✅ 索引检查完成\n');
}

/**
 * 清理示例数据
 */
async function cleanupExampleData(msq, needCleanup) {
    if (!needCleanup) {
        // 只在第一次提示无需清理
        if (!cleanupNotified) {
            console.log('\n✅ 使用的是已有数据，无需清理');
            cleanupNotified = true;
        }
        return;
    }

    console.log('\n🧹 清理示例数据...');

    const db = msq._adapter.db;

    // 使用常量清理集合
    const collectionList = Object.values(COLLECTIONS);
    for (const collName of collectionList) {
        await db.collection(collName).deleteMany({});
    }

    // 可选：清理创建的索引
    console.log('🧹 清理索引...');
    for (const collName of collectionList) {
        try {
            const coll = db.collection(collName);
            const indexes = await coll.indexes();

            // 删除非 _id 的自定义索引
            for (const idx of indexes) {
                if (idx.name !== '_id_' && idx.name.endsWith('_idx')) {
                    try {
                        await coll.dropIndex(idx.name);
                        console.log(`  ✅ 删除索引: ${collName}.${idx.name}`);
                    } catch (error) {
                        // 索引可能已被删除，忽略错误
                    }
                }
            }
        } catch (error) {
            // 集合可能不存在，忽略错误
        }
    }

    console.log('✅ 示例数据清理完成');
}

// ============================================================================
// 示例 1: 基础游标分页
// ============================================================================
async function example1_basicCursorPagination() {
  console.log('\n📖 示例 1: 基础游标分页');
  console.log('='.repeat(60));

  const msq = createMonSQLizeInstance();
  const { collection } = await msq.connect();

  // 准备数据
  const { needCleanup } = await prepareExampleData(msq);

  try {
    // 获取第一页
    console.log('\n1️⃣ 获取第一页数据：');
    const page1 = await collection(COLLECTIONS.PRODUCTS).findPage({
      query: { category: 'electronics', inStock: true },
      sort: { price: 1, _id: 1 },
      limit: 20
    });

    console.log(`  - 返回 ${page1.items.length} 条商品`);
    console.log(`  - 有下一页: ${page1.pageInfo.hasNext}`);
    if (page1.items.length > 0) {
      console.log(`  - 价格区间: ${page1.items[0]?.price} ~ ${page1.items[page1.items.length - 1]?.price}`);
    }

    // 获取下一页
    if (page1.pageInfo.hasNext) {
      console.log('\n2️⃣ 获取下一页：');
      const page2 = await collection(COLLECTIONS.PRODUCTS).findPage({
        query: { category: 'electronics', inStock: true },
        sort: { price: 1, _id: 1 },
        limit: 20,
        after: page1.pageInfo.endCursor
      });

      console.log(`  - 返回 ${page2.items.length} 条商品`);
      console.log(`  - 有上一页: ${page2.pageInfo.hasPrev}`);
      console.log(`  - 有下一页: ${page2.pageInfo.hasNext}`);
    }
  } finally {
    await cleanupExampleData(msq, needCleanup);
    await msq.close();
  }

  console.log('\n✅ 示例 1 完成\n');
}

// ============================================================================
// 示例 2: 跳页功能
// ============================================================================
async function example2_pageJumping() {
  console.log('\n📖 示例 2: 跳页功能');
  console.log('='.repeat(60));

  const msq = new MonSQLize({
    type: 'mongodb',
    databaseName: 'ecommerce',
    config: { useMemoryServer: true },
    bookmarks: {
      step: 10,      // 每 10 页保存一次书签
      maxHops: 20,   // 最多跳 20 次
      ttlMs: 3600000 // 书签缓存 1 小时
    }
  });

  const { collection } = await msq.connect();

  // 使用书签跳转到第 5 页
  console.log('\n1️⃣ 跳转到第 5 页：');
  const page5 = await collection('orders').findPage({
    query: { status: 'completed' },
    sort: { completedAt: -1, _id: 1 },
    limit: 50,
    page: 5,
    jump: {
      step: 10,
      maxHops: 20
    }
  });

  console.log(`  - 当前页: ${page5.pageInfo.currentPage}`);
  console.log(`  - 返回 ${page5.items.length} 条订单`);

  // 使用 offset 跳转（适合小数据量）
  console.log('\n2️⃣ 使用 offset 跳转到第 3 页：');
  const page3 = await collection('orders').findPage({
    query: { status: 'pending' },
    sort: { createdAt: -1 },
    limit: 30,
    page: 3,
    offsetJump: {
      enable: true,
      maxSkip: 10000
    }
  });

  console.log(`  - 当前页: ${page3.pageInfo.currentPage}`);
  console.log(`  - 返回 ${page3.items.length} 条订单`);

  await msq.close();
  console.log('\n✅ 示例 2 完成\n');
}

// ============================================================================
// 示例 3: 流式处理大数据集
// ============================================================================
async function example3_streamProcessing() {
  console.log('\n📖 示例 3: 流式处理大数据集');
  console.log('='.repeat(60));

  const msq = new MonSQLize({
    type: 'mongodb',
    databaseName: 'ecommerce',
    config: { useMemoryServer: true },
    findPageMaxLimit: 100000 // 提高流式查询的限制
  });

  const { collection } = await msq.connect();

  // 流式处理订单统计
  console.log('\n1️⃣ 流式统计 2024 年所有订单：');
  const stream = await collection('orders').findPage({
    query: {
      createdAt: {
        $gte: new Date('2024-01-01'),
        $lt: new Date('2025-01-01')
      }
    },
    sort: { createdAt: 1 },
    limit: 100000,
    stream: true,
    batchSize: 1000
  });

  let totalOrders = 0;
  let totalAmount = 0;
  const statusCount = {};

  stream.on('data', (order) => {
    totalOrders++;
    totalAmount += order.amount || 0;
    statusCount[order.status] = (statusCount[order.status] || 0) + 1;

    // 每 1000 条输出一次进度
    if (totalOrders % 1000 === 0) {
      process.stdout.write(`\r  - 已处理: ${totalOrders} 条订单...`);
    }
  });

  await new Promise((resolve, reject) => {
    stream.on('end', () => {
      if (totalOrders > 0) {
        console.log(`\n  - 总订单数: ${totalOrders}`);
        console.log(`  - 总金额: ${totalAmount.toFixed(2)}`);
        console.log(`  - 平均订单金额: ${(totalAmount / totalOrders).toFixed(2)}`);
        console.log('  - 状态分布:', statusCount);
      } else {
        console.log('\n  - 没有找到 2024 年的订单数据');
      }
      resolve();
    });

    stream.on('error', (err) => {
      console.error('  ❌ 流处理错误:', err);
      reject(err);
    });
  });

  await msq.close();
  console.log('\n✅ 示例 3 完成\n');
}

// ============================================================================
// 示例 4: 获���总数统计
// ============================================================================
async function example4_totalsStatistics() {
  console.log('\n📖 示例 4: 获取总数统计');
  console.log('='.repeat(60));

  const msq = new MonSQLize({
    type: 'mongodb',
    databaseName: 'ecommerce',
    config: { useMemoryServer: true }
  });

  const { collection } = await msq.connect();

  // 同步获取总数
  console.log('\n1️⃣ 同步获取总数：');
  const pageSync = await collection('users').findPage({
    query: { active: true },
    sort: { createdAt: -1 },
    limit: 20,
    totals: {
      mode: 'sync',
      maxTimeMS: 5000
    }
  });

  console.log(`  - 当前页数据: ${pageSync.items.length} 条`);
  if (pageSync.totals) {
    console.log(`  - 总用户数: ${pageSync.totals.total}`);
    console.log(`  - 总页数: ${pageSync.totals.totalPages}`);
    console.log(`  - 统计时间戳: ${new Date(pageSync.totals.ts).toLocaleString()}`);
  } else {
    console.log('  ⚠️  totals 功能未实现');
  }

  // 异步获取总数
  console.log('\n2️⃣ 异步获取总数（首次查询）：');
  const pageAsync1 = await collection('products').findPage({
    query: { category: 'books' },
    sort: { publishDate: -1 },
    limit: 30,
    totals: { mode: 'async' }
  });

  console.log(`  - 当前页数据: ${pageAsync1.items.length} 条`);
  if (pageAsync1.totals) {
    console.log(`  - 总数: ${pageAsync1.totals.total === null ? '计算中...' : pageAsync1.totals.total}`);
    console.log(`  - Token: ${pageAsync1.totals.token}`);

    // 等待后台统计完成
    if (pageAsync1.totals.total === null) {
      console.log('\n   等待 2 秒后重新查询...');
      await new Promise(resolve => setTimeout(resolve, 2000));

      const pageAsync2 = await collection('products').findPage({
        query: { category: 'books' },
        sort: { publishDate: -1 },
        limit: 30,
        totals: { mode: 'async' }
      });

      if (pageAsync2.totals) {
        console.log(`  - 总数: ${pageAsync2.totals.total}`);
        console.log(`  - 总页数: ${pageAsync2.totals.totalPages}`);
      }
    }
  } else {
    console.log('  ⚠️  totals 功能未实现');
  }

  await msq.close();
  console.log('\n✅ 示例 4 完成\n');
}

// ============================================================================
// 示例 5: 复杂查询和聚合
// ============================================================================
async function example5_complexQueries() {
  console.log('\n📖 示例 5: 复杂查询和聚合');
  console.log('='.repeat(60));

  const msq = new MonSQLize({
    type: 'mongodb',
    databaseName: 'ecommerce',
    config: { useMemoryServer: true }
  });

  const { collection } = await msq.connect();

  // 复合排序
  console.log('\n1️⃣ 多字段复合排序：');
  const result1 = await collection('orders').findPage({
    query: {
      status: { $in: ['paid', 'completed'] }
    },
    sort: {
      priority: -1,    // 优先级降序
      amount: -1,      // 金额降序
      createdAt: -1,   // 时间降序
      _id: 1           // ID 升序（保证稳定性）
    },
    limit: 10
  });

  console.log(`  - 返回 ${result1.items.length} 条订单`);
  result1.items.slice(0, 3).forEach((order, i) => {
    console.log(`  - #${i + 1}: 优先级=${order.priority}, 金额=${order.amount}`);
  });

  // 使用聚合管道增强数据
  console.log('\n2️⃣ 附加聚合管道计算：');
  const result2 = await collection('orders').findPage({
    query: { status: 'completed' },
    sort: { completedAt: -1 },
    limit: 10,
    pipeline: [
      {
        $addFields: {
          // 计算税后金额
          amountWithTax: { $multiply: ['$amount', 1.13] },
          // 计算完成天数
          daysToComplete: {
            $divide: [
              { $subtract: ['$completedAt', '$createdAt'] },
              86400000 // 毫秒转天数
            ]
          }
        }
      },
      {
        $addFields: {
          // 添加处理速度标签
          speedLabel: {
            $switch: {
              branches: [
                { case: { $lte: ['$daysToComplete', 1] }, then: '快速' },
                { case: { $lte: ['$daysToComplete', 3] }, then: '正常' },
                { case: { $gt: ['$daysToComplete', 3] }, then: '延迟' }
              ],
              default: '未知'
            }
          }
        }
      }
    ]
  });

  console.log(`  - 返回 ${result2.items.length} 条订单`);
  result2.items.slice(0, 3).forEach((order, i) => {
    console.log(`  - #${i + 1}: 金额=${order.amount}, 含税=${order.amountWithTax?.toFixed(2)}, 速度=${order.speedLabel}`);
  });

  // 使用索引提示优化查询
  console.log('\n3️⃣ 使用索引提示优化查询（示例）：');
  console.log('  - 注意：需要先创建索引: db.products.createIndex({ category: 1, price: 1 })');

  // 不使用 hint 参数，避免索引不存在的错误
  const result3 = await collection('products').findPage({
    query: {
      category: 'electronics',
      price: { $gte: 100, $lte: 1000 }
    },
    sort: { price: 1 },
    limit: 20,
    maxTimeMS: 3000
  });

  console.log(`  - 返回 ${result3.items.length} 条商品`);

  await msq.close();
  console.log('\n✅ 示例 5 完成\n');
}

// ============================================================================
// 示例 6: 错误处理和重试
// ============================================================================
async function example6_errorHandling() {
  console.log('\n📖 示例 6: 错误处理和重试');
  console.log('='.repeat(60));

  const msq = new MonSQLize({
    type: 'mongodb',
    databaseName: 'ecommerce',
    config: { useMemoryServer: true }
  });

  const { collection } = await msq.connect();

  // 处理跳页距离过大
  console.log('\n1️⃣ 处理跳页距离过大错误：');
  try {
    await collection('orders').findPage({
      query: {},
      sort: { _id: 1 },
      limit: 10,
      page: 1000,
      jump: { maxHops: 5 }
    });
  } catch (error) {
    if (error.code === 'JUMP_TOO_FAR') {
      console.log('  ⚠️  跳页距离过大，切换到 offset 模式：');

      const result = await collection('orders').findPage({
        query: {},
        sort: { _id: 1 },
        limit: 10,
        page: 1000,
        offsetJump: {
          enable: true,
          maxSkip: 100000
        }
      });

      console.log(`  ✅ 成功获取第 ${result.pageInfo.currentPage} 页`);
    }
  }

  // 处理参数冲突
  console.log('\n2️⃣ 处理参数冲突错误：');
  try {
    await collection('orders').findPage({
      query: {},
      sort: { _id: 1 },
      limit: 10,
      page: 2,
      after: 'some-cursor'
    });
  } catch (error) {
    if (error.code === 'VALIDATION_ERROR') {
      console.log('  ⚠️  参数冲突: page 和 after 不能同时使用');
      console.log('  📝 错误详情:', error.details);
      console.log('  ✅ 移除 page 参数后重试');
    }
  }

  // 处理超时
  console.log('\n3️⃣ 处理查询超时：');
  const queryWithRetry = async (retries = 3) => {
    for (let i = 0; i < retries; i++) {
      try {
        const result = await collection('large_collection').findPage({
          query: { /* 复杂查询 */ },
          sort: { _id: 1 },
          limit: 100,
          maxTimeMS: 5000
        });
        return result;
      } catch (error) {
        if (error.code === 50 && i < retries - 1) { // MongoDB 超时错误码
          console.log(`  ⚠️  第 ${i + 1} 次尝试超时，重试中...`);
          await new Promise(resolve => setTimeout(resolve, 1000));
        } else {
          throw error;
        }
      }
    }
  };

  console.log('  ✅ 实现了带重试的查询逻辑');

  await msq.close();
  console.log('\n✅ 示例 6 完成\n');
}

// ============================================================================
// 示例 7: 实战场景 - 构建分页 API
// ============================================================================
async function example7_buildPaginationAPI() {
  console.log('\n📖 示例 7: 实战场景 - 构建分页 API');
  console.log('='.repeat(60));

  const msq = new MonSQLize({
    type: 'mongodb',
    databaseName: 'ecommerce',
    config: { useMemoryServer: true }
  });

  const { collection } = await msq.connect();

  // 模拟 RESTful API 请求处理
  async function handleProductListAPI(req) {
    const {
      category,
      minPrice,
      maxPrice,
      search,
      sortBy = 'price',
      sortOrder = 'asc',
      limit = 20,
      after,
      page
    } = req;

    // 构建查询条件
    const query = {};
    if (category) query.category = category;
    if (minPrice || maxPrice) {
      query.price = {};
      if (minPrice) query.price.$gte = parseFloat(minPrice);
      if (maxPrice) query.price.$lte = parseFloat(maxPrice);
    }
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } }
      ];
    }

    // 构建排序
    const sort = {};
    sort[sortBy] = sortOrder === 'desc' ? -1 : 1;
    sort._id = 1; // 保证稳定排序

    // 执行查询（不使用 totals 避免连接问题）
    const options = {
      query,
      sort,
      limit: Math.min(parseInt(limit) || 20, 100) // 限制最大 100
    };

    if (after) {
      options.after = after;
    } else if (page) {
      options.page = parseInt(page);
      options.jump = { step: 10, maxHops: 20 };
    }

    const result = await collection('products').findPage(options);

    // 转换为 API 响应格式
    return {
      success: true,
      data: result.items,
      pagination: {
        hasNextPage: result.pageInfo.hasNext,
        hasPreviousPage: result.pageInfo.hasPrev,
        nextCursor: result.pageInfo.endCursor,
        prevCursor: result.pageInfo.startCursor,
        currentPage: result.pageInfo.currentPage
      }
    };
  }

  // 模拟几个 API 请求
  console.log('\n1️⃣ 请求: GET /api/products?category=electronics&limit=5');
  const response1 = await handleProductListAPI({
    category: 'electronics',
    limit: 5
  });
  console.log(`  - 返回 ${response1.data.length} 条商品`);
  console.log(`  - 有下一页: ${response1.pagination.hasNextPage}`);

  console.log('\n2️⃣ 请求: GET /api/products?category=electronics&page=2&limit=5');
  const response2 = await handleProductListAPI({
    category: 'electronics',
    page: 2,
    limit: 5
  });
  console.log(`  - 当前页: ${response2.pagination.currentPage}`);
  console.log(`  - 返回 ${response2.data.length} 条商品`);

  console.log('\n3️⃣ 请求: GET /api/products?minPrice=100&maxPrice=500&sortBy=price&sortOrder=desc');
  const response3 = await handleProductListAPI({
    minPrice: 100,
    maxPrice: 500,
    sortBy: 'price',
    sortOrder: 'desc',
    limit: 10
  });
  console.log(`  - 返回 ${response3.data.length} 条商品`);
  if (response3.data.length > 0) {
    console.log(`  - 价格区间: ${response3.data[response3.data.length - 1]?.price} ~ ${response3.data[0]?.price}`);
  }

  await msq.close();
  console.log('\n✅ 示例 7 完成\n');
}

// ============================================================================
// 示例 8: 性能优化技巧
// ============================================================================
async function example8_performanceOptimization() {
  console.log('\n📖 示例 8: 性能优化技巧');
  console.log('='.repeat(60));

  const msq = new MonSQLize({
    type: 'mongodb',
    databaseName: 'ecommerce',
    config: { useMemoryServer: true },
    bookmarks: {
      step: 10,
      maxHops: 20,
      ttlMs: 6 * 3600000 // 6 小时
    }
  });

  const { collection } = await msq.connect();

  // 获取原生 MongoDB 数据库对象用于索引操作
  const nativeDb = msq._adapter.db;
  const ordersCollection = nativeDb.collection('orders');
  const productsCollection = nativeDb.collection('products');

  console.log('\n🔧 准备阶段: 删除可能存在的旧索引...');

  try {
    await ordersCollection.dropIndex('demo_status_createdAt_idx');
    console.log('  ✅ 已删除旧索引: orders.demo_status_createdAt_idx');
  } catch (err) {
    if (err.code === 27) { // IndexNotFound
      console.log('  ℹ️  索引不存在，跳过删除');
    }
  }

  try {
    await productsCollection.dropIndex('demo_category_price_idx');
    console.log('  ✅ 已删除旧索引: products.demo_category_price_idx');
  } catch (err) {
    if (err.code === 27) {
      console.log('  ℹ️  索引不存在，跳过删除');
    }
  }

  try {
    // 技巧 1: 对比有索引和无索引的性能差异
    console.log('\n1️⃣ 技巧: 索引对查询性能的影响');
    console.log('  📊 测试场景: 查询特定状态的订单并按时间排序');

    // 无索引时的性能
    console.log('\n  ⏱️  无索引查询（基准测试）:');
    const start1a = Date.now();
    const result1a = await collection('orders').findPage({
      query: { status: 'paid' },
      sort: { createdAt: -1, _id: 1 },
      limit: 50
    });
    const time1a = Date.now() - start1a;
    console.log(`    - 查询耗时: ${time1a}ms`);
    console.log(`    - 返回数据: ${result1a.items.length} 条`);

    // 创建索引
    console.log('\n  🔧 创建复合索引: { status: 1, createdAt: -1 }');
    await ordersCollection.createIndex(
      { status: 1, createdAt: -1 },
      { name: 'demo_status_createdAt_idx' }
    );
    console.log('    - 索引创建完成');

    // 有索引时的性能（让 MongoDB 自动选择）
    console.log('\n  ⚡ 有索引查询（自动优化）:');
    const start1b = Date.now();
    const result1b = await collection('orders').findPage({
      query: { status: 'paid' },
      sort: { createdAt: -1, _id: 1 },
      limit: 50
    });
    const time1b = Date.now() - start1b;
    console.log(`    - 查询耗时: ${time1b}ms`);
    console.log(`    - 返回数据: ${result1b.items.length} 条`);

    if (time1a > time1b) {
      const improvement = ((time1a - time1b) / time1a * 100).toFixed(1);
      console.log(`    - ✨ 性能提升: ${improvement}% (${time1a}ms → ${time1b}ms)`);
    } else if (time1b > time1a) {
      console.log(`    - ℹ️  注意: 小数据集可能看不到明显性能差异`);
      console.log(`    - ℹ️  索引在大数据集和复杂查询时更有效`);
    } else {
      console.log(`    - ℹ️  性能相当`);
    }

    // 使用 hint 强制指定索引（演示用法）
    console.log('\n  🎯 使用 hint 强制指定索引:');
    const start1c = Date.now();
    const result1c = await collection('orders').findPage({
      query: { status: 'paid' },
      sort: { createdAt: -1, _id: 1 },
      limit: 50,
      hint: { status: 1, createdAt: -1 }
    });
    const time1c = Date.now() - start1c;
    console.log(`    - 查询耗时: ${time1c}ms`);
    console.log(`    - 说明: hint 用于强制使用特定索引，通常让 MongoDB 自动优化即可`);

    // 技巧 2: 流式处理大数据
    console.log('\n2️⃣ 技巧: 流式处理减少内存占用');
    console.log('  - 传统方式: 一次性加载所有数据到内存');
    console.log('  - 流式方式: 逐批处理，内存占用恒定');
    console.log('  - 适用场景: 处理大量数据导出、批量计算等');

    // 技巧 3: 合理配置书签
    console.log('\n3️⃣ 技巧: 合理配置书签提升跳页性能');
    console.log('  - step=10: 每 10 页保存一次书签');
    console.log('  - maxHops=20: 最多跳 20 次（200 页）');
    console.log('  - 适用场景: 需要频繁访问不同页码的分页场景');
    console.log('  - 权衡: 书签会占用缓存空间，需根据实际场景调整');

    // 技巧 4: 异步统计总数
    console.log('\n4️⃣ 技巧: 使用同步/异步 totals 获取总数');
    console.log('  - sync 模式: 阻塞等待统计完成，适合小数据集');
    console.log('  - async 模式: 后台统计，适合大数据集快速返回');

    const start2 = Date.now();
    const result2 = await collection('orders').findPage({
      query: { status: 'completed' },
      sort: { _id: 1 },
      limit: 20,
      totals: { mode: 'sync' }
    });
    const time2 = Date.now() - start2;
    console.log(`\n  - 查询+统计总耗时: ${time2}ms`);
    if (result2.totals) {
      console.log(`  - 总记录数: ${result2.totals.total}`);
      console.log(`  - 总页数: ${result2.totals.totalPages}`);
      console.log(`  - 当前页: ${result2.items.length} 条`);
    }

    // 技巧 5: 限制聚合管道复杂度
    console.log('\n5️⃣ 技巧: 控制聚合管道复杂度');
    console.log('  - 避免在分页查询中使用复杂的 $lookup');
    console.log('  - 将复杂计算移到应用层或单独查询');
    console.log('  - 使用 allowDiskUse 处理大数据集聚合');
    console.log('  - 考虑使用物化视图或预计算结果');

    // 技巧 6: 复合索引的使用场景
    console.log('\n6️⃣ 技巧: 复合索引优化价格区间查询');
    console.log('  📊 测试场景: 按分类和价格区间筛选商品');

    // 创建商品索引
    console.log('\n  🔧 创建索引: { category: 1, price: 1 }');
    await productsCollection.createIndex(
      { category: 1, price: 1 },
      { name: 'demo_category_price_idx' }
    );

    const start3 = Date.now();
    const result3 = await collection('products').findPage({
      query: {
        category: 'electronics',
        price: { $gte: 100, $lte: 1000 }
      },
      sort: { price: 1, _id: 1 },
      limit: 20
    });
    const time3 = Date.now() - start3;
    console.log(`\n  - 查询耗时: ${time3}ms`);
    console.log(`  - 返回数据: ${result3.items.length} 条商品`);
    console.log(`  - 说明: 复合索引 (category, price) 可同时优化过滤和排序`);

    // 技巧 7: 查询优化建议
    console.log('\n7️⃣ 技巧: 查询优化最佳实践');
    console.log('  ✅ 为常用查询字段创建索引');
    console.log('  ✅ 排序字段也应包含在索引中');
    console.log('  ✅ 使用投影 (projection) 只返回需要的字段');
    console.log('  ✅ 设置合理的 maxTimeMS 避免慢查询');
    console.log('  ✅ 监控慢查询日志，持续优化');
    console.log('  ⚠️  避免过多索引，会影响写入性能');
    console.log('  ⚠️  注意索引基数，高基数字段优先');

    console.log('\n💡 性能优化总结:');
    console.log('  1. 索引是提升查询性能的关键，但需要权衡写入开销');
    console.log('  2. 小数据集可能看不到明显差异，大数据集效果显著');
    console.log('  3. 让 MongoDB 自动选择索引通常是最优的');
    console.log('  4. 使用 explain() 分析查询执行计划');
    console.log('  5. 定期监控和优化慢查询');

  } finally {
    // 清理演示索引
    console.log('\n🧹 清理阶段: 删除演示索引...');

    try {
      await ordersCollection.dropIndex('demo_status_createdAt_idx');
      console.log('  ✅ 已删除索引: orders.demo_status_createdAt_idx');
    } catch (err) {
      if (err.code !== 27) { // 27 = IndexNotFound
        console.log(`  ⚠️  删除索引失败: ${err.message}`);
      }
    }

    try {
      await productsCollection.dropIndex('demo_category_price_idx');
      console.log('  ✅ 已删除索引: products.demo_category_price_idx');
    } catch (err) {
      if (err.code !== 27) {
        console.log(`  ⚠️  删除索引失败: ${err.message}`);
      }
    }

    await msq.close();
  }

  console.log('\n✅ 示例 8 完成\n');
}

// ============================================================================
// 示例 9: 使用 explain 分析查询性能
// ============================================================================
async function example9_explainAnalysis() {
  console.log('\n📖 示例 9: 使用 explain 分析查询性能');
  console.log('='.repeat(60));

  const msq = new MonSQLize({
    type: 'mongodb',
    databaseName: 'ecommerce',
    config: { useMemoryServer: true }
  });

  const { collection } = await msq.connect();

  // 示例 1: 基础查询计划分析
  console.log('\n1️⃣ 基础查询计划分析（queryPlanner 模式）：');
  const explain1 = await collection('orders').findPage({
    query: { status: 'paid' },
    sort: { createdAt: -1 },
    limit: 20,
    explain: true  // 等同于 'queryPlanner'
  });

  console.log('  📊 查询计划信息:');
  if (explain1.queryPlanner) {
    console.log(`    - 命名空间: ${explain1.queryPlanner.namespace || 'N/A'}`);
    console.log(`    - 使用索引: ${explain1.queryPlanner.winningPlan?.inputStage?.indexName || '未使用索引（集合扫描）'}`);
    console.log(`    - 查询方向: ${explain1.queryPlanner.winningPlan?.inputStage?.direction || 'N/A'}`);

    // 判断是否使用了索引
    const usedIndex = explain1.queryPlanner.winningPlan?.inputStage?.stage === 'IXSCAN';
    if (usedIndex) {
      console.log('    - ✅ 查询使用了索引优化');
    } else {
      console.log('    - ⚠️  查询未使用索引，建议创建合适的索引');
    }
  }

  // 示例 2: 详细执行统计
  console.log('\n2️⃣ 详细执行统计（executionStats 模式）：');
  const explain2 = await collection('orders').findPage({
    query: {
      status: 'completed',
      amount: { $gte: 100 }
    },
    sort: { completedAt: -1 },
    limit: 50,
    explain: 'executionStats'
  });

  if (explain2.executionStats) {
    console.log('  📈 执行统计:');
    console.log(`    - 执行时间: ${explain2.executionStats.executionTimeMillis}ms`);
    console.log(`    - 扫描文档数: ${explain2.executionStats.totalDocsExamined}`);
    console.log(`    - 返回文档数: ${explain2.executionStats.nReturned}`);
    console.log(`    - 扫描索引键数: ${explain2.executionStats.totalKeysExamined}`);

    // 计算查询效率
    const examined = explain2.executionStats.totalDocsExamined;
    const returned = explain2.executionStats.nReturned;
    if (examined > 0) {
      const efficiency = ((returned / examined) * 100).toFixed(1);
      console.log(`    - 查询效率: ${efficiency}% (${returned}/${examined})`);

      if (efficiency < 50) {
        console.log('    - ⚠️  查询效率较低，建议优化索引');
      } else if (efficiency < 80) {
        console.log('    - ℹ️  查询效率中等，有优化空间');
      } else {
        console.log('    - ✅ 查询效率良好');
      }
    }
  }

  // 示例 3: 游标分页的 explain
  console.log('\n3️⃣ 游标分页查询分析：');

  // 先获取第一页的游标
  const firstPage = await collection('products').findPage({
    query: { category: 'electronics' },
    sort: { price: 1, _id: 1 },
    limit: 10
  });

  if (firstPage.pageInfo.endCursor) {
    // 使用 explain 分析下一页查询
    const explain3 = await collection('products').findPage({
      query: { category: 'electronics' },
      sort: { price: 1, _id: 1 },
      limit: 10,
      after: firstPage.pageInfo.endCursor,
      explain: 'executionStats'
    });

    console.log('  📊 游标分页性能:');
    if (explain3.executionStats) {
      console.log(`    - 执行时间: ${explain3.executionStats.executionTimeMillis}ms`);
      console.log(`    - 扫描文档数: ${explain3.executionStats.totalDocsExamined}`);
      console.log('    - 说明: 游标分页通常只扫描少量文档，性能优异');
    }
  } else {
    console.log('  ℹ️  数据不足，跳过游标分页分析');
  }

  // 示例 4: 跳页模式的 explain
  console.log('\n4️⃣ 跳页模式查询分析：');
  const explain4 = await collection('products').findPage({
    query: { inStock: true },
    sort: { createdAt: -1 },
    limit: 20,
    page: 3,
    offsetJump: {
      enable: true,
      maxSkip: 10000
    },
    explain: 'executionStats'
  });

  if (explain4.executionStats) {
    console.log('  📊 跳页查询性能:');
    console.log(`    - 执行时间: ${explain4.executionStats.executionTimeMillis}ms`);
    console.log(`    - 扫描文档数: ${explain4.executionStats.totalDocsExamined}`);

    // 跳页使用 $skip，会扫描较多文档
    const skipped = explain4.executionStats.totalDocsExamined - explain4.executionStats.nReturned;
    if (skipped > 0) {
      console.log(`    - 跳过文档数: ${skipped}`);
      console.log('    - 说明: offset 模式会扫描跳过的文档，大页码时性能下降');
    }
  }

  // 示例 5: 对比不同查询策略
  console.log('\n5️⃣ 查询策略对比：');
  console.log('  对比场景: 获取第 100 条开始的 20 条数据');

  // 策略 1: offset 跳页
  console.log('\n  策略 1: offset 跳页');
  const strategyA = await collection('orders').findPage({
    query: { status: 'paid' },
    sort: { _id: 1 },
    limit: 20,
    page: 6,  // 第 6 页 = 跳过 100 条
    offsetJump: { enable: true, maxSkip: 10000 },
    explain: 'executionStats'
  });

  if (strategyA.executionStats) {
    console.log(`    - 执行时间: ${strategyA.executionStats.executionTimeMillis}ms`);
    console.log(`    - 扫描文档数: ${strategyA.executionStats.totalDocsExamined}`);
  }

  // 策略 2: 游标分页（模拟）
  console.log('\n  策略 2: 游标分页（理论值）');
  console.log('    - 执行时间: ~5-10ms（仅扫描当页数据）');
  console.log('    - 扫描文档数: ~21（limit + 1）');
  console.log('    - 优势: 不受页码影响，性能稳定');

  console.log('\n  💡 结论:');
  console.log('    - 小页码（< 10）: offset 和游标性能相当');
  console.log('    - 大页码（> 100）: 游标分页性能明显优于 offset');
  console.log('    - 推荐: 优先使用游标分页，需要跳页时结合书签机制');

  // 示例 6: 使用 hint 强制索引
  console.log('\n6️⃣ 使用 hint 强制指定索引：');
  console.log('  说明: hint 参数可以强制 MongoDB 使用特定索引');
  console.log('  注意: 通常应让 MongoDB 自动选择最优索引');

  try {
    const explain6 = await collection('orders').findPage({
      query: { status: 'completed' },
      sort: { createdAt: -1 },
      limit: 20,
      hint: { status: 1, createdAt: -1 },  // 强制使用这个索引
      explain: 'queryPlanner'
    });

    console.log('  📊 强制索引结果:');
    if (explain6.queryPlanner) {
      const indexName = explain6.queryPlanner.winningPlan?.inputStage?.indexName;
      console.log(`    - 使用索引: ${indexName || 'N/A'}`);
      console.log('    - ✅ hint 成功指定了索引');
    }
  } catch (error) {
    console.log('  ⚠️  指定的索引不存在，建议先创建索引');
    console.log(`    错误: ${error.message}`);
  }

  // 示例 7: allPlansExecution 模式
  console.log('\n7️⃣ 所有备选计划分析（allPlansExecution 模式）：');
  const explain7 = await collection('products').findPage({
    query: {
      category: 'electronics',
      price: { $gte: 100, $lte: 1000 }
    },
    sort: { price: 1 },
    limit: 30,
    explain: 'allPlansExecution'
  });

  if (explain7.executionStats && explain7.executionStats.allPlansExecution) {
    console.log('  📊 查询计划评估:');
    console.log(`    - 备选计划数: ${explain7.executionStats.allPlansExecution.length}`);
    console.log(`    - 最优计划: ${explain7.queryPlanner?.winningPlan?.inputStage?.stage || 'N/A'}`);

    if (explain7.executionStats.allPlansExecution.length > 1) {
      console.log('    - ℹ️  MongoDB 评估了多个索引方案并选择了最优的');
    } else {
      console.log('    - ℹ️  只有一个可用的查询计划');
    }
  }

  // 示例 8: 实用技巧总结
  console.log('\n8️⃣ explain 使用技巧总结：');
  console.log('  ✅ queryPlanner: 快速查看使用的索引');
  console.log('  ✅ executionStats: 分析实际性能和扫描效率');
  console.log('  ✅ allPlansExecution: 深度优化时比较不同策略');
  console.log('  ⚠️  explain 不返回实际数据，仅用于分析');
  console.log('  ⚠️  explain 不会使用缓存，结果是实时查询的');
  console.log('  💡 关注指标: executionTimeMillis, totalDocsExamined/nReturned 比值');

  await msq.close();
  console.log('\n✅ 示例 9 完成\n');
}

// ============================================================================
// 主函数 - 运行所有示例
// ============================================================================
async function main() {
  console.log('\n');
  console.log('╔═══════════════════════════════════════════════════════════╗');
  console.log('║          monSQLize findPage 方法完整示例集                ║');
  console.log('╚═══════════════════════════════════════════════════════════╝');

  const examples = [
    { name: '基础游标分页', fn: example1_basicCursorPagination },
    { name: '跳页功能', fn: example2_pageJumping },
    { name: '流式处理大数据集', fn: example3_streamProcessing },
    { name: '获取总数统计', fn: example4_totalsStatistics },
    { name: '复杂查询和聚合', fn: example5_complexQueries },
    { name: '错误处理和重试', fn: example6_errorHandling },
    { name: '构建分页 API', fn: example7_buildPaginationAPI },
    { name: '性能优化技巧', fn: example8_performanceOptimization },
    { name: 'explain 性能分析', fn: example9_explainAnalysis }
  ];

  // 如果指定了参数，只运行特定示例
  const exampleIndex = process.argv[2];
  if (exampleIndex) {
    const index = parseInt(exampleIndex) - 1;
    if (index >= 0 && index < examples.length) {
      await examples[index].fn();
    } else {
      console.log(`\n❌ 无效的示例编号: ${exampleIndex}`);
      console.log(`   有效范围: 1-${examples.length}`);
    }
  } else {
    // 运行所有示例
    for (const example of examples) {
      try {
        await example.fn();
      } catch (error) {
        console.error(`\n❌ 示例 "${example.name}" 执行失败:`, error.message);
        console.error('   提示: 确保 MongoDB 正在运行并且数据库有测试数据');
      }
    }
  }

  console.log('\n');
  console.log('╔═══════════════════════════════════════════════════════════╗');
  console.log('║                    所有示例执行完成                       ║');
  console.log('╚═══════════════════════════════════════════════════════════╝');
  console.log('\n💡 使用方法:');
  console.log('   - 运行所有示例: node examples/findPage.examples.js');
  console.log('   - 运行单个示例: node examples/findPage.examples.js [1-9]');
  console.log('\n📚 更多文档: docs/findPage.md');
  console.log('🧪 测试用例: test/findPage.test.js\n');
}

// 运行示例
if (require.main === module) {
  main()
    .catch(error => {
      console.error('\n❌ 程序执行出错:', error);
      process.exit(1);
    })
    .finally(async () => {
      // 显式停止 Memory Server，否则 Node.js 进程会卡住
      await stopMemoryServer();
    });
}

// 导出示例函数供其他模块使用
module.exports = {
  example1_basicCursorPagination,
  example2_pageJumping,
  example3_streamProcessing,
  example4_totalsStatistics,
  example5_complexQueries,
  example6_errorHandling,
  example7_buildPaginationAPI,
  example8_performanceOptimization,
  example9_explainAnalysis
};
