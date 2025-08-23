# monSQLize

一个面向多数据库的统一（Mongo 风格）读 API。目前支持 MongoDB。目标是在不同后端之间平滑切换，同时保持熟悉的查询形态与选项。

## 目录
- [状态](#status)
- [安装](#install)
- [快速开始](#quick-start)
- [缓存与失效](#cache)
  - [缓存配置](#缓存配置)
  - [缓存行为与细节](#缓存行为与细节)
  - [统计与可观测性](#统计与可观测性)
  - [缓存操作方法](#缓存操作方法)
  - [invalidate(op) 用法](#invalidate)
  - [进阶：手动失效](#cache-advanced)
- [跨库访问注意事项](#cross-db)
- [说明](#notes)

<a id='status'></a>
## 状态（总览）

> 说明：本表统一四列（分类 | 能力 | 状态 | 备注），状态使用标记：✅ 已实现、❌ 未实现、🗺️ 计划中。

| 分类 | 能力 | 状态 | 备注 |
|---|---|---|---|
| 数据库类型 | MongoDB | ✅ 已实现 | 当前唯一已实现适配器 |
| 数据库类型 | PostgreSQL | 🗺️ 计划中 | 未实现 |
| 数据库类型 | MySQL | 🗺️ 计划中 | 未实现 |
| 数据库类型 | SQLite | 🗺️ 计划中 | 未实现 |
| 数据库类型 | 查询运算符映射（operators） | 🗺️ 计划中 | 预研草案，尚未实现跨库翻译 |
| 数据模型/Schema | Schema 能力 | ❌ 未实现 | 由上层应用自行约束 |
| 读 API（Read） | findOne | ✅ 已实现 | 支持 projection、sort、cache、maxTimeMS |
| 读 API（Read） | find | ✅ 已实现 | 支持 limit/skip 普通分页；未传 limit 使用全局 findLimit（默认 10）；limit=0 表示不限制 |
| 读 API（Read） | 深分页（游标/主键） | ❌ 未实现 | 计划中 |
| 读 API（Read） | 链表/聚合驱动分页 | ❌ 未实现 | 计划中 |
| 读 API（Read） | count | ✅ 已实现 | 统计匹配文档数 |
| 读 API（Read） | stream（find 流式返回） | ❌ 未实现 | 计划中 |
| 读 API（Read） | 聚合（aggregate/或 find 支持聚合） | ❌ 未实现 | 后续可能透传或翻译 |
| 缓存与失效 | 内置内存缓存 | ✅ 已实现 | 读穿、TTL（毫秒）、LRU、惰性过期、并发去重 |
| 缓存与失效 | 稳定序列化键 | ✅ 已实现 | 支持常见 BSON；keys()/delPattern()；统计（enableStats 可选） |
| 缓存与失效 | 命名空间与精准失效 | ✅ 已实现 | collection.invalidate(op?)；getNamespace() |
| 缓存与失效 | 多层缓存（本地+远端） | 🗺️ 计划中 | 未实现 |
| 跨库访问 | 跨库读与失效 | ✅ 已实现 | db('<目标库>').collection('<集合>') 支持 find/findOne/count/invalidate |
| 超时与慢日志 | 全局默认值 | ✅ 已实现 | maxTimeMS、findLimit 构造时设定，单次可覆盖 |
| 超时与慢日志 | 慢查询日志 | ✅ 已实现 | slowQueryMs（默认 500ms）；日志包含安全字段与查询形状（无敏感值） |
| 类型与接口 | TypeScript 类型声明 | ✅ 已实现 | index.d.ts；含 CacheLike、Find/Count、getNamespace、getDefaults |
| 类型与接口 | getDefaults() | ✅ 已实现 | 返回当前实例默认配置视图 |
| 类型与接口 | 模块格式 | 🗺️ 计划中 | 目前 CJS；ESM 条件导出未实现 |
| 连接与运维 | connect/close | ✅ 已实现 | 连接与关闭 |
| 连接与运维 | 健康检查/事件钩子 | 🗺️ 计划中 | 未实现 |
| 写相关辅助 | createCollection/createView/dropCollection | ✅ 已实现 | Mongo 适配器功能 |
| 写相关辅助 | 写后读缓存一致性 | 手动 | 不自动失效，建议写后调用 collection.invalidate(op?) |
| 其他 | 安全默认 | ✅ 已实现 | find 未指定 limit 使用全局 findLimit；limit=0 表示不限制 |
| 其他 | 命名空间 instanceId | ✅ 已实现 | 可显式指定或自动生成；scope 支持 database/connection |

<a id='install'></a>
## 安装
```
npm i monsqlize
```

<a id='quick-start'></a>
## 快速开始（含默认配置与自动 instanceId）
```js
const MonSQLize = require('monsqlize');
(async () => {
    const { db, collection } = await (new MonSQLize({
        type: 'mongodb',
        databaseName: 'example',
        config: { uri: 'mongodb://localhost:27017' },
        maxTimeMS: 3000, //全局默认配置（本实例的默认 maxTimeMS）
        findLimit:10,  // 分成查询每页数量，默认:10
    }).connect());

  // 单次查询可覆盖 maxTimeMS；cache 为毫秒
  const one = await collection('test').findOne({ query: {}, cache: 5000, maxTimeMS: 1500 });
  console.log(one);

  // find 的安全默认：未传 limit 时使用全局 findLimit（默认 10）；传 0 表示不限制
  const list = await collection('test').find({ query: {} }); // 等效 limit=10
  const all = await collection('test').find({ query: {}, limit: 0 }); // 不限制

  // 写后失效（可选 op：'find' | 'findOne' | 'count'）
  await collection('test').invalidate();      // 失效该集合的全部读缓存
  await collection('test').invalidate('find'); // 仅失效 find 的缓存

  // —— 跨库访问（Cross-DB）——
  // 1) 访问其他数据库下的集合
  const docOther = await db('analytics').collection('events').findOne({
    query: { type: 'click' },
    cache: 3000,             // 可选缓存（毫秒）
    maxTimeMS: 1500          // 单次查询的超时覆盖
  });
  console.log('analytics.events ->', docOther);

  // 2) 在同一调用中进行多次跨库查询（顺序执行）
  const [u1, u2] = [
    await db('users_db').collection('users').findOne({ query: { name: 'Alice' }, cache: 2000 }),
    await db('users_db').collection('users').findOne({ query: { name: 'Bob' } })
  ];
  console.log(u1, u2);
})();
```

<a id='cache'></a>
## 缓存与失效

- 默认提供内存缓存（LRU + 惰性过期），也可传入自定义缓存实现（需实现标准接口：get/set/del/delPattern/keys 等）。
- 读穿（read-through）策略：当 options.cache>0 时开启缓存；0 或未传则直连数据库。
- TTL 单位为毫秒；允许缓存 null（仅将 undefined 视为未命中）。
- 键采用稳定序列化，确保同一查询结构产生相同键（含常见 BSON 类型）。

### 缓存配置
- 方式一：传入“配置对象”，自动创建内置内存缓存
```js
const { db, collection } = await new MonSQLize({
  type: 'mongodb',
  databaseName: 'example',
  config: { uri: 'mongodb://localhost:27017' },
  // 缓存配置（创建默认内存缓存实例）
  cache: {
    maxSize: 100000,          // 最大键数量（默认 100000）
    maxMemory: 0,             // 最大内存占用（字节）；0 表示不限制
    enableStats: true,        // 是否启用命中率等统计（默认 true）
  },
  // 全局查询默认值
  maxTimeMS: 3000,
  findLimit: 10,
}).connect();
```

- 方式二：注入自定义缓存实例（需实现 CacheLike 接口）
```ts
// TypeScript 接口（简化），见 index.d.ts 的 CacheLike
interface CacheLike {
  get(key: string): Promise<any>;
  set(key: string, val: any, ttl?: number): Promise<void>;
  del(key: string): Promise<boolean>;
  exists(key: string): Promise<boolean>;
  getMany(keys: string[]): Promise<Record<string, any>>;
  setMany(obj: Record<string, any>, ttl?: number): Promise<boolean>;
  delMany(keys: string[]): Promise<number>;
  delPattern(pattern: string): Promise<number>;
  clear(): void;
  keys(pattern?: string): string[];
  getStats?(): any;
}
```
```js
// 注入自定义实现（例如封装 Redis/Memcached/本地 LRU 等），只要方法签名一致即可
// 假设已获得自定义缓存实例
const customCache = getCustomCache();
const msq = new MonSQLize({
  type: 'mongodb',
  databaseName: 'example',
  config: { uri: 'mongodb://localhost:27017' },
  cache: customCache,
});
await msq.connect();
```

- 每次查询是否使用缓存由“查询级 options.cache”决定：
  - >0：使用读穿缓存，单位毫秒（TTL）
  - 0 或未传：绕过缓存，直连数据库

### 缓存行为与细节
- 读穿（read-through）：首次未命中会执行实际查询，结果写入缓存；命中直接返回缓存。
- 并发去重：相同键的并发请求共享同一 Promise，避免对后端的 thundering herd（参见 lib/cache.js 中 __inflight 逻辑）。
- LRU 淘汰：超出 maxSize 或 maxMemory 时，从最久未使用的键开始淘汰。
- TTL 精度：以毫秒为单位；采用“惰性过期”，即在读取/扫描时才判断过期、并清理键。
- 值语义：允许缓存 null；仅将 undefined 视为未命中（便于明确区分“确无数据”和“未缓存”）。
- 键生成：采用稳定序列化（stableStringify），对象键排序、数组保序；内置支持常见 BSON 类型（ObjectId、Decimal128、Long、UUID、Binary）。
- 内存估算：内置缓存对 value 进行粗略 size 估算（JSON.stringify 长度等），仅用于淘汰策略，并非精确内存计量。

### 统计与可观测性
- 获取底层缓存实例，并查看统计/键：
```js
const msq = new MonSQLize({ /* ... */ });
await msq.connect();
const cache = msq.getCache();

// 命中率与基本统计（需 enableStats=true）
const stats = cache.getStats && cache.getStats();
console.log('cache stats:', stats);

// 列出当前所有键（或按简单通配过滤）
console.log(cache.keys());         // 全部键
console.log(cache.keys('*users*')); // 仅包含 users 的键
```
- 手动清理：
```js
cache.clear();                 // 清空全部缓存（谨慎使用）
await cache.delPattern('*x*'); // 通配删除，复杂场景建议使用更强的外部缓存
```

<a id='缓存操作方法'></a>
### 缓存操作方法
- 以下方法由内置内存缓存与自定义 CacheLike 实现共同支持。先通过实例方法 `getCache()` 获取缓存对象：
```js
const msq = new MonSQLize({ /* ... */ });
await msq.connect();
const cache = msq.getCache();
```

- 方法速览：
  - `get(key: string): Promise<any>` 获取键值（未命中返回 undefined；允许缓存 null）。
  - `set(key: string, val: any, ttl?: number): Promise<void>` 设置键值与可选 TTL（毫秒）。
  - `del(key: string): Promise<boolean>` 删除单个键。
  - `exists(key: string): Promise<boolean>` 判断键是否存在且未过期。
  - `getMany(keys: string[]): Promise<Record<string, any>>` 批量获取。
  - `setMany(obj: Record<string, any>, ttl?: number): Promise<boolean>` 批量设置。
  - `delMany(keys: string[]): Promise<number>` 批量删除，返回删除数量。
  - `delPattern(pattern: string): Promise<number>` 按通配模式删除（内存实现为 O(N) 扫描）。
  - `clear(): void` 清空所有键（谨慎使用）。
  - `keys(pattern?: string): string[]` 列出键（可选通配模式）。
  - `getStats?(): any` 返回命中率、淘汰数、内存估算等统计（若启用）。

- 使用示例：
```js
// 单键 set/get
await cache.set('foo', { a: 1 }, 5000); // TTL 5s
const foo = await cache.get('foo');     // => { a: 1 }

// 判断存在/删除
const ok = await cache.exists('foo');   // true/false
await cache.del('foo');

// 批量操作
await cache.setMany({
  'k:1': { id: 1 },
  'k:2': { id: 2 },
}, 3000);
const many = await cache.getMany(['k:1', 'k:2']);
const removed = await cache.delMany(['k:1', 'k:2']);

// 模式删除与列举
await cache.delPattern('*users*');
const userKeys = cache.keys('*users*');

// 统计（需 enableStats）
const stats = cache.getStats && cache.getStats();
console.log(stats);
```

<a id='invalidate'></a>
### invalidate(op) 用法
- 作用：失效目标集合在当前命名空间（iid/type/db/collection）下的读缓存。
- op 可选：'find' | 'findOne' | 'count'。不传 op 表示失效该集合的全部读缓存。
- 示例：
```js
await collection('users').invalidate();         // 删除 users 集合所有读缓存
await collection('users').invalidate('find');   // 仅删除 find 相关缓存
```
- 典型时机：写操作（insert/update/delete/bulk）后调用，以保证读缓存与数据库一致。

<a id='cache-advanced'></a>
### 进阶：手动失效
- 建议优先使用集合访问器的 invalidate(op?) 进行失效。
- 如需更粗粒度的手动操作，可通过实例方法 getCache() 获取底层缓存实例：
```js
const msq = new MonSQLize({ /* ... */ });
await msq.connect();
const cache = msq.getCache();

// 清空全部缓存（谨慎使用）
cache.clear();

// 按简单模式删除包含某集合名的键（实现为通配匹配）
await cache.delPattern('*users*');
```
- 注意：底层内存缓存的 delPattern 为 O(N) 扫描，适合中小规模场景；重型场景可替换为外部缓存实现。

<a id='cross-db'></a>
## 跨库访问注意事项
- 快速入门的跨库示例与注意点已在「快速开始」中给出，推荐优先阅读该小节。
- 速查清单：
  - 用法：`db('<目标库名>').collection('<集合名>')`，返回集合读访问器，支持 find/findOne/count/invalidate。
  - 失效：跨库失效仍可用集合访问器的 `invalidate(op?)`；或使用 getCache().delPattern 进行批量模式失效。
  - 性能：跨库访问与同库一致；建议为高频跨库查询设置合适的 `cache` TTL 与 `maxTimeMS`。
  - 权限：确保连接账号具备目标库的读权限；否则驱动层会抛出权限错误。

<a id='notes'></a>
## 说明
- 全局 maxTimeMS 为默认值，单次 options.maxTimeMS 优先。
- 全局 findLimit 配置：构造时传入 findLimit（默认 10）。
- 缓存键稳定序列化已支持常见 BSON 类型（ObjectId、Decimal128、Long、UUID、Binary）。

欢迎 PR。


### 辅助方法与慢查询日志
- 获取默认配置（全局 maxTimeMS、findLimit、namespace、slowQueryMs）：
```js
const msq = new MonSQLize({
  type: 'mongodb',
  databaseName: 'example',
  config: { uri: 'mongodb://localhost:27017' },
  slowQueryMs: 800
});
await msq.connect();
console.log(msq.getDefaults());
```
- 获取集合访问器的命名空间（便于调试与手动失效脚本）：
```js
const ns = db('example').collection('users').getNamespace();
// => { iid, type: 'mongodb', db: 'example', collection: 'users' }
```
- 慢查询日志：findOne/find/find/count 会在一次调用耗时超过 slowQueryMs（默认为 500ms）时输出 warn 日志。
