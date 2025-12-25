# ES Module (import) 支持说明

**版本**: 1.0  
**最后更新**: 2025-01-02

---

## 📑 目录

- [📋 概述](#-概述)
- [🎯 支持的导入方式](#-支持的导入方式)
- [📦 Package.json 配置](#-packagejson-配置)
- [🚀 使用示例](#-使用示例)
- [📚 导入方式对比](#-导入方式对比)
- [🔧 可用的导出](#-可用的导出)
- [🧪 测试 ES Module 支持](#-测试-es-module-支持)
- [💡 最佳实践](#-最佳实践)
- [🎯 迁移指南](#-迁移指南)
- [⚠️ 注意事项](#️-注意事项)
- [📊 兼容性矩阵](#-兼容性矩阵)
- [🎉 总结](#-总结)

---

## �📋 概述

monSQLize 现已完全支持 **ES Module (import)** 和 **CommonJS (require)** 两种导入方式。

---

## 🎯 支持的导入方式

### 方式 1: CommonJS (require) ✅

```javascript
// 传统的 CommonJS 方式
const MonSQLize = require('monsqlize');

const db = new MonSQLize({
  type: 'mongodb',
  config: { uri: 'mongodb://localhost:27017/mydb' }
});

await db.connect();
```

### 方式 2: ES Module (import) ✅ 新增

```javascript
// 现代的 ES Module 方式
import MonSQLize from 'monsqlize';

const db = new MonSQLize({
  type: 'mongodb',
  config: { uri: 'mongodb://localhost:27017/mydb' }
});

await db.connect();
```

---

## 📦 Package.json 配置

monSQLize 的 package.json 已配置双模式支持：

```json
{
  "name": "monsqlize",
  "main": "lib/index.js",        // CommonJS 入口
  "module": "index.mjs",          // ES Module 入口
  "type": "commonjs",
  "exports": {
    ".": {
      "require": "./lib/index.js",  // require() 使用此文件
      "import": "./index.mjs",      // import 使用此文件
      "types": "./index.d.ts"       // TypeScript 类型定义
    }
  }
}
```

---

## 🚀 使用示例

### CommonJS 项目

**文件**: `app.js`

```javascript
const MonSQLize = require('monsqlize');

async function main() {
  const db = new MonSQLize({
    type: 'mongodb',
    databaseName: 'myapp',
    config: {
      uri: 'mongodb://localhost:27017'
    }
  });

  await db.connect();
  
  const users = db.model('users');
  const user = await users.findOne({ name: 'Alice' });
  
  console.log(user);
  
  await db.close();
}

main().catch(console.error);
```

**运行**:
```bash
node app.js
```

---

### ES Module 项目

**文件**: `app.mjs` 或 `app.js` (如果 package.json 中有 `"type": "module"`)

```javascript
import MonSQLize from 'monsqlize';

async function main() {
  const db = new MonSQLize({
    type: 'mongodb',
    databaseName: 'myapp',
    config: {
      uri: 'mongodb://localhost:27017'
    }
  });

  await db.connect();
  
  const users = db.model('users');
  const user = await users.findOne({ name: 'Alice' });
  
  console.log(user);
  
  await db.close();
}

main().catch(console.error);
```

**运行**:
```bash
node app.mjs
# 或
node app.js  # 如果 package.json 中 "type": "module"
```

---

## 📚 导入方式对比

### 默认导出

```javascript
// CommonJS
const MonSQLize = require('monsqlize');

// ES Module
import MonSQLize from 'monsqlize';
```

### 命名导出

```javascript
// CommonJS
const { Logger, MemoryCache } = require('monsqlize');

// ES Module
import { Logger, MemoryCache } from 'monsqlize';
```

### 混合导入

```javascript
// CommonJS
const MonSQLize = require('monsqlize');
const Logger = MonSQLize.Logger;

// ES Module
import MonSQLize, { Logger, MemoryCache } from 'monsqlize';
```

---

## 🔧 可用的导出

### 默认导出

- `MonSQLize` (主类)

### 命名导出

- `MonSQLize` (主类，命名导出)
- `Logger` (日志工具)
- `MemoryCache` (缓存类)
- `createRedisCacheAdapter` (Redis 适配器)
- `TransactionManager` (事务管理器)
- `CacheLockManager` (缓存锁管理器)
- `DistributedCacheInvalidator` (分布式缓存失效器)

---

## 🧪 测试 ES Module 支持

### 运行 ESM 测试

```bash
# 运行 ES Module 导入测试
node test/esm/import.test.mjs
```

### 测试内容

1. ✅ 默认导出 (`import MonSQLize`)
2. ✅ 命名导出 (`import { Logger }`)
3. ✅ 实例创建
4. ✅ 连接和基本操作

---

## 💡 最佳实践

### 1. 选择合适的导入方式

**使用 CommonJS 当**:
- 项目是传统 Node.js 项目
- 需要兼容旧版 Node.js (< 14.x)
- 使用的其他库主要是 CommonJS

**使用 ES Module 当**:
- 新项目，使用现代 JavaScript
- 需要更好的 Tree-shaking 支持
- 使用 TypeScript 或前端构建工具

### 2. TypeScript 支持

monSQLize 提供完整的 TypeScript 类型定义：

```typescript
// CommonJS
import MonSQLize = require('monsqlize');

// ES Module
import MonSQLize from 'monsqlize';

const db: MonSQLize = new MonSQLize({
  type: 'mongodb',
  databaseName: 'myapp',
  config: { uri: '...' }
});
```

### 3. 在 package.json 中声明模块类型

**使用 ES Module**:
```json
{
  "type": "module"
}
```

**使用 CommonJS** (默认):
```json
{
  "type": "commonjs"
}
```

---

## 🎯 迁移指南

### 从 CommonJS 迁移到 ES Module

**步骤 1**: 修改 package.json
```json
{
  "type": "module"
}
```

**步骤 2**: 修改文件扩展名
- `.js` 保持不变（如果 package.json 设置了 "type": "module"）
- 或重命名为 `.mjs`

**步骤 3**: 修改导入语句
```javascript
// 之前 (CommonJS)
const MonSQLize = require('monsqlize');

// 之后 (ES Module)
import MonSQLize from 'monsqlize';
```

**步骤 4**: 修改导出语句
```javascript
// 之前 (CommonJS)
module.exports = myFunction;

// 之后 (ES Module)
export default myFunction;
```

**步骤 5**: 使用顶层 await
```javascript
// ES Module 支持顶层 await
import MonSQLize from 'monsqlize';

const db = new MonSQLize({ ... });
await db.connect();  // 无需包装在 async 函数中
```

---

## ⚠️ 注意事项

### 1. 文件扩展名

- **ES Module**: 使用 `.mjs` 或 `.js` (如果 package.json 设置了 "type": "module")
- **CommonJS**: 使用 `.cjs` 或 `.js` (默认)

### 2. `__dirname` 和 `__filename`

ES Module 中不可用，需要替代方案：

```javascript
// CommonJS
const __dirname = __dirname;

// ES Module
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
```

### 3. require() 不可用

ES Module 中不能使用 `require()`，必须使用 `import`:

```javascript
// ❌ ES Module 中不可用
const fs = require('fs');

// ✅ 正确方式
import fs from 'fs';
```

### 4. 动态导入

```javascript
// CommonJS
const module = require('./module');

// ES Module - 同步导入
import module from './module.js';

// ES Module - 动态导入
const module = await import('./module.js');
```

---

## 📊 兼容性矩阵

| Node.js 版本 | CommonJS | ES Module |
|-------------|----------|-----------|
| 12.x | ✅ 支持 | ⚠️ 实验性 |
| 14.x | ✅ 支持 | ✅ 支持 |
| 16.x | ✅ 支持 | ✅ 支持 |
| 18.x | ✅ 支持 | ✅ 支持 (推荐) |
| 20.x | ✅ 支持 | ✅ 支持 (推荐) |
| 22.x | ✅ 支持 | ✅ 支持 (推荐) |

---

## 🎉 总结

### ✅ monSQLize 现已支持

1. **CommonJS (require)** - 传统方式，兼容性好
2. **ES Module (import)** - 现代方式，更好的优化

### ✅ 特性

- 🔄 双模式支持，无缝切换
- 📦 正确的 package.json 配置
- 🧪 完整的测试覆盖
- 📚 详细的文档说明
- 💡 最佳实践指导

### ✅ 用户无需修改代码

- 现有 CommonJS 项目无需改动
- 新项目可以直接使用 ES Module
- 两种方式功能完全一致

---

**版本要求**: Node.js >= 14.x (ES Module 完整支持)

**推荐版本**: Node.js 18.x 或 20.x (LTS)

