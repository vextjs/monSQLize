# findOneAndDelete() - Atomic find and delete

## Syntax

```javascript
collection(collectionName).findOneAndDelete(filter, options)
```

## Parameters


## filter (Object, required)
Filter criteria.


## options (Object, optional)

| Options | Type | Default | Description |
|------|------|--------|------|
| `projection` | Object | - | Field projection |
| `sort` | Object | - | Sorting conditions |
| `maxTimeMS` | Number | - | Maximum execution time |
| `comment` | String | - | Operation comments |
| `collation` | Object | - | Sorting Rules |
| `hint` | String/Object | - | Index Tips |
| `includeResultMetadata` | Boolean | false | Whether to include complete metadata |

## Return value

Default returns **deleted document object** or **null** (not found).

If `includeResultMetadata: true`, return:
```javascript
{
value: <document or null>,
  ok: 1,
  lastErrorObject: { n: 1 }
}
```

> **⚠️ IMPORTANT NOTE - MongoDB Driver 6.x Compatibility**
>
> monSQLize uses MongoDB Node.js driver 6.x, which makes important changes to the return value format of `findOneAndDelete`:
>
> **Driver 6.x (current version)**:
> - By default, the document object is returned directly
> - Requires explicit setting of `includeResultMetadata: true` to return complete metadata
>
> **Driver 5.x and earlier**:
> - Return complete metadata `{ value, ok, lastErrorObject }` by default
>
> **✅ monSQLize processing**:
> - This difference has been automatically handled internally, users do not need to care about the driver version
> - API behavior remains consistent and backward compatible
> - For the current verification entry, see [MongoDB Driver Version Compatibility Guide](./mongodb-driver-compatibility.md) and [findOneAnd* Return Value Unified Description](./findOneAnd-return-value-unified.md)

## Core Features


## Atomic guarantee

```javascript
//✅ Atomic operations - find and delete in the same transaction
const deletedTask = await collection("tasks").findOneAndDelete({
  status: "pending",
  assignedTo: null
});

if (deletedTask) {
  console.log("Get the task:", deletedTask.taskId);
  //Processing tasks...
}

//❌ Non-atomic - Risk of race conditions
const task = await collection("tasks").findOne({ status: "pending" });
if (task) {
  await collection("tasks").deleteOne({ _id: task._id });
  //During this period other processes may have acquired the same task!
}
```

## Common scenarios


## Scenario 1: Task queue consumption

```javascript
//Get and delete a task from the queue (atomic operation)
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

//It is also safe to call multiple workers concurrently
const task = await getNextTask();
if (task) {
  await processTask(task);
}
```


## Scenario 2: Session cleanup

```javascript
//Delete expired sessions and record
async function cleanupExpiredSession(sessionId) {
  const deletedSession = await collection("sessions").findOneAndDelete({
    sessionId,
    expiresAt: { $lt: new Date() }
  });

  if (deletedSession) {
    console.log(`Cleaned session: ${sessionId}`);
    //Log to audit log
    await collection("auditLogs").insertOne({
      action: "SESSION_EXPIRED",
      userId: deletedSession.userId,
      timestamp: new Date()
    });
  }

  return deletedSession;
}
```


## Scenario 3: Distributed lock release

```javascript
//Get lock information and delete
async function releaseLock(lockKey, ownerId) {
  const lock = await collection("locks").findOneAndDelete({
    lockKey,
    ownerId,
    expiresAt: { $gt: new Date() }
  });

  if (!lock) {
    throw new Error("The lock does not exist or is already held by another process");
  }

  console.log(`Lock released: ${lockKey}`);
  return lock;
}
```

## Differences from other methods

| Features | findOneAndDelete | deleteOne | deleteMany |
|------|------------------|-----------|------------|
| **Return value** | Deleted documents | Deletion statistics | Deletion statistics |
| **Atomic** | ✅ Atomic operations | ✅ Atomic operations | ✅ Atomic operations |
| **Get old value** | ✅ Supported | ❌ Not supported | ❌ Not supported |
| **Delete quantity** | Maximum 1 | Maximum 1 | Multiple |

## Related methods

- [deleteOne()](./delete-one.md) - deletes a single document (does not return the document)
- [deleteMany()](./delete-many.md) - Delete documents in batches
- [findOneAndUpdate()](./find-one-and-update.md) - Atomic find and update
- [findOneAndReplace()](./find-one-and-replace.md) - Atomic find and replace
