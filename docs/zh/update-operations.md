# 更新方法总览


## 1. 概述

monSQLize 提供三种 update 方法。本页用于选择方法和更新载荷形态：

| 方法 | 说明 | 聚合管道支持 |
|------|------|-------------|
| `updateOne()` | 更新单个匹配的文档 | 支持 |
| `updateMany()` | 更新所有匹配的文档 | 支持 |
| `updateBatch()` | 分批更新大量文档 | 支持 |

当前 update 方法同时支持传统更新操作符与聚合管道语法。聚合管道的完整说明见 [聚合管道更新指南](./update-aggregation.md)。

---

## 2. 传统更新操作符

### 2.1 常用操作符

#### $set - 设置字段值

```javascript
await users.updateOne(
    { userId: 'user1' },
    { $set: { name: 'Alice', age: 25 } }
);
```

#### $unset - 删除字段

```javascript
await users.updateOne(
    { userId: 'user1' },
    { $unset: { tempField: '' } }
);
```

#### $inc - 增加/减少数值

```javascript
await users.updateOne(
    { userId: 'user1' },
    { $inc: { loginCount: 1, balance: -100 } }
);
```

#### $push - 向数组添加元素

```javascript
await users.updateOne(
    { userId: 'user1' },
    { $push: { tags: 'newTag' } }
);
```

#### $pull - 从数组移除元素

```javascript
await users.updateOne(
    { userId: 'user1' },
    { $pull: { tags: 'oldTag' } }
);
```

### 2.2 组合使用

```javascript
await users.updateOne(
    { userId: 'user1' },
    {
        $set: { status: 'active' },
        $inc: { loginCount: 1 },
        $push: { loginHistory: new Date() }
    }
);
```

---

## 3. 聚合管道导读

当更新需要引用已有字段值、执行条件逻辑或做多阶段转换时，使用聚合管道。此时更新载荷是一个由阶段组成的数组：

```javascript
await orders.updateOne(
    { orderId: 'ORDER-123' },
    [
        { $set: { total: { $add: ['$price', '$tax'] } } }
    ]
);
```

本页只保留选择建议与基础写法。支持阶段、操作符示例、性能与排障见 [聚合管道更新指南](./update-aggregation.md)。

## 4. 如何选择更新形态

| 需求 | 推荐形态 | 继续阅读 |
|------|----------|----------|
| 简单赋值或删除字段 | `$set` / `$unset` 等传统操作符 | `updateOne()` / `updateMany()` |
| 数值增减或数组 push/pull | `$inc`、`$push`、`$pull` 等传统操作符 | `updateOne()` / `updateMany()` |
| 字段间计算 | 聚合管道数组 | [聚合管道更新指南](./update-aggregation.md) |
| 条件赋值或多阶段转换 | 聚合管道数组 | [聚合管道更新指南](./update-aggregation.md) |
| 大批量更新 | `updateBatch()` 搭配任一载荷形态 | [大批量更新](./updateBatch.md) |

## 5. 相关文档

- [更新单个文档](./update-one.md)
- [批量更新文档](./update-many.md)
- [大批量更新](./updateBatch.md)
- [聚合管道更新指南](./update-aggregation.md)
