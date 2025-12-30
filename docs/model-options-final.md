# Model Options 最终设计 - 精简版

## ✅ 最终决策

### lifecycle 有必要吗？
**答案：❌ 不需要配置项**

**原因**：
1. 不是所有 model 都有过期概念（User 表就不需要）
2. 即使需要过期，只需在 schema 中定义 `expireAt` 字段
3. TTL 索引在 indexes 中定义即可
4. 不需要单独的配置项

### cache、query、validation？
**答案：❌ 都不需要在 model options 中配置**

**原因**：
- **cache** → 全局 ORM 已配置 MemoryCache，所有 model 共享
- **query** → 全局 ORM 已配置 defaultLimit/maxLimit
- **validation** → 在 schema 中定义即可，全局 schema-dsl 提供验证能力

---

## 🎯 Model Options 最终配置（4 项）

```javascript
options: {
    // 1️⃣ 时间戳维护
    timestamps: true,  // 某些表不需要（如中间表）
    
    // 2️⃣ 软删除（用户删除后保留）
    softDelete: {
        enabled: true,
        field: 'deletedAt',
        type: 'timestamp',  // timestamp | boolean
        ttl: 30 * 24 * 60 * 60 * 1000,  // 30天后物理删除
        index: true
    },
    
    // 3️⃣ 乐观锁版本控制（高并发）
    version: {
        enabled: true,
        field: 'version',
        strategy: 'increment'  // increment | timestamp
    },
    
    // 4️⃣ 索引自动同步
    sync: {
        enabled: true,
        mode: 'safe',  // safe | force
        background: true
    }
}
```

---

## 为什么只有这 4 项？

| 配置项 | 是否需要 | 理由 | 使用差异 |
|--------|---------|------|---------|
| **timestamps** | ✅ 需要 | 某些表不需要（中间表） | User ✅ / UserRole ❌ |
| **softDelete** | ✅ 需要 | 某些表不需要（会话表） | User ✅ / Session ❌ |
| **version** | ✅ 需要 | 高并发表才需要 | User ✅ / Post ❌ |
| **sync** | ✅ 需要 | 每个表索引定义不同 | 所有表都不同 |
| **lifecycle** | ❌ 不需要 | schema + indexes 搞定 | 不用单独配置 |
| **cache** | ❌ 不需要 | 全局 MemoryCache | 所有表共享 |
| **query** | ❌ 不需要 | 全局 defaults | 所有表共享 |
| **validation** | ❌ 不需要 | 全局 schema-dsl | 所有表共享 |

---

## 具体使用示例

### 用户表 (User)

```javascript
module.exports = {
    enums: { role: 'admin|user', status: 'active|inactive|banned' },
    
    schema: function(dsl) {
        return dsl({
            username: 'string:3-32!',
            password: 'string!',
            age: 'number:0-150',
            role: this.enums.role.default('user')
        })
    },
    
    indexes: [
        { key: { username: 1 }, unique: true },
        { key: { email: 1 }, unique: true }
    ],
    
    options: {
        timestamps: true,  // ✅ 需要
        softDelete: {      // ✅ 需要（删除后保留30天）
            enabled: true,
            ttl: 30 * 24 * 60 * 60 * 1000
        },
        version: { enabled: true },  // ✅ 需要（防止并发冲突）
        sync: true  // ✅ 需要（有索引要同步）
    }
};
```

### 会话表 (Session)

```javascript
module.exports = {
    schema: function(dsl) {
        return dsl({
            userId: 'objectId!',
            token: 'string!',
            expireAt: 'date!'  // 🔑 关键字段
        })
    },
    
    indexes: [
        { key: { expireAt: 1 }, expireAfterSeconds: 0 }  // TTL 索引
    ],
    
    options: {
        timestamps: false,  // ❌ 不需要（会话不需要 createdAt）
        softDelete: { enabled: false },  // ❌ 不需要（会话不保留）
        version: { enabled: false },  // ❌ 不需要（会话寿命短）
        sync: true  // ✅ 需要同步 TTL 索引
    }
};
```

### 中间表 (UserRole)

```javascript
module.exports = {
    schema: function(dsl) {
        return dsl({
            userId: 'objectId!',
            roleId: 'objectId!'
        })
    },
    
    indexes: [
        { key: { userId: 1, roleId: 1 }, unique: true }
    ],
    
    options: {
        timestamps: false,  // ❌ 中间表不需要时间戳
        softDelete: { enabled: false },  // ❌ 中间表不需要软删除
        version: { enabled: false },  // ❌ 不需要版本控制
        sync: true  // ✅ 需要同步唯一索引
    }
};
```

### 验证码表 (VerifyCode)

```javascript
module.exports = {
    schema: function(dsl) {
        return dsl({
            phone: 'string!',
            code: 'string!',
            expireAt: 'date!'  // 🔑 关键字段
        })
    },
    
    indexes: [
        { key: { phone: 1, expireAt: 1 } },
        { key: { expireAt: 1 }, expireAfterSeconds: 0 }  // TTL 索引
    ],
    
    options: {
        timestamps: true,  // ✅ 可选（记录发送时间）
        softDelete: { enabled: false },  // ❌ 不需要软删除
        version: { enabled: false },  // ❌ 不需要版本控制
        sync: true  // ✅ 需要同步 TTL 索引
    }
};
```

---

## 清晰的配置原则

```
🌍 全局 ORM 层配置（初始化一次）：
├─ cache → MemoryCache 缓存系统
├─ logger → Logger 日志系统
├─ slowQueryLog → SlowQueryLogManager 慢查询管理
├─ validation → schema-dsl 验证能力
└─ defaults → defaultLimit/maxLimit 默认值

🗂️  Model 级别配置（每个表独立）：
├─ timestamps → 是否需要时间戳
├─ softDelete → 是否需要软删除
├─ version → 是否需要版本控制
└─ sync → 索引自动同步

📝 在 schema 中定义：
├─ 所有字段定义（包括 expireAt）
└─ 使用 schema-dsl 完成验证

📍 在 indexes 中定义：
├─ 所有索引（包括 TTL 索引）
└─ { key: { expireAt: 1 }, expireAfterSeconds: 0 }
```

---

## 总结

✅ **简洁有力**：Model options 只有 4 项，够用

✅ **职责清晰**：
- 全局配置 → 共享功能
- Model 配置 → 模型特异性
- Schema 定义 → 字段和验证
- Indexes 定义 → 索引和 TTL

✅ **无冗余**：没有重复配置

✅ **易维护**：每个 model 配置简单明了

---

## 相关文件

- `lib/model/examples/test.js` - Model 定义示例（简化版）
- `docs/model-options-simplification.md` - 简化分析
- `lib/index.js` - ORM 全局初始化参数

