# MongoDB 事务功能文档

**版本**: v1.0.0  
**更新日期**: 2025-11-19

---

## 📚 目录

- [概述](#概述)
- [快速开始](#快速开始)
- [配置选项](#配置选项)
- [API 参考](#api-参考)
- [缓存策略](#缓存策略)
- [最佳实践](#最佳实践)
- [常见问题](#常见问题)
- [性能优化](#性能优化)

---

## 概述

monSQLize 提供完整的 MongoDB 事务支持，确保数据的原子性、一致性、隔离性和持久性（ACID）。

### 核心特性

- ✅ **自动事务管理**（withTransaction - 推荐）
- ✅ **手动事务管理**（startSession - 高级用法）
- ✅ **智能缓存策略**（事务内可选缓存，事务外正常缓存）
- ✅ **缓存锁机制**（防止脏数据）
- ✅ **自动重试**（瞬态错误自动重试）
- ✅ **超时处理**（自动中断长事务）
- ✅ **监控指标**（执行时长、成功率等）
- ✅ **读关注/读偏好/因果一致性**

### 前置要求

- ✅ MongoDB 4.0+ 副本集或分片集群
- ✅ Node.js 14+
- ✅ monSQLize v1.0.0+

---

## 快速开始

### 1. 初始化与配置

```javascript
const MonSQLize = require('monsqlize');

const msq = new MonSQLize({
    type: 'mongodb',
    databaseName: 'mydb',
    config: {
        uri: 'mongodb://localhost:27017?replicaSet=rs0', // 必须是副本集
        options: {}
    },
    cache: {
        ttl: 60000,    // 缓存60秒
        maxSize: 1000  // 最多1000条
    }
});

await msq.connect();
const { collection } = await msq.connect();
```

### 2. 使用自动事务（推荐⭐）

最简单的方式，自动管理提交、回滚和重试：

```javascript
// 示例1：转账
await msq.withTransaction(async (tx) => {
    const accounts = collection('accounts');
    
    // 从 Alice 扣款
    await accounts.updateOne(
        { userId: 'alice' },
        { $inc: { balance: -100 } },
        { session: tx.session } // 🔑 传入 session
    );
    
    // 给 Bob 加款
    await accounts.updateOne(
        { userId: 'bob' },
        { $inc: { balance: 100 } },
        { session: tx.session }
    );
    
    // ✅ 成功：自动提交
    // ❌ 失败：自动回滚
});
```

```javascript
// 示例2：库存扣减 + 创建订单
const orderId = await msq.withTransaction(async (tx) => {
    const inventory = collection('inventory');
    const orders = collection('orders');
    
    // 检查库存
    const product = await inventory.findOne(
        { productId: 'SKU123' },
        { session: tx.session }
    );
    
    if (product.stock < 10) {
        throw new Error('库存不足');
    }
    
    // 扣减库存
    await inventory.updateOne(
        { productId: 'SKU123' },
        { $inc: { stock: -10 } },
        { session: tx.session }
    );
    
    // 创建订单
    const order = {
        orderId: 'ORDER001',
        productId: 'SKU123',
        quantity: 10,
        createdAt: new Date()
    };
    await orders.insertOne(order, { session: tx.session });
    
    return order.orderId;
});

console.log('订单创建成功:', orderId);
```

### 3. 使用手动事务（高级用法）

需要精细控制事务生命周期时使用：

```javascript
const tx = await msq.startSession();

try {
    await tx.start();
    
    // 执行操作
    await collection('accounts').updateOne(
        { userId: 'alice' },
        { $inc: { balance: -100 } },
        { session: tx.session }
    );
    
    // 手动提交
    await tx.commit();
} catch (error) {
    // 手动回滚
    await tx.abort();
    throw error;
} finally {
    // 释放资源
    await tx.end();
}
```

---

## 配置选项

### 全局配置（构造函数）

```javascript
const msq = new MonSQLize({
    // ...基础配置
    transaction: {
        // ⭐ 重要：事务内默认不使用缓存（确保数据一致性）
        // 如需在事务内使用缓存，需在查询时显式指定 cache 参数
        
        // 是否启用自动重试（默认：true）
        enableRetry: true,
        
        // 最大重试次数（默认：3）
        maxRetries: 3,
        
        // 重试延迟（毫秒，默认：100）
        retryDelay: 100,
        
        // 重试退避系数（默认：2）
        retryBackoff: 2,
        
        // 默认超时时间（毫秒，默认：30000）
        defaultTimeout: 30000,
        
        // 默认读关注（可选）
        defaultReadConcern: { level: 'majority' },
        
        // 默认写关注（可选）
        defaultWriteConcern: { w: 'majority' },
        
        // 缓存锁最大持续时间（毫秒，默认：300000）
        lockMaxDuration: 300000,
        
        // 缓存锁清理间隔（毫秒，默认：10000）
        lockCleanupInterval: 10000
    }
});
```

### 单次事务配置

```javascript
await msq.withTransaction(async (tx) => {
    // 事务逻辑
}, {
    // 读关注级别
    readConcern: { level: 'snapshot' },
    
    // 写关注级别
    writeConcern: { w: 'majority' },
    
    // 读偏好
    readPreference: 'primary',
    
    // 因果一致性（默认：true）
    causalConsistency: true,
    
    // 超时时间（毫秒）
    timeout: 60000,
    
    // 最大重试次数（覆盖全局配置）
    maxRetries: 5
});
```

---

## API 参考

### msq.withTransaction(callback, options)

自动管理事务（推荐）。

**参数**:
- `callback(tx)`: 事务回调函数
  - `tx.session`: MongoDB session 对象
  - `tx.id`: 事务唯一标识
  - `tx.state`: 事务状态（'pending' | 'committed' | 'aborted'）
- `options`: 事务选项（可选）

**返回**: Promise<any> - 返回 callback 的返回值

**示例**:
```javascript
const result = await msq.withTransaction(async (tx) => {
    // 事务内操作必须传入 session
    await collection('users').updateOne(
        { _id: 1 },
        { $set: { name: 'Alice' } },
        { session: tx.session }
    );
    
    return { success: true };
});
```

### msq.startSession(options)

创建手动事务会话。

**参数**:
- `options`: 事务选项（同 withTransaction）

**返回**: Promise<Transaction>

**Transaction 实例方法**:
- `start()`: 开始事务
- `commit()`: 提交事务
- `abort()`: 回滚事务
- `end()`: 释放资源

**示例**:
```javascript
const tx = await msq.startSession({
    readConcern: { level: 'majority' },
    timeout: 60000
});

try {
    await tx.start();
    
    // 执行操作
    await collection('accounts').updateOne(
        { _id: 1 },
        { $inc: { balance: -100 } },
        { session: tx.session }
    );
    
    await tx.commit();
} catch (error) {
    await tx.abort();
    throw error;
} finally {
    await tx.end();
}
```

---

## 缓存策略

### ⭐ 默认策略：事务内不缓存（推荐）

**设计理念**: 事务追求数据一致性，缓存追求性能。默认情况下，事务内操作不使用缓存，确保数据准确性。

```javascript
await msq.withTransaction(async (tx) => {
    // ✅ 事务内查询：直接从数据库读取，不使用缓存
    const user = await collection('users').findOne(
        { _id: 1 },
        { session: tx.session }
        // 不需要指定 cache: 0，默认不缓存
    );
    
    // ✅ 事务内写入：自动失效相关缓存 + 添加缓存锁
    await collection('users').updateOne(
        { _id: 1 },
        { $set: { balance: 100 } },
        { session: tx.session }
    );
});

// ✅ 事务外查询：正常使用缓存
const user = await collection('users').findOne(
    { _id: 1 },
    { cache: 60000 } // 缓存60秒
);
```

### 可选策略：事务内启用缓存（性能优化）

**使用场景**: 事务内多次查询相同数据，且可以接受事务开始时的快照数据。

```javascript
await msq.withTransaction(async (tx) => {
    // ⚡ 第一次查询：从数据库读取并缓存（仅在事务内有效）
    const product = await collection('products').findOne(
        { _id: 'SKU123' },
        { 
            session: tx.session,
            cache: 60000,           // 启用缓存
            txCacheIsolation: true  // 事务内缓存隔离
        }
    );
    
    // ⚡ 第二次查询：从缓存读取（快）
    const productAgain = await collection('products').findOne(
        { _id: 'SKU123' },
        { session: tx.session, cache: 60000 }
    );
    
    // ✅ 提交后：缓存自动失效
    // ❌ 回滚后：缓存自动失效
});
```

### 缓存锁机制（自动）

**作用**: 防止事务执行期间，外部操作写入脏数据到缓存。

```javascript
await msq.withTransaction(async (tx) => {
    // 1. 更新数据
    await collection('users').updateOne(
        { _id: 1 },
        { $set: { balance: 100 } },
        { session: tx.session }
    );
    // 🔒 自动添加缓存锁：users:1
    
    // 2. 外部尝试缓存该数据（会被阻止）
    // ❌ 缓存写入被跳过（因为键被锁定）
    
    // 3. 事务提交
    await tx.commit();
    // 🔓 自动释放锁 + 失效缓存
});
```

### 缓存策略对比

| 策略 | 优点 | 缺点 | 适用场景 |
|------|------|------|---------|
| **不缓存（默认）** | 数据一致性高、简单 | 性能略低 | 大多数场景 |
| **启用缓存** | 性能高（多次查询） | 复杂性略高 | 事务内多次查询相同数据 |
| **缓存锁** | 防止脏数据（自动） | 略微降低并发 | 自动启用，无需配置 |

---

## 最佳实践

### 1. 幂等性设计 ⭐

**重要**: 事务回调必须幂等，因为可能自动重试。

```javascript
// ✅ 好的设计：使用唯一标识
await msq.withTransaction(async (tx) => {
    await collection('orders').insertOne({
        orderId: 'ORDER_' + Date.now(), // 唯一ID
        status: 'pending'
    }, { session: tx.session });
});

// ❌ 不好的设计：依赖外部状态
let counter = 0;
await msq.withTransaction(async (tx) => {
    counter++; // 重试会导致 counter 增加多次
    await collection('logs').insertOne({
        logId: counter // 不幂等
    }, { session: tx.session });
});
```

### 2. 超时时间设置

```javascript
// 短事务（推荐）
await msq.withTransaction(async (tx) => {
    // 简单操作
}, { timeout: 5000 });

// 长事务（谨慎使用）
await msq.withTransaction(async (tx) => {
    // 复杂操作
}, { timeout: 60000 }); // MongoDB 默认限制60秒
```

### 3. 错误处理

```javascript
try {
    await msq.withTransaction(async (tx) => {
        // 业务逻辑
        const user = await collection('users').findOne(
            { _id: 1 },
            { session: tx.session }
        );
        
        if (!user) {
            throw new Error('用户不存在');
        }
        
        // 更多操作...
    });
} catch (error) {
    if (error.message === '用户不存在') {
        // 业务错误
        console.error('业务错误:', error.message);
    } else if (error.errorLabels?.includes('TransientTransactionError')) {
        // MongoDB 瞬态错误（已自动重试）
        console.error('事务失败:', error.message);
    } else {
        // 其他错误
        console.error('未知错误:', error);
    }
}
```

### 4. 性能优化

```javascript
// ✅ 好的做法：先验证，后事务
async function transfer(fromId, toId, amount) {
    // 1. 事务外预检查（快速失败）
    const fromUser = await collection('users').findOne({ _id: fromId });
    if (!fromUser || fromUser.balance < amount) {
        throw new Error('余额不足');
    }
    
    // 2. 事务内执行
    await msq.withTransaction(async (tx) => {
        await collection('users').updateOne(
            { _id: fromId },
            { $inc: { balance: -amount } },
            { session: tx.session }
        );
        
        await collection('users').updateOne(
            { _id: toId },
            { $inc: { balance: amount } },
            { session: tx.session }
        );
    });
}

// ❌ 不好的做法：所有逻辑都在事务内
await msq.withTransaction(async (tx) => {
    // 复杂业务逻辑
    // 多次网络调用
    // ...（长时间占用事务）
});
```

### 5. 监控与日志

```javascript
const tx = await msq.startSession();

try {
    await tx.start();
    
    console.log('事务开始:', tx.id);
    
    // 业务逻辑
    await collection('users').updateOne(
        { _id: 1 },
        { $set: { lastLogin: new Date() } },
        { session: tx.session }
    );
    
    await tx.commit();
    console.log('事务提交成功:', tx.id);
} catch (error) {
    await tx.abort();
    console.error('事务回滚:', tx.id, error);
    throw error;
} finally {
    await tx.end();
}
```

---

## 常见问题

### Q1: 为什么事务内查询没有使用缓存？

**A**: 这是设计的默认行为。原因：
1. **数据一致性优先** - 事务追求准确性，缓存可能有延迟
2. **避免脏读** - 事务内应该读取最新数据
3. **简化使用** - 用户不需要考虑缓存问题

如果需要性能优化，可以显式启用 `cache` 选项。

### Q2: 什么时候使用手动事务？

**A**: 大多数情况使用 `withTransaction`（自动）。以下情况考虑手动：
- 需要在事务开始前做复杂判断
- 需要在 commit 前做额外验证
- 需要细粒度控制事务生命周期

### Q3: 事务失败如何调试？

**A**: 检查以下几点：
1. **MongoDB 是副本集吗？** - 单节点不支持事务
2. **连接字符串正确吗？** - 需要 `?replicaSet=rs0`
3. **超时时间合理吗？** - 默认30秒
4. **回调是否幂等？** - 可能重试多次

### Q4: 缓存锁会影响性能吗？

**A**: 影响很小。原因：
- 锁仅在事务执行期间生效（通常很短）
- 锁是内存级别的（不涉及 I/O）
- 锁的检查非常快（O(1) 哈希查找）

### Q5: 事务内可以操作多个数据库吗？

**A**: 可以，但有限制：
- ✅ 同一个 MongoDB 集群内的多个数据库
- ❌ 跨 MongoDB 集群（不支持）

```javascript
await msq.withTransaction(async (tx) => {
    // 操作 db1.users
    await collection('users').updateOne(
        { _id: 1 },
        { $set: { status: 'active' } },
        { session: tx.session }
    );
    
    // 操作 db2.logs（需要先获取 db2 的 collection）
    const db2 = msq.db('db2');
    await db2.collection('logs').insertOne({
        action: 'user_activated',
        userId: 1
    }, { session: tx.session });
});
```

### Q6: 并发事务会死锁吗？

**A**: MongoDB 会自动检测并抛出 `WriteConflict` 错误。monSQLize 会自动重试（如果启用了 `enableRetry`）。

---

## 性能优化

### 1. 减少事务内操作

```javascript
// ✅ 好的做法
const validated = await preValidate(); // 事务外
if (validated) {
    await msq.withTransaction(async (tx) => {
        // 仅核心操作
    });
}

// ❌ 不好的做法
await msq.withTransaction(async (tx) => {
    await validate();  // 事务内
    await doWork();    // 事务内
});
```

### 2. 批量操作

```javascript
// ✅ 好的做法：使用批量 API
await msq.withTransaction(async (tx) => {
    await collection('users').updateMany(
        { status: 'inactive' },
        { $set: { status: 'deleted' } },
        { session: tx.session }
    );
});

// ❌ 不好的做法：循环单条更新
await msq.withTransaction(async (tx) => {
    for (const user of users) {
        await collection('users').updateOne(
            { _id: user._id },
            { $set: { status: 'deleted' } },
            { session: tx.session }
        );
    }
});
```

### 3. 合理使用索引

```javascript
// ✅ 确保查询字段有索引
await collection('users').createIndex({ userId: 1 });

await msq.withTransaction(async (tx) => {
    // 使用索引字段查询（快）
    const user = await collection('users').findOne(
        { userId: 'alice' }, // 有索引
        { session: tx.session }
    );
});
```

### 4. 监控事务性能

```javascript
// 获取事务统计
const stats = msq._transactionManager?.getStats();
console.log('事务统计:', {
    总数: stats.totalTransactions,
    成功: stats.successfulTransactions,
    失败: stats.failedTransactions,
    平均耗时: stats.averageDuration + 'ms'
});
```

---

## 相关文档

- [MongoDB 事务官方文档](https://docs.mongodb.com/manual/core/transactions/)
- [设计文档](../design/transaction-complete-design.md)
- [示例代码](../examples/transaction.examples.js)

---

**文档版本**: v1.0.0  
**最后更新**: 2025-11-19  
**贡献者**: monSQLize 团队

