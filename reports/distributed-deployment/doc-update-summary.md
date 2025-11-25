# 📝 分布式部署文档更新总结

**日期**: 2025-11-25  
**更新内容**: 修正 `instanceId` 和 `redis` 参数说明

---

## 🔧 主要更新

### 1. 明确 `instanceId` 的默认值

**之前**：文档说 `instanceId` 是必需的，但没说明默认值是什么

**现在**：
- ❌ **可选**：不是必需参数
- **默认值**：`instance-${timestamp}-${random}`
- **示例**：`instance-1732521234567-a2b3c4d5e`
- **建议**：强烈建议手动设置（便于调试和日志追踪）

**代码实现**（lib/distributed-cache-invalidator.js:34）：
```javascript
this.instanceId = options.instanceId || `instance-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
```

---

### 2. 统一 `redis` 参数说明

**修复前**：有些地方写着 `redis: redis  // ✅ 必需`

**修复后**：全部改为注释，说明自动复用：
```javascript
distributed: {
  enabled: true,
  instanceId: 'instance-1'  // ❌ 可选：默认自动生成
  // redis: redis           // ❌ 可选：默认自动从 remote 复用
}
```

---

## 📊 修改统计

| 文件 | 修改次数 | 说明 |
|------|---------|------|
| `docs/distributed-deployment.md` | 8处 | 删除 `redis: redis`，明确 `instanceId` 默认值 |

### 具体修改位置

1. **配置选项表格**（Line ~325）
   - 更新 `instanceId` 的默认值说明
   - 强调是可选的，但建议手动设置

2. **方案1配置示例**（Line ~210）
   - 删除 `redis: redis`
   - 改为注释说明

3. **方案2配置示例**（Line ~218）
   - 保留 `redis: redis`（事务锁必须显式配置）

4. **架构3配置示例**（Line ~151）
   - 删除 `redis: redis`
   - 更新 `instanceId` 说明

5. **架构4配置示例**（Line ~218）
   - 删除 `distributed.redis`
   - 保留 `transaction.distributedLock.redis`

6. **完整配置示例**（Line ~445）
   - 删除 `distributed.redis`
   - 更新注释

7. **故障排查部分**（Line ~844）
   - 强调事务锁必须显式配置 Redis

8. **快速开始部分**（Line ~923）
   - 更新 `instanceId` 说明
   - 删除 `redis: redis`

---

## ✅ 配置清单（最终版）

### distributed（分布式缓存失效）

| 参数 | 必需 | 默认值 | 说明 |
|-----|------|--------|------|
| `enabled` | ✅ 是 | - | 启用分布式失效 |
| `redis` | ❌ 否 | 自动从 `remote` 提取 | Redis 实例（可选） |
| `redisUrl` | ❌ 否 | - | Redis URL（不推荐） |
| `instanceId` | ❌ 否 | `instance-${timestamp}-${random}` | 实例 ID（建议手动设置） |
| `channel` | ❌ 否 | `'monsqlize:cache:invalidate'` | Pub/Sub 频道 |

### transaction.distributedLock（分布式事务锁）

| 参数 | 必需 | 默认值 | 说明 |
|-----|------|--------|------|
| `redis` | ✅ 是 | - | Redis 实例（必须显式配置） |
| `keyPrefix` | ❌ 否 | `'monsqlize:cache:lock:'` | 锁键前缀 |
| `maxDuration` | ❌ 否 | `300000` | 锁最大持续时间（毫秒） |

---

## 📖 最简配置示例

### 分布式缓存失效（推荐）

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
    remote: MonSQLize.createRedisCacheAdapter(redis),
    distributed: {
      enabled: true
      // instanceId: 'instance-1'  // 可选，默认自动生成（建议手动设置）
      // redis: redis              // 可选，默认自动从 remote 复用
      // channel: 'myapp:cache'    // 可选，默认 'monsqlize:cache:invalidate'
    }
  }
});
```

**最简配置只需要1行**：
```javascript
distributed: { enabled: true }
```

---

### 分布式事务锁（金融/交易场景）

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
    remote: MonSQLize.createRedisCacheAdapter(redis),
    distributed: {
      enabled: true
    },
    transaction: {
      distributedLock: {
        redis: redis  // 必须：事务锁需要显式配置
        // keyPrefix: 'myapp:lock:'  // 可选
      }
    }
  }
});
```

**区别**：
- 分布式缓存失效：`redis` 可省略（自动复用）
- 分布式事务锁：`redis` 必须显式配置

---

## ⚠️ 常见问题

### Q1: `instanceId` 是必须的吗？

**A**: 不是必须的，但**强烈建议手动设置**。

- 如果不设置，会自动生成（格式：`instance-1732521234567-a2b3c4d5e`）
- 建议使用环境变量：`instanceId: process.env.INSTANCE_ID`
- 便于日志追踪和调试

### Q2: `distributed.redis` 需要配置吗？

**A**: 不需要，会自动从 `cache.remote` 提取 Redis 实例。

- 推荐：不配置，自动复用
- 可选：手动配置（如需单独的 Redis 连接）

### Q3: `transaction.distributedLock.redis` 需要配置吗？

**A**: 需要，事务锁必须显式配置 Redis 实例。

- 原因：事务锁有独立的生命周期和配置需求
- 推荐：使用与 `cache.remote` 相同的 Redis 实例

### Q4: 为什么有两个 `redis` 配置？

**A**: 用途不同：

- `distributed.redis`：用于 Pub/Sub 广播（可选，自动复用）
- `transaction.distributedLock.redis`：用于分布式锁（必需，显式配置）

---

## 🎯 关键点总结

1. **`instanceId` 是可选的**
   - 默认自动生成（时间戳 + 随机字符串）
   - 建议手动设置环境变量

2. **`distributed.redis` 是可选的**
   - 默认自动从 `cache.remote` 复用
   - 无需重复配置

3. **`transaction.distributedLock.redis` 是必需的**
   - 必须显式传入 Redis 实例
   - 可以复用同一个 Redis 连接

4. **最简配置**
   ```javascript
   distributed: { enabled: true }  // 只需这一行！
   ```

---

**更新时间**: 2025-11-25  
**文档状态**: ✅ 已更新并验证  
**下一步**: 更新示例代码和单元测试

