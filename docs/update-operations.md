# Update 操作详解

> **适用版本**: v1.0.8+  
> **最后更新**: 2026-01-15

---

## 📋 目录

- [1. 概述](#1-概述)
- [2. 传统更新操作符](#2-传统更新操作符)
- [3. 聚合管道更新 (v1.0.8+)](#3-聚合管道更新-v108)
- [4. 使用场景对比](#4-使用场景对比)
- [5. 最佳实践](#5-最佳实践)
- [6. 性能考虑](#6-性能考虑)
- [7. 常见问题](#7-常见问题)

---

## 1. 概述

monSQLize 提供了三种 update 方法：

| 方法 | 说明 | 聚合管道支持 |
|------|------|-------------|
| `updateOne()` | 更新单个匹配的文档 | ✅ v1.0.8+ |
| `updateMany()` | 更新所有匹配的文档 | ✅ v1.0.8+ |
| `updateBatch()` | 分批更新大量文档 | ✅ v1.0.8+ |

从 **v1.0.8** 开始，所有 update 方法都支持**聚合管道**语法，提供更强大的字段计算和转换能力。

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

## 3. 聚合管道更新 (v1.0.8+)

### 3.1 基础概念

**什么是聚合管道更新？**

聚合管道更新允许你在 update 操作中使用聚合表达式，支持：
- ✅ 字段间计算（引用其他字段）
- ✅ 条件表达式（$cond、$switch）
- ✅ 数组操作（$arrayElemAt、$slice）
- ✅ 字符串操作（$concat、$trim）
- ✅ 日期计算（$add、$subtract）
- ✅ 多阶段转换（多个 $set/$unset）

**MongoDB 版本要求**: MongoDB 4.2+

### 3.2 基本语法

```javascript
await collection.updateOne(
    filter,      // 筛选条件（对象）
    [            // ✨ 聚合管道（数组）
        { $set: { field1: expression1 } },
        { $unset: ['field2'] },
        { $addFields: { field3: expression3 } }
    ],
    options      // 可选参数
);
```

### 3.3 支持的操作符

| 操作符 | 说明 | 示例 |
|--------|------|------|
| `$set` | 设置字段值 | `{ $set: { total: { $add: ['$a', '$b'] } } }` |
| `$unset` | 删除字段 | `{ $unset: ['tempField'] }` |
| `$addFields` | 添加字段（$set 的别名） | `{ $addFields: { computed: '$value' } }` |
| `$project` | 字段投影 | `{ $project: { name: 1, age: 1 } }` |
| `$replaceRoot` | 替换根文档 | `{ $replaceRoot: { newRoot: '$nested' } }` |
| `$replaceWith` | 替换文档（$replaceRoot 的别名） | `{ $replaceWith: '$newDoc' }` |

### 3.4 使用场景

#### 场景1: 字段间计算 ⭐

**需求**: 订单总价 = 单价 × 数量 + 运费

```javascript
await orders.updateOne(
    { orderId: 'ORDER-123' },
    [
        {
            $set: {
                totalPrice: {
                    $add: [
                        { $multiply: ['$unitPrice', '$quantity'] },
                        '$shippingFee'
                    ]
                },
                updatedAt: new Date()
            }
        }
    ]
);
```

**为什么用聚合管道？**
- ✅ 一次操作完成计算
- ✅ 避免先查询再计算
- ✅ 服务端计算，减少网络往返

#### 场景2: 条件赋值 ⭐

**需求**: 根据积分自动设置会员等级

```javascript
await users.updateOne(
    { userId: 'user1' },
    [
        {
            $set: {
                memberLevel: {
                    $switch: {
                        branches: [
                            { case: { $gte: ['$points', 10000] }, then: 'platinum' },
                            { case: { $gte: ['$points', 5000] }, then: 'gold' },
                            { case: { $gte: ['$points', 1000] }, then: 'silver' }
                        ],
                        default: 'bronze'
                    }
                }
            }
        }
    ]
);
```

**为什么用聚合管道？**
- ✅ 复杂条件判断
- ✅ 原子操作，避免竞态条件
- ✅ 代码更简洁

#### 场景3: 数组操作 ⭐

**需求**: 提取数组第一个元素作为默认值

```javascript
await products.updateOne(
    { productId: 'p123' },
    [
        {
            $set: {
                defaultImage: { $arrayElemAt: ['$images', 0] },
                totalTags: { $size: '$tags' },
                firstTag: { $arrayElemAt: ['$tags', 0] }
            }
        }
    ]
);
```

#### 场景4: 字符串拼接 ⭐

**需求**: 生成全名字段

```javascript
await users.updateOne(
    { userId: 'user1' },
    [
        {
            $set: {
                fullName: {
                    $concat: ['$firstName', ' ', '$lastName']
                },
                displayName: {
                    $cond: [
                        { $ne: ['$nickname', null] },
                        '$nickname',
                        { $concat: ['$firstName', ' ', '$lastName'] }
                    ]
                }
            }
        }
    ]
);
```

#### 场景5: 日期计算 ⭐

**需求**: 设置过期时间（创建时间 + 30天）

```javascript
await subscriptions.updateOne(
    { subscriptionId: 'sub123' },
    [
        {
            $set: {
                expiresAt: {
                    $add: ['$createdAt', 30 * 24 * 60 * 60 * 1000]  // +30天（毫秒）
                }
            }
        }
    ]
);
```

#### 场景6: 多阶段转换 ⭐

**需求**: 数据清洗、计算、时间戳更新

```javascript
await products.updateOne(
    { productId: 'p789' },
    [
        // 阶段1: 数据规范化
        {
            $set: {
                name: { $trim: { input: '$name' } },
                sku: { $toUpper: '$sku' }
            }
        },
        // 阶段2: 计算派生字段
        {
            $set: {
                discountedPrice: {
                    $multiply: [
                        '$price',
                        { $subtract: [1, '$discountRate'] }
                    ]
                }
            }
        },
        // 阶段3: 更新时间戳
        {
            $set: { updatedAt: new Date() }
        }
    ]
);
```

#### 场景7: 复杂业务逻辑 ⭐

**需求**: 订单状态自动流转

```javascript
await orders.updateOne(
    { orderId: 'ORDER-456' },
    [
        {
            $set: {
                status: {
                    $cond: [
                        { $eq: ['$paymentStatus', 'paid'] },
                        {
                            $cond: [
                                { $eq: ['$inventoryStatus', 'reserved'] },
                                'processing',
                                'pending-inventory'
                            ]
                        },
                        'pending-payment'
                    ]
                },
                updatedAt: new Date()
            }
        }
    ]
);
```

### 3.5 与传统方式对比

| 需求 | 传统方式 | 聚合管道方式 | 优势 |
|------|----------|-------------|------|
| 字段间计算 | ❌ 需查询→计算→更新 | ✅ 一次操作 | 减少网络往返 |
| 条件赋值 | ❌ 需多次查询判断 | ✅ 原子操作 | 避免竞态条件 |
| 数组操作 | ⚠️ 部分支持 | ✅ 完整支持 | 更灵活 |
| 字符串拼接 | ❌ 需客户端处理 | ✅ 服务端计算 | 性能更好 |
| 日期计算 | ❌ 需客户端计算 | ✅ 服务端计算 | 避免时区问题 |

---

## 4. 使用场景对比

### 4.1 何时使用传统操作符？

✅ **适用场景**:
- 简单的字段赋值（`$set`、`$unset`）
- 数值增减（`$inc`）
- 数组元素添加/删除（`$push`、`$pull`）
- 不需要字段间计算

**示例**:
```javascript
// ✅ 简单赋值，用传统方式即可
await users.updateOne(
    { userId: 'user1' },
    { $set: { status: 'active' }, $inc: { loginCount: 1 } }
);
```

### 4.2 何时使用聚合管道？

✅ **适用场景**:
- 需要引用其他字段值
- 需要条件表达式（if/switch）
- 需要复杂的数组/字符串/日期操作
- 需要多阶段数据转换

**示例**:
```javascript
// ✅ 字段间计算，必须用聚合管道
await orders.updateOne(
    { orderId: 'ORDER-123' },
    [
        { $set: { total: { $add: ['$price', '$tax'] } } }
    ]
);
```

---

## 5. 最佳实践

### 5.1 选择合适的方法

```javascript
// ❌ 错误：简单赋值使用聚合管道（过度复杂）
await users.updateOne({ userId: 'user1' }, [
    { $set: { status: 'active' } }
]);

// ✅ 正确：简单赋值使用传统操作符
await users.updateOne({ userId: 'user1' }, {
    $set: { status: 'active' }
});

// ✅ 正确：字段间计算使用聚合管道
await orders.updateOne({ orderId: 'ORDER-123' }, [
    { $set: { total: { $add: ['$price', '$tax'] } } }
]);
```

### 5.2 合理使用多阶段

```javascript
// ❌ 过度分阶段（不必要）
await products.updateOne({ productId: 'p1' }, [
    { $set: { field1: value1 } },
    { $set: { field2: value2 } },
    { $set: { field3: value3 } }
]);

// ✅ 合并到一个阶段
await products.updateOne({ productId: 'p1' }, [
    {
        $set: {
            field1: value1,
            field2: value2,
            field3: value3
        }
    }
]);

// ✅ 有依赖关系时才分阶段
await products.updateOne({ productId: 'p1' }, [
    // 阶段1: 先规范化数据
    { $set: { price: { $toDouble: '$priceString' } } },
    // 阶段2: 再基于规范化后的数据计算
    { $set: { discountedPrice: { $multiply: ['$price', 0.9] } } }
]);
```

### 5.3 错误处理

```javascript
try {
    await users.updateOne(
        { userId: 'user1' },
        [{ $set: { total: { $add: ['$a', '$b'] } } }]
    );
} catch (error) {
    if (error.code === 'UNSUPPORTED_OPERATION') {
        // MongoDB 版本不支持聚合管道
        console.error('请升级到 MongoDB 4.2+');
    } else {
        // 其他错误
        console.error('更新失败:', error.message);
    }
}
```

### 5.4 性能优化

#### 使用索引

```javascript
// ✅ 确保筛选字段有索引
await users.createIndex({ userId: 1 });
await users.updateOne({ userId: 'user1' }, [...]);
```

#### 避免过度复杂的表达式

```javascript
// ❌ 过度复杂（性能差）
await users.updateOne({ userId: 'user1' }, [
    {
        $set: {
            result: {
                $cond: [
                    { $and: [
                        { $gte: ['$a', 10] },
                        { $lte: ['$b', 20] },
                        { $ne: ['$c', null] },
                        { $in: ['$d', ['x', 'y', 'z']] }
                    ]},
                    { $multiply: ['$e', { $add: ['$f', '$g'] }] },
                    { $divide: ['$h', { $subtract: ['$i', '$j'] }] }
                ]
            }
        }
    }
]);

// ✅ 简化逻辑（或拆分为多次操作）
await users.updateOne({ userId: 'user1' }, [
    { $set: { temp: { $add: ['$f', '$g'] } } },
    { $set: { result: { $multiply: ['$e', '$temp'] } } },
    { $unset: ['temp'] }
]);
```

---

## 6. 性能考虑

### 6.1 性能对比

| 操作类型 | 传统操作符 | 聚合管道 | 性能差异 |
|----------|----------|---------|---------|
| 简单赋值 | 快 | 略慢 | ~5-10% |
| 字段间计算 | 不支持 | 快 | - |
| 条件逻辑 | 多次操作 | 一次完成 | 快 50%+ |
| 复杂表达式 | 不支持 | 中等 | - |

### 6.2 性能建议

1. **简单操作优先用传统操作符**
   ```javascript
   // ✅ 快速
   await users.updateOne({ _id }, { $set: { name: 'Alice' } });
   ```

2. **复杂计算才用聚合管道**
   ```javascript
   // ✅ 适合
   await orders.updateOne({ _id }, [
       { $set: { total: { $add: ['$price', '$tax'] } } }
   ]);
   ```

3. **批量更新使用 updateBatch**
   ```javascript
   // ✅ 大批量更新（10000+）
   await users.updateBatch(
       { status: 'inactive' },
       [{ $set: { status: 'archived' } }],
       { batchSize: 1000 }
   );
   ```

---

## 7. 常见问题

### Q1: 聚合管道会自动转换 ObjectId 吗？

**A**: 不会。聚合管道中的字符串保持原样，不会自动转换为 ObjectId。

```javascript
// ❌ 不会自动转换
await users.updateOne({ _id }, [
    { $set: { refId: '507f1f77bcf86cd799439011' } }  // 保持字符串
]);

// ✅ 需要手动转换（如果需要）
const { ObjectId } = require('mongodb');
await users.updateOne({ _id }, [
    { $set: { refId: new ObjectId('507f1f77bcf86cd799439011') } }
]);
```

### Q2: 聚合管道支持哪些表达式操作符？

**A**: 支持大部分聚合表达式操作符，包括：

- **算术**: `$add`, `$subtract`, `$multiply`, `$divide`, `$mod`
- **条件**: `$cond`, `$switch`, `$ifNull`
- **数组**: `$arrayElemAt`, `$size`, `$slice`, `$filter`
- **字符串**: `$concat`, `$substr`, `$trim`, `$toUpper`, `$toLower`
- **日期**: `$dateToString`, `$year`, `$month`, `$dayOfMonth`
- **类型**: `$type`, `$convert`, `$toDouble`, `$toString`

完整列表请参考: [MongoDB 聚合表达式](https://www.mongodb.com/docs/manual/reference/operator/aggregation/)

### Q3: 空数组会报错吗？

**A**: 会。空数组不是有效的聚合管道。

```javascript
// ❌ 错误：空数组
await users.updateOne({ _id }, []);
// Error: update 聚合管道不能为空数组

// ✅ 正确：至少包含一个阶段
await users.updateOne({ _id }, [
    { $set: { updatedAt: new Date() } }
]);
```

### Q4: 如何调试聚合管道？

**A**: 使用日志记录和分阶段测试。

```javascript
// 1. 开启调试日志
const msq = new MonSQLize({
    config: { uri: '...' },
    logger: console  // 输出调试日志
});

// 2. 分阶段测试
// 先测试第一阶段
await users.updateOne({ _id }, [
    { $set: { step1: { $add: ['$a', '$b'] } } }
]);

// 再添加第二阶段
await users.updateOne({ _id }, [
    { $set: { step1: { $add: ['$a', '$b'] } } },
    { $set: { step2: { $multiply: ['$step1', 2] } } }
]);
```

### Q5: 聚合管道更新后缓存会失效吗？

**A**: 会。与传统更新操作一样，聚合管道更新后会自动失效相关缓存。

```javascript
// 查询并缓存
await users.find({ status: 'active' }, { cache: 5000 });

// 聚合管道更新（缓存会自动失效）
await users.updateOne({ userId: 'user1' }, [
    { $set: { status: 'inactive' } }
]);

// 下次查询会重新从数据库读取
await users.find({ status: 'active' }, { cache: 5000 });
```

---

## 相关文档

- [MongoDB 聚合管道文档](https://www.mongodb.com/docs/manual/tutorial/update-documents-with-aggregation-pipeline/)
- [MongoDB 聚合表达式](https://www.mongodb.com/docs/manual/reference/operator/aggregation/)
- [monSQLize API 文档](./api-reference.md)

---

**文档版本**: v1.0.0  
**适用于**: monSQLize v1.0.8+  
**最后更新**: 2026-01-15

