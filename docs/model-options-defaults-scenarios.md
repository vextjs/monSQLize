# Model Options 默认值与实际场景指南

## 📋 第1部分：默认配置值

### 完整的默认值表

| 配置项 | 默认值 | 说明 |
|--------|--------|------|
| **timestamps.enabled** | `false` | 默认禁用，需主动启用 |
| **timestamps.createdAt** | `'createdAt'` | 创建时间字段名 |
| **timestamps.updatedAt** | `'updatedAt'` | 更新时间字段名 |
| **softDelete.enabled** | `false` | 默认禁用，需主动启用 |
| **softDelete.field** | `'deletedAt'` | 软删除字段名 |
| **softDelete.type** | `'timestamp'` | 类型（timestamp 或 boolean） |
| **softDelete.ttl** | `null` | 不自动清理（null=永久保留） |
| **softDelete.index** | `true` | 自动创建 deletedAt 索引 |
| **version.enabled** | `false` | 默认禁用，需主动启用 |
| **version.field** | `'version'` | 版本字段名 |
| **version.strategy** | `'increment'` | 策略（increment 或 timestamp） |
| **sync.enabled** | `false` | 默认禁用，需主动启用 |
| **sync.mode** | `'safe'` | 模式（safe 或 force） |
| **sync.background** | `true` | 后台创建索引 |

### 核心原则

✅ **默认全部禁用**（enabled: false）
- 不强制用户使用任何功能
- 用户根据需求显式启用

✅ **合理的字段名默认值**
- timestamps: 'createdAt' / 'updatedAt'
- softDelete: 'deletedAt'
- version: 'version'

✅ **生产环保险**
- sync.mode = 'safe'（只创建，不删除）
- softDelete.index = true（自动创建索引）

---

## 📊 第2部分：日常开发场景分析

### 场景1️⃣：用户/订单表

**特点**：
- 核心业务表
- 可能被并发更新（订单状态）
- 用户可能误删，需要恢复
- 需要创建/更新时间追踪

**最佳配置**：
```javascript
options: {
    timestamps: true,           // 需要时间戳
    softDelete: true,           // 需要软删除，保留30天
    version: true,              // 防止并发冲突
    sync: true                  // 同步索引
}

indexes: [
    { key: { username: 1 }, unique: true },
    { key: { email: 1 }, unique: true }
]
```

**说明**：
- `timestamps: true` - 记录用户/订单创建时间
- `softDelete: true` - 用户删除账号后保留30天，可恢复
- `version: true` - 订单并发更新时防止冲突
- `sync: true` - 生产用 safe，开发用 force

**自动注入方法**：
```javascript
// 恢复已删除用户
await User.restore(userId);

// 查询包含软删除的用户
const allUsers = await User.findWithDeleted();

// 只查询已删除的用户
const deletedUsers = await User.findOnlyDeleted();
```

---

### 场景2️⃣：会话表（Session）

**特点**：
- 寿命短（2小时有效期）
- 不需要时间戳
- 不需要软删除（过期自动删除）
- 不需要版本控制

**最佳配置**：
```javascript
options: {
    timestamps: false,          // 不需要时间戳
    softDelete: false,          // 不需要软删除
    version: false,             // 不需要版本控制
    sync: true                  // 同步 TTL 索引
}

schema: function(dsl) {
    return dsl({
        userId: 'objectId!',
        token: 'string!',
        expireAt: 'date!'       // 过期时间
    })
}

indexes: [
    { key: { expireAt: 1 }, expireAfterSeconds: 0 }  // TTL 索引，到期自动删除
]
```

**说明**：
- 最小化配置，只启用 sync
- 使用 TTL 索引自动清理过期会话
- 不需要人工恢复（会话过期了就是过期了）

---

### 场景3️⃣：中间表（UserRole）

**特点**：
- 关联表，无业务数据
- 不需要时间戳
- 不需要软删除
- 不需要版本控制
- 需要同步唯一索引

**最佳配置**：
```javascript
options: {
    timestamps: false,
    softDelete: false,
    version: false,
    sync: true                  // 需要同步唯一索引
}

schema: function(dsl) {
    return dsl({
        userId: 'objectId!',
        roleId: 'objectId!'
    })
}

indexes: [
    { key: { userId: 1, roleId: 1 }, unique: true }
]
```

**说明**：
- 极简配置
- 唯一索引防止重复关联
- 删除时直接物理删除（无需恢复）

---

### 场景4️⃣：日志/事件表

**特点**：
- 仅记录历史
- 需要时间戳（记录事件发生时间）
- 不删除（审计需要）
- 不需要软删除
- 不需要版本控制

**最佳配置**：
```javascript
options: {
    timestamps: true,           // 记录日志发生时间
    softDelete: false,          // 日志永久保留
    version: false,             // 日志不更新
    sync: true
}

schema: function(dsl) {
    return dsl({
        event: 'string!',
        userId: 'objectId',
        action: 'string!',
        details: 'object'
    })
}

indexes: [
    { key: { userId: 1 } },
    { key: { createdAt: -1 } },
    { key: { event: 1 } }
]
```

**说明**：
- 记录 createdAt 知道何时发生
- 不删除（审计日志）
- 可选：添加 TTL 按法律要求清理（如保留7年）

```javascript
// 按法律要求保留7年，之后自动删除
indexes: [
    { key: { createdAt: 1 }, expireAfterSeconds: 7 * 365 * 24 * 3600 }
]
```

---

### 场景5️⃣：商品/内容表（高频并发）

**特点**：
- 核心商品数据
- 秒杀时高并发（防止超卖）
- 下架后可能需要恢复
- 需要更新时间

**最佳配置**：
```javascript
options: {
    timestamps: true,           // 记录创建/更新时间
    softDelete: true,           // 下架商品保留（不是真删除）
    version: true,              // 秒杀时防止并发冲突
    sync: {
        enabled: true,
        mode: 'safe',           // 生产：safe，开发：force
        background: true
    }
}

schema: function(dsl) {
    return dsl({
        name: 'string:1-100!',
        price: 'number!',
        stock: 'number!',
        status: 'enum:active|inactive|deleted'
    })
}

indexes: [
    { key: { name: 1 } },
    { key: { status: 1 } },
    { key: { price: 1 } },
    { key: { stock: 1 } }
]
```

**说明**：
- `version: true` - 秒杀时乐观锁防止超卖
  ```javascript
  // 秒杀逻辑
  const result = await Product.updateOne(
      { _id: productId, version: currentVersion, stock: { $gt: 0 } },
      { 
          $inc: { stock: -1, version: 1 },
          $set: { updatedAt: new Date() }
      }
  );
  if (result.matchedCount === 0) {
      // 更新失败：版本不匹配或库存不足，需要重试
  }
  ```

- `softDelete: true` - 下架商品保留，后续可复原
- `sync: safe` - 生产环境只创建索引，不删除

---

## 🎯 第3部分：快速决策树

```
是否需要时间戳？
├─ 是 → timestamps: true
│  └─ 自定义字段名？
│     └─ 是 → timestamps: { enabled: true, createdAt: '...', updatedAt: '...' }
└─ 否 → timestamps: false

是否可能被误删？
├─ 是 → softDelete: true
│  └─ 保留多久？
│     ├─ 30天 → ttl: 30 * 24 * 60 * 60 * 1000
│     ├─ 永久 → ttl: null
│     └─ 自定义 → ttl: ...
└─ 否 → softDelete: false

是否高并发更新？
├─ 是 → version: true
└─ 否 → version: false

是否有自定义索引？
├─ 是 → sync: true
│  └─ 开发用 force，生产用 safe
└─ 否 → sync: false 或省略
```

---

## 💡 第4部分：常见问题与建议

### Q: 什么时候启用 softDelete?

✅ **应该启用**：
- 核心业务数据（用户、订单、商品）
- 用户可见的数据（帖子、评论、照片）
- 需要审计的数据

❌ **不需要启用**：
- 会话、缓存、Token
- 中间表
- 临时表
- 日志表（通常只追加）

---

### Q: softDelete.ttl 设置多少合适?

**推荐**：
```javascript
// 用户可见的数据：30天（给用户时间反悔）
softDelete: { ttl: 30 * 24 * 60 * 60 * 1000 }

// 敏感数据（订单、支付）：90天（法律要求）
softDelete: { ttl: 90 * 24 * 60 * 60 * 1000 }

// 可选数据（日志、临时）：7天
softDelete: { ttl: 7 * 24 * 60 * 60 * 1000 }

// 永久保留（某些关键信息）
softDelete: { ttl: null }
```

---

### Q: version 的两种策略差异?

```javascript
// 自增策略（推荐）
version: { strategy: 'increment' }
// version: 1 → 2 → 3 → ...
// 优点：自增长，可识别冲突次数

// 时间戳策略
version: { strategy: 'timestamp' }
// version: 1609459200000 → 1609459201000 → ...
// 优点：包含时间信息，精度高
```

**推荐使用 increment**（更简洁）

---

### Q: sync 的 safe vs force?

```javascript
// 生产环境：safe（只创建不删除）
sync: { mode: 'safe', background: true }

// 开发环境：force（完全同步）
sync: { mode: 'force', background: true }
```

**为什么**：
- 生产环境：保险起见，误删索引风险大
- 开发环境：需要快速调整索引

---

## 🔄 第5部分：配置演变示例

### 开发阶段（MVP）

```javascript
options: {
    timestamps: true,
    softDelete: true,
    version: true,
    sync: true
}
// 所有功能打开，便于测试
```

### 优化阶段（发现浪费）

```javascript
// 发现 User 表没有并发问题
options: {
    timestamps: true,
    softDelete: true,
    version: false,  // ← 关闭
    sync: true
}

// 发现中间表不需要时间戳
options: {
    timestamps: false,  // ← 关闭
    softDelete: false,
    version: false,
    sync: true
}
```

### 生产环境（最优配置）

```javascript
// User 表
options: {
    timestamps: true,
    softDelete: true,
    version: true,
    sync: { enabled: true, mode: 'safe' }
}

// UserRole 表
options: {
    timestamps: false,
    softDelete: false,
    version: false,
    sync: true
}

// Session 表
options: {
    timestamps: false,
    softDelete: false,
    version: false,
    sync: true
}
```

---

## ✅ 最佳实践总结

1. **默认禁用**：所有功能默认 enabled: false，按需启用

2. **三层配置**：
   - 第1层：什么都不改（options: {}）
   - 第2层：简化启用（timestamps: true）
   - 第3层：精细控制（{ enabled, field, ... }）

3. **按场景选择**：
   - 核心表：全启用
   - 关联表：最小化
   - 会话表：仅 sync
   - 日志表：仅 timestamps

4. **生产安全**：
   - sync.mode = 'safe'
   - softDelete.ttl 根据业务要求
   - version 用于高并发

5. **定期优化**：
   - 识别不需要的功能
   - 关闭以节省性能
   - 留下必需的配置

---

## 📚 参考文档

- `lib/model/examples/test.js` - 完整的示例模板
- `docs/model-options-configuration-guide.md` - 详细配置指南
- `docs/model-options-final.md` - 设计理念说明

