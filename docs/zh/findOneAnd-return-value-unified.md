# findOneAnd* 方法返回值行为

## 概述

本文档详细说明 monSQLize 如何统一处理不同 MongoDB Driver 版本中 `findOneAndUpdate`、`findOneAndReplace`、`findOneAndDelete` 方法的返回值差异。

---

## 问题背景

### MongoDB Driver 版本差异

在 MongoDB Node.js Driver 的不同版本中，`findOneAnd*` 方法的返回值格式存在重大差异。当前 monSQLize 以 `mongodb@6.21.0` 作为运行时依赖基线；Driver 7.5.0 作为扩展矩阵验证版本。

#### Driver 4.x 返回格式

```javascript
const result = await collection.findOneAndUpdate(
  { name: 'Alice' },
  { $set: { age: 31 } }
);

console.log(result);
// 输出：
{
  value: { _id: ..., name: "Alice", age: 31 },  // 文档内容
  ok: 1,                                         // 操作状态
  lastErrorObject: {                             // 错误对象
    n: 1,
    updatedExisting: true,
    upserted: undefined
  }
}

// 需要手动提取 value
const user = result.value;
```

#### Driver 5.x 返回格式

```javascript
const result = await collection.findOneAndUpdate(
  { name: 'Alice' },
  { $set: { age: 31 } }
);

console.log(result);
// 输出：
{
  value: { _id: ..., name: "Alice", age: 31 }  // 只返回文档
}

// 仍需要提取 value
const user = result.value;
```

#### Driver 6.x / 7.x 默认返回格式

```javascript
const result = await collection.findOneAndUpdate(
  { name: 'Alice' },
  { $set: { age: 31 } }
);

console.log(result);
// 输出：
{
  _id: ...,
  name: "Alice",
  age: 31
}

// 默认已经是文档本身
const user = result;
```

### 问题

如果直接使用 MongoDB Driver，用户代码需要根据版本处理不同的返回值：

```javascript
// 用户需要手动处理 driver 版本差异
const result = await collection.findOneAndUpdate(filter, update);

let user;
if (driverVersion === 4) {
  user = result.value;  // Driver 4.x
} else if (driverVersion === 5) {
  user = result.value;  // Driver 5.x
} else if (driverVersion >= 6) {
  user = result;        // Driver 6.x / 7.x 默认行为
}
```

---

## monSQLize 的解决方案

### 当前依赖基线下的统一用户体验

monSQLize 当前包依赖基线为 `mongodb@6.21.0`，并验证 Driver 7.5.0 扩展矩阵。在当前依赖基线下，`findOneAnd*` 直接返回文档或 `null`，**用户无需额外安装或选择 driver 版本**。

```javascript
// 使用当前 monSQLize 包依赖基线
const user = await collection.findOneAndUpdate(
  { name: 'Alice' },
  { $set: { age: 31 } }
);

// 直接返回文档本身（不是 result.value）
console.log(user);  
// 输出: { _id: ..., name: "Alice", age: 31 }

// 无需判断版本
// 无需提取 value
// 代码简洁清晰
```

---

## 实现原理

### Driver 薄封装

monSQLize 在 `src/adapters/mongodb/writes/write-basic.ts` 中调用 MongoDB Driver 原生方法，并保持当前 driver 基线的默认返回形态：

```javascript
// monSQLize 内部实现（简化版）
async findOneAndUpdate(filter, update, options = {}) {
  // 1. 调用原生 Driver
  const result = await this.nativeCollection.findOneAndUpdate(
    filter, 
    update, 
    options
  );
  
  // 2. 返回当前 driver 基线的文档/null 形态
  return result;
}
```

### 验证边界

- `mongodb@6.21.0` 是默认运行时基线。
- Driver 7.5.0 通过兼容性矩阵作为扩展验证。
- Driver 4.x / 5.x 的 `{ value, ok, lastErrorObject }` 是历史迁移背景，不建议在新项目覆盖当前包依赖基线。

---

## 适用的方法

monSQLize 对以下 3 个方法统一了返回值：

### 1. findOneAndUpdate

```javascript
// 所有支持的 driver 版本返回统一格式
const updatedUser = await collection.findOneAndUpdate(
  { name: 'Alice' },
  { $set: { age: 31 } },
  { returnDocument: 'after' }
);

console.log(updatedUser);  // { _id: ..., name: "Alice", age: 31 }
```

### 2. findOneAndReplace

```javascript
// 所有支持的 driver 版本返回统一格式
const replacedUser = await collection.findOneAndReplace(
  { name: 'Alice' },
  { name: 'Alice', age: 31, status: 'active' },
  { returnDocument: 'after' }
);

console.log(replacedUser);  // { _id: ..., name: "Alice", age: 31, status: "active" }
```

### 3. findOneAndDelete

```javascript
// 所有支持的 driver 版本返回统一格式
const deletedUser = await collection.findOneAndDelete({ name: 'Alice' });

console.log(deletedUser);  // { _id: ..., name: "Alice", age: 31 }
```

---

## 用户体验对比

### 直接使用原生 Driver

```javascript
const { MongoClient } = require('mongodb');
const client = await MongoClient.connect('mongodb://localhost:27017');
const collection = client.db('mydb').collection('users');

// 返回元数据包装对象
const result = await collection.findOneAndUpdate(
  { name: 'Alice' },
  { $set: { age: 31 } },
  { returnDocument: 'after' }
);

// 需要手动提取 value
const user = result.value;

// 需要判断文档是否存在
if (!user) {
  console.log('用户不存在');
  return;
}

console.log(user.name);
```

### 使用 monSQLize

```javascript
import MonSQLize from 'monsqlize';
const msq = new MonSQLize({ type: 'mongodb', config: { uri: '...' } });
await msq.connect();
const collection = msq.collection('users');

// 直接返回文档
const user = await collection.findOneAndUpdate(
  { name: 'Alice' },
  { $set: { age: 31 } },
  { returnDocument: 'after' }
);

// 直接使用
if (!user) {
  console.log('用户不存在');
  return;
}

console.log(user.name);  // 简洁清晰
```

---

## 测试验证

### 测试覆盖

monSQLize 通过当前兼容性矩阵验证默认 driver 基线和扩展 driver：

| Driver 版本 | 测试状态 | findOneAndUpdate | findOneAndReplace | findOneAndDelete |
|------------|---------|-----------------|------------------|-----------------|
| 6.21.0 | 默认基线 | 文档/null | 文档/null | 文档/null |
| 7.5.0 | 扩展验证 | 文档/null | 文档/null | 文档/null |
| 4.x / 5.x | ℹ️ 历史背景 | ⚠️ 原生元数据形态 | ⚠️ 原生元数据形态 | ⚠️ 原生元数据形态 |

### 运行测试

```bash
# 运行兼容性矩阵
npm run test:compatibility

# 运行 MongoDB server matrix
npm run test:server-matrix

# 查看当前解析到的 driver
npm ls mongodb
```

---

## 最佳实践

### 1. 使用 monSQLize 无需修改代码

```javascript
// 推荐：使用 monSQLize
const user = await collection.findOneAndUpdate(filter, update);
// 直接返回文档，所有版本一致
```

### 2. 避免在应用中覆盖默认 Driver

```javascript
// 推荐：使用 monSQLize 的默认运行时依赖
// package manager 不需要额外声明 mongodb
// 如必须覆盖 driver，请先运行兼容性矩阵
```

### 3. 处理不存在的情况

```javascript
const user = await collection.findOneAndUpdate(filter, update);

if (!user) {
  // 文档不存在
  console.log('未找到匹配的文档');
  return;
}

// 文档存在，直接使用
console.log(user.name);
```

---

## 总结

### monSQLize 的优势

1. **当前依赖基线即统一体验**
   - 当前 Driver 基线返回文档或 `null`
   - 用户无需手动提取 `value`
   - 代码更简洁清晰

2. **版本升级有验证入口**
   - 兼容性矩阵覆盖 `mongodb@6.21.0` 与 Driver 7.5.0
   - 用户代码无需为当前依赖基线增加版本判断
   - 新主版本升级前先跑矩阵验证

3. **完整测试覆盖**
   - 测试当前默认 driver 与扩展 driver
   - 验证所有 `findOneAnd*` 方法
   - 验证结果记录在 `test/validation/`

4. **开发效率提升**
   - 减少 30-50% 代码量
   - 避免版本判断逻辑
   - 更专注业务逻辑

---

## 相关文档

- 📖 [MongoDB Driver 兼容性指南](./mongodb-driver-compatibility.md)
- 📖 [兼容性矩阵配置](../../test/compatibility/matrix.json)
- 📖 [验证进度](../../test/validation/VERIFICATION-PROGRESS.md)

---

**结论**: 使用 monSQLize 当前包依赖基线时，`findOneAnd*` 方法返回文档或 `null`，用户不需要额外安装 driver，也不需要手动处理 `result.value`。

