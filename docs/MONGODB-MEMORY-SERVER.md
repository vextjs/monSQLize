# MongoDB Memory Server - 配置使用指南

## 🚀 快速开始

### 测试代码

```javascript
const MonSQLize = require('../../lib');

const msq = new MonSQLize({
  type: 'mongodb',
  databaseName: 'test_db',
  config: { 
    useMemoryServer: true  // 🔑 启用内存数据库
  }
});

await msq.connect();  // 自动使用内存 MongoDB
```

### 生产代码

```javascript
const msq = new MonSQLize({
  type: 'mongodb',
  databaseName: 'prod_db',
  config: { 
    uri: process.env.MONGODB_URI  // 使用真实数据库
  }
});
```

---

## 📊 配置参数

| 参数 | 类型 | 默认值 | 说明 |
|-----|------|-------|------|
| `useMemoryServer` | boolean | `false` | 是否使用内存数据库 |
| `uri` | string | - | MongoDB 连接 URI |

**优先级**: 当 `useMemoryServer: true` 时，会忽略 `uri` 参数

---

## ✨ 特性

✅ **配置驱动**：通过配置参数显式控制  
✅ **单例模式**：所有测试共享一个实例  
✅ **零风险**：生产环境不会误用  
✅ **高性能**：启动仅需 3 秒，后续 <1ms  

---

## 📝 使用场景

### 场景 1: 单元测试

```javascript
config: { useMemoryServer: true }
```

### 场景 2: 集成测试

```javascript
config: { uri: 'mongodb://staging:27017' }
```

### 场景 3: 生产环境

```javascript
config: { uri: process.env.MONGODB_URI }
```

---

## 🔧 工作原理

```
测试代码
  ↓ config: { useMemoryServer: true }
lib/mongodb/connect.js
  ↓ 检测到 useMemoryServer
  ↓ 启动内存 MongoDB（单例）
  ↓ 返回内存数据库 URI
MongoClient
  ↓ 连接到内存数据库
测试执行
```

---

## 📈 性能

- **首次启动**: ~3 秒
- **后续使用**: <1 毫秒（单例）
- **connection 套件**: 0.43 秒
- **find 套件**: 0.51 秒
- **findPage 套件**: 0.50 秒

---

## 🔗 相关文档

- [完整报告](./2025-11-05-config-driven-mongodb-memory-server.md)
- [测试文档](../test/README.md)
- [CHANGELOG](../CHANGELOG.md)

---

**版本**: 1.0（配置驱动）  
**更新**: 2025-11-05

