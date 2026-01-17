# Update 方法支持聚合管道

> **版本**: v1.0.8+  
> **更新日期**: 2026-01-16

---

## 📋 目录

- [简介](#简介)
- [快速开始](#快速开始)
- [聚合管道基础](#聚合管道基础)
- [常用操作符](#常用操作符)
- [使用场景](#使用场景)
- [最佳实践](#最佳实践)
- [性能优化](#性能优化)
- [注意事项](#注意事项)
- [API 参考](#api-参考)

---

## 简介

从 v1.0.8 开始，monSQLize 的 `updateOne` 和 `updateMany` 方法支持 **聚合管道语法**，让您可以使用强大的聚合操作符进行更新。

### 为什么需要聚合管道?

**传统更新的限制**:

```javascript
// ❌ 无法实现：将价格增加10%
await collection.updateOne(
    { _id: id },
    { $set: { price: price * 1.1 } }  // 错误：无法引用字段值
);

// ❌ 无法实现：计算总价 = 单价 * 数量
await collection.updateOne(
    { _id: id },
    { $set: { total: unitPrice * quantity } }  // 错误：无法引用字段值
);
```

**聚合管道的优势**:

```javascript
// ✅ 可以实现：将价格增加10%
await collection.updateOne(
    { _id: id },
    [
        { $set: { price: { $multiply: ['$price', 1.1] } } }
    ]
);

// ✅ 可以实现：计算总价
await collection.updateOne(
    { _id: id },
    [
        { $set: { total: { $multiply: ['$unitPrice', '$quantity'] } } }
    ]
);
```

### 核心能力

- ✅ **字段间计算**: 基于现有字段值计算新值
- ✅ **条件赋值**: 根据条件设置不同的值
- ✅ **多阶段转换**: 复杂的数据转换流程
- ✅ **完全兼容**: 与 MongoDB 4.2+ 原生语法一致

---

## 快速开始

### 基础示例

```javascript
const MonSQLize = require('monsqlize');

const msq = new MonSQLize({
    type: 'mongodb',
    databaseName: 'mydb',
    config: { uri: 'mongodb://localhost:27017' }
});

await msq.connect();
const collection = msq.collection('products');

// 传统更新（仍然支持）
await collection.updateOne(
    { _id: productId },
    { $set: { status: 'active' } }
);

// 聚合管道更新（新功能）
await collection.updateOne(
    { _id: productId },
    [
        { $set: { 
            totalPrice: { $add: ['$price', '$tax'] }
        }}
    ]
);
```

### 识别规则

monSQLize 会自动检测更新语法：

```javascript
// 对象 → 传统更新
{ $set: { name: 'John' } }

// 数组 → 聚合管道
[ { $set: { total: { $add: ['$price', '$tax'] } } } ]
```

---

## 聚合管道基础

### 基本结构

聚合管道是一个包含多个阶段的数组：

```javascript
[
    { $set: { field1: expression1 } },  // 阶段1
    { $set: { field2: expression2 } },  // 阶段2
    { $unset: 'field3' }                // 阶段3
]
```

### 可用阶段

在 update 中可以使用以下阶段：

| 阶段 | 说明 | 示例 |
|------|------|------|
| `$set` | 设置字段值 | `{ $set: { total: { $add: ['$a', '$b'] } } }` |
| `$unset` | 删除字段 | `{ $unset: ['temp', 'oldField'] }` |
| `$replaceRoot` | 替换根文档 | `{ $replaceRoot: { newRoot: '$nested' } }` |

### 字段引用

使用 `$` 前缀引用字段：

```javascript
// 引用单个字段
'$price'

// 引用嵌套字段
'$address.city'

// 引用数组元素
'$items.0.price'
```

---

## 常用操作符

### 算术操作符

#### $add - 加法

```javascript
// 计算总价 = 单价 + 税费
await collection.updateOne(
    { _id: id },
    [
        { $set: { totalPrice: { $add: ['$unitPrice', '$tax'] } } }
    ]
);

// 多个字段相加
{ $add: ['$price', '$tax', '$shipping'] }

// 加上固定值
{ $add: ['$price', 10] }
```

#### $subtract - 减法

```javascript
// 计算折扣价 = 原价 - 折扣
await collection.updateOne(
    { _id: id },
    [
        { $set: { finalPrice: { $subtract: ['$originalPrice', '$discount'] } } }
    ]
);
```

#### $multiply - 乘法

```javascript
// 计算总价 = 单价 × 数量
await collection.updateOne(
    { _id: id },
    [
        { $set: { total: { $multiply: ['$unitPrice', '$quantity'] } } }
    ]
);

// 价格增加10%
{ $multiply: ['$price', 1.1] }
```

#### $divide - 除法

```javascript
// 计算平均价格
await collection.updateOne(
    { _id: id },
    [
        { $set: { avgPrice: { $divide: ['$totalPrice', '$quantity'] } } }
    ]
);
```

#### $mod - 取模

```javascript
// 判断奇偶
{ $mod: ['$number', 2] }  // 0 = 偶数, 1 = 奇数
```

### 条件操作符

#### $cond - 条件表达式

```javascript
// 根据金额设置优先级
await collection.updateOne(
    { _id: id },
    [
        {
            $set: {
                priority: {
                    $cond: {
                        if: { $gte: ['$amount', 1000] },
                        then: 'high',
                        else: 'normal'
                    }
                }
            }
        }
    ]
);

// 多重条件
{
    $cond: {
        if: { $gte: ['$score', 90] },
        then: 'A',
        else: {
            $cond: {
                if: { $gte: ['$score', 80] },
                then: 'B',
                else: 'C'
            }
        }
    }
}
```

#### $ifNull - 空值处理

```javascript
// 使用默认值
await collection.updateOne(
    { _id: id },
    [
        {
            $set: {
                displayName: { $ifNull: ['$nickname', '$username'] }
            }
        }
    ]
);
```

#### $switch - 多分支选择

```javascript
// 根据状态码设置描述
{
    $set: {
        statusText: {
            $switch: {
                branches: [
                    { case: { $eq: ['$status', 1] }, then: '待处理' },
                    { case: { $eq: ['$status', 2] }, then: '处理中' },
                    { case: { $eq: ['$status', 3] }, then: '已完成' }
                ],
                default: '未知'
            }
        }
    }
}
```

### 字符串操作符

#### $concat - 字符串拼接

```javascript
// 拼接全名
await collection.updateOne(
    { _id: id },
    [
        {
            $set: {
                fullName: { $concat: ['$firstName', ' ', '$lastName'] }
            }
        }
    ]
);
```

#### $toLower / $toUpper - 大小写转换

```javascript
// 邮箱转小写
await collection.updateOne(
    { _id: id },
    [
        { $set: { email: { $toLower: '$email' } } }
    ]
);

// 用户名转大写
{ $set: { username: { $toUpper: '$username' } } }
```

#### $substr - 子字符串

```javascript
// 提取前10个字符
{ $substr: ['$description', 0, 10] }
```

### 比较操作符

```javascript
// $eq - 等于
{ $eq: ['$status', 'active'] }

// $ne - 不等于
{ $ne: ['$status', 'deleted'] }

// $gt - 大于
{ $gt: ['$price', 100] }

// $gte - 大于等于
{ $gte: ['$age', 18] }

// $lt - 小于
{ $lt: ['$stock', 10] }

// $lte - 小于等于
{ $lte: ['$discount', 0.5] }
```

### 逻辑操作符

```javascript
// $and - 与
{ $and: [
    { $gte: ['$age', 18] },
    { $lte: ['$age', 65] }
]}

// $or - 或
{ $or: [
    { $eq: ['$status', 'active'] },
    { $eq: ['$status', 'pending'] }
]}

// $not - 非
{ $not: { $eq: ['$status', 'deleted'] } }
```

---

## 使用场景

### 场景1：字段间计算

```javascript
// 订单场景：计算总价
await orders.updateOne(
    { _id: orderId },
    [
        {
            $set: {
                // 小计 = 单价 × 数量
                subtotal: { $multiply: ['$unitPrice', '$quantity'] },
                // 税费 = 小计 × 税率
                tax: { $multiply: [
                    { $multiply: ['$unitPrice', '$quantity'] },
                    '$taxRate'
                ]},
                // 总价 = 小计 + 税费
                total: { $add: [
                    { $multiply: ['$unitPrice', '$quantity'] },
                    { $multiply: [
                        { $multiply: ['$unitPrice', '$quantity'] },
                        '$taxRate'
                    ]}
                ]}
            }
        }
    ]
);
```

### 场景2：条件赋值

```javascript
// 用户场景：根据积分设置等级
await users.updateMany(
    { updatedAt: { $lt: new Date('2026-01-01') } },
    [
        {
            $set: {
                level: {
                    $switch: {
                        branches: [
                            { case: { $gte: ['$points', 10000] }, then: 'vip' },
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

### 场景3：数据清洗

```javascript
// 批量标准化数据
await users.updateMany(
    {},
    [
        {
            $set: {
                // 邮箱转小写
                email: { $toLower: '$email' },
                // 使用默认昵称
                displayName: { $ifNull: ['$nickname', '$username'] },
                // 计算年龄
                age: {
                    $divide: [
                        { $subtract: [new Date(), '$birthDate'] },
                        31536000000  // 毫秒数/年
                    ]
                }
            }
        },
        {
            $unset: ['tempField', 'oldField']  // 删除临时字段
        }
    ]
);
```

### 场景4：多阶段转换

```javascript
// 复杂数据转换
await products.updateOne(
    { _id: productId },
    [
        // 阶段1：计算基础字段
        {
            $set: {
                originalTotal: { $multiply: ['$price', '$quantity'] }
            }
        },
        // 阶段2：应用折扣
        {
            $set: {
                discountAmount: { $multiply: ['$originalTotal', '$discountRate'] },
                discountedTotal: { $subtract: [
                    '$originalTotal',
                    { $multiply: ['$originalTotal', '$discountRate'] }
                ]}
            }
        },
        // 阶段3：添加税费
        {
            $set: {
                tax: { $multiply: ['$discountedTotal', 0.08] },
                finalTotal: { $add: [
                    '$discountedTotal',
                    { $multiply: ['$discountedTotal', 0.08] }
                ]}
            }
        }
    ]
);
```

### 场景5：价格调整

```javascript
// 批量调整价格
await products.updateMany(
    { category: 'electronics' },
    [
        {
            $set: {
                // 价格上涨10%
                newPrice: { $multiply: ['$price', 1.1] },
                // 保留旧价格
                oldPrice: '$price'
            }
        },
        {
            $set: {
                // 更新实际价格
                price: '$newPrice'
            }
        },
        {
            $unset: 'newPrice'  // 删除临时字段
        }
    ]
);
```

---

## 最佳实践

### 1. 性能优先

```javascript
// ✅ 推荐：一次性计算多个字段
await collection.updateOne(
    { _id: id },
    [
        {
            $set: {
                total: { $add: ['$price', '$tax'] },
                discount: { $multiply: ['$price', 0.1] },
                final: { $subtract: [
                    { $add: ['$price', '$tax'] },
                    { $multiply: ['$price', 0.1] }
                ]}
            }
        }
    ]
);

// ❌ 避免：多次更新
await collection.updateOne({ _id: id }, [
    { $set: { total: { $add: ['$price', '$tax'] } } }
]);
await collection.updateOne({ _id: id }, [
    { $set: { discount: { $multiply: ['$price', 0.1] } } }
]);
```

### 2. 使用中间变量

```javascript
// ✅ 推荐：使用多阶段简化复杂计算
await collection.updateOne(
    { _id: id },
    [
        // 阶段1：计算中间值
        {
            $set: {
                subtotal: { $multiply: ['$price', '$quantity'] }
            }
        },
        // 阶段2：基于中间值计算最终值
        {
            $set: {
                total: { $add: ['$subtotal', '$shipping'] }
            }
        }
    ]
);
```

### 3. 防御性编程

```javascript
// ✅ 推荐：处理空值和异常情况
await collection.updateOne(
    { _id: id },
    [
        {
            $set: {
                total: {
                    $add: [
                        { $ifNull: ['$price', 0] },
                        { $ifNull: ['$tax', 0] }
                    ]
                },
                // 避免除以零
                avgPrice: {
                    $cond: {
                        if: { $gt: ['$quantity', 0] },
                        then: { $divide: ['$total', '$quantity'] },
                        else: 0
                    }
                }
            }
        }
    ]
);
```

### 4. 保留历史数据

```javascript
// ✅ 推荐：修改前保存原值
await collection.updateOne(
    { _id: id },
    [
        {
            $set: {
                oldPrice: '$price',
                price: { $multiply: ['$price', 1.1] },
                priceUpdatedAt: new Date()
            }
        }
    ]
);
```

### 5. 批量操作

```javascript
// ✅ 推荐：使用 updateMany 批量更新
const result = await collection.updateMany(
    { status: 'pending', createdAt: { $lt: expiredDate } },
    [
        {
            $set: {
                status: 'expired',
                expiredAt: new Date()
            }
        }
    ]
);

console.log(`Updated ${result.modifiedCount} documents`);
```

---

## 性能优化

### 1. 减少管道阶段

```javascript
// ❌ 低效：多个阶段
[
    { $set: { a: { $add: ['$x', 1] } } },
    { $set: { b: { $add: ['$y', 1] } } },
    { $set: { c: { $add: ['$z', 1] } } }
]

// ✅ 高效：合并到一个阶段
[
    {
        $set: {
            a: { $add: ['$x', 1] },
            b: { $add: ['$y', 1] },
            c: { $add: ['$z', 1] }
        }
    }
]
```

### 2. 使用索引

```javascript
// 确保查询条件有索引
await collection.createIndex({ status: 1, category: 1 });

// 然后批量更新
await collection.updateMany(
    { status: 'active', category: 'electronics' },
    [ { $set: { featured: true } } ]
);
```

### 3. 分批处理大量数据

```javascript
// 分批更新避免超时
const batchSize = 1000;
let skip = 0;
let updated = 0;

while (true) {
    const docs = await collection
        .find({ status: 'pending' })
        .skip(skip)
        .limit(batchSize)
        .toArray();
    
    if (docs.length === 0) break;
    
    const ids = docs.map(d => d._id);
    const result = await collection.updateMany(
        { _id: { $in: ids } },
        [ { $set: { status: 'processed' } } ]
    );
    
    updated += result.modifiedCount;
    skip += batchSize;
    
    console.log(`Processed ${updated} documents...`);
}
```

---

## 注意事项

### 1. MongoDB 版本要求

聚合管道更新需要 **MongoDB 4.2+**：

```javascript
// 检查 MongoDB 版本
const admin = msq.db.admin();
const serverInfo = await admin.serverInfo();
console.log(`MongoDB version: ${serverInfo.version}`);

// v4.2+ 才支持聚合管道更新
if (parseFloat(serverInfo.version) < 4.2) {
    console.warn('Aggregation pipeline updates require MongoDB 4.2+');
}
```

### 2. 字段引用语法

```javascript
// ✅ 正确：使用 $ 前缀
{ $add: ['$price', '$tax'] }

// ❌ 错误：缺少 $ 前缀
{ $add: ['price', 'tax'] }  // 会被当作字符串！
```

### 3. 数组vs对象

```javascript
// 聚合管道：数组
[ { $set: { total: { $add: ['$a', '$b'] } } } ]

// 传统更新：对象
{ $set: { total: 100 } }

// 不要混用！
```

### 4. 性能考虑

聚合管道更新比传统更新 **稍慢**（约10-20%），只在必要时使用：

```javascript
// ✅ 需要字段间计算 → 使用聚合管道
[ { $set: { total: { $add: ['$price', '$tax'] } } } ]

// ✅ 简单赋值 → 使用传统更新
{ $set: { status: 'active' } }
```

### 5. 事务支持

聚合管道更新完全支持事务：

```javascript
const session = msq.client.startSession();

try {
    await session.withTransaction(async () => {
        await collection.updateOne(
            { _id: id },
            [ { $set: { total: { $add: ['$price', '$tax'] } } } ],
            { session }
        );
    });
} finally {
    await session.endSession();
}
```

---

## API 参考

### updateOne

```typescript
collection.updateOne(
    filter: object,
    update: object | array,
    options?: {
        upsert?: boolean;
        session?: ClientSession;
        // ... 其他选项
    }
): Promise<UpdateResult>
```

**参数**:
- `filter`: 查询条件
- `update`: 更新内容（对象=传统更新，数组=聚合管道）
- `options`: 可选配置

**返回**:
```typescript
{
    acknowledged: boolean;
    matchedCount: number;
    modifiedCount: number;
    upsertedId?: ObjectId;
}
```

### updateMany

```typescript
collection.updateMany(
    filter: object,
    update: object | array,
    options?: UpdateOptions
): Promise<UpdateResult>
```

与 `updateOne` 类似，但可以更新多个文档。

---

## 相关文档

- [update-one.md](./update-one.md) - updateOne 完整文档
- [update-many.md](./update-many.md) - updateMany 完整文档
- [update-operations.md](./update-operations.md) - 更新操作概览
- [aggregate.md](./aggregate.md) - 聚合管道详解

---

_文档版本: v1.0.8_  
_最后更新: 2026-01-16_

