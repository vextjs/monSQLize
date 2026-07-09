# Update Methods Overview

## 1. Overview

monSQLize provides three update methods. This page is the entry point for choosing the method and update payload shape:

| Method | Description | Aggregation pipeline support |
|------|------|-------------|
| `updateOne()` | Update a single matching document | Supported |
| `updateMany()` | Update all matching documents | Supported |
| `updateBatch()` | Update a large number of documents in batches | Supported |

Current update methods support both traditional update operators and aggregation pipeline syntax. For the full pipeline guide, see [Aggregation Pipeline Update Guide](./update-aggregation.md).

---

## 2. Traditional update operator

### 2.1 Common operators

### $set - Set field value

```javascript
await users.updateOne(
    { userId: 'user1' },
    { $set: { name: 'Alice', age: 25 } }
);
```

### $unset - delete a field

```javascript
await users.updateOne(
    { userId: 'user1' },
    { $unset: { tempField: '' } }
);
```

### $inc - increase/decrease value

```javascript
await users.updateOne(
    { userId: 'user1' },
    { $inc: { loginCount: 1, balance: -100 } }
);
```

### $push - Add elements to an array

```javascript
await users.updateOne(
    { userId: 'user1' },
    { $push: { tags: 'newTag' } }
);
```

### $pull - remove elements from an array

```javascript
await users.updateOne(
    { userId: 'user1' },
    { $pull: { tags: 'oldTag' } }
);
```

### 2.2 Combination use

```javascript
await users.updateOne(
    { userId: 'user1' },
    {
        $set: { status: 'active' },
        $inc: { loginCount: 1 },
        $push: { loginHistory: new Date() }
    }
);
```

---

## 3. Aggregation pipeline handoff

Use an aggregation pipeline when the update needs to reference existing field values, run conditional logic, or perform multi-stage transformations. The update payload is an array of pipeline stages:

```javascript
await orders.updateOne(
    { orderId: 'ORDER-123' },
    [
        { $set: { total: { $add: ['$price', '$tax'] } } }
    ]
);
```

This overview intentionally stops at selection and basic syntax. See [Aggregation Pipeline Update Guide](./update-aggregation.md) for supported stages, operator examples, performance notes, and troubleshooting.

## 4. Choosing the update shape

| Need | Recommended shape | Where to continue |
|------|-------------------|-------------------|
| Simple assignment or field removal | Traditional operators such as `$set` / `$unset` | `updateOne()` / `updateMany()` |
| Numeric increment or array push/pull | Traditional operators such as `$inc`, `$push`, `$pull` | `updateOne()` / `updateMany()` |
| Field-to-field calculation | Aggregation pipeline array | [Aggregation Pipeline Update Guide](./update-aggregation.md) |
| Conditional assignment or multi-stage transformation | Aggregation pipeline array | [Aggregation Pipeline Update Guide](./update-aggregation.md) |
| Large update workload | `updateBatch()` with either payload shape | [Batch update](./updateBatch.md) |

## 5. Related documents

- [Update one document](./update-one.md)
- [Update many documents](./update-many.md)
- [Batch update](./updateBatch.md)
- [Aggregation Pipeline Update Guide](./update-aggregation.md)
