# MongoDB 驱动版本兼容性指南

**文档版本**: 1.0  
**最后更新**: 2025-11-17  
**适用版本**: monSQLize v1.x

---

## 📋 概述

本文档说明 monSQLize 如何处理 MongoDB Node.js 驱动的版本差异，以及如何确保未来驱动升级时的兼容性。

---

## 🎯 当前支持的驱动版本

### 官方支持

| MongoDB 驱动版本 | 支持状态 | 说明 |
|-----------------|---------|------|
| **6.x** | ✅ 完全支持 | 已测试并完全兼容 |
| **5.x** | ⚠️ 理论兼容 | 未经测试，可能存在问题 |
| **7.x+** | ⚠️ 未知 | 未经测试，可能存在未知问题 |

### 依赖声明

`package.json` 中的声明：
```json
{
  "dependencies": {
    "mongodb": "^6.17.0"
  }
}
```

**说明**: 
- `^6.17.0` 表示兼容 6.17.0 到 <7.0.0 的所有版本
- 如需升级到 7.x，请先参考本文档的"升级指南"章节

---

## 🔍 驱动版本差异详解

### findOneAnd* 方法的返回值变化

这是最重要的变化，也是本次修复的核心问题。

#### MongoDB 驱动 5.x 及更早版本

```javascript
const result = await collection.findOneAndUpdate(filter, update);

console.log(result);
// 输出：
// {
//   value: { _id: ..., name: "Alice" },
//   ok: 1,
//   lastErrorObject: { 
//     updatedExisting: true, 
//     n: 1 
//   }
// }
```

**特点**:
- ✅ 默认返回完整元数据
- ✅ 包含 `value`（文档）、`ok`（状态）、`lastErrorObject`（详细信息）
- ✅ 可以直接判断操作是否成功

#### MongoDB 驱动 6.x

```javascript
// 默认行为（不带选项）
const result = await collection.findOneAndUpdate(filter, update);

console.log(result);
// 输出：
// { _id: ..., name: "Alice" }  // 直接返回文档！

// 获取完整元数据（需要显式指定）
const result = await collection.findOneAndUpdate(filter, update, {
  includeResultMetadata: true
});

console.log(result);
// 输出：
// {
//   value: { _id: ..., name: "Alice" },
//   ok: 1,
//   lastErrorObject: { 
//     updatedExisting: true, 
//     n: 1 
//   }
// }
```

**特点**:
- ❌ 默认不返回元数据，直接返回文档
- ✅ 需要 `includeResultMetadata: true` 才返回完整元数据
- ⚠️ **破坏性变更**：旧代码访问 `result.lastErrorObject` 会报错

### 其他受影响的方法

| 方法 | 驱动 5.x | 驱动 6.x | 是否变化 |
|------|---------|---------|---------|
| **findOneAndUpdate** | `{ value, ok, lastErrorObject }` | 文档对象 | ✅ 已变化 |
| **findOneAndReplace** | `{ value, ok, lastErrorObject }` | 文档对象 | ✅ 已变化 |
| **findOneAndDelete** | `{ value, ok, lastErrorObject }` | 文档对象 | ✅ 已变化 |
| **updateOne** | `{ acknowledged, matchedCount, ... }` | 相同 | ❌ 未变化 |
| **updateMany** | `{ acknowledged, matchedCount, ... }` | 相同 | ❌ 未变化 |
| **deleteOne** | `{ acknowledged, deletedCount }` | 相同 | ❌ 未变化 |
| **deleteMany** | `{ acknowledged, deletedCount }` | 相同 | ❌ 未变化 |
| **replaceOne** | `{ acknowledged, matchedCount, ... }` | 相同 | ⚠️ 行为微调* |

**注**: replaceOne 的 `modifiedCount` 计算方式有微调，即使内容相同也可能返回 1。

---

## 🛡️ monSQLize 的兼容性保证

### 核心策略：适配层模式

monSQLize 使用**适配层模式**隔离驱动版本差异：

```
用户代码
    ↓
monSQLize 公共 API（保持不变）
    ↓
result-handler.js（适配层）← 处理驱动差异
    ↓
MongoDB 驱动（可能变化）
```

### 关键实现：result-handler.js

**位置**: `lib/mongodb/writes/result-handler.js`

**职责**:
1. ✅ 统一处理 `findOneAnd*` 的返回值
2. ✅ 自动检测和适配驱动版本差异
3. ✅ 提供一致的 API 行为
4. ✅ 记录异常情况和版本警告

**核心函数**:

```javascript
// 1. 处理返回值格式差异
handleFindOneAndResult(result, options, logger)

// 2. 安全判断文档是否被修改
wasDocumentModified(result)

// 3. 检测驱动版本
detectDriverVersion()

// 4. 输出版本警告
warnUnsupportedDriverVersion(logger)
```

### 版本检测机制

**自动检测**:
- 首次调用 `findOneAnd*` 方法时自动检测驱动版本
- 检测逻辑：读取 `require("mongodb").version` 或 `package.json`

**警告机制**:
```javascript
// 驱动版本 < 6.x
logger.warn("[result-handler] ⚠️ 检测到 MongoDB 驱动版本过旧", {
  detectedVersion: 5,
  supportedVersion: "6.x",
  message: "monSQLize 专为 MongoDB 驱动 6.x 设计，旧版本可能存在兼容性问题",
  recommendation: "建议升级到 MongoDB Node.js 驱动 ^6.0.0"
});

// 驱动版本 > 6.x
logger.warn("[result-handler] ⚠️ 检测到 MongoDB 驱动版本未经测试", {
  detectedVersion: 7,
  testedVersion: "6.x",
  message: "monSQLize 已针对 MongoDB 驱动 6.x 测试，新版本可能存在未知问题",
  recommendation: "如遇问题，请查看技术分析报告或回退到驱动 6.x"
});
```

### 异常情况处理

**场景 1: result 为 null**
```javascript
// 驱动在某些边界情况可能返回 null
handleFindOneAndResult(null, {});
// 返回: null（用户视角正常）

// 日志输出
logger.debug("[result-handler] Result is null/undefined, returning empty result");
```

**场景 2: 缺少 lastErrorObject**
```javascript
// 驱动返回了非预期格式
const result = { _id: 1, name: "Alice" }; // 缺少 value 和 lastErrorObject
handleFindOneAndResult(result, {});

// 自动补充缺失字段
// 日志输出
logger.warn("[result-handler] ⚠️ Result missing lastErrorObject, possible driver version issue", {
  hasValue: false,
  resultKeys: ["_id", "name"],
  driverVersion: 6,
  recommendation: "这可能表明 MongoDB 驱动返回了非预期的格式，请检查驱动版本"
});
```

---

## 🚀 未来驱动升级指南

### 升级前检查清单

当 MongoDB 发布新的主版本驱动时（如 7.x），请按以下步骤操作：

#### 步骤 1：阅读官方文档 ✅

- [ ] 阅读 MongoDB 驱动的 CHANGELOG
- [ ] 重点关注 `findOneAnd*` 方法的变更
- [ ] 查看是否有其他破坏性变更

**官方资源**:
- [MongoDB Node.js Driver Release Notes](https://github.com/mongodb/node-mongodb-native/releases)
- [Migration Guide](https://www.mongodb.com/docs/drivers/node/current/whats-new/)

#### 步骤 2：本地测试 ✅

```bash
# 1. 创建测试分支
git checkout -b test/mongodb-driver-upgrade

# 2. 升级驱动
npm install mongodb@^7.0.0

# 3. 运行完整测试套件
npm test

# 4. 检查测试结果
# - 关注 findOneAndUpdate 测试（22 个）
# - 关注 findOneAndDelete 测试（18 个）
# - 关注 findOneAndReplace 测试（20 个）
# - 关注 replaceOne 测试（24 个）
```

#### 步骤 3：检查日志输出 ✅

```bash
# 运行测试并查看警告日志
npm test 2>&1 | grep "result-handler"

# 查找版本警告
npm test 2>&1 | grep "检测到 MongoDB 驱动版本"
```

#### 步骤 4：修复兼容性问题 ✅

**如果测试失败**:

1. **定位问题**:
   ```bash
   # 运行特定测试套件
   npm test -- --grep "findOneAndUpdate"
   ```

2. **分析错误**:
   - 是否是返回值格式变化？
   - 是否是新增/删除的字段？
   - 是否是行为逻辑变化？

3. **修改适配层**:
   - 优先修改 `result-handler.js`
   - 保持公共 API 不变
   - 添加新的驱动版本检测逻辑

4. **更新文档**:
   - 更新本文档的"支持的驱动版本"
   - 更新 CHANGELOG.md
   - 更新 API 文档中的兼容性说明

#### 步骤 5：回归测试 ✅

```bash
# 完整测试套件
npm test

# 覆盖率检查
npm run coverage

# 确保没有回归问题
```

### 修复示例：如何适配驱动 7.x（假设）

假设 MongoDB 驱动 7.x 再次改变了返回值格式：

**场景**: 驱动 7.x 返回 `{ document, metadata }` 格式

```javascript
// lib/mongodb/writes/result-handler.js

function handleFindOneAndResult(result, options = {}, logger = null) {
    const driverVersion = detectDriverVersion();
    
    // 驱动 7.x 的新格式
    if (driverVersion >= 7) {
        // 适配新格式
        if (result && result.document !== undefined) {
            // 转换为统一格式
            result = {
                value: result.document,
                ok: 1,
                lastErrorObject: result.metadata || { n: result.document ? 1 : 0 }
            };
        }
    }
    
    // 驱动 6.x 的处理逻辑（保持不变）
    // ...existing code...
    
    // 统一返回
    if (options.includeResultMetadata) {
        return result;
    } else {
        return result.value !== undefined ? result.value : null;
    }
}
```

**关键点**:
- ✅ 仅修改 `result-handler.js`
- ✅ 公共 API 保持不变
- ✅ 用户代码无需修改

---

## 📊 测试策略

### 测试覆盖范围

| 测试类型 | 测试用例数 | 说明 |
|---------|-----------|------|
| **findOneAndUpdate** | 22 | 覆盖所有选项和边界情况 |
| **findOneAndDelete** | 18 | 覆盖排序、projection 等 |
| **findOneAndReplace** | 20 | 覆盖 upsert、缓存等 |
| **replaceOne** | 24 | 覆盖驱动行为变化 |
| **其他写操作** | 100+ | 确保无回归 |

### 关键测试场景

**必须测试的场景**:
1. ✅ 找到文档并修改
2. ✅ 未找到文档（返回 null）
3. ✅ upsert 插入新文档
4. ✅ 返回更新前的文档（`returnDocument: "before"`）
5. ✅ 返回更新后的文档（`returnDocument: "after"`）
6. ✅ 包含完整元数据（`includeResultMetadata: true`）
7. ✅ 缓存自动失效
8. ✅ 并发安全性

### 自动化测试命令

```bash
# 运行所有测试
npm test

# 仅运行 findOneAnd* 测试
npm test -- --grep "findOneAnd"

# 测试覆盖率
npm run coverage

# 查看覆盖率报告
open coverage/index.html  # macOS
start coverage/index.html  # Windows
```

---

## 🔧 开发者指南

### 添加新的 findOneAnd* 风格方法

如果未来需要添加类似的方法（如自定义的 `findOneAndModify`），请遵循以下模式：

```javascript
// lib/mongodb/writes/custom-find-one-and-modify.js

const { handleFindOneAndResult, wasDocumentModified } = require("./result-handler");

async function customFindOneAndModify(filter, modification, options = {}) {
    const { logger } = this.context;
    
    try {
        // 1. 强制获取完整元数据
        const driverOptions = { ...options, includeResultMetadata: true };
        
        // 2. 调用 MongoDB 驱动
        const result = await nativeCollection.customMethod(filter, modification, driverOptions);
        
        // 3. 判断是否需要失效缓存
        const wasModified = wasDocumentModified(result);
        if (cache && wasModified) {
            // 缓存失效逻辑
        }
        
        // 4. 使用统一的返回值处理（传递 logger）
        return handleFindOneAndResult(result, options, logger);
        
    } catch (error) {
        // 错误处理
    }
}
```

**关键点**:
- ✅ 使用 `includeResultMetadata: true`
- ✅ 使用 `wasDocumentModified()` 判断缓存失效
- ✅ 使用 `handleFindOneAndResult()` 处理返回值
- ✅ 传递 `logger` 参数用于诊断

---

## 📖 相关资源

### 内部文档

- **技术分析报告**: `analysis-reports/2025-11-17-mongodb-driver-6x-compatibility-FINAL.md`
  - 详细的问题分析
  - 修复方案对比
  - 经验教训和最佳实践

- **API 文档**:
  - `docs/find-one-and-update.md` - 包含兼容性说明
  - `docs/find-one-and-replace.md` - 包含兼容性说明
  - `docs/find-one-and-delete.md` - 包含兼容性说明

### 外部资源

- [MongoDB Node.js Driver Documentation](https://www.mongodb.com/docs/drivers/node/current/)
- [MongoDB Node.js Driver GitHub](https://github.com/mongodb/node-mongodb-native)
- [MongoDB Driver Release Notes](https://github.com/mongodb/node-mongodb-native/releases)

---

## ❓ FAQ

### Q1: 如果我使用的是 MongoDB 驱动 5.x，会有问题吗？

**A**: 理论上可以工作，但未经充分测试。建议升级到 6.x：

```bash
npm install mongodb@^6.17.0
```

如果必须使用 5.x，请运行完整测试套件确认兼容性。

### Q2: 如何知道当前使用的驱动版本？

**A**: 检查 `package-lock.json` 或运行：

```bash
npm list mongodb
```

或在代码中：

```javascript
const mongodb = require("mongodb");
console.log("MongoDB Driver Version:", mongodb.version);
```

### Q3: 升级到驱动 7.x 后测试失败，怎么办？

**A**: 按照"未来驱动升级指南"操作：

1. 查看失败的测试套件（特别是 `findOneAnd*`）
2. 分析错误日志
3. 修改 `result-handler.js` 适配新格式
4. 保持公共 API 不变

如需帮助，请参考技术分析报告或提交 Issue。

### Q4: 为什么只有 findOneAnd* 方法受影响？

**A**: 因为这些方法的返回值格式比较复杂（包含元数据），而其他方法（如 `updateOne`）的返回值格式简单且未变化。

### Q5: 未来会支持多个驱动版本吗？

**A**: 目前不计划支持多版本。原因：

- ✅ 增加维护成本
- ✅ 增加测试复杂度
- ✅ MongoDB 驱动遵循语义化版本，主版本间差异明确

推荐做法：随 MongoDB 驱动主版本升级而升级 monSQLize。

---

## 📝 更新日志

| 日期 | 版本 | 变更 |
|------|------|------|
| 2025-11-17 | 1.0 | 初始版本 - 添加驱动 6.x 兼容性说明 |

---

**维护者**: monSQLize 开发团队  
**联系方式**: 通过 GitHub Issues 提问  
**最后审核**: 2025-11-17

