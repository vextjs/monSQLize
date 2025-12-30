# Model Options 与 ORM 全局配置对比

## 架构层次

```
┌─────────────────────────────────────────────────────┐
│          全局 ORM 初始化 (Singleton)                │
│                                                     │
│  ├─ slowQueryLog (SlowQueryLogManager)             │
│  ├─ cache (MemoryCache)                           │
│  ├─ logger (Logger)                               │
│  └─ transactionManager (TransactionManager)       │
│                                                     │
└────────────────────────┬────────────────────────────┘
                         │ (所有model共享)
        ┌────────────────┼────────────────┬──────────────┐
        │                │                │              │
    ┌───▼─────┐   ┌────▼──────┐   ┌────▼──────┐   ┌──▼──────┐
    │ User    │   │  Post     │   │ Session   │   │ Profile │
    │ Model   │   │  Model    │   │ Model     │   │ Model   │
    │         │   │           │   │           │   │         │
    │options: │   │ options:  │   │ options:  │   │options: │
    │{...}    │   │ {...}     │   │ {...}     │   │ {...}   │
    └─────────┘   └───────────┘   └───────────┘   └─────────┘
```

## 配置权限对比表

| 配置项 | 作用域 | 配置位置 | 说明 |
|--------|--------|---------|------|
| **慢查询日志** | 全局 | ORM 初始化 | 所有 model 共享，不需在 model options 中配置 |
| **缓存** | 全局 | ORM 初始化 | 使用全局 MemoryCache，model 可配置失效策略 |
| **日志记录器** | 全局 | ORM 初始化 | 所有 model 共享日志系统 |
| **版本控制** | 模型级 | model options | 每个 model 独立配置 |
| **软删除** | 模型级 | model options | 每个 model 独立配置 |
| **TTL/生命周期** | 模型级 | model options | 每个 model 独立配置 |
| **索引同步** | 模型级 | model options | 每个 model 独立配置 |
| **查询缓存策略** | 模型级 | model options | 每个 model 独立配置缓存失效规则 |
| **时间戳维护** | 模型级 | model options | 每个 model 独立配置字段名 |

---

## 全局配置示例

### 完整 ORM 初始化

```javascript
const MonSQLize = require('monsqlize');

const msq = new MonSQLize({
    type: 'mongodb',
    config: {
        host: 'localhost',
        port: 27017,
        database: 'mydb'
    },
    
    // 全局慢查询日志（所有 model 共享）
    slowQueryLog: {
        enabled: true,
        storage: {
            type: 'mongodb',
            useBusinessConnection: true,
            mongodb: {
                database: 'admin',
                collection: 'slow_query_logs',
                ttl: 7 * 24 * 3600  // 7天
            }
        },
        filter: {
            minExecutionTimeMs: 500  // 记录 500ms+ 的查询
        }
    },
    
    // 全局缓存配置
    cache: {
        type: 'memory',  // 或 'redis'
        ttl: 60 * 1000,  // 默认60秒
        maxSize: 1000    // 最多1000个条目
    },
    
    // 全局日志记录器
    logger: customLogger,
    
    // 全局查询超时（所有 model 遵守）
    maxTimeMS: 2000,
    
    // Count 队列配置（高并发）
    countQueue: {
        enabled: true,
        concurrency: 8,
        maxQueueSize: 10000
    }
});
```

---

## Model 配置示例

### 用户表（User）

```javascript
// models/User.js
module.exports = {
    enums: { ... },
    schema: function(dsl) { ... },
    
    options: {
        // 时间戳：自动维护 createdAt / updatedAt
        timestamps: true,
        
        // 版本控制：防止并发更新冲突（模型级）
        version: {
            enabled: true,
            field: 'version',
            strategy: 'increment'
        },
        
        // 软删除：用户删除账号后保留30天（模型级）
        softDelete: {
            enabled: true,
            field: 'deletedAt',
            type: 'timestamp',
            ttl: 30 * 24 * 60 * 60 * 1000,  // 30天
            index: true
        },
        
        // 查询缓存策略（模型级）
        cache: {
            enabled: true,
            ttl: 60 * 1000,
            prefix: 'user:',
            invalidateOn: ['insert', 'update', 'delete']
        },
        
        // 查询默认配置（模型级）
        query: {
            defaultLimit: 10,
            maxLimit: 100,
            softDeleteFilter: true  // 自动过滤软删除数据
        }
    }
};
```

### 会话表（Session）

```javascript
// models/Session.js
module.exports = {
    schema: function(dsl) { ... },
    
    options: {
        // 时间戳
        timestamps: true,
        
        // 数据生命周期：会话2小时过期（模型级）
        lifecycle: {
            enabled: true,
            field: 'expireAt',
            index: true
        },
        
        // 不使用软删除（会话不需要保留）
        softDelete: {
            enabled: false
        },
        
        // 查询缓存：会话数据不缓存
        cache: {
            enabled: false
        }
    }
};
```

### 验证码表（VerifyCode）

```javascript
// models/VerifyCode.js
module.exports = {
    schema: function(dsl) { ... },
    
    options: {
        // 数据生命周期：验证码5分钟过期（模型级）
        lifecycle: {
            enabled: true,
            field: 'expireAt',
            index: true
        },
        
        // 不使用软删除
        softDelete: {
            enabled: false
        },
        
        // 不使用时间戳
        timestamps: false
    }
};
```

---

## 关键区别

### 全局配置 vs 模型配置

#### 慢查询日志：全局管理 ✅

```javascript
// ✅ 正确：全局配置一次
const msq = new MonSQLize({
    slowQueryLog: { enabled: true, ... }
});

// ❌ 错误：不要在 model options 中配置
options: {
    slowQuery: { ... }  // ❌ 不支持
}
```

**优势**：
- 统一管理所有 model 的查询日志
- 自动去重和聚合
- 避免重复配置

---

#### 版本控制：模型级管理 ✅

```javascript
// ✅ 正确：在 model options 中配置
options: {
    version: {
        enabled: true,
        field: 'version'
    }
}

// ❌ 不合理：全局配置版本控制
// 原因：不同 model 可能有不同需求
// - User model：需要版本控制（并发更新多）
// - Session model：不需要版本控制（寿命短）
```

**原因**：
- 不同 model 需求不同
- User 表需要版本控制，Session 表不需要
- 灵活性高

---

#### 软删除：模型级管理 ✅

```javascript
// ✅ 正确：在 model options 中配置
options: {
    softDelete: {
        enabled: true,
        ttl: 30 * 24 * 60 * 60 * 1000
    }
}

// ❌ 不合理：全局配置软删除
// 原因：不同 model 的软删除需求完全不同
// - User model：删除后保留30天
// - Session model：不需要软删除
// - VerifyCode model：不需要软删除
```

**原因**：
- 每个 model 有自己的业务规则
- 灵活性和独立性很重要

---

## 配置优先级

当同一个功能既有全局配置又有模型配置时：

```
全局配置（默认值） + 模型配置（覆盖）= 最终行为
```

### 示例：缓存 TTL

```javascript
// 全局配置：默认缓存60秒
const msq = new MonSQLize({
    cache: { ttl: 60 * 1000 }
});

// User model：覆盖为120秒
options: {
    cache: {
        enabled: true,
        ttl: 120 * 1000  // 覆盖全局的60秒
    }
}

// Session model：禁用缓存
options: {
    cache: {
        enabled: false
    }
}

// Post model：使用全局默认 60 秒
// (未在 model options 中配置，继承全局配置)
options: {
    cache: {
        enabled: true
    }
}
```

---

## 最佳实践

### ✅ DO（应该这样做）

1. **全局配置一次性功能**
   ```javascript
   slowQueryLog: { enabled: true, ... }  // 全局
   cache: { type: 'memory', ... }        // 全局
   logger: customLogger                   // 全局
   ```

2. **Model 配置模型特定功能**
   ```javascript
   options: {
       version: { enabled: true },       // 模型级
       softDelete: { enabled: true },    // 模型级
       lifecycle: { enabled: true }      // 模型级
   }
   ```

3. **Model 配置业务规则**
   ```javascript
   options: {
       query: { softDeleteFilter: true },  // 业务规则
       cache: { prefix: 'user:' }          // 业务规则
   }
   ```

### ❌ DON'T（不要这样做）

1. **❌ 不要在 model options 中配置全局功能**
   ```javascript
   options: {
       slowQuery: { ... }  // 错误！在全局配置
   }
   ```

2. **❌ 不要在全局配置中处理模型特定逻辑**
   ```javascript
   new MonSQLize({
       version: { ... }  // 错误！应在 model options
   })
   ```

3. **❌ 不要在不同 model 中重复相同配置**
   ```javascript
   // User model
   options: { cache: { ttl: 60 * 1000 } }
   
   // Post model
   options: { cache: { ttl: 60 * 1000 } }  // 重复！应在全局配置
   ```

---

## 总结

| 层次 | 配置内容 | 配置位置 | 频率 |
|------|---------|---------|------|
| **ORM 全局** | 慢查询、缓存、日志、事务 | constructor | 初始化一次 |
| **Model 级** | 版本、软删除、TTL、索引、验证 | options | 每个 model 独立 |
| **业务规则** | 查询过滤、缓存策略、默认值 | options | 每个 model 独立 |

---

## 相关文档

- `lib/slow-query-log/` - 慢查询日志管理器
- `docs/model-options.md` - Model options 详细配置
- `lib/index.js` - ORM 初始化参数

