# TTL 使用场景对比分析

## 场景1：软删除 + TTL 清理 (softDelete.ttl)

**目的**：用户数据被"删除"后，保留一段时间再物理删除

### 示例：用户表
```javascript
// 用户主动删除账号
await User.delete({ _id: userId });
// → deletedAt = 2025-12-30 10:00:00

// 30天后（2026-01-29）自动物理删除
// MongoDB TTL 索引：{ deletedAt: 1, expireAfterSeconds: 2592000 }
```

### 数据状态
```javascript
// 正常状态
{ _id: 1, name: 'John', deletedAt: null }

// 软删除状态（保留30天）
{ _id: 1, name: 'John', deletedAt: 2025-12-30 }

// 30天后自动物理删除（从数据库中移除）
```

---

## 场景2：数据本身过期 (options.ttl)

**目的**：数据本身有生命周期，到期自动删除（不是"软删除"）

### 示例1：会话表
```javascript
// 用户登录，创建会话（2小时有效）
await Session.insertOne({
    userId: 123,
    token: 'abc...',
    expireAt: new Date(Date.now() + 2 * 60 * 60 * 1000)  // 2小时后
});

// 2小时后自动物理删除
// MongoDB TTL 索引：{ expireAt: 1, expireAfterSeconds: 0 }
```

### 示例2：验证码表
```javascript
// 发送验证码（5分钟有效）
await VerifyCode.insertOne({
    phone: '13800138000',
    code: '123456',
    expireAt: new Date(Date.now() + 5 * 60 * 1000)  // 5分钟后
});

// 5分钟后自动物理删除
```

### 数据状态
```javascript
// 插入时就设置了过期时间
{ _id: 1, userId: 123, token: 'abc...', expireAt: 2025-12-30 12:00:00 }

// 到期后自动物理删除（没有"软删除"概念）
```

---

## 关键区别

| 维度 | softDelete.ttl | options.ttl |
|------|----------------|-------------|
| **触发条件** | 用户执行删除操作后 | 数据创建时就设置过期时间 |
| **过期字段** | deletedAt（软删除时间戳） | expireAt（业务过期时间） |
| **中间状态** | 有软删除状态（可恢复） | 没有中间状态（到期就删） |
| **恢复能力** | 可恢复（在TTL清理前） | 不可恢复（业务逻辑决定） |
| **适用场景** | 用户数据、订单数据 | 会话、验证码、临时缓存 |

---

## 可以合并吗？

### ❌ 不建议合并的原因

1. **语义不同**
   - softDelete.ttl：删除后保留多久
   - options.ttl：数据本身存活多久

2. **使用场景不同**
   - 用户表不需要 options.ttl（用户数据不会过期）
   - 会话表不需要 softDelete（会话不需要软删除）

3. **索引配置不同**
   ```javascript
   // softDelete.ttl
   { deletedAt: 1, expireAfterSeconds: 2592000 }  // 从删除时间算起

   // options.ttl
   { expireAt: 1, expireAfterSeconds: 0 }  // 直接用字段值
   ```

---

## ✅ 建议：保持独立，但改进命名

### 方案：重命名避免混淆

```javascript
options: {
    // 软删除配置
    softDelete: {
        enabled: true,
        field: 'deletedAt',
        type: 'timestamp',
        retention: 30 * 24 * 60 * 60 * 1000,  // ✅ 改名：retention（保留期）
        index: true
    },

    // 数据生命周期配置
    lifecycle: {  // ✅ 改名：lifecycle（生命周期）
        enabled: true,
        field: 'expireAt',
        index: true
    }
}
```

这样更清晰：
- `retention` = 保留期（软删除后保留多久）
- `lifecycle` = 生命周期（数据本身的有效期）

