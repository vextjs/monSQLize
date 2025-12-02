# 数据库操作 API

数据库级别的管理操作，包括列出数据库、删除数据库、列出集合等。

---

## 目录

- [listDatabases()](#listdatabases) - 列出所有数据库
- [dropDatabase()](#dropdatabase) - 删除数据库（危险）
- [listCollections()](#listcollections) - 列出所有集合
- [runCommand()](#runcommand) - 执行任意命令

---

## listDatabases()

列出 MongoDB 服务器上的所有数据库。

### 语法

```javascript
const databases = await db._adapter.listDatabases([options]);
```

### 参数

- **options** (Object, 可选):
  - `nameOnly` (boolean): 仅返回数据库名称，默认 `false`

### 返回值

- **不使用 nameOnly**: `Promise<Array<Object>>`
  - `name` (string): 数据库名称
  - `sizeOnDisk` (number): 磁盘占用（字节）
  - `empty` (boolean): 是否为空
- **使用 nameOnly**: `Promise<Array<string>>`

### 示例

```javascript
// 获取详细信息
const databases = await adapter.listDatabases();
console.log(databases);
// [
//   { name: 'admin', sizeOnDisk: 83886080, empty: false },
//   { name: 'mydb', sizeOnDisk: 167772160, empty: false }
// ]

// 仅获取名称
const dbNames = await adapter.listDatabases({ nameOnly: true });
console.log(dbNames); // ['admin', 'config', 'local', 'mydb']
```

---

## dropDatabase()

**⚠️ 危险操作**：删除整个数据库，无法恢复！

### 安全机制

1. **必须显式确认**: 必须传入 `{ confirm: true }`
2. **生产环境保护**: 生产环境默认禁止，需额外传入 `{ allowProduction: true }`
3. **审计日志**: 所有删除尝试都会记录

### 语法

```javascript
const result = await db._adapter.dropDatabase(databaseName, options);
```

### 参数

- **databaseName** (string, 必需): 数据库名称
- **options** (Object, 必需):
  - `confirm` (boolean, 必需): 必须为 `true`
  - `allowProduction` (boolean): 是否允许在生产环境执行，默认 `false`
  - `user` (string): 操作用户（用于审计）

### 返回值

- **类型**: `Promise<Object>`
- **属性**:
  - `dropped` (boolean): 是否删除成功
  - `database` (string): 被删除的数据库名称
  - `timestamp` (Date): 删除时间

### 示例

#### ❌ 错误：未提供确认

```javascript
try {
    await adapter.dropDatabase('test_db');
} catch (error) {
    console.error(error.message);
    // "dropDatabase requires explicit confirmation..."
}
```

#### ✅ 正确：提供确认

```javascript
const result = await adapter.dropDatabase('test_db', {
    confirm: true,
    user: 'admin@example.com'
});

console.log('Database dropped:', result.database);
console.log('Timestamp:', result.timestamp);
```

#### ⚠️ 生产环境：需要额外确认

```javascript
// 在生产环境（NODE_ENV=production）
const result = await adapter.dropDatabase('prod_db', {
    confirm: true,
    allowProduction: true,
    user: 'admin@example.com'
});
```

### 错误处理

```javascript
try {
    await adapter.dropDatabase('my_database', {
        confirm: true,
        user: 'admin@example.com'
    });
} catch (error) {
    if (error.code === 'CONFIRMATION_REQUIRED') {
        console.error('❌ 缺少确认参数');
    } else if (error.code === 'PRODUCTION_BLOCKED') {
        console.error('❌ 生产环境被阻止');
    } else {
        console.error('❌ 删除失败:', error.message);
    }
}
```

---

## listCollections()

列出当前数据库中的所有集合。

### 语法

```javascript
const collections = await db._adapter.listCollections([options]);
```

### 参数

- **options** (Object, 可选):
  - `nameOnly` (boolean): 仅返回集合名称，默认 `false`

### 返回值

- **不使用 nameOnly**: `Promise<Array<Object>>`
- **使用 nameOnly**: `Promise<Array<string>>`

### 示例

```javascript
// 获取详细信息
const collections = await adapter.listCollections();
console.log(collections);
// [
//   { name: 'users', type: 'collection', options: {}, info: {...} },
//   { name: 'orders', type: 'collection', options: {}, info: {...} }
// ]

// 仅获取名称
const names = await adapter.listCollections({ nameOnly: true });
console.log(names); // ['users', 'orders', 'products']
```

---

## runCommand()

执行任意 MongoDB 命令。

### 语法

```javascript
const result = await db._adapter.runCommand(command, [options]);
```

### 参数

- **command** (Object, 必需): MongoDB 命令对象
- **options** (Object, 可选): 命令选项

### 示例

```javascript
// 执行 ping 命令
const ping = await adapter.runCommand({ ping: 1 });
console.log(ping.ok); // 1

// 执行 dbStats 命令
const stats = await adapter.runCommand({ dbStats: 1, scale: 1024 });
console.log('Collections:', stats.collections);
console.log('Data size (KB):', stats.dataSize);

// 执行 collStats 命令
const collStats = await adapter.runCommand({
    collStats: 'users',
    scale: 1048576 // MB
});
console.log('Count:', collStats.count);
console.log('Size (MB):', collStats.size);
```

---

## 相关文档

- [运维监控](./admin.md) - ping, buildInfo, serverStatus, stats
- [集合管理](./collection-mgmt.md) - 集合级别操作
- [示例代码](../examples/admin.examples.js)

---

**最后更新**: 2025-12-02  
**版本**: v0.3.0

