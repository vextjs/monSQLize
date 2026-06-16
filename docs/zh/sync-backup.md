# Change Stream 数据同步

> **版本**: v1.0.8  
> **功能**: 实时同步数据到备份库  
> **模式**: CDC (Change Data Capture)

---

## 📋 概述

**Change Stream 数据同步**基于 MongoDB 原生 Change Stream 机制，实时监听数据变更并同步到多个备份库。

### 核心特性

- ✅ **实时同步**：基于 MongoDB Change Stream，延迟 10-500ms
- ✅ **解耦设计**：主库写操作不受影响，异步同步
- ✅ **断点续传**：Resume Token 自动保存，重启后继续
- ✅ **多目标支持**：同时同步到多个备份库
- ✅ **数据过滤**：自定义过滤逻辑
- ✅ **数据转换**：支持脱敏、字段转换
- ✅ **自动重连**：网络中断自动恢复
- ✅ **健康检查**：复用 ConnectionPoolManager

---

## ⚠️ 前提条件

### 必须满足

1. **MongoDB Replica Set** 🔴
   ```bash
   # 检查是否为 Replica Set
   rs.status()
   ```

2. **MongoDB 版本 >= 4.0** 🔴

3. **用户权限** 🔴
   ```javascript
   // 需要 changeStream 权限
   {
       resource: { db: "dbName", collection: "" },
       actions: ["changeStream", "find"]
   }
   ```

---

## 🚀 快速开始

### 基础配置

```javascript
import MonSQLize from 'monsqlize';

const msq = new MonSQLize({
    type: 'mongodb',
    config: {
        uri: 'mongodb://localhost:27017/main',
        replicaSet: 'rs0'  // 🔴 必须
    },
    
    // 🆕 同步配置
    sync: {
        enabled: true,
        targets: [
            {
                name: 'backup-main',
                uri: 'mongodb://backup:27017/backup',
                collections: ['users', 'orders']
            }
        ]
    }
});

await msq.connect();

// 正常使用，自动同步
await msq.collection('users').insertOne({ name: 'Alice' });
// ✅ 自动同步到 backup-main

await msq.close();
```

---

## 📖 配置选项

### sync 配置

| 选项 | 类型 | 必需 | 默认值 | 说明 |
|------|------|------|--------|------|
| `enabled` | boolean | ✅ | - | 是否启用同步 |
| `targets` | Array | ✅ | - | 备份目标数组 |
| `resumeToken` | Object | ❌ | - | Resume Token 配置 |
| `filter` | Function | ❌ | - | 事件过滤函数 |
| `transform` | Function | ❌ | - | 数据转换函数 |

`transform` 是 manager 级转换钩子。每个通过过滤的 change event 只会在分发到匹配 targets 前执行一次，因此所有 target 会收到同一个转换后的 document。Delete 事件通常没有 `fullDocument`；自定义 target 应能处理 `document === undefined`，并使用 `event.documentKey` 完成删除处理。

### targets[].配置

| 选项 | 类型 | 必需 | 说明 |
|------|------|------|------|
| `name` | string | ✅ | 目标名称（唯一） |
| `uri` | string | ✅ | MongoDB URI |
| `collections` | Array | ❌ | 同步的集合，`['*']` 表示全部 |
| `healthCheck` | Object | ❌ | 健康检查配置 |

### resumeToken 配置

| 选项 | 类型 | 必需 | 默认值 | 说明 |
|------|------|------|--------|------|
| `storage` | string | ❌ | `'file'` | 存储类型：`'file'` 或 `'redis'` |
| `path` | string | ❌ | `./.sync-resume-token` | 文件路径（文件模式） |
| `redis` | Object | ❌ | - | Redis 实例（Redis 模式） |

---

## 💡 使用示例

### 示例1：多备份目标

```javascript
{
    sync: {
        enabled: true,
        targets: [
            {
                name: 'backup-asia',
                uri: 'mongodb://asia:27017/backup',
                collections: ['*']
            },
            {
                name: 'backup-us',
                uri: 'mongodb://us:27017/backup',
                collections: ['*']
            }
        ]
    }
}
```

### 示例2：数据过滤

```javascript
{
    sync: {
        enabled: true,
        targets: [...],
        
        // 只同步 active 用户
        filter: (event) => {
            if (event.ns?.coll === 'users') {
                return event.fullDocument?.status === 'active';
            }
            return true;
        }
    }
}
```

### 示例3：数据脱敏

```javascript
{
    sync: {
        enabled: true,
        targets: [...],
        
        // 删除敏感字段
        transform: (doc) => {
            delete doc.password;
            delete doc.ssn;
            return doc;
        }
    }
}
```

### 示例4：Redis Resume Token

```javascript
const Redis = require('ioredis');
const redis = new Redis();

{
    sync: {
        enabled: true,
        targets: [...],
        resumeToken: {
            storage: 'redis',
            redis: redis
        }
    }
}
```

---

## 📊 性能影响

| 写入 QPS | 主库 CPU | 主库内存 | 网络带宽 | 同步延迟 |
|---------|---------|---------|---------|---------|
| 100 | +0.5% | +10MB | 1MB/s | 10-50ms |
| 1000 | +1% | +20MB | 10MB/s | 50-200ms |
| 5000 | +2% | +50MB | 50MB/s | 200-500ms |

---

## 🔧 API

### 获取统计信息

```javascript
const stats = msq.getSyncStats();
console.log(stats);
// {
//   isRunning: true,
//   eventCount: 1234,
//   syncedCount: 1230,
//   errorCount: 4,
//   startTime: 2026-01-17T...,
//   lastEventTime: 2026-01-17T...,
//   targets: [...]
// }
```

### 手动停止同步

```javascript
await msq.stopSync();
```

### 手动启动同步

```javascript
await msq.startSync();
```

---

## ❓ 常见问题

### Q1: 提示 "Change Stream 不可用"

**原因**: MongoDB 不是 Replica Set

**解决**:
```bash
# 1. 检查拓扑
rs.status()

# 2. 如果是单节点，转为 Replica Set
rs.initiate()
```

### Q2: 同步有延迟？

**原因**: 网络延迟、备份库性能

**解决**:
1. 检查网络延迟：`ping backup-host`
2. 检查备份库性能：`db.serverStatus()`
3. 减少同步的集合数量

### Q3: Resume Token 丢失怎么办？

**影响**: 重启后从当前时间开始同步，丢失中间数据

**解决**:
1. 使用 Redis 存储 Resume Token
2. 定期备份 Resume Token 文件
3. 手动全量同步一次

### Q4: 如何处理同步失败？

**自动处理**:
- 单个目标失败不影响其他目标
- Change Stream 中断自动重连（最多5次）

**手动处理**:
```javascript
// 查看错误统计
const stats = msq.getSyncStats();
console.log(stats.errorCount);
console.log(stats.targets[0].lastError);
```

---

## 🛡️ 最佳实践

### 1. 生产环境配置

```javascript
{
    sync: {
        enabled: true,
        targets: [
            {
                name: 'backup-main',
                uri: 'mongodb://backup:27017/backup',
                collections: ['*'],
                healthCheck: {
                    enabled: true,
                    interval: 30000,  // 30秒
                    timeout: 5000,
                    retries: 3
                }
            }
        ],
        resumeToken: {
            storage: 'redis',  // 使用 Redis
            redis: redisInstance
        }
    }
}
```

### 2. 监控和告警

```javascript
// 定期检查统计
setInterval(() => {
    const stats = msq.getSyncStats();
    
    if (stats.errorCount > 100) {
        // 发送告警
        sendAlert('同步错误过多');
    }
    
    if (!stats.isRunning) {
        // 发送告警
        sendAlert('同步已停止');
    }
}, 60000);
```

### 3. 优雅关闭

```javascript
process.on('SIGTERM', async () => {
    console.log('收到 SIGTERM，优雅关闭...');
    await msq.close();
    process.exit(0);
});
```

---

## 📚 更多资源

- [示例代码](https://github.com/vextjs/monSQLize/blob/main/examples/docs/sync.ts)
- [MongoDB Change Streams 官方文档](https://www.mongodb.com/docs/manual/changeStreams/)
- [ConnectionPoolManager 文档](./multi-pool.md)

---

_文档更新时间: 2026-01-17_  
_版本: v1.0.9_

