# Model Options 完整设计 - 最终总结

## 🎯 解决的核心问题

### 问题1：默认配置值说明
✅ **完成**：补充了所有配置项的默认值
```javascript
// 完整的默认值
timestamps.enabled: false
timestamps.createdAt: 'createdAt'
timestamps.updatedAt: 'updatedAt'
softDelete.enabled: false
softDelete.field: 'deletedAt'
softDelete.type: 'timestamp'
softDelete.ttl: null
softDelete.index: true
version.enabled: false
version.field: 'version'
version.strategy: 'increment'
sync.enabled: false
sync.mode: 'safe'
sync.background: true
```

### 问题2：实际场景的最佳实践建议
✅ **完成**：分析了 5 个常见日常开发场景

---

## 📊 日常开发场景对比表

| 场景 | timestamps | softDelete | version | sync | 说明 |
|------|-----------|-----------|---------|------|------|
| **用户/订单** | ✅ true | ✅ true | ✅ true | ✅ true | 核心表，全启用 |
| **会话表** | ❌ false | ❌ false | ❌ false | ✅ true | 寿命短，用 TTL 清理 |
| **中间表** | ❌ false | ❌ false | ❌ false | ✅ true | 极简配置 |
| **日志表** | ✅ true | ❌ false | ❌ false | ✅ true | 仅追加，永久保留 |
| **商品表** | ✅ true | ✅ true | ✅ true | ✅ safe | 高并发，防超卖 |

---

## 🔑 关键建议汇总

### 1️⃣ 默认全部禁用原则
```javascript
// ❌ 不要强制启用
options: { }  // 默认什么都不启用

// ✅ 用户根据需求主动启用
options: {
    timestamps: true,
    softDelete: true,
    version: true,
    sync: true
}
```

### 2️⃣ softDelete.ttl 推荐值
```javascript
// 用户可见数据（帖子、评论）：30天
softDelete: { ttl: 30 * 24 * 60 * 60 * 1000 }

// 敏感数据（订单、支付）：90天
softDelete: { ttl: 90 * 24 * 60 * 60 * 1000 }

// 永久保留（关键信息）
softDelete: { ttl: null }
```

### 3️⃣ version 用于高并发场景
```javascript
// 秒杀防超卖
const result = await Product.updateOne(
    { _id: productId, version: currentVersion, stock: { $gt: 0 } },
    { $inc: { stock: -1, version: 1 } }
);
if (result.matchedCount === 0) {
    // 版本冲突，需要重试
}
```

### 4️⃣ sync 的环境差异
```javascript
// 生产环境：safe（保险）
sync: { mode: 'safe' }

// 开发环境：force（快速）
sync: { mode: 'force' }
```

### 5️⃣ 三层配置递进
```javascript
// 第1层：完全默认
options: { }

// 第2层：简化启用
options: {
    timestamps: true,
    softDelete: true,
    version: true,
    sync: true
}

// 第3层：精细控制
options: {
    timestamps: { enabled: true, createdAt: 'created_at', updatedAt: 'updated_at' },
    softDelete: { enabled: true, field: 'deleted_at', type: 'timestamp', ttl: 30*24*60*60*1000 },
    version: { enabled: true, field: 'v', strategy: 'increment' },
    sync: { enabled: true, mode: 'safe', background: true }
}
```

---

## 🎓 实际应用指导

### 开发流程建议

**阶段1：MVP 开发**
```javascript
// 快速启用所有功能，便于测试
options: {
    timestamps: true,
    softDelete: true,
    version: true,
    sync: true
}
```

**阶段2：优化阶段**
```javascript
// 分析性能，关闭不必要的功能
// - 发现某表没有并发 → 关闭 version
// - 发现某表不需要时间 → 关闭 timestamps
// - 发现某表不需要恢复 → 关闭 softDelete
```

**阶段3：生产环境**
```javascript
// 精确配置每个表
User: { timestamps: true, softDelete: true, version: true, sync: true }
UserRole: { timestamps: false, softDelete: false, version: false, sync: true }
Session: { timestamps: false, softDelete: false, version: false, sync: true }
```

---

## 📋 场景快速参考

### 场景1：用户表
```javascript
options: {
    timestamps: true,   // 记录操作时间
    softDelete: true,   // 删除后保留30天可恢复
    version: true,      // 防止并发冲突
    sync: true          // 同步索引
}
```
**自动注入方法**：
- `User.restore(id)` - 恢复已删除用户
- `User.findWithDeleted()` - 查询包含已删除用户
- `User.findOnlyDeleted()` - 只查询已删除用户

---

### 场景2：会话表
```javascript
options: {
    timestamps: false,
    softDelete: false,
    version: false,
    sync: true
}

// 在 schema 中定义过期时间
schema: function(dsl) {
    return dsl({ expireAt: 'date!' })
}

// 在 indexes 中定义 TTL 索引
indexes: [
    { key: { expireAt: 1 }, expireAfterSeconds: 0 }
]
```
**说明**：寿命短，使用 TTL 自动清理，不需要软删除

---

### 场景3：中间表
```javascript
options: {
    timestamps: false,
    softDelete: false,
    version: false,
    sync: true
}

// 唯一索引防重
indexes: [
    { key: { userId: 1, roleId: 1 }, unique: true }
]
```
**说明**：极简配置，删除时物理删除

---

### 场景4：日志表
```javascript
options: {
    timestamps: true,   // 记录事件发生时间
    softDelete: false,  // 永久保留
    version: false,
    sync: true
}
```
**说明**：审计需要，不删除，只追加

---

### 场景5：商品表（高并发）
```javascript
options: {
    timestamps: true,
    softDelete: true,   // 下架后保留
    version: true,      // 秒杀防超卖
    sync: { enabled: true, mode: 'safe' }
}
```
**说明**：核心数据，并发更新，需要完整功能

---

## ✅ 完成清单

### 核心文件
- ✅ `lib/model/examples/test.js` (291 行)
  - 4 项配置项详细展示
  - 默认值明确标注
  - 简化/详细配置方式说明
  - 5 个实际场景最佳实践
  - 开发建议 5 条

### 文档文件
- ✅ `docs/model-options-defaults-scenarios.md` (463 行)
  - 完整的默认值表
  - 5 个日常场景分析
  - 快速决策树
  - 常见问题解答
  - 配置演变示例

- ✅ `docs/model-options-configuration-guide.md`
  - 配置方式指南
  - 实际示例

- ✅ `docs/model-options-final.md`
  - 最终设计说明

- ✅ `docs/model-options-evolution.md`
  - 版本演变过程

---

## 🎉 最终设计总结

### 设计哲学

1. **最小化原则**
   - 只有 4 项核心配置
   - 默认全部禁用
   - 用户按需启用

2. **一致性原则**
   - 所有配置项 API 相同
   - 支持简化/详细/禁用三种方式
   - 学会一种用法，适用所有配置

3. **实用性原则**
   - 基于实际开发场景
   - 提供现成的配置模板
   - 清晰的默认值说明

4. **安全性原则**
   - sync 默认 safe 模式
   - softDelete 默认保留
   - version 防止并发冲突

---

## 🚀 使用步骤

### Step 1：选择场景
从 5 个场景中选择最接近的：
- 用户/订单表
- 会话表
- 中间表
- 日志表
- 商品表

### Step 2：复制配置
```javascript
// 直接复制对应场景的 options 配置
options: { ... }
```

### Step 3：按需调整
```javascript
// 根据实际需求调整参数
softDelete: { ttl: 90 * 24 * 60 * 60 * 1000 }  // 改为 90 天
sync: { mode: 'force' }  // 开发环境用 force
```

### Step 4：查看文档
如有疑问，查看对应的场景说明或常见问题

---

## 📚 文档导航

| 需求 | 文档 | 位置 |
|------|------|------|
| 快速启用 | test.js | `lib/model/examples/test.js` |
| 默认值查询 | 默认值表 | `docs/model-options-defaults-scenarios.md` |
| 场景参考 | 5 个场景 | `docs/model-options-defaults-scenarios.md` |
| 常见问题 | Q&A | `docs/model-options-defaults-scenarios.md` |
| 配置详解 | 详细指南 | `docs/model-options-configuration-guide.md` |
| 设计理念 | 最终设计 | `docs/model-options-final.md` |

---

## 💡 核心建议

1. **开发阶段**：使用简化配置，快速迭代
   ```javascript
   options: {
       timestamps: true,
       softDelete: true,
       version: true,
       sync: true
   }
   ```

2. **优化阶段**：识别不需要的功能，关闭以提升性能

3. **生产环境**：确认 `sync.mode = 'safe'`，避免误删索引

4. **高并发表**：必须启用 `version`，防止并发冲突

5. **敏感数据**：启用 `softDelete`，避免误删无法恢复

---

## ✨ 总结

✅ **设计完成**：Model Options 配置体系完整
✅ **文档完善**：覆盖默认值、场景、最佳实践
✅ **易于使用**：3 层配置方式，满足所有需求
✅ **生产就绪**：安全、灵活、可扩展

**示例模板已准备好，可作为 ORM Model 功能开发的参考！** 🎯

