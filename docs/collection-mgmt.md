# 集合管理 API

集合级别的管理操作，包括统计、重命名、修改属性等。

---

## 目录

- [stats()](#stats) - 获取集合统计
- [renameCollection()](#renamecollection) - 重命名集合
- [collMod()](#collmod) - 修改集合属性
- [convertToCapped()](#converttocapped) - 转换为固定大小集合
- [createCollection()](#createcollection) - 创建特殊集合

---

## stats()

获取集合的统计信息。

### 语法

```javascript
const stats = await collection.stats([options]);
```

### 参数

- **options** (Object, 可选):
  - `scale` (number): 缩放因子（1=字节, 1024=KB, 1048576=MB）

### 返回值

```javascript
{
    ns: 'mydb.users',          // 命名空间
    count: 1000,                // 文档数量
    size: 524288,               // 数据大小
    storageSize: 1048576,       // 存储大小
    totalIndexSize: 102400,     // 索引总大小
    avgObjSize: 524,            // 平均文档大小
    indexSizes: {               // 各索引大小
        _id_: 32768,
        email_1: 40960
    },
    nindexes: 2,                // 索引数量
    scaleFactor: 1              // 缩放因子
}
```

### 示例

```javascript
// 基础使用
const stats = await collection.stats();
console.log('文档数:', stats.count);
console.log('数据大小:', stats.size, 'bytes');
console.log('索引大小:', stats.totalIndexSize, 'bytes');

// 使用 MB 为单位
const statsMB = await collection.stats({ scale: 1048576 });
console.log('数据大小:', statsMB.size, 'MB');
console.log('索引大小:', statsMB.totalIndexSize, 'MB');
```

---

## renameCollection()

重命名集合。

### 语法

```javascript
await collection.renameCollection(newName, [options]);
```

### 参数

- **newName** (string, 必需): 新集合名称
- **options** (Object, 可选):
  - `dropTarget` (boolean): 如果目标已存在，是否删除，默认 `false`

### 示例

```javascript
// 基础重命名
await collection.renameCollection('users_new');

// 覆盖已存在的目标集合
await collection.renameCollection('users_backup', {
    dropTarget: true
});
```

---

## collMod()

修改集合属性。

### 语法

```javascript
await collection.collMod(modifications);
```

### 参数

- **modifications** (Object, 必需):
  - `validator` (Object): 新的验证规则
  - `validationLevel` (string): 验证级别
  - `validationAction` (string): 验证行为
  - `index` (Object): 索引修改

### 示例

```javascript
// 修改验证级别
await collection.collMod({
    validationLevel: 'moderate'
});

// 修改 TTL 索引过期时间
await collection.collMod({
    index: {
        keyPattern: { createdAt: 1 },
        expireAfterSeconds: 7200 // 2小时
    }
});
```

---

## convertToCapped()

将普通集合转换为固定大小集合。

### 语法

```javascript
await collection.convertToCapped(size, [options]);
```

### 参数

- **size** (number, 必需): 集合大小（字节）
- **options** (Object, 可选):
  - `max` (number): 最大文档数

### 示例

```javascript
// 转换为 10MB 固定大小集合
await collection.convertToCapped(10485760);

// 限制最大文档数
await collection.convertToCapped(10485760, { max: 5000 });
```

---

## createCollection()

创建特殊类型的集合。

### 固定大小集合（Capped Collection）

```javascript
const adapter = db._adapter;

await adapter.db.createCollection('logs', {
    capped: true,
    size: 10485760,  // 10MB
    max: 5000        // 最多5000个文档
});
```

**特点**:
- 固定大小，自动删除最老的文档
- 适合日志、消息队列等场景
- 插入性能高

### 时间序列集合（Time-Series，MongoDB 5.0+）

```javascript
await adapter.db.createCollection('measurements', {
    timeseries: {
        timeField: 'timestamp',
        metaField: 'sensor',
        granularity: 'seconds'
    }
});
```

**特点**:
- 优化时序数据存储
- 自动压缩和聚合
- 适合IoT、监控数据

---

## 完整示例

```javascript
const MonSQLize = require('monsqlize');

async function manageCollection() {
    const db = new MonSQLize({
        type: 'mongodb',
        config: { uri: 'mongodb://localhost:27017/mydb' }
    });
    
    await db.connect();
    const { collection } = await db.connect();
    const users = collection('users');
    
    // 1. 获取集合统计
    const stats = await users.stats({ scale: 1048576 }); // MB
    console.log('=== 集合统计 ===');
    console.log('文档数:', stats.count);
    console.log('数据大小:', stats.size, 'MB');
    console.log('索引数:', stats.nindexes);
    console.log('索引大小:', stats.totalIndexSize, 'MB');
    
    // 2. 分析索引占比
    const indexRatio = (stats.totalIndexSize / stats.size) * 100;
    console.log('索引占比:', indexRatio.toFixed(2), '%');
    
    if (indexRatio > 50) {
        console.warn('⚠️ 索引占用过高，考虑优化');
    }
    
    // 3. 重命名集合（如需要）
    // await users.renameCollection('users_v2');
    
    // 4. 修改验证级别
    await users.collMod({
        validationLevel: 'moderate'
    });
    console.log('✅ 验证级别已更新');
    
    // 5. 创建固定大小集合用于日志
    const adapter = db._adapter;
    await adapter.db.createCollection('app_logs', {
        capped: true,
        size: 104857600,  // 100MB
        max: 10000
    });
    console.log('✅ 日志集合已创建');
    
    await db.close();
}

manageCollection().catch(console.error);
```

---

## 相关文档

- [运维监控](./admin.md) - 数据库统计
- [Schema 验证](./validation.md) - 验证规则
- [示例代码](../examples/admin.examples.js)

---

**最后更新**: 2025-12-02  
**版本**: v0.3.0

