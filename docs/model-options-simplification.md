# Model Options 精简分析

## 🔍 配置重复分析

### 当前配置的问题

```javascript
全局 ORM 已配置：
├─ cache (MemoryCache) - 全局缓存系统
├─ logger (Logger) - 全局日志
├─ slowQueryLog - 全局慢查询
├─ validation - 全局数据验证（schema-dsl）
└─ defaults (defaultLimit, maxLimit等) - 全局默认值

Model 中又配置：
├─ cache - 重复！
├─ query - 重复！
├─ validation - 重复！
└─ lifecycle - 有必要吗？
```

## ❌ 不需要的配置

| 配置项 | 理由 | 应该在哪里 |
|--------|------|-----------|
| **cache** | 全局 MemoryCache 已配置，所有 model 共享 | ORM 初始化 |
| **query** | 全局 defaults 已有 defaultLimit/maxLimit | ORM 初始化 |
| **validation** | 全局 schema-dsl 已有验证能力 | schema 定义 |

## ❓ lifecycle 有必要吗？

### 场景分析

```javascript
// 场景1：用户表
- 用户不会自动过期
- lifecycle 没意义

// 场景2：会话表
- Session 2小时过期
- 需要配置 expireAt 字段和 TTL 索引

// 场景3：验证码表
- 验证码 5分钟过期
- 需要配置 expireAt 字段和 TTL 索引
```

### lifecycle vs softDelete.ttl 的真实区别

```javascript
// softDelete.ttl
- 用户执行 delete 后，deletedAt = now
- 30天后自动物理删除
- 🔴 用于"数据保留期"

// lifecycle.ttl (expireAt)
- 创建时就设置 expireAt = now + 2小时
- 到期自动删除
- 🔴 用于"业务有效期"
```

### lifecycle 是否有必要？

**分析**：
- 不需要单独配置项
- 只需要在 schema 中定义 expireAt 字段
- 在 indexes 中定义 TTL 索引即可

```javascript
// 简单做法
schema: function(dsl) {
    return dsl({
        // ... 其他字段
        expireAt: 'date'  // 可选字段
    })
}

indexes: [
    { key: { expireAt: 1 }, expireAfterSeconds: 0 }  // TTL 索引
]

// 不需要 lifecycle 配置项
```

## ✅ 真正需要的配置（Model 级别）

只保留**业务特异性强、不同 model 差异大的配置**：

```javascript
options: {
    // 1️⃣ 时间戳维护（某些 model 不需要）
    timestamps: true,
    
    // 2️⃣ 软删除（某些 model 不需要）
    softDelete: {
        enabled: true,
        field: 'deletedAt',
        ttl: 30 * 24 * 60 * 60 * 1000,
        index: true
    },
    
    // 3️⃣ 乐观锁版本（高并发 model 才需要）
    version: {
        enabled: true,
        field: 'version',
        strategy: 'increment'
    },
    
    // 4️⃣ 索引同步（模型特异的索引定义）
    sync: {
        enabled: true,
        mode: 'safe',
        background: true
    }
}
```

## 为什么这 4 个必要？

| 配置 | 为什么必要 | 使用差异 |
|------|----------|---------|
| **timestamps** | 某些表不需要（如中间表） | User ✅, UserRole ❌ |
| **softDelete** | 某些表不需要（如会话表） | User ✅, Session ❌ |
| **version** | 高并发才需要 | User ✅, Post ❌ |
| **sync** | 模型定义了 indexes | 所有表都可能不同 |

## 为什么其他不必要？

| 不需要的项 | 全局已配置 | 备注 |
|-----------|----------|------|
| **cache** | ✅ MemoryCache | 所有 model 共享，无需单独配置 |
| **query** | ✅ defaults | 全局设置 defaultLimit/maxLimit |
| **validation** | ✅ schema-dsl | 在 schema 中定义即可 |
| **lifecycle** | 不需要配置项 | 在 schema + indexes 中定义即可 |

---

## 最终结论

### lifecycle：❌ 不需要配置项

原因：
1. 不是所有 model 都有过期概念
2. 即使有过期，也只需在 schema 中定义 expireAt 字段
3. TTL 索引在 indexes 中定义即可
4. 不需要单独的配置项

### Model Options 应该只有 4 项：

```javascript
options: {
    timestamps: true,
    softDelete: { enabled, field, ttl, index },
    version: { enabled, field, strategy },
    sync: { enabled, mode, background }
}
```

简洁、清晰、没有冗余！

