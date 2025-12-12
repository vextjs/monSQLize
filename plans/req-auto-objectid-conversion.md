# 需求文档：自动 ObjectId 转换

> **需求编号**: REQ-001  
> **需求类型**: req-（新功能）  
> **创建日期**: 2025-12-12  
> **负责人**: 待定  
> **状态**: 💡 提议  
> **优先级**: P1

---

## 📑 目录

- [需求概述](#需求概述)
- [目标](#目标)
- [背景说明](#背景说明)
- [方案设计](#方案设计)
- [实现清单](#实现清单)
- [影响范围](#影响范围)
- [验证方式](#验证方式)
- [风险评估](#风险评估)
- [相关文档](#相关文档)

---

## 需求概述

在所有 CRUD 操作中，自动检测并转换 ObjectId 字符串为 ObjectId 实例，无需手动调用 `new ObjectId()`。

**简化前**：
```javascript
await msq.collection('users').findOne({ 
  _id: new ObjectId('507f1f77bcf86cd799439011') 
});
```

**简化后**：
```javascript
await msq.collection('users').findOne({ 
  _id: '507f1f77bcf86cd799439011' // 自动转换
});
```

---

## 目标

### 主要目标

1. **自动转换 ObjectId 字符串**
   - 检测所有查询条件中的 ObjectId 字符串
   - 自动转换为 ObjectId 实例
   - 支持深层嵌套对象

2. **保持向后兼容**
   - 已有代码无需修改
   - 支持混合使用（字符串 + ObjectId 实例）
   - 不影响现有性能

3. **智能检测**
   - 仅转换符合 ObjectId 格式的字符串（24位十六进制）
   - 避免误转换普通字符串
   - 支持数组中的 ObjectId 字符串（如 `$in`）

### 次要目标

4. **完整的测试覆盖**
   - 单元测试：转换逻辑
   - 集成测试：CRUD 操作
   - 边界测试：错误格式处理

5. **清晰的文档**
   - API 文档说明自动转换行为
   - 迁移指南（如有破坏性变更）
   - 性能影响说明

---

## 背景说明

### 当前问题

1. **代码冗余**
   ```javascript
   // 每次都要手动转换
   const user = await msq.collection('users').findOne({ 
     _id: new ObjectId(userId) 
   });
   
   // 复杂查询更繁琐
   const users = await msq.collection('users').find({ 
     _id: { $in: ids.map(id => new ObjectId(id)) },
     managerId: new ObjectId(managerId)
   });
   ```

2. **容易遗漏**
   - 忘记转换导致查询失败
   - 字符串与 ObjectId 类型不匹配

3. **快捷方法有限**
   - `findOneById()` 只解决单 ID 查询
   - `findByIds()` 只解决多 ID 查询
   - 其他场景仍需手动转换

### 用户反馈

- "每次都要写 `new ObjectId()` 太麻烦"
- "希望像 Mongoose 一样自动转换"
- "有时忘记转换，调试很久才发现"

### 业界实践

**Mongoose**：
```javascript
// Mongoose 自动转换 _id 字段
const user = await User.findOne({ _id: '507f1f77bcf86cd799439011' });
```

**Prisma**：
```javascript
// Prisma 自动处理 ID 类型
const user = await prisma.user.findUnique({ 
  where: { id: '507f1f77bcf86cd799439011' } 
});
```

---

## 方案设计

### 方案1：查询预处理（推荐）⭐

**核心思路**：在执行查询前，递归遍历查询对象，检测并转换 ObjectId 字符串。

#### 实现位置

在 `lib/collection-wrapper.js` 中添加预处理函数：

```javascript
// lib/utils/objectid-converter.js（新增文件）
const { ObjectId } = require('mongodb');

/**
 * 检测字符串是否为有效的 ObjectId 格式
 * @param {string} str - 待检测字符串
 * @returns {boolean}
 */
function isValidObjectIdString(str) {
  if (typeof str !== 'string') return false;
  // 24位十六进制字符
  return /^[0-9a-fA-F]{24}$/.test(str);
}

/**
 * 递归转换查询对象中的 ObjectId 字符串
 * @param {*} obj - 查询对象
 * @returns {*} 转换后的对象
 */
function convertObjectIdStrings(obj) {
  if (obj === null || obj === undefined) {
    return obj;
  }

  // 已经是 ObjectId 实例，直接返回
  if (obj instanceof ObjectId) {
    return obj;
  }

  // 字符串：检测是否为 ObjectId 格式
  if (typeof obj === 'string') {
    return isValidObjectIdString(obj) ? new ObjectId(obj) : obj;
  }

  // 数组：递归处理每个元素
  if (Array.isArray(obj)) {
    return obj.map(item => convertObjectIdStrings(item));
  }

  // 对象：递归处理每个属性
  if (typeof obj === 'object') {
    const converted = {};
    for (const [key, value] of Object.entries(obj)) {
      converted[key] = convertObjectIdStrings(value);
    }
    return converted;
  }

  // 其他类型（数字、布尔等）直接返回
  return obj;
}

module.exports = {
  isValidObjectIdString,
  convertObjectIdStrings,
};
```

#### 集成到 CRUD 方法

```javascript
// lib/collection-wrapper.js
const { convertObjectIdStrings } = require('./utils/objectid-converter');

class CollectionWrapper {
  // ...existing code...

  async findOne(filter = {}, options = {}) {
    // 自动转换 ObjectId 字符串
    const convertedFilter = convertObjectIdStrings(filter);
    
    // 原有逻辑
    const result = await this._collection.findOne(convertedFilter, options);
    // ...existing code...
  }

  async find(filter = {}, options = {}) {
    const convertedFilter = convertObjectIdStrings(filter);
    // ...existing code...
  }

  async updateOne(filter, update, options = {}) {
    const convertedFilter = convertObjectIdStrings(filter);
    // update 中的 ObjectId 也需要转换
    const convertedUpdate = convertObjectIdStrings(update);
    // ...existing code...
  }

  // 其他方法类似处理
}
```

#### 优点

- ✅ **透明转换**：用户无感知，自动处理
- ✅ **完全兼容**：已有代码无需修改
- ✅ **智能检测**：只转换符合格式的字符串
- ✅ **深度支持**：支持嵌套对象和数组
- ✅ **性能可控**：只在查询时转换，开销可接受

#### 缺点

- ⚠️ **性能开销**：每次查询都需要递归遍历
- ⚠️ **潜在误转换**：24位十六进制字符串可能被误判

---

### 方案2：字段级配置

**核心思路**：为集合配置哪些字段需要自动转换。

```javascript
// 配置示例
msq.collection('users', {
  objectIdFields: ['_id', 'managerId', 'departmentId']
});

// 使用
await msq.collection('users').findOne({ 
  _id: '507f1f77bcf86cd799439011', // 自动转换
  managerId: '507f1f77bcf86cd799439012', // 自动转换
  name: 'John' // 不转换
});
```

#### 优点

- ✅ **精确控制**：明确指定转换字段
- ✅ **避免误转换**：不会转换非 ObjectId 字段
- ✅ **性能更好**：只检查指定字段

#### 缺点

- ❌ **配置繁琐**：每个集合都要配置
- ❌ **灵活性差**：动态字段无法处理
- ❌ **不够透明**：需要用户额外配置

---

### 方案3：全局开关

**核心思路**：提供全局开关，用户选择是否启用自动转换。

```javascript
// 全局配置
const msq = new MonSQLize(url, {
  autoConvertObjectId: true // 默认开启
});

// 单个操作禁用
await msq.collection('users').findOne(
  { _id: '507f1f77bcf86cd799439011' },
  { autoConvertObjectId: false } // 禁用
);
```

#### 优点

- ✅ **灵活控制**：可全局或单次操作控制
- ✅ **向后兼容**：可以选择不启用

#### 缺点

- ⚠️ **配置复杂**：增加配置项
- ⚠️ **行为不一致**：不同配置下行为不同

---

### 推荐方案

**方案1（查询预处理）+ 方案3（全局开关）**

**实现策略**：
1. 默认启用自动转换
2. 提供全局开关 `autoConvertObjectId: true|false`
3. 支持单个操作禁用

**配置示例**：
```javascript
// 全局启用（默认）
const msq = new MonSQLize(url);

// 全局禁用
const msq = new MonSQLize(url, {
  autoConvertObjectId: false
});

// 单个操作禁用
await msq.collection('users').findOne(
  { _id: '507f1f77bcf86cd799439011' },
  { skipObjectIdConversion: true }
);
```

---

## 实现清单

### 阶段1：核心功能（4-6小时）

| # | 任务 | 文件 | 状态 |
|---|------|------|------|
| 1 | 创建 ObjectId 转换工具 | lib/utils/objectid-converter.js | 📋 待开始 |
| 2 | 集成到 CollectionWrapper | lib/collection-wrapper.js | 📋 待开始 |
| 3 | 添加全局配置支持 | lib/index.js | 📋 待开始 |
| 4 | 添加单操作配置支持 | lib/collection-wrapper.js | 📋 待开始 |

### 阶段2：测试覆盖（6-8小时）

| # | 任务 | 文件 | 状态 |
|---|------|------|------|
| 5 | 单元测试：转换逻辑 | test/unit/objectid-converter.test.js | 📋 待开始 |
| 6 | 集成测试：CRUD 操作 | test/integration/auto-objectid.test.js | 📋 待开始 |
| 7 | 边界测试：错误格式 | test/edge-cases/objectid-conversion.test.js | 📋 待开始 |
| 8 | 性能测试：转换开销 | test/performance/objectid-conversion.bench.js | 📋 待开始 |

### 阶段3：文档更新（2-3小时）

| # | 任务 | 文件 | 状态 |
|---|------|------|------|
| 9 | API 文档更新 | docs/auto-objectid-conversion.md | 📋 待开始 |
| 10 | README 更新 | README.md | 📋 待开始 |
| 11 | 迁移指南（如需要） | docs/migration-guide.md | 📋 待开始 |

### 阶段4：示例代码（1-2小时）

| # | 任务 | 文件 | 状态 |
|---|------|------|------|
| 12 | 基础示例 | examples/auto-objectid-conversion.examples.js | 📋 待开始 |
| 13 | 复杂场景示例 | examples/advanced-objectid-usage.examples.js | 📋 待开始 |

**预估总工作量**：13-19 小时

---

## 影响范围

### 影响模块

1. **lib/utils/objectid-converter.js**（新增）
   - ObjectId 检测逻辑
   - 递归转换逻辑

2. **lib/collection-wrapper.js**（修改）
   - 所有 CRUD 方法集成转换逻辑
   - 受影响方法（18个）：
     - findOne, find, findPage
     - updateOne, updateMany, replaceOne
     - deleteOne, deleteMany
     - findOneAndUpdate, findOneAndReplace, findOneAndDelete
     - insertOne, insertMany（update 字段）
     - aggregate（pipeline 中的 $match）
     - count, distinct

3. **lib/index.js**（修改）
   - 添加全局配置 `autoConvertObjectId`

### 影响接口

**无破坏性变更**：
- 已有代码无需修改
- `new ObjectId()` 仍然有效
- 字符串和 ObjectId 实例可混合使用

**新增行为**：
- ObjectId 字符串自动转换为 ObjectId 实例

### 兼容性

✅ **完全向后兼容**

- 现有代码无需修改
- 性能影响 < 5%（仅在有 ObjectId 字符串时）
- 可通过配置禁用

---

## 验证方式

### 单元测试

**测试文件**：`test/unit/objectid-converter.test.js`

**测试用例**：

1. **基础转换**
   ```javascript
   it('应该转换有效的 ObjectId 字符串', () => {
     const input = '507f1f77bcf86cd799439011';
     const result = convertObjectIdStrings(input);
     expect(result).toBeInstanceOf(ObjectId);
   });
   ```

2. **不转换无效字符串**
   ```javascript
   it('不应该转换无效的字符串', () => {
     const input = 'invalid-id';
     const result = convertObjectIdStrings(input);
     expect(result).toBe(input);
   });
   ```

3. **深度嵌套对象**
   ```javascript
   it('应该转换嵌套对象中的 ObjectId', () => {
     const input = {
       filter: {
         _id: '507f1f77bcf86cd799439011',
         $or: [
           { managerId: '507f1f77bcf86cd799439012' }
         ]
       }
     };
     const result = convertObjectIdStrings(input);
     expect(result.filter._id).toBeInstanceOf(ObjectId);
     expect(result.filter.$or[0].managerId).toBeInstanceOf(ObjectId);
   });
   ```

4. **数组中的 ObjectId**
   ```javascript
   it('应该转换 $in 数组中的 ObjectId', () => {
     const input = {
       _id: { $in: ['507f1f77bcf86cd799439011', '507f1f77bcf86cd799439012'] }
     };
     const result = convertObjectIdStrings(input);
     expect(result._id.$in[0]).toBeInstanceOf(ObjectId);
   });
   ```

### 集成测试

**测试文件**：`test/integration/auto-objectid.test.js`

**测试场景**：

1. **findOne 自动转换**
   ```javascript
   it('findOne 应该自动转换 ObjectId 字符串', async () => {
     const insertResult = await collection.insertOne({ name: 'Test' });
     const idString = insertResult.insertedId.toString();
     
     // 使用字符串查询
     const result = await collection.findOne({ _id: idString });
     expect(result).toBeDefined();
     expect(result.name).toBe('Test');
   });
   ```

2. **复杂查询自动转换**
   ```javascript
   it('应该转换复杂查询中的 ObjectId', async () => {
     // 插入测试数据
     const user1 = await collection.insertOne({ name: 'User1' });
     const user2 = await collection.insertOne({ name: 'User2' });
     
     // 使用 $in 查询
     const result = await collection.find({
       _id: { 
         $in: [
           user1.insertedId.toString(), 
           user2.insertedId.toString()
         ] 
       }
     }).toArray();
     
     expect(result).toHaveLength(2);
   });
   ```

3. **update 自动转换**
   ```javascript
   it('updateOne 应该自动转换 filter 和 update 中的 ObjectId', async () => {
     const insertResult = await collection.insertOne({ 
       name: 'Test',
       managerId: null
     });
     
     const managerId = new ObjectId().toString();
     
     await collection.updateOne(
       { _id: insertResult.insertedId.toString() },
       { $set: { managerId: managerId } }
     );
     
     const updated = await collection.findOne({ 
       _id: insertResult.insertedId 
     });
     
     expect(updated.managerId).toBeInstanceOf(ObjectId);
   });
   ```

### 性能测试

**测试文件**：`test/performance/objectid-conversion.bench.js`

**测试目标**：转换开销 < 5%

**测试场景**：

1. **简单查询**
   - 1000次 findOne，对比转换前后耗时

2. **复杂查询**
   - 1000次复杂 find，包含嵌套对象和数组

3. **批量操作**
   - 批量 updateMany，包含多个 ObjectId 字段

---

## 风险评估

### 技术风险

| 风险 | 等级 | 影响 | 缓解措施 |
|------|------|------|---------|
| **误转换普通字符串** | 🟡 中 | 查询失败 | 严格检测格式（24位十六进制） |
| **性能影响** | 🟡 中 | 查询变慢 | 性能测试，优化递归算法 |
| **深度嵌套性能** | 🟢 低 | 极深对象变慢 | 限制递归深度（如 10 层） |
| **与现有代码冲突** | 🟢 低 | 行为不一致 | 提供禁用选项 |

### 兼容性风险

| 风险 | 等级 | 影响 | 缓解措施 |
|------|------|------|---------|
| **破坏现有代码** | 🟢 低 | 无 | 完全向后兼容 |
| **与 MongoDB 驱动冲突** | 🟢 低 | 无 | 使用官方 ObjectId |
| **类型推导问题** | 🟡 中 | TypeScript 报错 | 更新类型定义 |

### 用户接受度风险

| 风险 | 等级 | 影响 | 缓解措施 |
|------|------|------|---------|
| **用户不习惯自动转换** | 🟢 低 | 混淆 | 详细文档说明 |
| **误认为是 Bug** | 🟢 低 | 支持成本 | 清晰的发布说明 |

**总体风险**: 🟢 **低风险**，可安全实施

---

## 性能影响分析

### 转换开销

**算法复杂度**：
- 时间复杂度：O(n)，n 为对象属性总数
- 空间复杂度：O(d)，d 为对象深度

**预估影响**：

| 场景 | 转换前 | 转换后 | 增加 |
|------|--------|--------|------|
| 简单查询（1个字段） | 1ms | 1.05ms | +5% |
| 复杂查询（10个字段） | 2ms | 2.1ms | +5% |
| 深度嵌套（5层） | 3ms | 3.2ms | +7% |

**优化策略**：

1. **缓存检测结果**
   ```javascript
   const objectIdCache = new WeakMap();
   
   function isObjectIdCached(str) {
     if (objectIdCache.has(str)) {
       return objectIdCache.get(str);
     }
     const result = isValidObjectIdString(str);
     objectIdCache.set(str, result);
     return result;
   }
   ```

2. **限制递归深度**
   ```javascript
   function convertObjectIdStrings(obj, depth = 0) {
     if (depth > 10) return obj; // 限制10层
     // ...existing code...
   }
   ```

3. **跳过已知安全字段**
   ```javascript
   const SAFE_FIELDS = new Set(['$set', '$inc', '$push']);
   
   for (const [key, value] of Object.entries(obj)) {
     if (SAFE_FIELDS.has(key) && typeof value === 'object') {
       // 递归但不转换 key 本身
       converted[key] = convertObjectIdStrings(value);
     }
   }
   ```

---

## 替代方案

### 方案A：不实现（保持现状）

**优点**：
- ✅ 无开发成本
- ✅ 无风险

**缺点**：
- ❌ 用户体验差
- ❌ 代码冗余

**结论**：不推荐

---

### 方案B：仅扩展快捷方法

**实现**：
```javascript
// 新增更多快捷方法
findByIdString(idString) {
  return this.findOne({ _id: new ObjectId(idString) });
}

updateByIdString(idString, update) {
  return this.updateOne({ _id: new ObjectId(idString) }, update);
}
```

**优点**：
- ✅ 实现简单
- ✅ 无性能影响

**缺点**：
- ❌ 方法爆炸（需要为每个操作添加）
- ❌ 只解决 _id 字段

**结论**：不推荐

---

## 完成日期

**预计完成**: 2025-12-20  
**实际完成**: 待定

---

## 相关文档

- [STATUS.md](../STATUS.md) - 需求状态追踪
- [CHANGELOG.md](../CHANGELOG.md) - 版本变更日志
- [MongoDB ObjectId 文档](https://www.mongodb.com/docs/manual/reference/method/ObjectId/)
- [monSQLize API 文档](../README.md)

---

## 附录

### A. ObjectId 格式说明

**标准格式**：24位十六进制字符串

```
507f1f77bcf86cd799439011
├─────┬─────┤├──┬──┤├──┬──┤
│     │      │   │   │   └─ 3字节计数器
│     │      │   │   └───── 2字节进程ID
│     │      │   └───────── 2字节机器ID
│     │      └───────────── 时间戳（秒）
│     └──────────────────── 4字节时间戳
└────────────────────────── 前8位为时间戳（秒）
```

**检测正则**：`/^[0-9a-fA-F]{24}$/`

### B. 边界情况处理

| 情况 | 处理方式 |
|------|---------|
| 24位十六进制字符串 | ✅ 转换为 ObjectId |
| 23位或25位字符串 | ❌ 不转换 |
| 24位非十六进制字符串 | ❌ 不转换 |
| ObjectId 实例 | ✅ 直接返回 |
| null/undefined | ✅ 直接返回 |
| 数字/布尔 | ✅ 直接返回 |

### C. 测试用例矩阵

| 输入类型 | 示例 | 期望输出 |
|---------|------|---------|
| 有效 ObjectId 字符串 | `'507f1f77bcf86cd799439011'` | ObjectId 实例 |
| 无效字符串 | `'invalid-id'` | 原字符串 |
| ObjectId 实例 | `new ObjectId()` | 原实例 |
| 嵌套对象 | `{ _id: '507f...' }` | `{ _id: ObjectId(...) }` |
| 数组 | `['507f...', '508f...']` | `[ObjectId(...), ObjectId(...)]` |
| $in 操作符 | `{ $in: ['507f...'] }` | `{ $in: [ObjectId(...)] }` |
| null | `null` | `null` |
| undefined | `undefined` | `undefined` |

---

**文档版本**: 1.0  
**最后更新**: 2025-12-12  
**状态**: 💡 提议中

