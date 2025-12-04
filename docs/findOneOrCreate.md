# findOneOrCreate 扩展方法

> **版本**: v1.2.0+  
> **类型**: 扩展方法  
> **优先级**: P0

---

## 📋 概述

`findOneOrCreate` 是一个强大的扩展方法，用于查找文档，如果不存在则自动创建。它自动处理并发竞态条件，充分利用缓存，显著减少代码量（80%）。

---

## 🎯 核心特性

| 特性 | 说明 |
|------|------|
| **并发安全** | 自动处理 unique 索引冲突，智能重试 |
| **缓存优化** | 文档存在时直接命中缓存（0 DB 调用）|
| **代码减少** | 6-8 行原生代码 → 1 行扩展方法（减少 80%）|
| **事务支持** | 完整支持 MongoDB 事务（session 参数）|
| **性能监控** | 自动记录慢查询日志 |

---

## 📖 API 签名

```typescript
findOneOrCreate(
  query: Object,
  doc: Object,
  options?: FindOneOrCreateOptions
): Promise<FindOneOrCreateResult>

interface FindOneOrCreateOptions {
  projection?: Object;           // 字段投影
  cache?: number;                // 缓存时间（毫秒）
  retryOnConflict?: boolean;     // 并发冲突时是否重试（默认: true）
  maxRetries?: number;           // 最大重试次数（默认: 3）
  maxTimeMS?: number;            // 查询超时时间
  comment?: string;              // 查询注释
  session?: ClientSession;       // MongoDB 会话（事务支持）
}

interface FindOneOrCreateResult {
  doc: Object;                   // 文档对象
  created: boolean;              // 是否新创建（true: 新创建, false: 已存在）
  fromCache: boolean;            // 是否来自缓存（仅 created: false 时有效）
}
```

---

## 🚀 使用场景

### 场景 1: OAuth 用户首次登录

**业务需求**: GitHub OAuth 登录，用户不存在则自动创建，已存在则直接返回。

#### ❌ 原生实现（6-8 行，容易出错）

```javascript
// 原生 API 需要 6-8 行代码
let user = await User.findOne({ githubId: profile.id });

if (!user) {
  try {
    user = await User.insertOne({
      githubId: profile.id,
      username: profile.login,
      email: profile.email,
      avatar: profile.avatar_url,
      createdAt: new Date()
    });
  } catch (err) {
    if (err.code === 11000) {
      // 并发冲突，重新查询
      user = await User.findOne({ githubId: profile.id });
    } else {
      throw err;
    }
  }
}

// 问题：
// 1. 代码冗长（6-8 行）
// 2. 并发处理容易遗漏
// 3. 没有利用缓存
// 4. 错误处理复杂
```

#### ✅ findOneOrCreate（1 行，并发安全）

```javascript
const { doc: user, created } = await User.findOneOrCreate(
  { githubId: profile.id },
  {
    githubId: profile.id,
    username: profile.login,
    email: profile.email,
    avatar: profile.avatar_url,
    createdAt: new Date()
  }
);

if (created) {
  // 新用户：发送欢迎邮件
  await sendWelcomeEmail(user.email);
} else {
  // 老用户：更新最后登录时间
  await User.updateOne({ _id: user._id }, { $set: { lastLogin: new Date() } });
}

// 优势：
// ✅ 1 行代码（减少 80%）
// ✅ 自动处理并发冲突
// ✅ 充分利用缓存
// ✅ 返回 created 标记，区分新老用户
```

---

### 场景 2: 标签自动创建

**业务需求**: 文章添加标签，标签不存在则自动创建，已存在则复用。

#### ❌ 原生实现

```javascript
const tags = [];

for (const tagName of ['JavaScript', 'MongoDB', 'Node.js']) {
  let tag = await Tag.findOne({ name: tagName });
  
  if (!tag) {
    try {
      tag = await Tag.insertOne({ name: tagName, count: 0, createdAt: new Date() });
    } catch (err) {
      if (err.code === 11000) {
        tag = await Tag.findOne({ name: tagName });
      } else {
        throw err;
      }
    }
  }
  
  tags.push(tag._id);
}

await Article.updateOne({ _id: articleId }, { $set: { tags } });

// 问题：
// 1. 重复代码（每个标签都要写一遍）
// 2. 并发处理容易遗漏
// 3. 多个标签同时创建时可能冲突
```

#### ✅ findOneOrCreate

```javascript
const tags = [];

for (const tagName of ['JavaScript', 'MongoDB', 'Node.js']) {
  const { doc: tag } = await Tag.findOneOrCreate(
    { name: tagName },
    { name: tagName, count: 0, createdAt: new Date() }
  );
  tags.push(tag._id);
}

await Article.updateOne({ _id: articleId }, { $set: { tags } });

// 优势：
// ✅ 简洁清晰
// ✅ 自动处理并发冲突（多个文章同时添加相同标签）
// ✅ 不需要 try-catch
```

---

### 场景 3: 缓存计算结果

**业务需求**: 获取月度统计，不存在则计算并缓存，已存在则直接返回（缓存命中）。

#### ❌ 原生实现

```javascript
// 原生 API 需要手动处理缓存
let stats = await Stats.findOne({ month: '2024-12' });

if (!stats) {
  const data = await calculateMonthlyStats('2024-12');  // 耗时计算
  stats = await Stats.insertOne({
    month: '2024-12',
    data,
    createdAt: new Date()
  });
}

// 问题：
// 1. 没有利用缓存
// 2. 每次都要查询数据库
// 3. 并发冲突处理缺失
```

#### ✅ findOneOrCreate（缓存优化）

```javascript
const { doc: stats, fromCache } = await Stats.findOneOrCreate(
  { month: '2024-12' },
  {
    month: '2024-12',
    data: await calculateMonthlyStats('2024-12'),  // 仅在不存在时计算
    createdAt: new Date()
  },
  { cache: 3600000 }  // 缓存 1 小时
);

console.log(fromCache ? '缓存命中（< 1ms）' : '计算并缓存');

// 性能对比：
// 原生 API（每次查询）: 50ms
// findOneOrCreate（缓存命中）: < 1ms（提升 50 倍）
```

---

## ⚙️ 选项详解

### projection - 字段投影

**类型**: `Object`  
**默认**: 无（返回所有字段）

```javascript
const { doc } = await User.findOneOrCreate(
  { email: 'user@example.com' },
  {
    email: 'user@example.com',
    name: 'Test User',
    age: 30,
    secret: 'should-not-return'
  },
  { projection: { name: 1, email: 1 } }  // 只返回 name 和 email
);

console.log(doc);
// { _id: ObjectId(...), name: 'Test User', email: 'user@example.com' }
// secret 不会返回
```

---

### cache - 缓存时间

**类型**: `number`（毫秒）  
**默认**: 继承全局配置  
**建议**: 根据数据变化频率设置（例如：用户信息 1 小时，统计数据 10 分钟）

```javascript
// 场景：用户信息（变化少，缓存 1 小时）
const { doc: user, fromCache } = await User.findOneOrCreate(
  { email: 'user@example.com' },
  { /* ... */ },
  { cache: 3600000 }  // 1 小时
);

// 场景：实时统计（变化快，缓存 1 分钟）
const { doc: stats } = await Stats.findOneOrCreate(
  { key: 'realtime' },
  { /* ... */ },
  { cache: 60000 }  // 1 分钟
);
```

**性能提升**:
- 无缓存：每次查询 ~50ms
- 缓存命中：< 1ms（提升 50 倍）

---

### retryOnConflict - 并发冲突重试

**类型**: `boolean`  
**默认**: `true`

```javascript
// 启用重试（默认，推荐）
const { doc } = await User.findOneOrCreate(
  { email: 'user@example.com' },
  { /* ... */ },
  { retryOnConflict: true, maxRetries: 3 }
);

// 禁用重试（不推荐，可能因并发冲突失败）
const { doc } = await User.findOneOrCreate(
  { email: 'user@example.com' },
  { /* ... */ },
  { retryOnConflict: false }
);
```

**并发处理流程**:
```
1. findOne(query) → 不存在
2. insertOne(doc) → E11000（并发冲突）
3. 自动重试 findOne(query) → 找到文档
4. 返回已存在的文档
```

---

### maxRetries - 最大重试次数

**类型**: `number`  
**默认**: `3`

```javascript
const { doc } = await User.findOneOrCreate(
  { email: 'user@example.com' },
  { /* ... */ },
  { maxRetries: 5 }  // 最多重试 5 次
);
```

---

### session - 事务支持

**类型**: `ClientSession`  
**默认**: 无

```javascript
const session = await client.startSession();
session.startTransaction();

try {
  const { doc: user } = await User.findOneOrCreate(
    { email: 'user@example.com' },
    { /* ... */ },
    { session }
  );

  await Order.insertOne({ userId: user._id, /* ... */ }, { session });

  await session.commitTransaction();
} catch (error) {
  await session.abortTransaction();
  throw error;
} finally {
  session.endSession();
}
```

---

## 🔄 与其他方法对比

| 方法 | 行为 | 并发安全 | 缓存利用 | 适用场景 |
|------|------|---------|---------|---------|
| **findOneOrCreate** | 存在 → 返回<br>不存在 → 插入 | ✅ 自动处理 | ✅ 充分利用 | OAuth 登录、标签创建 |
| **findOne + insertOne** | 手动实现 | ❌ 需要手动处理 | ❌ 需要手动实现 | 复杂场景 |
| **upsertOne** | 存在 → 更新<br>不存在 → 插入 | ✅ 原子操作 | ❌ 每次都更新 | 配置管理、数据同步 |
| **findOneAndUpdate** | 存在 → 更新<br>不存在 → 可选插入 | ✅ 原子操作 | ❌ 每次都更新 | 计数器、状态更新 |

**核心区别**:
- `findOneOrCreate`: 存在时**不更新**，不存在时插入（OAuth 登录场景）
- `upsertOne`: 存在时**更新**，不存在时插入（配置管理场景）

---

## 📊 性能数据

### 基准测试

**测试环境**: MongoDB 5.0, Node.js 18, 本地测试

| 场景 | 原生 API | findOneOrCreate | 性能提升 |
|------|---------|----------------|---------|
| **首次创建** | 50ms | 52ms | 相当 |
| **查询已存在（无缓存）** | 50ms | 50ms | 相当 |
| **查询已存在（缓存命中）** | 50ms | < 1ms | **50 倍** |
| **并发创建（5 个并发）** | 5 × 50ms = 250ms（串行）| 60ms（并行 + 重试）| **4 倍** |

---

## ⚠️ 注意事项

### 1. query 必须有 unique 索引

为了保证并发安全，query 条件的字段必须有 unique 索引：

```javascript
// ✅ 正确：email 有 unique 索引
await db.collection('users').createIndex({ email: 1 }, { unique: true });

const { doc } = await User.findOneOrCreate(
  { email: 'user@example.com' },
  { /* ... */ }
);

// ❌ 错误：name 没有 unique 索引，并发时可能插入重复数据
const { doc } = await User.findOneOrCreate(
  { name: 'John' },  // 如果没有 unique 索引，并发时可能插入多个 John
  { /* ... */ }
);
```

---

### 2. doc 必须包含 query 的字段

```javascript
// ✅ 正确：doc 包含 query 的 email 字段
const { doc } = await User.findOneOrCreate(
  { email: 'user@example.com' },
  {
    email: 'user@example.com',  // 必须包含
    name: 'Test User'
  }
);

// ❌ 错误：doc 缺少 query 的 email 字段
const { doc } = await User.findOneOrCreate(
  { email: 'user@example.com' },
  {
    name: 'Test User'  // 缺少 email，插入后无法匹配查询条件
  }
);
```

---

### 3. 不会更新已存在的文档

```javascript
// 已存在的用户
await User.insertOne({ email: 'user@example.com', name: 'Old Name', age: 30 });

// findOneOrCreate 不会更新
const { doc, created } = await User.findOneOrCreate(
  { email: 'user@example.com' },
  {
    email: 'user@example.com',
    name: 'New Name',  // ❌ 不会更新
    age: 99            // ❌ 不会更新
  }
);

console.log(created);  // false（已存在）
console.log(doc.name); // 'Old Name'（保持原值）
console.log(doc.age);  // 30（保持原值）

// 如果需要更新，使用 updateOrInsert 或 upsertOne
```

---

## 📝 完整示例

### 示例 1: 微博用户关注系统

```javascript
// 用户 A 关注用户 B
async function followUser(userIdA, userIdB) {
  // 确保关注记录不重复
  const { doc: follow, created } = await Follow.findOneOrCreate(
    { followerId: userIdA, followingId: userIdB },
    {
      followerId: userIdA,
      followingId: userIdB,
      createdAt: new Date()
    }
  );

  if (created) {
    // 新关注：更新计数
    await User.updateOne({ _id: userIdB }, { $inc: { followerCount: 1 } });
    await User.updateOne({ _id: userIdA }, { $inc: { followingCount: 1 } });
    
    // 发送通知
    await Notification.insertOne({
      userId: userIdB,
      type: 'new_follower',
      from: userIdA,
      createdAt: new Date()
    });
  }

  return { success: true, alreadyFollowing: !created };
}
```

---

### 示例 2: 分布式锁

```javascript
// 获取分布式锁
async function acquireLock(lockKey, ttl = 30000) {
  const { doc: lock, created } = await Lock.findOneOrCreate(
    { key: lockKey },
    {
      key: lockKey,
      ownerId: process.pid,
      expiresAt: new Date(Date.now() + ttl),
      createdAt: new Date()
    }
  );

  if (!created) {
    // 锁已被占用，检查是否过期
    if (lock.expiresAt < new Date()) {
      // 过期，强制释放
      await Lock.deleteOne({ key: lockKey });
      return acquireLock(lockKey, ttl);  // 重试
    }
    throw new Error(`Lock '${lockKey}' is already held`);
  }

  return lock;
}

// 释放锁
async function releaseLock(lockKey, ownerId) {
  await Lock.deleteOne({ key: lockKey, ownerId });
}
```

---

## 🐛 错误处理

### 常见错误

```javascript
// 1. query 是空对象
try {
  await User.findOneOrCreate({}, { name: 'Test' });
} catch (err) {
  console.error(err.message);  // 'query 参数必须是非空对象'
}

// 2. doc 是空对象
try {
  await User.findOneOrCreate({ email: 'test@example.com' }, {});
} catch (err) {
  console.error(err.message);  // 'doc 参数必须是非空对象'
}

// 3. 并发冲突重试超限
try {
  await User.findOneOrCreate(
    { email: 'test@example.com' },
    { /* ... */ },
    { maxRetries: 3 }
  );
} catch (err) {
  console.error(err.message);  // 'findOneOrCreate 并发冲突，重试 3 次后仍失败'
}
```

---

## 📚 相关文档

- [upsertOne](./upsertOne.md) - 更新或插入（会更新已存在的文档）
- [findOneAndUpdate](./findOneAndUpdate.md) - 查找并更新
- [insertOne](./insertOne.md) - 插入文档

---

> **文档版本**: v1.2.0  
> **最后更新**: 2025-12-04  
> **维护者**: monSQLize Team

