# ObjectId 跨版本兼容性

## 概述

monSQLize 从 **v1.1.1** 开始支持跨 BSON 版本的 ObjectId 兼容，可以无缝处理来自其他 MongoDB 库（如 mongoose）的 ObjectId 对象。

## 问题背景

当您的项目混用多个 MongoDB 库时，可能会遇到 BSON 版本冲突问题：

```javascript
// 其他服务使用 mongoose (bson@4.x 或 bson@5.x)
const dataFromMongoose = await MongooseModel.findOne({ ... }).lean();

// monSQLize 使用 mongodb@6.x (bson@6.x)
await msq.collection('orders').insertOne(dataFromMongoose);
// ❌ 错误：Unsupported BSON version, bson types must be from bson 6.x.x
```

**根本原因**：
- mongoose 依赖 `bson@4.x` 或 `bson@5.x`
- monSQLize 使用 `mongodb@6.x` 内部依赖 `bson@6.x`
- mongodb@6.x 驱动拒绝接受非 `bson@6.x` 的 ObjectId 实例

## 解决方案

monSQLize 内置了**自动跨版本 ObjectId 转换**功能，无需手动处理：

### ✅ 自动转换（推荐）

```javascript
const MonSQLize = require('monsqlize');

// 从 mongoose 获取数据（包含 bson@4.x/5.x 的 ObjectId）
const dataFromMongoose = await MongooseModel.findOne({ ... }).lean();

// 直接插入，monSQLize 自动转换 ObjectId
const result = await msq.collection('orders').insertOne(dataFromMongoose);
// ✅ 成功：自动将旧版本 ObjectId 转换为 bson@6.x 版本
```

### 工作原理

monSQLize 的 `convertObjectIdStrings` 函数会：

1. **检测旧版本 ObjectId**：通过 `constructor.name === 'ObjectId'` 识别
2. **安全转换**：调用 `.toString()` 获取十六进制字符串，再构造为 `bson@6.x` 版本
3. **递归处理**：自动处理嵌套对象和数组中的 ObjectId
4. **错误降级**：转换失败时返回原对象，不影响其他字段

## 支持的场景

### 1. 单个 ObjectId

```javascript
// mongoose 的 ObjectId
const legacyUserId = mongoose.Types.ObjectId('507f1f77bcf86cd799439011');

// 自动转换
await msq.collection('users').insertOne({
  userId: legacyUserId,  // ✅ 自动转换
  name: 'Alice'
});
```

### 2. 嵌套对象

```javascript
const order = {
  _id: mongooseObjectId1,
  userId: mongooseObjectId2,
  items: [
    { productId: mongooseObjectId3, qty: 2 },
    { productId: mongooseObjectId4, qty: 1 }
  ],
  metadata: {
    createdBy: mongooseObjectId5,
    updatedBy: mongooseObjectId6
  }
};

// 所有 ObjectId 自动转换
await msq.collection('orders').insertOne(order);
```

### 3. ObjectId 数组

```javascript
const userIds = [
  mongooseObjectId1,
  mongooseObjectId2,
  mongooseObjectId3
];

await msq.collection('groups').insertOne({
  name: 'Group A',
  members: userIds  // ✅ 数组中的所有 ObjectId 自动转换
});
```

### 4. 查询条件

```javascript
// 查询条件中的 ObjectId 也会自动转换
const result = await msq.collection('orders').find({
  userId: mongooseObjectId  // ✅ 自动转换
});
```

## 性能优化

- **零拷贝优化**：如果对象中没有需要转换的 ObjectId，返回原对象（不克隆）
- **智能检测**：只处理字段名匹配 `_id`, `*Id`, `*Ids` 等模式的字段
- **深度限制**：递归深度默认限制为 10 层，防止栈溢出

## 兼容性

| BSON 版本 | mongoose 版本 | monSQLize 支持 |
|-----------|--------------|---------------|
| bson@4.x  | mongoose@5.x | ✅ 完全支持     |
| bson@5.x  | mongoose@6.x | ✅ 完全支持     |
| bson@6.x  | mongoose@7.x | ✅ 原生支持     |

## 手动转换（可选）

如果您需要手动控制转换过程：

```javascript
const { convertObjectIdStrings } = require('monsqlize/lib/utils/objectid-converter');

// 手动转换
const converted = convertObjectIdStrings(dataFromMongoose);

await msq.collection('orders').insertOne(converted);
```

## 调试

启用日志查看转换过程：

```javascript
const msq = new MonSQLize({
  type: 'mongodb',
  databaseName: 'mydb',
  config: { uri: 'mongodb://localhost:27017' },
  logger: {
    level: 'debug'  // 启用调试日志
  }
});

// 插入时会输出转换日志
await msq.collection('orders').insertOne(dataFromMongoose);
// [DEBUG] [ObjectId Converter] Cross-version ObjectId converted
//   { from: 'ObjectId', to: 'ObjectId', hex: '507f1f77bcf86cd799439011' }
```

## 注意事项

1. **字段引用不转换**：MongoDB 聚合管道中的字段引用（如 `$userId`）不会被转换
2. **特殊操作符**：`$expr`, `$function`, `$where` 等内部不转换
3. **循环引用检测**：自动检测并防止循环引用导致的无限递归
4. **错误降级**：转换失败时返回原值，不会抛出异常

## 相关链接

- [MongoDB 官方驱动版本兼容性](https://www.mongodb.com/docs/drivers/node/current/compatibility/)
- [Mongoose 版本选择指南](https://mongoosejs.com/docs/version-selection.html)
- [BSON 规范](http://bsonspec.org/)

## 更新日志

- **v1.1.1** (2026-01-27)：新增跨版本 ObjectId 兼容性支持
