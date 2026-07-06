# ObjectId 转换范围

MongoDB runtime 默认启用 ObjectId 自动转换。它让查询和写入可以接收常见的标识符输入，同时确保写入 MongoDB 的值是实际的 `ObjectId`。

## 会转换什么

| 输入形态 | monSQLize 是否转换 | 结果 |
|----------|--------------------|------|
| 当前 MongoDB driver 的 `ObjectId` | 否 | 原样使用 |
| 来自其他 BSON 或 Mongoose 副本的 ObjectId-like 实例 | 是 | 用当前 MongoDB driver 的 `ObjectId` 重建 |
| 24 位十六进制字符串 | 是，前提是自动转换已启用且路径未被排除 | `ObjectId` |
| `{ "$oid": "..." }` 这类 MongoDB Extended JSON 包装对象 | 不把包装对象本身当作 ObjectId | 传入前先解析 |

monSQLize 判断的是运行时值形态，不是依赖发布号。已经是 `ObjectId` 的值会直接复用；来自其他 BSON 实现但看起来像 ObjectId 的值，会通过十六进制字符串重建。

## 字段范围

自动转换会覆盖标准化后的查询条件和写入文档。只要某个 24 位十六进制字符串所在路径没有被排除，就可能被转换。

如果你的业务字段只是“长得像 ObjectId”的字符串，要把这些字段排除：

```javascript
const db = new MonSQLize({
  type: 'mongodb',
  config: { uri: 'mongodb://localhost:27017/app' },
  autoConvertObjectId: {
    excludeFields: ['traceId', 'external.code']
  }
});
```

只有在你希望所有标识符都按传入值原样发送时，才使用 `autoConvertObjectId: false`。

## 查询示例

```javascript
await db.collection('users').findOne({
  _id: '6975da7914d83bc3e18e8123'
});

await db.collection('orders').find({
  user_id: { $in: ['69005bc26654d09120d0f82a'] }
});
```

这两个示例都会在发送给 MongoDB 前标准化为 `ObjectId`。

## 写入示例

```javascript
await db.collection('orders').insertOne({
  user_id: '69005bc26654d09120d0f82a',
  item_ids: ['68f1d9e7b53745e8627a952f']
});
```

插入和更新 payload 内的 ObjectId-like 值会在写入前标准化。

## Extended JSON 输入

Extended JSON 是传输格式，不是 monSQLize 操作推荐的内存形态。不要在想表达 `_id` 是 ObjectId 时直接传入这种对象：

```javascript
await db.collection('trips').insertOne({
  _id: { $oid: '6975da7914d83bc3e18e8123' }
});
```

应先解析 Extended JSON，或直接创建 `ObjectId`：

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

## 总结

| 场景 | 推荐输入 |
|------|----------|
| 按 id 查询 | `{ _id: '6975da7914d83bc3e18e8123' }` 或 `{ _id: new ObjectId(...) }` |
| 按多个 id 查询 | `{ _id: { $in: ids } }` |
| 插入或更新 id 字段 | `ObjectId` 或 24 位十六进制字符串 |
| 导入 MongoDB Extended JSON | 先用 `BSON.EJSON.deserialize()` 反序列化 |
| 保存非 id 的 24 位十六进制字符串 | 加入 `autoConvertObjectId.excludeFields` |
