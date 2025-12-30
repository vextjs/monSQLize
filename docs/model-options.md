# Model Options 配置详解

## 概述

Model 的 `options` 配置提供了丰富的功能，包括时间戳自动维护、软删除、版本控制、数据过期、索引同步、慢查询日志等。

---

## 1. 时间戳自动维护 (timestamps)

### 基础配置
```javascript
options: {
    timestamps: true  // 启用自动时间戳
}
```

### 详细配置
```javascript
options: {
    timestamps: true,
    timestampFields: {
        createdAt: 'createdAt',  // 创建时间字段名
        updatedAt: 'updatedAt'   // 更新时间字段名
    }
}
```

### 行为
- **insert**: 自动添加 `createdAt` 和 `updatedAt`
- **update**: 自动更新 `updatedAt`
- **字段类型**: Date

---

## 2. 软删除配置 (softDelete)

### 基础配置
```javascript
options: {
    softDelete: true  // 使用默认配置
}
```

### 详细配置
```javascript
options: {
    softDelete: {
        enabled: true,
        field: 'deletedAt',      // 软删除字段名
        type: 'timestamp',       // 类型：timestamp | boolean
        ttl: 30 * 24 * 60 * 60 * 1000,  // 30天后物理删除
        index: true              // 创建索引（用于 TTL）
    }
}
```

### 两种类型对比

#### timestamp 类型（推荐）
```javascript
type: 'timestamp'
// deletedAt = null  → 正常数据
// deletedAt = Date  → 已删除（记录删除时间）
```

**优势**：
- ✅ 记录删除时间
- ✅ 支持 TTL 自动清理
- ✅ 方便统计分析

#### boolean 类型
```javascript
type: 'boolean'
// isDeleted = false → 正常数据
// isDeleted = true  → 已删除
```

**优势**：
- ✅ 查询更直观
- ✅ 节省存储空间

### 软删除数据过期清理

```javascript
softDelete: {
    enabled: true,
    ttl: 30 * 24 * 60 * 60 * 1000,  // 30天后物理删除
    index: true  // 必须开启，创建 TTL 索引
}
```

**工作原理**：
1. MongoDB TTL 索引会自动删除 `deletedAt < 当前时间 - ttl` 的文档
2. 后台进程每60秒检查一次
3. 物理删除不可恢复

**使用场景**：
- 遵守数据保留政策（GDPR等）
- 节省存储空间
- 避免软删除数据积累

### 自动注入的方法

```javascript
// 软删除（设置 deletedAt = now）
await User.delete({ _id: userId });

// 恢复软删除数据（设置 deletedAt = null）
await User.restore(userId);

// 强制物理删除
await User.forceDelete(userId);

// 查询包含软删除的数据
const allUsers = await User.findWithDeleted({ role: 'admin' });

// 只查询软删除的数据
const deletedUsers = await User.findOnlyDeleted({ role: 'admin' });
```

---

## 3. 乐观锁版本控制 (version)

### 基础配置
```javascript
options: {
    version: true  // 使用默认配置
}
```

### 详细配置
```javascript
options: {
    version: {
        enabled: true,
        field: 'version',        // 版本字段名
        strategy: 'increment'    // 策略：increment | timestamp
    }
}
```

### 策略对比

#### increment（推荐）
```javascript
strategy: 'increment'
// version: 1 → 2 → 3 → ...
```

#### timestamp
```javascript
strategy: 'timestamp'
// version: 1609459200000 → 1609459201000 → ...
```

### 并发更新保护

```javascript
// 用户A读取数据（version: 1）
const user = await User.findOne({ _id: userId });

// 用户B更新数据（version: 1 → 2）
await User.updateOne({ _id: userId, version: 1 }, { $set: { name: 'B' }, $inc: { version: 1 } });

// 用户A尝试更新（version: 1，但数据库已是2）
const result = await User.updateOne(
    { _id: userId, version: user.version },  // version: 1
    { $set: { name: 'A' }, $inc: { version: 1 } }
);

// result.matchedCount === 0 → 更新失败，需要重新读取
```

---

## 4. 数据过期配置 (TTL)

### 配置
```javascript
options: {
    ttl: {
        enabled: true,
        field: 'expireAt',  // 过期时间字段
        index: true         // 创建 TTL 索引
    }
}
```

### 使用场景

#### 会话数据（2小时过期）
```javascript
await Session.insertOne({
    userId: '123',
    token: 'abc...',
    expireAt: new Date(Date.now() + 2 * 60 * 60 * 1000)  // 2小时后
});
```

#### 验证码（5分钟过期）
```javascript
await VerifyCode.insertOne({
    phone: '13800138000',
    code: '123456',
    expireAt: new Date(Date.now() + 5 * 60 * 1000)  // 5分钟后
});
```

#### 临时缓存（30分钟过期）
```javascript
await TempCache.insertOne({
    key: 'api_response',
    value: { ... },
    expireAt: new Date(Date.now() + 30 * 60 * 1000)  // 30分钟后
});
```

### 注意事项
- MongoDB TTL 索引后台每60秒检查一次
- 过期时间不是精确的（可能延迟最多60秒）
- 删除是物理删除，不可恢复

---

## 5. 索引自动同步 (sync)

### 基础配置
```javascript
options: {
    sync: true  // 使用默认配置（安全模式）
}
```

### 详细配置
```javascript
options: {
    sync: {
        enabled: true,
        mode: 'safe',       // 模式：safe | force
        background: true    // 后台创建索引
    }
}
```

### 模式对比

#### safe（推荐）
- 只创建缺失的索引
- 不删除多余的索引
- 适合生产环境

#### force
- 创建缺失的索引
- 删除多余的索引
- 适合开发环境

### 索引定义示例
```javascript
indexes: [
    { key: { username: 1 }, unique: true },           // 唯一索引
    { key: { email: 1 }, unique: true, sparse: true },// 稀疏索引
    { key: { age: -1 } },                             // 降序索引
    { key: { createdAt: 1 }, expireAfterSeconds: 86400 }, // TTL索引（24小时）
    { key: { location: '2dsphere' } },                // 地理空间索引
    { key: { name: 'text' } }                         // 全文索引
]
```

---

## 6. 查询缓存配置 (cache)

### 配置
```javascript
options: {
    cache: {
        enabled: true,
        ttl: 60 * 1000,       // 缓存60秒
        prefix: 'user:',      // 缓存键前缀
        invalidateOn: ['insert', 'update', 'delete']  // 自动失效
    }
}
```

---

## 7. 查询默认配置 (query)

### 配置
```javascript
options: {
    query: {
        defaultLimit: 10,        // 默认查询数量
        maxLimit: 100,           // 最大查询数量
        softDeleteFilter: true   // 自动过滤软删除数据
    }
}
```

### 行为示例
```javascript
// 未指定 limit，使用 defaultLimit: 10
const users = await User.find({ role: 'admin' });

// 指定 limit，但超过 maxLimit，自动限制为 100
const users = await User.find({ role: 'admin' }).limit(200);  // 实际: 100

// softDeleteFilter: true 时，自动添加 { deletedAt: null }
const users = await User.find({ role: 'admin' });
// 实际查询: { role: 'admin', deletedAt: null }
```

---

## 8. 数据验证 (validation)

### 配置
```javascript
options: {
    validation: {
        enabled: true,        // 启用验证
        strict: true,         // 严格模式
        stripUnknown: false   // 是否移除未知字段
    }
}
```

### 验证行为
```javascript
// schema 定义
schema: function(dsl) {
    return dsl({
        username: 'string:3-32!',
        age: 'number:0-150'
    })
}

// strict: true 时，不允许额外字段
await User.insertOne({
    username: 'john',
    age: 25,
    extra: 'field'  // ❌ 抛出错误
});

// stripUnknown: true 时，自动移除额外字段
await User.insertOne({
    username: 'john',
    age: 25,
    extra: 'field'  // ✅ 自动移除，只插入 username 和 age
});
```

---

## 完整配置示例

```javascript
module.exports = {
    enums: { ... },
    schema: function(dsl) { ... },
    methods: (model) => { ... },
    hooks: (model) => { ... },
    indexes: [ ... ],
    relations: { ... },
    
    options: {
        // 时间戳
        timestamps: true,
        
        // 软删除（30天后物理删除）
        softDelete: {
            enabled: true,
            field: 'deletedAt',
            type: 'timestamp',
            ttl: 30 * 24 * 60 * 60 * 1000,
            index: true
        },
        
        // 版本控制
        version: {
            enabled: true,
            field: 'version',
            strategy: 'increment'
        },
        
        // 数据过期（用于会话、验证码等）
        ttl: {
            enabled: true,
            field: 'expireAt',
            index: true
        },
        
        // 索引自动同步
        sync: {
            enabled: true,
            mode: 'safe',
            background: true
        },
        
        // 慢查询日志
        slowQuery: {
            enabled: true,
            threshold: 500,
            logLevel: 'warn',
            stats: { enabled: true }
        },
        
        // 查询缓存
        cache: {
            enabled: true,
            ttl: 60 * 1000,
            prefix: 'user:',
            invalidateOn: ['insert', 'update', 'delete']
        },
        
        // 查询默认配置
        query: {
            defaultLimit: 10,
            maxLimit: 100,
            softDeleteFilter: true
        },
        
        // 数据验证
        validation: {
            enabled: true,
            strict: true,
            stripUnknown: false
        }
    }
};
```

---

## 最佳实践

### 1. 软删除 + TTL 清理
```javascript
softDelete: {
    enabled: true,
    ttl: 30 * 24 * 60 * 60 * 1000,  // 30天后物理删除
    index: true  // 必须开启
}
```
**适用场景**：用户数据、订单数据等需要保留一段时间的业务数据

### 2. 纯 TTL（无软删除）
```javascript
ttl: {
    enabled: true,
    field: 'expireAt',
    index: true
}
```
**适用场景**：会话、验证码、临时缓存等短期数据

### 3. 高并发场景
```javascript
version: true,      // 防止并发更新冲突
cache: {            // 减少数据库压力
    enabled: true,
    ttl: 60 * 1000
},
slowQuery: {        // 监控性能
    enabled: true,
    threshold: 500
}
```

### 4. 开发环境 vs 生产环境
```javascript
// 开发环境
sync: { mode: 'force' },      // 强制同步索引
slowQuery: { threshold: 100 } // 更严格的慢查询阈值

// 生产环境
sync: { mode: 'safe' },       // 安全模式
slowQuery: { threshold: 500 } // 合理的慢查询阈值
```

---

## 注意事项和补充说明

### 慢查询日志配置（全局 ORM 层管理）

⚠️ **重要**：慢查询日志由全局 ORM 层 `SlowQueryLogManager` 统一管理，**不需要在 model options 中单独配置**。

**全局配置示例**：
```javascript
const msq = new (require('monsqlize'))({
    type: 'mongodb',
    config: { ... },
    
    // 全局慢查询日志配置
    slowQueryLog: {
        enabled: true,
        storage: {
            type: 'mongodb',
            mongodb: {
                collection: 'slow_query_logs',
                ttl: 7 * 24 * 3600  // 7天
            }
        },
        filter: {
            minExecutionTimeMs: 500  // 500ms 以上记录
        }
    }
});
```

**特点**：
- ✅ 所有 model 的查询自动上报（insert/find/update/delete）
- ✅ 自动去重和聚合统计
- ✅ 批处理提升性能
- ✅ TTL 索引自动清理过期日志

详见：`lib/slow-query-log/` 模块文档

---

## 注意事项

1. **TTL 索引延迟**：MongoDB TTL 索引每60秒检查一次，删除可能延迟
2. **软删除性能**：大量软删除数据会影响查询性能，建议配置 TTL 自动清理
3. **版本控制开销**：每次更新需要检查版本，略微增加开销
4. **缓存一致性**：分布式环境需要使用 Redis 等分布式缓存
5. **索引创建**：生产环境使用 `background: true` 避免阻塞

---

## 参考链接

- [MongoDB TTL Indexes](https://docs.mongodb.com/manual/core/index-ttl/)
- [MongoDB Index Background](https://docs.mongodb.com/manual/core/index-creation/)
- [Optimistic Locking Pattern](https://en.wikipedia.org/wiki/Optimistic_concurrency_control)

