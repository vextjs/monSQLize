# Model Options 配置方式指南

## 核心原则：统一的配置风格

所有 options 配置项都遵循相同的设计模式：
- ✅ **详细配置**：完整控制所有参数
- ✅ **简化配置**：快速启用功能（使用默认值）
- ✅ **禁用配置**：明确关闭功能

---

## 配置项对比表

| 配置项 | 详细配置 | 简化配置 | 禁用配置 | 默认值 |
|--------|---------|---------|---------|--------|
| **timestamps** | `{ enabled, createdAt, updatedAt }` | `true` | `false` | `{ createdAt: 'createdAt', updatedAt: 'updatedAt' }` |
| **softDelete** | `{ enabled, field, type, ttl, index }` | `true` | `false` | `{ field: 'deletedAt', type: 'timestamp', ttl: null, index: true }` |
| **version** | `{ enabled, field, strategy }` | `true` | `false` | `{ field: 'version', strategy: 'increment' }` |
| **sync** | `{ enabled, mode, background }` | `true` | `false` | `{ mode: 'safe', background: true }` |

---

## 详细配置

### timestamps - 自动维护时间戳

```javascript
timestamps: {
    enabled: true,              // 启用时间戳
    createdAt: 'createdAt',     // 创建时间字段名（自定义）
    updatedAt: 'updatedAt'      // 更新时间字段名（自定义）
}
```

**使用场景**：
```javascript
// 标准用法
timestamps: {
    enabled: true,
    createdAt: 'createdAt',
    updatedAt: 'updatedAt'
}

// 自定义字段名
timestamps: {
    enabled: true,
    createdAt: 'create_time',   // 改为 create_time
    updatedAt: 'update_time'    // 改为 update_time
}

// 简化配置
timestamps: true                // 使用默认字段名

// 禁用
timestamps: false
```

---

### softDelete - 软删除配置

```javascript
softDelete: {
    enabled: true,              // 启用软删除
    field: 'deletedAt',         // 软删除字段名（自定义）
    type: 'timestamp',          // 类型：timestamp | boolean
    ttl: 30 * 24 * 60 * 60 * 1000,  // TTL：30天后物理删除
    index: true                 // 自动创建索引
}
```

**使用场景**：
```javascript
// 标准用法（保留30天）
softDelete: {
    enabled: true,
    field: 'deletedAt',
    type: 'timestamp',
    ttl: 30 * 24 * 60 * 60 * 1000,
    index: true
}

// 永久保留（不自动清理）
softDelete: {
    enabled: true,
    field: 'deletedAt',
    type: 'timestamp',
    ttl: null,  // 不设置 TTL
    index: true
}

// 使用 boolean 类型
softDelete: {
    enabled: true,
    field: 'isDeleted',
    type: 'boolean',
    ttl: null,
    index: true
}

// 简化配置
softDelete: true        // 使用默认值

// 禁用
softDelete: { enabled: false }
```

---

### version - 乐观锁版本控制

```javascript
version: {
    enabled: true,              // 启用版本控制
    field: 'version',           // 版本字段名（自定义）
    strategy: 'increment'       // 策略：increment | timestamp
}
```

**使用场景**：
```javascript
// 自增策略（推荐）
version: {
    enabled: true,
    field: 'version',
    strategy: 'increment'       // version: 1 → 2 → 3
}

// 时间戳策略
version: {
    enabled: true,
    field: '__version__',
    strategy: 'timestamp'       // version: 时间戳
}

// 简化配置
version: true           // 使用默认值（自增）

// 禁用
version: { enabled: false }
```

---

### sync - 索引自动同步

```javascript
sync: {
    enabled: true,              // 启用索引同步
    mode: 'safe',               // 模式：safe | force
    background: true            // 后台创建索引
}
```

**使用场景**：
```javascript
// 安全模式（生产环境）
sync: {
    enabled: true,
    mode: 'safe',           // 只创建缺失的索引
    background: true        // 后台创建，不阻塞
}

// 强制同步（开发环境）
sync: {
    enabled: true,
    mode: 'force',          // 创建+删除，完全同步
    background: true
}

// 简化配置
sync: true              // 使用默认值（safe 模式）

// 禁用
sync: { enabled: false }
```

---

## 实际示例

### 例1：用户表（User）

```javascript
module.exports = {
    schema: function(dsl) { ... },
    indexes: [ ... ],
    
    options: {
        // 方式1：详细配置
        timestamps: {
            enabled: true,
            createdAt: 'createdAt',
            updatedAt: 'updatedAt'
        },
        softDelete: {
            enabled: true,
            field: 'deletedAt',
            type: 'timestamp',
            ttl: 30 * 24 * 60 * 60 * 1000,
            index: true
        },
        version: {
            enabled: true,
            field: 'version',
            strategy: 'increment'
        },
        sync: {
            enabled: true,
            mode: 'safe',
            background: true
        }
    }
};
```

---

### 例2：会话表（Session）- 大部分禁用

```javascript
module.exports = {
    schema: function(dsl) {
        return dsl({
            userId: 'objectId!',
            token: 'string!',
            expireAt: 'date!'
        })
    },
    
    indexes: [
        { key: { expireAt: 1 }, expireAfterSeconds: 0 }  // TTL 索引
    ],
    
    options: {
        // 方式2：精简配置
        timestamps: false,              // 不需要时间戳
        softDelete: { enabled: false }, // 不需要软删除
        version: { enabled: false },    // 不需要版本控制
        sync: true                      // 需要同步 TTL 索引
    }
};
```

---

### 例3：中间表（UserRole）- 最小化配置

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
        // 方式3：简化配置 + 禁用
        timestamps: false,              // 中间表不需要时间戳
        softDelete: { enabled: false }, // 中间表不需要软删除
        version: { enabled: false },    // 中间表不需要版本控制
        sync: true                      // 需要同步唯一索引
    }
};
```

---

### 例4：订单表（Order）- 自定义字段名

```javascript
module.exports = {
    schema: function(dsl) { ... },
    indexes: [ ... ],
    
    options: {
        // 方式4：详细配置 + 自定义字段名
        timestamps: {
            enabled: true,
            createdAt: 'order_time',     // 自定义
            updatedAt: 'last_update'     // 自定义
        },
        softDelete: {
            enabled: true,
            field: 'is_deleted',         // 自定义
            type: 'boolean',             // 改为 boolean
            ttl: 90 * 24 * 60 * 60 * 1000,  // 90天
            index: true
        },
        version: {
            enabled: true,
            field: '__version',          // 自定义
            strategy: 'increment'
        },
        sync: true
    }
};
```

---

## 配置快速查询表

### 需要什么就配置什么

| Model 类型 | timestamps | softDelete | version | sync |
|-----------|-----------|-----------|---------|------|
| **用户表** | ✅ true | ✅ true | ✅ true | ✅ true |
| **会话表** | ❌ false | ❌ false | ❌ false | ✅ true |
| **订单表** | ✅ true | ✅ true | ✅ true | ✅ true |
| **日志表** | ✅ true | ❌ false | ❌ false | ✅ true |
| **中间表** | ❌ false | ❌ false | ❌ false | ✅ true |
| **缓存表** | ❌ false | ❌ false | ❌ false | ✅ true |

---

## 配置选择决策树

```
需要自动维护时间戳？
├─ 是
│  ├─ 使用默认字段名？
│  │  ├─ 是 → timestamps: true
│  │  └─ 否 → timestamps: { enabled: true, createdAt: '...', updatedAt: '...' }
│  └─ 否 → timestamps: false
│
需要软删除？
├─ 是
│  ├─ 使用默认配置？
│  │  ├─ 是 → softDelete: true
│  │  └─ 否 → softDelete: { enabled: true, field: '...', type: '...', ttl: ..., index: true }
│  └─ 否 → softDelete: { enabled: false }
│
需要版本控制？
├─ 是
│  ├─ 使用默认配置？
│  │  ├─ 是 → version: true
│  │  └─ 否 → version: { enabled: true, field: '...', strategy: '...' }
│  └─ 否 → version: { enabled: false }
│
需要索引同步？
├─ 是
│  ├─ 使用默认配置？
│  │  ├─ 是 → sync: true
│  │  └─ 否 → sync: { enabled: true, mode: '...', background: true }
│  └─ 否 → sync: { enabled: false }
```

---

## 最佳实践

### ✅ DO（推荐）

```javascript
// 1. 开发阶段：使用简化配置快速迭代
options: {
    timestamps: true,
    softDelete: true,
    version: true,
    sync: true
}

// 2. 优化阶段：根据需要调整
options: {
    timestamps: { enabled: true, createdAt: 'created_at', updatedAt: 'updated_at' },
    softDelete: { enabled: true, field: 'deleted_at', ttl: 30 * 24 * 60 * 60 * 1000 },
    version: true,
    sync: { enabled: true, mode: 'safe' }
}

// 3. 生产阶段：保持清晰的配置
options: {
    timestamps: true,
    softDelete: true,
    version: true,
    sync: true
}
```

### ❌ DON'T（避免）

```javascript
// ❌ 混乱的配置方式
options: {
    timestamps: true,
    softDelete: { enabled: true },
    version: true,
    sync: { enabled: true, mode: 'safe' }
}

// ❌ 冗余的配置
options: {
    timestamps: { enabled: true, createdAt: 'createdAt', updatedAt: 'updatedAt' },  // 全部是默认值
    softDelete: { enabled: true, field: 'deletedAt', type: 'timestamp', ttl: null, index: true },  // 全部是默认值
    version: { enabled: true, field: 'version', strategy: 'increment' },  // 全部是默认值
    sync: { enabled: true, mode: 'safe', background: true }  // 全部是默认值
}
```

---

## 总结

| 配置方式 | 何时使用 | 示例 |
|---------|---------|------|
| **简化** | 使用默认值 | `timestamps: true` |
| **详细** | 需要自定义 | `timestamps: { enabled: true, createdAt: 'custom_name' }` |
| **禁用** | 不需要该功能 | `timestamps: false` 或 `softDelete: { enabled: false }` |

所有配置项都支持这三种方式，**保持一致的 API 设计**！

