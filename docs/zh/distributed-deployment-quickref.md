# 🚀 分布式部署快速参考

---

## 📑 目录

- [最简配置](#最简配置只需3行)
- [完整配置](#完整配置推荐)
- [参数速查表](#参数速查表)
- [常见场景](#常见场景)
- [环境变量设置](#环境变量设置)
- [关键点记忆](#关键点记忆)
- [验证配置](#验证配置)

---

## 最简配置（只需3行）

```javascript
distributed: {
  enabled: true  // 只需这一行！其他都是可选的
}
```

---

## 完整配置（推荐）

```javascript
const Redis = require('ioredis');
const redis = new Redis('redis://localhost:6379');

const msq = new MonSQLize({
  type: 'mongodb',
  databaseName: 'mydb',
  config: { uri: 'mongodb://...' },
  cache: {
    multiLevel: true,
    local: { maxSize: 1000 },
    remote: MonSQLize.createRedisCacheAdapter(redis),  // ① Redis 缓存
    distributed: {
      enabled: true,                              // ② 启用分布式失效
      instanceId: process.env.INSTANCE_ID         // ③ 实例ID（建议设置）
    }
  }
});
```

---

## 参数速查表

### distributed（分布式缓存失效）

| 参数 | 必需？ | 默认值 |
|-----|-------|--------|
| `enabled` | ✅ 是 | - |
| `redis` | ❌ 否 | 自动从 `remote` 提取 |
| `instanceId` | ❌ 否 | `instance-${timestamp}-${random}` |
| `channel` | ❌ 否 | `'monsqlize:cache:invalidate'` |

### transaction.distributedLock（兼容配置占位）

`transaction.distributedLock` 为 v1 配置兼容保留。v2 runtime 不会把它接入事务缓存锁，事务缓存锁仍是进程内语义。

跨实例临界区请使用显式业务协调，例如 `DistributedCacheLockManager` + 幂等 / fencing；严格新鲜度读路径请绕过缓存。

---

## 常见场景

### 场景1: 一般Web应用（推荐）

```javascript
distributed: {
  enabled: true,
  instanceId: process.env.INSTANCE_ID  // 使用环境变量
}
```

### 场景2: 金融/支付系统

```javascript
const msq = new MonSQLize({
  type: 'mongodb',
  databaseName: 'mydb',
  cache: {
    distributed: {
      enabled: true,
      instanceId: process.env.INSTANCE_ID
    }
  }
});

// 显式业务协调，而不是 transaction.distributedLock。
const lock = new MonSQLize.DistributedCacheLockManager({
  redis,
  lockKeyPrefix: 'myapp:business:lock:'
});

await lock.withLock(`payment:${paymentId}`, async () => {
  // 幂等临界区。
});
```

### 场景3: Kubernetes部署

```javascript
distributed: {
  enabled: true,
  instanceId: process.env.HOSTNAME  // 使用Pod名称
}
```

---

## 环境变量设置

### Docker

```bash
docker run -e INSTANCE_ID=server-1 myapp
```

### Kubernetes

```yaml
env:
  - name: INSTANCE_ID
    valueFrom:
      fieldRef:
        fieldPath: metadata.name  # 使用Pod名称
```

### PM2

```json
{
  "apps": [{
    "name": "app-1",
    "script": "server.js",
    "env": {
      "INSTANCE_ID": "app-1"
    }
  }]
}
```

---

## 关键点记忆

1. **`enabled: true`** - 唯一必需的配置
2. **`redis`** - 自动从 `remote` 复用，无需重复配置
3. **`instanceId`** - 可选但建议设置，便于调试
4. **跨实例强一致流程** - 使用显式业务协调，或绕过缓存

---

## 验证配置

```javascript
// 启动后检查
const stats = msq.getDistributedCacheInvalidatorStats();
console.log('分布式失效器状态:', stats);
// 输出: { messagesSent: 0, messagesReceived: 0, instanceId: 'xxx', ... }
```

---

**文档**: [完整说明](./distributed-deployment.md)  
**更新**: 2025-11-25

