# Redis 配置说明对比

## 两种 redis 配置的区别

### 1. distributed.redis（分布式缓存失效）

**用途**：Redis Pub/Sub 广播缓存失效消息

**必需性**：❌ **可选**

**默认行为**：自动从 `cache.remote` 提取 Redis 实例

**配置示例**：
```javascript
cache: {
  multiLevel: true,
  remote: MonSQLize.createRedisCacheAdapter(redis),  // ① Redis 缓存
  distributed: {
    enabled: true
    // redis  ← ❌ 不需要，自动从 remote 复用（ES6 简写）
  }
}
```

**原因**：
- 广播功能依赖 Redis，而 `remote` 已经配置了 Redis
- 自动复用避免用户重复配置
- 降低配置复杂度

---

### 2. transaction.distributedLock.redis（分布式事务锁）

**用途**：Redis 存储分布式锁信息

**必需性**：✅ **必需**

**默认行为**：无默认值，必须显式传入

**配置示例**：
```javascript
cache: {
  multiLevel: true,
  remote: MonSQLize.createRedisCacheAdapter(redis),  // ① Redis 缓存
  distributed: {
    enabled: true  // ② 分布式失效（自动复用 redis）
  },
  transaction: {
    distributedLock: {
      redis  // ③ 事务锁（必须显式配置）✅ 必需（ES6 简写）
    }
  }
}
```

**原因**：

1. **生命周期不同**
   - 缓存：可降级（Redis 挂了用本地缓存）
   - 事务锁：不可降级（必须保证分布式一致性）

2. **配置需求不同**
   - 缓存：可复用同一个 Redis 连接
   - 事务锁：可能需要独立的 Redis 连接（高可用部署）

3. **语义明确**
   - 显式配置表示用户明确知道正在使用分布式锁
   - 避免无意中启用了分布式锁（可能有性能影响）

4. **未来扩展**
   - 可能支持其他分布式锁实现（Redlock、Zookeeper 等）
   - 显式配置更易于扩展

---

## 配置清单

| 配置项 | 必需？ | 默认值 | 说明 |
|-------|-------|--------|------|
| `cache.remote` | ❌ | - | Redis 缓存（可选） |
| `distributed.redis` | ❌ | 自动从 `remote` 提取 | Pub/Sub 广播（可选） |
| `transaction.distributedLock.redis` | ✅ | - | 分布式锁（必需）|

---

## 常见场景配置

> **💡 ES6 简写提示**：当属性名和变量名相同时，可以简写。
> - ✅ `redis` 等同于 `redis: redis`
> - ❌ `redis: redis1` 不能简写（变量名不同）

### 场景1：只需要分布式缓存失效

```javascript
const redis = new Redis('redis://localhost:6379');

cache: {
  multiLevel: true,
  remote: MonSQLize.createRedisCacheAdapter(redis),  // ✅ 配置 Redis 缓存
  distributed: {
    enabled: true  // ✅ 启用失效广播（自动复用 redis）
  }
  // ❌ 不需要配置 distributed.redis
}
```

### 场景2：需要分布式事务锁

```javascript
const redis = new Redis('redis://localhost:6379');

cache: {
  multiLevel: true,
  remote: MonSQLize.createRedisCacheAdapter(redis),  // ✅ Redis 缓存
  distributed: {
    enabled: true  // ✅ 失效广播（自动复用）
  },
  transaction: {
    distributedLock: {
      redis  // ✅ 必须显式配置（语义明确）
    }
  }
}
```

### 场景3：使用独立的 Redis 连接

```javascript
const redis1 = new Redis('redis://cache-server:6379');      // 缓存专用
const redis2 = new Redis('redis://lock-server:6379');       // 锁专用

cache: {
  multiLevel: true,
  remote: MonSQLize.createRedisCacheAdapter(redis1),  // 缓存用 redis1
  distributed: {
    enabled: true,
    redis: redis1  // 广播也用 redis1（不同变量名不能简写）
  },
  transaction: {
    distributedLock: {
      redis: redis2  // 锁用 redis2（不同变量名不能简写）
    }
  }
}
```

---

## 设计理念

### 原则1：最小配置原则
能自动推断的配置不要求用户手动配置（如 `distributed.redis`）

### 原则2：显式优于隐式
关键功能必须显式配置，让用户明确知道在使用（如 `transaction.distributedLock.redis`）

### 原则3：合理默认值
大多数场景下默认配置即可工作（如 `channel`、`keyPrefix`）

### 原则4：易于扩展
显式配置更易于未来扩展新功能

---

## 总结

### distributed.redis - 可选
- ❌ 不需要配置
- 自动从 `cache.remote` 复用
- 降低配置复杂度

### transaction.distributedLock.redis - 必需
- ✅ 必须显式配置
- 语义明确，避免误用
- 便于高可用部署

**这是合理的设计决策！** ✅

