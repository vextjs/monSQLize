# Model Options 设计总结

## 📋 最终决策

### 问题1：slowQuery 有必要吗？

**决策：❌ 移除**

**原因**：
1. ✅ 慢查询日志已在全局 ORM 层实现（`lib/slow-query-log/SlowQueryLogManager`）
2. ✅ 所有 model 的查询自动上报，无需单个 model 配置
3. ❌ 在 model options 中重复配置会导致混淆
4. ✅ 统一管理好处：去重、聚合、自动清理

**配置位置**：
- ✅ **应该在**：ORM 初始化时全局配置
- ❌ **不应该在**：model options 中配置

### 问题2：retention vs ttl - 哪个更合适？

**决策：✅ 使用 ttl**

**原因**：
1. ✅ MongoDB 生态约定俗成：`ttl` = Time To Live
2. ✅ 用户熟悉 MongoDB TTL 索引概念
3. ✅ 简洁明了，直观易懂
4. ✅ 命名统一：`softDelete.ttl` 和 `lifecycle.ttl` 概念对齐

**字段含义**：
```javascript
softDelete: {
    ttl: 30 * 24 * 60 * 60 * 1000  // 30天后物理删除
}

lifecycle: {
    field: 'expireAt',  // 数据自身的过期时间
    index: true         // TTL 索引自动清理
}
```

---

## 📊 最终 Model Options 配置（8项）

```javascript
options: {
    // 1. 时间戳维护（自动 createdAt / updatedAt）
    timestamps: true,
    timestampFields: { createdAt: 'createdAt', updatedAt: 'updatedAt' }

    // 2. 软删除（用户删除后保留期）
    softDelete: {
        enabled: true,
        field: 'deletedAt',
        type: 'timestamp',  // timestamp | boolean
        ttl: 30 * 24 * 60 * 60 * 1000,  // 30天
        index: true
    }

    // 3. 乐观锁版本控制（并发冲突）
    version: {
        enabled: true,
        field: 'version',
        strategy: 'increment'  // increment | timestamp
    }

    // 4. 数据生命周期（会话/验证码/缓存）
    lifecycle: {
        enabled: true,
        field: 'expireAt',
        index: true
    }

    // 5. 索引自动同步
    sync: {
        enabled: true,
        mode: 'safe',  // safe | force
        background: true
    }

    // 6. 查询缓存（模型级缓存策略）
    cache: {
        enabled: true,
        ttl: 60 * 1000,
        prefix: 'user:',
        invalidateOn: ['insert', 'update', 'delete']
    }

    // 7. 查询默认配置
    query: {
        defaultLimit: 10,
        maxLimit: 100,
        softDeleteFilter: true
    }

    // 8. 数据验证（基于 schema）
    validation: {
        enabled: true,
        strict: true,
        stripUnknown: false
    }
}
```

---

## ✅ 完成项目

### 文件更新

1. **`lib/model/examples/test.js`** ✅
   - 移除 `slowQuery` 配置
   - 使用 `ttl` 而非 `retention`
   - 简化为 8 项配置
   - 补充全局方法说明

2. **`docs/model-options.md`** ✅
   - 补充慢查询日志全局配置说明
   - 调整章节编号
   - 更新最佳实践

3. **`docs/model-options-vs-global-config.md`** ✨ 新增
   - 全局配置 vs 模型配置对比
   - 完整 ORM 初始化示例
   - 不同 model 的配置示例
   - 配置优先级说明

### 设计改进

| 维度 | 之前 | 之后 | 说明 |
|------|------|------|------|
| **slowQuery** | model options | 全局 ORM | 统一管理，避免重复配置 |
| **TTL 字段** | 不统一 | 统一为 `ttl` | 与 MongoDB 概念对齐 |
| **配置项数** | 9项 | 8项 | 移除冗余的 slowQuery |
| **全局/模型分工** | 模糊 | 清晰 | 全局→全局、模型→模型 |

---

## 🎯 核心设计原则

### 全局配置（ORM 初始化）
- ✅ 一次性功能：慢查询、缓存系统、日志、事务
- ✅ 所有 model 共享
- ✅ 配置一次，无需重复

### 模型配置（model options）
- ✅ 模型特定逻辑：版本控制、软删除、TTL
- ✅ 业务规则：查询过滤、缓存策略
- ✅ 每个 model 独立配置

---

## 📚 相关文档

- `lib/model/examples/test.js` - Model 定义示例
- `docs/model-options.md` - Model options 详细配置指南
- `docs/model-options-vs-global-config.md` - 全局 vs 模型配置对比
- `lib/slow-query-log/` - 慢查询日志管理器
- `lib/slow-query-log/config-manager.js` - 慢查询配置说明

---

## 验证结果

✅ **示例模板验证通过**

```
✅ enums 可被外部访问
✅ schema 中 this 自动绑定
✅ methods 返回正确结构
✅ hooks 支持所有操作
✅ indexes 配置完整
✅ relations 支持三种类型
✅ options 配置完整清晰
✅ 全局方法注入说明完善
```

---

## 🎉 总结

1. **架构清晰**：全局功能全局配置，模型功能模型配置
2. **配置精简**：从 9 项简化到 8 项，移除冗余
3. **命名统一**：使用 `ttl` 与 MongoDB 概念对齐
4. **文档完善**：三份文档详细说明全局/模型/对比
5. **示例可用**：test.js 可作为 Model 功能开发参考

Model 定义示例模板完成！🚀

