# findOneAndDelete() - 原子查找并删除

原子地查找并删除单个文档，返回被删除的文档。这是一个原子操作，适合需要获取旧值同时删除的场景。

## 语法

```javascript
collection(collectionName).findOneAndDelete(filter, options)
```

## 参数

### filter (Object, 必需)
筛选条件。

### options (Object, 可选)

| 选项 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `projection` | Object | - | 字段投影 |
| `sort` | Object | - | 排序条件 |
| `maxTimeMS` | Number | - | 最大执行时间 |
| `comment` | String | - | 操作注释 |
| `collation` | Object | - | 排序规则 |
| `hint` | String/Object | - | 索引提示 |
| `includeResultMetadata` | Boolean | false | 是否包含完整元数据 |

## 返回值

默认返回**被删除的文档对象**或 **null**（未找到）。

如果 `includeResultMetadata: true`，返回：
```javascript
{
  value: <文档或null>,
  ok: 1,
  lastErrorObject: { n: 1 }
}
```

> **⚠️ 重要提示 - MongoDB 驱动 6.x 兼容性**
> 
> monSQLize 使用 MongoDB Node.js 驱动 6.x，该版本对 `findOneAndDelete` 的返回值格式进行了重要变更：
> 
> **驱动 6.x (当前版本)**:
> - 默认直接返回文档对象
> - 需要显式设置 `includeResultMetadata: true` 才返回完整元数据
> 
> **驱动 5.x 及更早版本**:
> - 默认返回完整元数据 `{ value, ok, lastErrorObject }`
> 
> **✅ monSQLize 的处理**:
> - 已在内部自动处理此差异，用户无需关心驱动版本
> - API 行为保持一致，向后兼容
> - 详见技术分析报告: `analysis-reports/2025-11-17-mongodb-driver-6x-compatibility.md`

## 核心特性

### 原子性保证

```javascript
// ✅ 原子操作 - 查找和删除在同一事务中
const deletedTask = await collection("tasks").findOneAndDelete({
  status: "pending",
  assignedTo: null
});

if (deletedTask) {
  console.log("获取到任务:", deletedTask.taskId);
  // 处理任务...
}

// ❌ 非原子 - 有竞态条件风险
const task = await collection("tasks").findOne({ status: "pending" });
if (task) {
  await collection("tasks").deleteOne({ _id: task._id });
  // 在这期间其他进程可能已经获取了同一个任务！
}
```

## 常见场景

### 场景 1: 任务队列消费

```javascript
// 从队列中获取并删除一个任务（原子操作）
async function getNextTask() {
  const task = await collection("taskQueue").findOneAndDelete(
    { 
      status: "pending",
      scheduledAt: { $lte: new Date() }
    },
    { 
      sort: { priority: -1, scheduledAt: 1 }
    }
  );

  return task;
}

// 多个 Worker 并发调用也安全
const task = await getNextTask();
if (task) {
  await processTask(task);
}
```

### 场景 2: 会话清理

```javascript
// 删除过期会话并记录
async function cleanupExpiredSession(sessionId) {
  const deletedSession = await collection("sessions").findOneAndDelete({
    sessionId,
    expiresAt: { $lt: new Date() }
  });

  if (deletedSession) {
    console.log(`已清理会话: ${sessionId}`);
    // 记录到审计日志
    await collection("auditLogs").insertOne({
      action: "SESSION_EXPIRED",
      userId: deletedSession.userId,
      timestamp: new Date()
    });
  }

  return deletedSession;
}
```

### 场景 3: 分布式锁释放

```javascript
// 获取锁信息并删除
async function releaseLock(lockKey, ownerId) {
  const lock = await collection("locks").findOneAndDelete({
    lockKey,
    ownerId,
    expiresAt: { $gt: new Date() }
  });

  if (!lock) {
    throw new Error("锁不存在或已被其他进程持有");
  }

  console.log(`锁已释放: ${lockKey}`);
  return lock;
}
```

## 与其他方法的区别

| 特性 | findOneAndDelete | deleteOne | deleteMany |
|------|------------------|-----------|------------|
| **返回值** | 被删除的文档 | 删除统计 | 删除统计 |
| **原子性** | ✅ 原子操作 | ✅ 原子操作 | ✅ 原子操作 |
| **获取旧值** | ✅ 支持 | ❌ 不支持 | ❌ 不支持 |
| **删除数量** | 最多 1 个 | 最多 1 个 | 多个 |

## 相关方法

- [deleteOne()](./write-operations.md#deleteone) - 删除单个文档（不返回文档）
- [deleteMany()](./write-operations.md#deletemany) - 批量删除文档
- [findOneAndUpdate()](./find-one-and-update.md) - 原子查找并更新
- [findOneAndReplace()](./find-one-and-replace.md) - 原子查找并替换

