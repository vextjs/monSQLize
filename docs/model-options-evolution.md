# Model Options 版本对比

## 演变过程

### v1：初始版本（过度设计）❌

```javascript
options: {
    timestamps: true,
    softDelete: { enabled, field, type, ttl, index },
    version: { enabled, field, strategy },
    lifecycle: { enabled, field, index },  // ❌ 不需要
    sync: { enabled, mode, background },
    cache: { enabled, ttl, prefix, invalidateOn },  // ❌ 重复
    query: { defaultLimit, maxLimit, softDeleteFilter },  // ❌ 重复
    validation: { enabled, strict, stripUnknown }  // ❌ 重复
}
// 总共 9 个配置项，其中 4 个是冗余的
```

**问题**：
- 配置项过多
- cache/query/validation 在全局已配置
- lifecycle 不需要单独配置项
- 用户困惑，哪些真正必要

---

### v2：精简版本（最终版） ✅

```javascript
options: {
    // 1. 时间戳维护
    timestamps: true,
    
    // 2. 软删除
    softDelete: {
        enabled: true,
        field: 'deletedAt',
        type: 'timestamp',
        ttl: 30 * 24 * 60 * 60 * 1000,
        index: true
    },
    
    // 3. 乐观锁版本
    version: {
        enabled: true,
        field: 'version',
        strategy: 'increment'
    },
    
    // 4. 索引同步
    sync: {
        enabled: true,
        mode: 'safe',
        background: true
    }
}
// 总共 4 个配置项，没有冗余
```

**改进**：
- ✅ 配置项减少 75%（9 → 4）
- ✅ 无冗余配置
- ✅ 清晰明确
- ✅ 易于使用和维护

---

## 关键改变

| 配置项 | v1 | v2 | 说明 |
|--------|----|----|------|
| **timestamps** | ✅ 保留 | ✅ 保留 | 某些表不需要 |
| **softDelete** | ✅ 保留 | ✅ 保留 | 某些表不需要 |
| **version** | ✅ 保留 | ✅ 保留 | 高并发表才需要 |
| **sync** | ✅ 保留 | ✅ 保留 | 模型特异的索引定义 |
| **lifecycle** | ❌ 移除 | - | 不需要配置项，用 schema+indexes |
| **cache** | ❌ 移除 | - | 全局 MemoryCache 已配置 |
| **query** | ❌ 移除 | - | 全局 defaults 已配置 |
| **validation** | ❌ 移除 | - | 全局 schema-dsl 已配置 |

---

## 为什么移除这 4 项？

### lifecycle → schema + indexes

```javascript
// ❌ v1: 不需要这样配置
options: {
    lifecycle: {
        enabled: true,
        field: 'expireAt',
        index: true
    }
}

// ✅ v2: 这样就够了
schema: function(dsl) {
    return dsl({
        expireAt: 'date'  // 定义字段
    })
}

indexes: [
    { key: { expireAt: 1 }, expireAfterSeconds: 0 }  // TTL 索引
]
```

**原因**：
- 字段定义就在 schema 中
- 索引定义就在 indexes 中
- 不需要单独的配置项，会重复

---

### cache → 全局 ORM 配置

```javascript
// ❌ v1: 不需要在 model 中配置
options: {
    cache: {
        enabled: true,
        ttl: 60 * 1000,
        prefix: 'user:'
    }
}

// ✅ v2: 全局配置一次
const msq = new MonSQLize({
    cache: {
        type: 'memory',
        ttl: 60 * 1000
    }
});
// 所有 model 共享
```

**原因**：
- 缓存系统是全局的（MemoryCache）
- 所有 model 共享配置
- 不需要每个 model 单独配置

---

### query → 全局 ORM 配置

```javascript
// ❌ v1: 不需要在 model 中配置
options: {
    query: {
        defaultLimit: 10,
        maxLimit: 100,
        softDeleteFilter: true
    }
}

// ✅ v2: 全局配置一次
const msq = new MonSQLize({
    findLimit: 10,
    options: {
        defaults: {
            maxLimit: 100,
            softDeleteFilter: true
        }
    }
});
// 所有 model 遵守
```

**原因**：
- 默认值应该是全局一致的
- 如果某个 model 需要特殊值，再单独配置（v3）
- 目前保持全局统一

---

### validation → schema-dsl

```javascript
// ❌ v1: 不需要这样配置
options: {
    validation: {
        enabled: true,
        strict: true,
        stripUnknown: false
    }
}

// ✅ v2: schema 中已定义
schema: function(dsl) {
    return dsl({
        username: 'string:3-32!',  // ← 验证规则在这里
        age: 'number:0-150',
        // schema-dsl 负责验证
    })
}
```

**原因**：
- 验证规则就定义在 schema 中
- schema-dsl 包负责验证能力
- 不需要单独的配置项

---

## 使用对比

### v1（过度设计）

```javascript
// User model - 配置冗长
const UserModel = {
    schema: function(dsl) { ... },
    
    options: {
        timestamps: true,
        softDelete: { enabled: true, ... },
        version: { enabled: true, ... },
        lifecycle: { enabled: false },  // ❌ 不需要，但要显式禁用
        sync: { enabled: true, ... },
        cache: { enabled: true, ... },  // ❌ 重复配置
        query: { softDeleteFilter: true },  // ❌ 重复配置
        validation: { enabled: true, ... }  // ❌ 重复配置
    }
};

// Session model - 要禁用很多东西
const SessionModel = {
    schema: function(dsl) { ... },
    
    options: {
        timestamps: false,  // ❌ 需要显式禁用
        softDelete: { enabled: false },  // ❌ 需要显式禁用
        version: { enabled: false },  // ❌ 需要显式禁用
        lifecycle: { enabled: true, ... },  // ✅ 这个要启用
        sync: { enabled: true, ... },
        cache: { enabled: false },  // ❌ 需要显式禁用
        query: { softDeleteFilter: false },  // ❌ 需要显式禁用
        validation: { enabled: true, ... }  // ❌ 需要显式禁用
    }
};
```

---

### v2（精简设计）

```javascript
// User model - 配置简洁
const UserModel = {
    schema: function(dsl) { ... },
    
    options: {
        timestamps: true,  // ✅ 需要
        softDelete: { enabled: true, ... },  // ✅ 需要
        version: { enabled: true, ... },  // ✅ 需要
        sync: { enabled: true, ... }  // ✅ 需要
    }
};

// Session model - 配置简洁
const SessionModel = {
    schema: function(dsl) {
        return dsl({
            userId: 'objectId!',
            expireAt: 'date!'  // ✅ 在 schema 中定义
        })
    },
    
    indexes: [
        { key: { expireAt: 1 }, expireAfterSeconds: 0 }  // ✅ TTL 索引
    ],
    
    options: {
        timestamps: false,  // 不需要时间戳
        softDelete: { enabled: false },  // 不需要软删除
        version: { enabled: false },  // 不需要版本控制
        sync: { enabled: true }  // 需要同步 TTL 索引
    }
};
```

---

## 总结

| 方面 | v1 | v2 | 改进 |
|------|----|----|------|
| **配置项数** | 9 | 4 | ↓ 55% |
| **冗余配置** | 4 个 | 0 个 | ✅ 完全消除 |
| **复杂度** | 高 | 低 | ✅ 易于理解 |
| **维护成本** | 高 | 低 | ✅ 易于维护 |
| **用户困惑** | 多 | 少 | ✅ 清晰明确 |

---

## 最终建议

✅ **采用 v2（精简版）**

优势：
1. 配置项少，易于理解
2. 职责分工清晰（全局 vs 模型）
3. 没有冗余配置
4. 易于维护和扩展

---

相关文档：
- `docs/model-options-final.md` - 最终设计详解
- `lib/model/examples/test.js` - 示例模板

