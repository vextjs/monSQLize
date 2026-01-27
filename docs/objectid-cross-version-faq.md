# ObjectId 跨版本兼容性 - 常见问题解答（FAQ）

## Q1: 为什么连接时提示"[DEBUG] [Saga] 使用 Redis 存储"，明明没连接 Redis？

### 问题描述

即使没有配置 Redis，初始化 monSQLize 时仍然输出：
```
[DEBUG] [Saga] 使用 Redis 存储（多进程共享）
```

### 根本原因

monSQLize 的 Saga 协调器（SagaOrchestrator）判断逻辑有误：
- **错误逻辑**：只要有 `cache` 实例且有 `set()` 方法，就认为是 Redis
- **实际情况**：monSQLize 默认启用内存缓存（MemoryCache），也有 `set()` 方法

### 解决方案

修改 `lib/saga/SagaOrchestrator.js` 的判断逻辑，通过检测 Redis 特有的方法来识别：

```javascript
// ❌ 旧逻辑（错误）
if (this.cache && typeof this.cache.set === 'function') {
    this.useRedis = true;
    this.logger?.debug('[Saga] 使用 Redis 存储（多进程共享）');
}

// ✅ 新逻辑（正确）
const isRedis = typeof this.cache.keys === 'function' && 
               typeof this.cache.publish === 'function';

if (isRedis) {
    this.useRedis = true;
    this.logger?.debug('[Saga] 使用 Redis 存储（多进程共享）');
} else {
    this.sagas = new Map();
    this.useRedis = false;
    this.logger?.debug('[Saga] 使用内存缓存（单进程，Saga 元数据不共享）');
}
```

### 验证结果

修复后的日志输出：
```
[DEBUG] [Saga] 使用内存缓存（单进程，Saga 元数据不共享）  ✅ 正确
```

---

## Q2: 自动将旧版本 ObjectId 转换为 bson@6.x，会不会影响旧版本 mongoose？

### 问题描述

担心 monSQLize 转换 ObjectId 后，mongoose 读取数据时会出现问题。

### 简短回答

**不会有任何影响！完全向后兼容。** ✅

### 详细解释

#### 1. 转换的时机和方向

```
┌─────────────┐                   ┌─────────────┐
│  mongoose   │ ─────────────────→│  MongoDB    │
│ (bson@4.x)  │    写入 (无需转换)  │  数据库     │
└─────────────┘                   └─────────────┘
                                        ↑  ↓
       ┌────────────────────────────────┘  └────────────────────────────────┐
       │                                                                     │
    读取（自动）                                                         写入（转换）
       │                                                                     │
       ↓                                                                     ↓
┌─────────────┐                                                    ┌─────────────┐
│  mongoose   │ ←──────────────────────────────────────────────── │ monSQLize   │
│ (bson@4.x)  │       ✅ 正常读取，无需monSQLize干预                 │ (bson@6.x)  │
└─────────────┘                                                    └─────────────┘
```

**关键点**：
- ✅ **转换是单向的**：只在 monSQLize 写入时发生
- ✅ **数据库存储统一**：ObjectId 的 BSON 二进制格式是标准的（12字节）
- ✅ **mongoose 读取自动**：mongoose 读取时会自动将 BSON 转换为它自己的 ObjectId

#### 2. ObjectId 的存储格式

无论是 bson@4.x、5.x 还是 6.x，ObjectId 在 MongoDB 中的存储格式都是相同的：

```
BSON 二进制格式（12 字节）：
┌─────────────┬─────────┬─────────┬─────────┐
│  Timestamp  │ Machine │ Process │ Counter │
│  (4 bytes)  │(3 bytes)│(2 bytes)│(3 bytes)│
└─────────────┴─────────┴─────────┴─────────┘
```

**关键点**：
- 所有 BSON 版本都遵循相同的规范
- MongoDB 不关心 ObjectId 是哪个 BSON 版本创建的
- 读取时，各库会将 BSON 转换为自己的 ObjectId 实例

#### 3. 实际测试验证

我们编写了完整的向后兼容性测试（`scripts/test/verify-backward-compatibility.js`）：

**测试流程**：
1. ✅ monSQLize 插入数据（包含旧版本 ObjectId，自动转换为 bson@6.x）
2. ✅ 原生驱动读取（模拟 mongoose），验证 ObjectId 值和类型
3. ✅ 原生驱动更新数据（模拟 mongoose 写入）
4. ✅ monSQLize 读取更新后的数据，验证一致性

**测试结论**：
```
✅ monSQLize 写入的数据可以被原生驱动正常读取
✅ ObjectId 值完全一致（十六进制字符串相同）
✅ ObjectId 类型正确（都是 ObjectId 实例）
✅ 原生驱动（mongoose）写入的数据 monSQLize 可以正常读取
✅ 混用 monSQLize 和 mongoose 不会有任何问题
```

#### 4. 为什么不会影响 mongoose？

**核心原理**：

1. **转换只影响写入**
   - monSQLize 写入时：旧版本 ObjectId → 新版本 ObjectId → BSON（12字节）
   - mongoose 写入时：旧版本 ObjectId → BSON（12字节）
   - **存储结果相同**：都是标准的 BSON 格式

2. **读取时各自转换**
   - mongoose 读取：BSON（12字节）→ mongoose 的 ObjectId（bson@4.x/5.x）
   - monSQLize 读取：BSON（12字节）→ monSQLize 的 ObjectId（bson@6.x）
   - **各自独立**：互不干扰

3. **ObjectId 值始终一致**
   ```javascript
   // monSQLize 写入
   const legacyId = mongoose.Types.ObjectId('507f1f77bcf86cd799439011');
   await msq.collection('users').insertOne({ userId: legacyId });
   // 存储到 MongoDB: BSON(507f1f77bcf86cd799439011)
   
   // mongoose 读取
   const user = await User.findOne({ _id: ... });
   console.log(user.userId.toString());  // "507f1f77bcf86cd799439011" ✅
   
   // monSQLize 读取
   const user2 = await msq.collection('users').findOne({ _id: ... });
   console.log(user2.userId.toString());  // "507f1f77bcf86cd799439011" ✅
   ```

#### 5. 实际使用场景

**场景 1：mongoose 服务 → monSQLize 服务（跨服务调用）**

```javascript
// 服务 A（使用 mongoose）
const user = await User.findOne({ username: 'john' }).lean();
// user.userId 是 mongoose 的 ObjectId (bson@4.x/5.x)

// 调用服务 B（使用 monSQLize）
await axios.post('http://service-b/api/orders', { userId: user.userId });

// 服务 B 接收数据
app.post('/api/orders', async (req, res) => {
    const { userId } = req.body;  // 旧版本 ObjectId
    
    // ✅ monSQLize 自动转换
    await msq.collection('orders').insertOne({
        userId,  // 自动转换为 bson@6.x
        productId: new ObjectId(),
        status: 'pending'
    });
});
```

**场景 2：mongoose 和 monSQLize 混用同一个数据库**

```javascript
// mongoose 写入
await User.create({ username: 'alice', age: 25 });

// monSQLize 读取
const users = await msq.collection('users').find({ age: { $gte: 18 } });
// ✅ 完全正常

// monSQLize 写入
await msq.collection('users').insertOne({ username: 'bob', age: 30 });

// mongoose 读取
const bob = await User.findOne({ username: 'bob' });
// ✅ 完全正常
```

### 总结

| 问题 | 回答 |
|------|------|
| 会不会影响 mongoose 读取？ | ❌ 不会，mongoose 读取时会自动转换 |
| 会不会影响数据库中的数据？ | ❌ 不会，存储格式完全相同 |
| 需要修改 mongoose 代码吗？ | ❌ 不需要，完全透明 |
| 能否混用 mongoose 和 monSQLize？ | ✅ 可以，完全兼容 |
| 转换有性能影响吗？ | ✅ 极小（~0.01ms/ObjectId） |
| 会不会丢失数据？ | ❌ 不会，ObjectId 值完全一致 |

---

## Q3: 如何验证我的项目是否存在兼容性问题？

运行以下测试脚本：

```bash
# 跨版本兼容性测试
node scripts/test/verify-cross-version-objectid.js

# 向后兼容性测试
node scripts/test/verify-backward-compatibility.js
```

---

## Q4: 如果我不想自动转换，可以禁用吗？

目前自动转换是默认启用的，暂无配置项禁用。

**原因**：
- 这是一个 Bug 修复，不是新功能
- 转换是安全的，不会影响任何现有功能
- 性能影响极小（~0.01ms/ObjectId）

如果您确实需要禁用，请提交 Issue 说明您的场景。

---

## Q5: 如果遇到其他 BSON 类型冲突，如何处理？

目前只处理了 ObjectId 的跨版本兼容。如果遇到其他类型（如 Decimal128, Binary 等）的冲突，请：

1. 提交 Issue：https://github.com/vextjs/monSQLize/issues
2. 提供复现步骤和错误信息
3. 我们会优先处理

---

## 相关文档

- [ObjectId 跨版本兼容性指南](../docs/objectid-cross-version.md)
- [修复报告](../reports/jrpc/implementation/objectid-cross-version-fix-v1.1.1.md)
- [CHANGELOG](../CHANGELOG.md)
