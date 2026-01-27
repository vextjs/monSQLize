# ObjectId 转换日志配置说明

## 📋 默认行为

**v1.1.1 默认完全静默** - 不输出任何 ObjectId 转换日志 ✅

```javascript
// 默认配置
const msq = new MonSQLize({
  type: 'mongodb',
  config: { uri: 'mongodb://localhost:27017' }
});

await msq.collection('users').insertOne(dataWithObjectIds);
// ✅ 无任何日志输出（完全静默）
```

## 🎯 为什么默认静默？

1. **日志无实际作用**：ObjectId 转换是自动的，用户无需关心
2. **避免日志污染**：大量数据时会产生过多日志
3. **生产环境友好**：减少日志存储和性能开销
4. **透明转换**：用户无感知，自动处理兼容性问题

## 🔧 配置选项

如果您需要调试或了解转换详情，可以启用日志：

### 选项 1：启用摘要日志（推荐用于调试）

每次操作只输出一条摘要：

```javascript
const msq = new MonSQLize({
  type: 'mongodb',
  config: { uri: 'mongodb://localhost:27017' },
  autoConvertObjectId: {
    silent: false  // 关闭静默，启用摘要日志
  }
});

await msq.collection('users').insertOne(dataWithObjectIds);
// 输出：[DEBUG] [ObjectId Converter] Converted 15 cross-version ObjectIds
```

### 选项 2：启用详细日志（仅用于深度调试）

输出每个 ObjectId 的转换详情：

```javascript
const msq = new MonSQLize({
  type: 'mongodb',
  config: { uri: 'mongodb://localhost:27017' },
  autoConvertObjectId: {
    silent: false,   // 关闭静默
    verbose: true    // 启用详细日志
  }
});

await msq.collection('users').insertOne(dataWithObjectIds);
// 输出：每个 ObjectId 都有一条详细日志
```

## 📊 配置对比

| 模式 | silent | verbose | 日志输出 | 适用场景 |
|------|--------|---------|---------|---------|
| **静默模式**（默认）✅ | `true` | - | 无 | 生产环境、日常开发 |
| **摘要模式** | `false` | `false` | 1条摘要 | 需要了解转换情况时 |
| **详细模式** | `false` | `true` | N条详情 | 深度调试、排查问题 |

## 💡 完整配置示例

### 最简配置（推荐）

```javascript
const msq = new MonSQLize({
  type: 'mongodb',
  config: { uri: 'mongodb://localhost:27017' }
  // 默认完全静默，无需配置
});
```

### 调试配置（临时启用）

```javascript
const msq = new MonSQLize({
  type: 'mongodb',
  config: { uri: 'mongodb://localhost:27017' },
  autoConvertObjectId: {
    silent: false  // 临时启用摘要日志
  }
});
```

### 完整配置（所有选项）

```javascript
const msq = new MonSQLize({
  type: 'mongodb',
  config: { uri: 'mongodb://localhost:27017' },
  autoConvertObjectId: {
    enabled: true,           // 是否启用自动转换（默认 true）
    silent: true,            // 静默模式（默认 true，不输出任何日志）
    verbose: false,          // 详细日志（默认 false）
    excludeFields: [],       // 排除字段
    customFieldPatterns: [], // 自定义字段模式
    maxDepth: 10            // 最大递归深度
  }
});
```

## 🎯 使用建议

### 生产环境

```javascript
// 使用默认配置即可
const msq = new MonSQLize({
  type: 'mongodb',
  config: { uri: 'mongodb://localhost:27017' }
});
```

### 开发环境（日常）

```javascript
// 大多数情况下也用默认配置
const msq = new MonSQLize({
  type: 'mongodb',
  config: { uri: 'mongodb://localhost:27017' }
});
```

### 调试场景

```javascript
// 只在怀疑 ObjectId 转换有问题时临时启用
const msq = new MonSQLize({
  type: 'mongodb',
  config: { uri: 'mongodb://localhost:27017' },
  autoConvertObjectId: {
    silent: false  // 临时启用摘要日志
  }
});
```

## ❓ 常见问题

### Q: 完全不输出日志，会不会有问题？

A: 不会。ObjectId 转换是自动的、透明的、安全的。如果有问题，会在实际操作（如 insertOne）时抛出异常。

### Q: 如何知道有没有发生转换？

A: 正常情况下您不需要知道。如果确实需要，可以临时设置 `silent: false` 查看。

### Q: 转换失败会怎样？

A: 转换失败会输出 WARN 日志（不受 silent 控制），并返回原值，不会中断流程。

### Q: 能否只在转换失败时输出日志？

A: 可以。默认配置已经实现了这一点：
- `silent: true`：不输出成功转换的日志
- 转换失败：总是输出 WARN 日志（不受 silent 控制）

## 📝 总结

- ✅ **默认完全静默**：不输出任何成功转换的日志
- ✅ **失败必定提示**：转换失败总是输出 WARN
- ✅ **可按需启用**：调试时可以临时启用日志
- ✅ **生产友好**：减少日志量，提升性能

---

**更新版本**: v1.1.1  
**更新日期**: 2026-01-27
