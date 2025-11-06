# monSQLize

一个面向多数据库的统一（Mongo 风格）读 API。目前支持 MongoDB。目标是在不同后端之间平滑切换，同时保持熟悉的查询形态与选项。

## 特性

- ✅ **MongoDB 适配器**：完整支持 MongoDB 查询功能
- ✅ **内置缓存**：TTL/LRU/命名空间失效/并发去重
- ✅ **跨库访问**：轻松访问不同数据库的集合
- ✅ **性能优化**：慢查询日志、查询超时控制
- ✅ **类型安全**：完整的 TypeScript 类型声明

## 状态

- **已实现**：MongoDB 适配器；find/findOne/count；内置缓存；跨库访问；默认值（maxTimeMS/findLimit）；慢查询日志；TypeScript 类型
- **规划中**：多层缓存（本地+远端）；更多数据库适配器（PostgreSQL/MySQL/SQLite）

**完整能力矩阵与路线图**：[STATUS.md](./STATUS.md)

---

## 安装

```bash
npm i monsqlize
```

---

## 快速开始

```js
const MonSQLize = require('monsqlize');

(async () => {
  // 创建实例并连接
  const { db, collection } = await new MonSQLize({
    type: 'mongodb',
    databaseName: 'example',
    config: { uri: 'mongodb://localhost:27017' },
    maxTimeMS: 3000,        // 全局查询超时（毫秒）
    findLimit: 10,          // find 默认 limit
  }).connect();

  // 查询单个文档
  const one = await collection('test').findOne({
    query: { status: 'active' },
    cache: 5000,            // 缓存 5 秒
    maxTimeMS: 1500         // 覆盖全局超时
  });
  console.log('findOne ->', one);

  // 查询多个文档
  const list = await collection('test').find({
    query: { category: 'electronics' },
    limit: 10,              // 限制 10 条
    cache: 3000             // 缓存 3 秒
  });
  console.log('find ->', list.length);

  // 跨库访问
  const event = await db('analytics').collection('events').findOne({
    query: { type: 'click' },
    cache: 3000,
    maxTimeMS: 1500
  });
  console.log('跨库查询 ->', event);
})();
```

---

## 核心 API

### 查询方法

| 方法 | 说明 | 文档链接 |
|------|------|---------|
| **find()** | 批量查询（支持数组和流式） | [docs/find.md](./docs/find.md) |
| **findOne()** | 查询单个文档 | [docs/findOne.md](./docs/findOne.md) |
| **findPage()** | 分页查询（游标/跳页/总数） | [docs/findPage.md](./docs/findPage.md) |
| **aggregate()** | 聚合管道查询 | [docs/aggregate.md](./docs/aggregate.md) |
| **distinct()** | 字段去重查询 | [docs/distinct.md](./docs/distinct.md) |
| **count()** | 统计文档数量 | [docs/count.md](./docs/count.md) |
| **explain()** | 查询计划分析 | [docs/explain.md](./docs/explain.md) |

### 缓存与维护

| 方法 | 说明 | 文档链接 |
|------|------|---------|
| **cache** | 缓存策略配置 | [docs/cache.md](./docs/cache.md) |
| **prewarmBookmarks()** | 预热分页书签 | [docs/bookmarks.md](./docs/bookmarks.md) |
| **listBookmarks()** | 列出书签信息 | [docs/bookmarks.md](./docs/bookmarks.md) |
| **clearBookmarks()** | 清理书签缓存 | [docs/bookmarks.md](./docs/bookmarks.md) |

### 连接与事件

| 主题 | 说明 | 文档链接 |
|------|------|---------|
| **连接管理** | 连接、关闭、跨库访问 | [docs/connection.md](./docs/connection.md) |
| **事件系统** | 监听连接、错误、慢查询 | [docs/events.md](./docs/events.md) |

---

## 主要功能示例

### 1. find 查询（支持流式传输）

```js
// 数组模式（默认）
const products = await collection('products').find({
  query: { category: 'electronics', inStock: true },
  projection: { name: 1, price: 1 },
  sort: { price: -1 },
  limit: 20,
  cache: 5000
});

// 流式传输（大数据量）
const stream = await collection('products').find({
  query: { category: 'electronics' },
  stream: true,              // 返回流
  cache: 0                   // 禁用缓存
});

stream.on('data', (doc) => {
  console.log('处理文档:', doc);
});

stream.on('end', () => {
  console.log('✅ 所有文档处理完成');
});
```

**详细文档**: [docs/find.md](./docs/find.md)

---

### 2. findPage 分页查询

```js
// 游标分页（推荐）
const page1 = await collection('products').findPage({
  query: { category: 'electronics' },
  limit: 20,
  sort: { createdAt: -1 },
  bookmarks: {
    step: 10,                // 每 10 页缓存一个书签
    maxHops: 20,             // 最多跳跃 20 次
    ttlMs: 3600000           // 书签缓存 1 小时
  }
});

console.log('第 1 页:', page1.data);
console.log('下一页游标:', page1.cursor);

// 使用游标获取下一页
const page2 = await collection('products').findPage({
  query: { category: 'electronics' },
  limit: 20,
  cursor: page1.cursor       // 传入上一页的游标
});

// 跳页模式（跳到第 100 页）
const page100 = await collection('products').findPage({
  query: { category: 'electronics' },
  limit: 20,
  page: 100,                 // 跳到第 100 页
  bookmarks: { step: 10, maxHops: 20, ttlMs: 3600000 }
});
```

**详细文档**: [docs/findPage.md](./docs/findPage.md)

---

### 3. aggregate 聚合查询

```js
// 统计订单总额
const stats = await collection('orders').aggregate({
  pipeline: [
    { $match: { status: 'completed', date: { $gte: new Date('2025-01-01') } } },
    { $group: {
        _id: '$category',
        total: { $sum: '$amount' },
        count: { $sum: 1 },
        avgAmount: { $avg: '$amount' }
      }
    },
    { $sort: { total: -1 } }
  ],
  cache: 60000,              // 缓存 1 分钟
  maxTimeMS: 5000
});

console.log('聚合结果:', stats);
```

**详细文档**: [docs/aggregate.md](./docs/aggregate.md)

---

### 4. 缓存策略

```js
// 配置全局缓存
const msq = new MonSQLize({
  type: 'mongodb',
  databaseName: 'shop',
  config: { uri: 'mongodb://localhost:27017' },
  cache: {
    maxSize: 100000,         // 最大缓存 10 万条
    enableStats: true        // 启用统计
  }
});

// 查询级缓存
const products = await collection('products').find({
  query: { category: 'electronics' },
  cache: 5000,               // 缓存 5 秒
  maxTimeMS: 3000
});

// 获取缓存统计
const stats = msq.getCacheStats();
console.log('缓存统计:', {
  命中率: stats.hitRate,
  缓存条目: stats.size,
  淘汰次数: stats.evictions
});

// 缓存失效（写操作后）
await collection('products').insertOne({ name: 'New Product', price: 999 });
// 自动清理 products 集合的所有缓存
```

**详细文档**: [docs/cache.md](./docs/cache.md)

---

### 5. 连接管理

```js
const msq = new MonSQLize({
  type: 'mongodb',
  databaseName: 'shop',
  config: { uri: 'mongodb://localhost:27017' }
});

// 连接
const { db, collection } = await msq.connect();

// 跨库访问
const analyticsEvent = await db('analytics').collection('events').findOne({
  query: { type: 'click' },
  cache: 3000
});

// 关闭连接
await msq.close();
```

**详细文档**: [docs/connection.md](./docs/connection.md)

---

### 6. 事件监听

```js
// 监听慢查询
msq.on('slow-query', (data) => {
  console.warn('慢查询警告:', {
    操作: data.operation,
    集合: data.collectionName,
    耗时: data.duration,
    查询: data.query
  });
});

// 监听连接状态
msq.on('connected', (data) => {
  console.log('✅ 数据库连接成功');
});

msq.on('error', (data) => {
  console.error('❌ 数据库错误:', data.error.message);
});
```

**详细文档**: [docs/events.md](./docs/events.md)

---

## 示例代码

所有示例代码位于 [examples/](./examples/) 目录：

| 示例文件 | 说明 |
|---------|------|
| [find.examples.js](./examples/find.examples.js) | find 查询示例（数组和流式） |
| [findPage.examples.js](./examples/findPage.examples.js) | 分页查询示例（游标/跳页/总数） |
| [aggregate.examples.js](./examples/aggregate.examples.js) | 聚合管道示例 |
| [distinct.examples.js](./examples/distinct.examples.js) | 字段去重示例 |
| [count.examples.js](./examples/count.examples.js) | 统计查询示例 |
| [explain.examples.js](./examples/explain.examples.js) | 查询计划分析示例 |
| [bookmarks.examples.js](./examples/bookmarks.examples.js) | 书签维护示例 |
| [findOne.examples.js](./examples/findOne.examples.js) | findOne 查询示例 |

---

## 项目结构

```
monSQLize/
├── lib/                     # 源代码
│   ├── index.js            # 主入口
│   ├── mongodb/            # MongoDB 适配器
│   └── common/             # 通用工具
├── docs/                    # 详细文档
│   ├── find.md             # find 方法文档
│   ├── findPage.md         # findPage 方法文档
│   ├── aggregate.md        # aggregate 方法文档
│   ├── distinct.md         # distinct 方法文档
│   ├── count.md            # count 方法文档
│   ├── explain.md          # explain 方法文档
│   ├── bookmarks.md        # Bookmark 维护文档
│   ├── connection.md       # 连接管理文档
│   ├── cache.md            # 缓存策略文档
│   └── events.md           # 事件系统文档
├── examples/                # 示例代码
├── test/                    # 测试用例
├── index.d.ts               # TypeScript 类型声明
├── package.json
├── README.md                # 本文件
├── CHANGELOG.md             # 版本历史
├── STATUS.md                # 功能状态
└── LICENSE
```

---

## 开发与测试

### 运行测试

```bash
# 安装依赖
npm ci

# 运行所有测试
npm test

# 运行单个测试
npm test -- test/unit/features/find.test.js

# 查看测试覆盖率
npm run coverage
```

### 本地开发

```bash
# 安装 MongoDB Memory Server（测试用）
npm install

# 启动本地 MongoDB（如果需要）
docker run -d -p 27017:27017 --name mongodb mongo:latest

# 运行示例
node examples/find.examples.js
```

**测试文档**: [docs/MONGODB-MEMORY-SERVER.md](./docs/MONGODB-MEMORY-SERVER.md)

---

## 贡献指南

欢迎贡献！请阅读 [CONTRIBUTING.md](./CONTRIBUTING.md) 了解详细信息。

### 贡献流程

1. Fork 项目
2. 创建特性分支 (`git checkout -b feature/AmazingFeature`)
3. 提交更改 (`git commit -m 'feat: Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 提交 Pull Request

---

## 许可证

MIT License - 详见 [LICENSE](./LICENSE) 文件

---

## 链接

- **项目主页**: https://github.com/your-username/monSQLize
- **问题反馈**: https://github.com/your-username/monSQLize/issues
- **变更日志**: [CHANGELOG.md](./CHANGELOG.md)
- **功能状态**: [STATUS.md](./STATUS.md)

---

## 致谢

感谢所有贡献者和使用者的支持！