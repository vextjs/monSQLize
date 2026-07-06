# ObjectId Conversion Scope

ObjectId auto-conversion is enabled by default for the MongoDB runtime. It lets common identifier inputs work in query and write paths while keeping MongoDB values stored as real `ObjectId` values.

## What Is Converted

| Input shape | Converted by monSQLize | Result |
|-------------|------------------------|--------|
| `ObjectId` from the current MongoDB driver | No | Used as-is |
| ObjectId-like instance from another BSON or Mongoose copy | Yes | Rebuilt with the current MongoDB driver `ObjectId` |
| 24-character hexadecimal string | Yes, when auto-conversion is enabled and the path is not excluded | `ObjectId` |
| MongoDB Extended JSON wrapper such as `{ "$oid": "..." }` | No, not as the wrapper itself | Parse it before passing the document |

monSQLize checks the runtime value shape, not dependency release numbers. If a value is already an `ObjectId`, it is reused. If an object looks like an ObjectId from another BSON implementation, monSQLize rebuilds it from its hexadecimal string.

## Field Scope

Auto-conversion runs through normalized query filters and write documents. A valid 24-character hex string can be converted wherever the configured path is allowed.

If your data contains business strings that merely look like ObjectIds, exclude those fields:

```javascript
const db = new MonSQLize({
  type: 'mongodb',
  config: { uri: 'mongodb://localhost:27017/app' },
  autoConvertObjectId: {
    excludeFields: ['traceId', 'external.code']
  }
});
```

Use `autoConvertObjectId: false` only when you want to pass every identifier value exactly as provided.

## Query Examples

```javascript
await db.collection('users').findOne({
  _id: '6975da7914d83bc3e18e8123'
});

await db.collection('orders').find({
  user_id: { $in: ['69005bc26654d09120d0f82a'] }
});
```

Both examples are normalized to `ObjectId` values before reaching MongoDB.

## Write Examples

```javascript
await db.collection('orders').insertOne({
  user_id: '69005bc26654d09120d0f82a',
  item_ids: ['68f1d9e7b53745e8627a952f']
});
```

ObjectId-like values inside insert and update payloads are normalized before the write operation is sent.

## Extended JSON Input

Extended JSON is a transport format, not the recommended in-memory shape for monSQLize operations. Do not pass this object when you mean `_id` should be an ObjectId:

```javascript
await db.collection('trips').insertOne({
  _id: { $oid: '6975da7914d83bc3e18e8123' }
});
```

Parse Extended JSON first, or create the ObjectId directly:

```javascript
const { BSON, ObjectId } = require('mongodb');

const parsed = BSON.EJSON.deserialize({
  _id: { $oid: '6975da7914d83bc3e18e8123' },
  owner_id: { $oid: '69005bc26654d09120d0f82a' }
});

await db.collection('trips').insertOne(parsed);

await db.collection('trips').insertOne({
  _id: new ObjectId('6975da7914d83bc3e18e8123')
});
```

## Summary

| Situation | Recommended input |
|-----------|-------------------|
| Query by id | `{ _id: '6975da7914d83bc3e18e8123' }` or `{ _id: new ObjectId(...) }` |
| Query many ids | `{ _id: { $in: ids } }` |
| Insert or update id fields | `ObjectId` values or 24-character hex strings |
| Import MongoDB Extended JSON | Deserialize it first with `BSON.EJSON.deserialize()` |
| Store non-id 24-character hex strings | Add the field to `autoConvertObjectId.excludeFields` |
