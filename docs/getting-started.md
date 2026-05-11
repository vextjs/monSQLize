# 快速开始

## 适用范围

本页覆盖当前 TS 版 `monSQLize` 已正式承接的最小上手路径：

- 安装
- 初始化 `MonSQLize`
- `connect()`
- `collection()`
- 基础写入与查询
- 连接关闭

## 安装

```bash
npm install monsqlize
```

### 当前依赖边界

- 必需运行时依赖：`mongodb`、`schema-dsl`、`ssh2`
- 可选缓存依赖：`ioredis`
- 当前 Node.js 基线：`>=18.0.0`

## 最小连接示例

```javascript
const MonSQLize = require('monsqlize');

const msq = new MonSQLize({
    type: 'mongodb',
    databaseName: 'mydb',
    config: { uri: 'mongodb://localhost:27017' },
});

await msq.connect();

const users = msq.collection('users');
await users.insertOne({
    username: 'ada',
    email: 'ada@example.com',
    createdAt: new Date(),
});

const user = await users.findOne({ email: 'ada@example.com' });
console.log(user);

await msq.close();
```

## 仓库内可执行示例

若你在当前仓库中验证最小路径，可直接运行：

```bash
npm run build
npm run test:examples
```

当前官方示例文件是 `examples/quick-start/basic-connect.ts`，验证时会先编译再执行。该示例会：

1. 启动内存 MongoDB
2. 创建 `MonSQLize` 实例并连接
3. 写入一条用户数据
4. 读回该数据并打印结果
5. 关闭连接并清理临时数据库

## 当前正式承接范围

### 已正式承接

- `connect()` / `close()`
- `collection()` / `db()` / `use()`
- 基础查询 façade：`find` / `findOne` / `count` / `aggregate` / `distinct` / `findPage` / `watch`
- 基础与便利写入：`insertOne`、`updateOne`、`deleteOne`、`insertMany`、`updateMany`、`deleteMany`、`replaceOne`、`findOneAnd*`、`upsertOne`
- 批量写入扩展：`insertBatch` / `updateBatch` / `deleteBatch` / `incrementOne`

### 仍建议参考 `monSQLize-v1`

- 尚未在当前 `docs/**` 中展开的历史专题说明
- 更细粒度的场景化迁移示例
- 旧版完整章节化说明

## 常见注意事项

1. `connect()` 前直接访问 `collection()` 会触发 `NOT_CONNECTED`。
2. 缺少 `config.uri` 会触发 `INVALID_CONFIG`。
3. 当前仓库是 TS 重写版本，但对外消费入口仍保持 CJS / ESM / `index.d.ts` 兼容。

