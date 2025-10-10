# monSQLize

一个面向多数据库的统一（Mongo 风格）读 API。目前支持 MongoDB。目标是在不同后端之间平滑切换，同时保持熟悉的查询形态与选项。

## 目录
- [状态](#status)
- [安装](#install)
- [快速开始](#quick-start)
- [聚合查询（aggregate）](#aggregate)
- [深度分页（聚合版，Mongo）](#deep-pagination-agg)
- [统一 findPage：游标 + 跳页 + offset + totals](#findpage-unified)
- [返回耗时（meta）](#返回耗时meta)
- [缓存与失效](#cache)
  - [缓存配置](#缓存配置)
  - [缓存行为与细节](#缓存行为与细节)
  - [统计与可观测性](#统计与可观测性)
  - [缓存操作方法](#缓存操作方法)
  - [invalidate(op) 用法](#invalidate)
- [跨库访问注意事项](#cross-db)
- [说明](#notes)
- [事件（Mongo）](#事件mongo)
- [健康检查与事件（Mongo）](#健康检查与事件mongo)

<a id='status'></a>
## 状态（速览）

- 已实现：MongoDB 适配器；find/findOne/count；内置缓存（TTL/LRU/命名空间失效/并发去重）；跨库访问；默认值（maxTimeMS/findLimit）；慢查询日志；TypeScript 类型。
- 新增：多层缓存（本地+远端，MultiLevelCache）；更多数据库适配器（PostgreSQL/MySQL/SQLite）、ESM 条件导出、深分页/流式返回/聚合等仍在规划中。
- 完整能力矩阵与路线图请见：STATUS.md。

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

<a id='aggregate'></a>
## 聚合查询（aggregate）
> 提示：可在构造时通过 defaults 配置 aggregateMaxTimeMS（默认 10s）。如需允许落盘，请在本次调用显式传入 allowDiskUse: true。
`aggregate(options)`  支持以数组形式传入聚合管道，并在管道中使用 `$lookup` 等操作符进行联表查询。

- 适用：复杂查询与报表，或需要联表的场景。
- 缓存：仅当 `options.cache>0` 时启用；缓存键包含 `op=aggregate | pipelineHash`。
- 透传（Mongo 专属）：支持在 options 里传 `hint`/`collation`，分别透传至 `aggregate` 的 `hint`/`collation`。
> 兼容性提示：`aggregate hint` 需要较新的 MongoDB/Node 驱动版本（建议 MongoDB ≥ 4.2，Node 驱动 ≥ 5.x）。

示例：
```js
const MonSQLize = require('monsqlize');
const { collection } = await new MonSQLize({
  type: 'mongodb',
  databaseName: 'example',
  config: { uri: 'mongodb://localhost:27017' },
}).connect();

const pipeline = [
  {
    $lookup: {
      from: 'user',
      let: { userId: { $toObjectId: '$userId' } },
      pipeline: [ { $match: { $expr: { $eq: ['$_id','$$userId'] } } } ],
      as: 'userInfo'
    }
  },
  { $match: { status: 'paid' } },
  { $sort: { createdAt: -1, _id: 1 } },
  { $limit: 10 }
];

// 聚合查询
const result = await collection('orders').aggregate(pipeline, {
  cache: 3000,
});
console.log(result);
```
> 说明：当前 Mongo 适配器的 `aggregate` 基于原生驱动实现，未来跨数据库将复用该方法名，以各自最优实现（如 SQL Join）。


<a id='deep-pagination-agg'></a>
## 深度分页（聚合版，Mongo）
> 提示：可在构造时通过 defaults 配置 findPageMaxLimit（默认 500）。如需聚合允许落盘，请在本次调用显式传入 allowDiskUse: true；未来版本可能提供 cursorSecret 以增强游标防篡改。
`findPage(options)` 采用“游标（after/before）+ 稳定排序（默认 `_id:1`，自动补 `_id`）+ limit+1 探测”的方式分页，页内可执行 `$lookup` 等聚合阶段。

- 适用：排序与游标锚点来自主集合字段（如 `_id`、`createdAt` 等）。
- 方向：`after` 表示“下一页”；`before` 表示“上一页”（查询阶段反转排序，返回前再恢复顺序）。
- 缓存：仅当 `options.cache>0` 时启用；缓存键包含 `op=findPage | query | sort | limit | after|before | pipelineHash`。
- 透传（Mongo 专属）：支持在 options 里传 `hint`/`collation`，分别透传至 `aggregate` 的 `hint`/`collation`。
> 兼容性提示：`aggregate hint` 需要较新的 MongoDB/Node 驱动版本（建议 MongoDB ≥ 4.2，Node 驱动 ≥ 5.x）。

示例：
```js
const MonSQLize = require('monsqlize');
const { collection } = await new MonSQLize({
  type: 'mongodb',
  databaseName: 'example',
  config: { uri: 'mongodb://localhost:27017' },
}).connect();

const lookup = [{
  $lookup: {
    from: 'user',
    let: { userId: { $toObjectId: '$userId' } },
    pipeline: [ { $match: { $expr: { $eq: ['$_id','$$userId'] } } } ],
    as: 'userInfo'
  }
}];

// 首页
let page = await collection('orders').findPage({
  query: { status: 'paid' },
  sort: { createdAt: -1, _id: 1 },
  limit: 10,
  pipeline: lookup,
  cache: 3000,
});

// 下一页（after）
page = await collection('orders').findPage({
  query: { status: 'paid' },
  sort: { createdAt: -1, _id: 1 },
  limit: 10,
  pipeline: lookup,
  after: page.pageInfo.endCursor,
});

// 上一页（before）
page = await collection('orders').findPage({
  query: { status: 'paid' },
  sort: { createdAt: -1, _id: 1 },
  limit: 10,
  pipeline: lookup,
  before: page.pageInfo.startCursor,
});
```
> 说明：当前 Mongo 适配器的 `findPage` 基于聚合管道实现（先分页后联表）。未来跨数据库将复用该方法名，以各自最优实现（如 SQL Keyset）。

<a id='findpage-unified'></a>
## 统一 findPage：游标 + 跳页 + offset + totals

自 vNext 起，`collection.findPage(options)` 在保持 after/before 语义不变的同时，新增：
- 跳页（`page`）：基于“书签（bookmark）+ 少量 after”快速跳转到第 N 页；书签默认复用实例缓存（cache），键前缀 `bm:`。
- offset 兜底（`offsetJump`）：当 `(page-1)*limit ≤ maxSkip` 时，内部使用 `$skip+$limit` 一次性定位，并回填当页书签。
- 总数（`totals`）：提供 `none|async|approx|sync` 模式；缓存键前缀 `tot:`，默认 `none`。

### 参数（向后兼容，含注释）
```
findPage({
  // —— 基本 ——
  query?: object,                     // Mongo 查询条件
  pipeline?: object[],                // 页内联表/投影（仅对本页 limit 条生效）
  sort?: Record<string, 1|-1>,        // 稳定排序；未补 _id 时内部自动补 `_id:1`
  limit: number,                      // 页大小：1..MAX_LIMIT（默认 MAX_LIMIT=500）
  after?: string,                     // 下一页游标；与 before/page 互斥
  before?: string,                    // 上一页游标；与 after/page 互斥

  page?: number,                      // 目标页（≥1）；与 after/before 互斥
  // —— 跳页（书签）可选 ——
  jump?: {
    step?: number,                    // 书签密度：每隔 step 页存一个书签；默认 10
    maxHops?: number,                 // 单次跳页允许的“连续 after 次数（累计）”上限；默认 20
    keyDims?: object,                 // 可选；未传则自动生成去敏形状（db/coll/sort/limit/queryShape/pipelineShape）
    // 注意：书签默认复用实例 cache，无需显式传 getBookmark/saveBookmark
  },

  // —— 小范围 offset 兜底（可选） ——
  offsetJump?: {
    enable?: boolean,                 // 开启后，当 skip=(page-1)*limit ≤ maxSkip 时走 `$skip+$limit`
    maxSkip?: number,                 // 默认 50_000；超过则回退到“书签跳转”逻辑
  },

  // —— 总数/总页数（可选增强） ——
  totals?: {
    mode?: 'none'|'async'|'approx'|'sync', // 默认 'none'
    maxTimeMS?: number,              // 用于 `countDocuments` 的超时（sync/async）
    ttlMs?: number,                  // 总数缓存 TTL（async/approx），默认 10 分钟
    hint?: any,                      // 计数 hint（可选）
    collation?: any,                 // 计数 collation（可选，与列表一致更安全）
  },

  // —— 透传与通用 ——
  cache?: number,                    // 读穿缓存 TTL（毫秒）；>0 才缓存；0/未传直连
  maxTimeMS?: number,                // 聚合超时；默认继承实例 defaults.maxTimeMS
  allowDiskUse?: boolean,            // 聚合允许落盘（大管道时启用），显式开启（默认不启用）
  hint?: any,                        // 聚合 hint ，仅当需要强制索引时传（可选）
  collation?: any,                   // 聚合 collation 需要区域性比较时传（可选）
})
```
- 默认值一览（无特殊说明均可被本次调用覆盖）：
  - 基本：
    - limit：1..MAX_LIMIT（默认 MAX_LIMIT=500，可通过构造参数 defaults.findPageMaxLimit 调整上限）
    - sort：未补 `_id` 时自动补 `_id:1`
    - cache：默认不缓存（0/未传）；>0 则缓存对应毫秒
    - maxTimeMS：默认继承实例 defaults.maxTimeMS（示例：2000）
    - allowDiskUse：默认 false（遵循驱动默认）
    - hint/collation：默认不传（透传时请与列表行为一致）
  - 跳页（书签，jump）：
    - step：10（每隔 step 页保存一个书签）
    - maxHops：20（整次跳页允许的“连续 after 次数”累计上限）
    - maxPages：10000（书签写入的页数上限，超过不上新书签）
    - keyDims：未传时自动生成（去敏形状：db/coll/sort/limit/queryShape/pipelineShape）
    - 书签 TTL：6 小时（从实例 defaults.bookmarks.ttlMs 读取，未设则使用 6h）
    - 存储：默认复用实例 cache（键前缀 `bm:`）
  - offset 兜底（offsetJump）：
    - enable：默认不启用
    - maxSkip：50_000（当 skip=(page-1)*limit ≤ maxSkip 时启用 `$skip+$limit` 一次定位）
  - 总数（totals）：
    - mode：'none'（可选 'async'|'approx'|'sync'）
    - maxTimeMS：sync/async 模式下默认 2000（可覆盖）
    - ttlMs：10 分钟（async/approx 使用；缓存键前缀 `tot:`）
    - hint/collation：默认不传（按需透传）
- 书签/总数键采用“去敏形状哈希”：包含 `db/coll/sort/limit/queryShape/pipelineShape`，不含任何具体值。
- 互斥规则：`after` 与 `before` 互斥；`page` 与 `after/before` 互斥（冲突将抛 `VALIDATION_ERROR`）。

> 默认值优先级（从高到低）：
> 1) 本次调用 options.*（如 jump.step、totals.ttlMs 等）
> 2) 实例构造时的 defaults（如 defaults.maxTimeMS、defaults.findPageMaxLimit、defaults.bookmarks.{step,maxHops,ttlMs}）
> 3) 内置硬编码默认（step=10、maxHops=20、书签TTL=6h、offset.maxSkip=50k、totals.mode='none'、totals.ttl=10m）

> 可选：在实例级配置书签默认（无须单次传 getBookmark/saveBookmark）：
> ```js
> const msq = new MonSQLize({
>   type: 'mongodb', databaseName: 'example', config: { uri: 'mongodb://localhost:27017' },
>   maxTimeMS: 3000,
>   // 书签默认（可省略，使用内置 10/20/6h）
>   bookmarks: { step: 10, maxHops: 20, ttlMs: 6*3600_000 },
>   cache: { maxSize: 100000, enableStats: true },
> });
> ```

### 返回结构
```
{
  items: any[],
  pageInfo: {
    hasNext: boolean,
    hasPrev: boolean,
    startCursor: string | null,
    endCursor: string | null,
    currentPage?: number, // 仅跳页/offset 模式回显目标页号（逻辑页号）
  },
  totals?: {
    mode: 'async'|'sync'|'approx',
    total?: number|null|undefined,   // async: null（未就绪）；approx: undefined（未知或近似）
    totalPages?: number|null|undefined,
    token?: string,                  // async 时返回的短标识（<keyHash>），用于轮询获取总数；服务端应据命名空间重建完整缓存键
    ts?: number,                     // 写入时间戳（毫秒），如果来自缓存
    error?: string                   // 仅 async：统计失败时可能附带的错误标识（例如 'count_failed'）
  }
}
```

### 示例
- 跳到第 37 页 + 异步总数
```js
const res = await coll.findPage({
  query:{ status:'paid' }, sort:{ createdAt:-1, _id:1 }, limit:50,
  page:37,
  jump:{ step:20, maxHops:25 },
  totals:{ mode:'async', maxTimeMS:1500, ttlMs: 10*60_000 },
  cache: 2000,
});
console.log(res.pageInfo.currentPage); // 37
console.log(res.totals && res.totals.token); // 用于轮询总数
```

- 小范围 offset 兜底
```js
const page200 = await coll.findPage({
  query: { status: 'paid' },
  sort: { createdAt: -1, _id: 1 },
  limit: 50,
  page: 200,
  offsetJump: { enable: true, maxSkip: 50_000 },
});
console.log(page200.pageInfo.currentPage); // 200
```

- 异步 totals 轮询接口（服务层示例）
```js
// 列表接口：返回分页 + totals.token
app.get('/orders', async (req, res) => {
  const page = Number(req.query.page || 1);
  const data = await coll.findPage({
    query: { status: 'paid' }, sort: { createdAt: -1, _id: 1 }, limit: 50,
    page, totals: { mode: 'async', maxTimeMS: 1500, ttlMs: 10*60_000 }
  });
  res.json(data);
});

// 轮询总数：前端传回短 token（<keyHash>），服务端据命名空间重建完整缓存键
app.get('/list/total', async (req, res) => {
  const token = String(req.query.token || ''); // token = '<keyHash>'
  const ns = accessor.getNamespace().ns;      // 例如 `${iid}:${type}:${db}:${collection}`
  const key = `${ns}:tot:${token}`;
  const cached = await msq.getCache().get(key);
  res.json(cached || { total: null, totalPages: null });
});
```

### 错误码（集中）
- `VALIDATION_ERROR`
  - 触发：`limit` 不在 1..MAX_LIMIT；`after/before` 同时出现；`page` 与 `after/before` 冲突。
  - 处理：修正参数；若为冲突，移除其一。
- `INVALID_CURSOR`
  - 触发：游标中的 `sort` 与当前 `sort` 不一致，或游标结构错误。
  - 处理：清理对应书签；使用新的排序重新获取游标/书签；或等待书签 TTL 过期后重试。
- `JUMP_TOO_FAR`
  - 触发：本次跳页需要的推进次数累计超过 `maxHops` 限制。
  - 处理：增大书签密度 `step` 或预热；在小范围偏移下启用 `offsetJump`；或缩小目标页号范围。

### 注意与最佳实践
- 跳页路线始终为“从最近书签的 endCursor 向后推进”，`before` 仅用于上一页视觉行为，不参与跳页计算。
- 为 `sort` 建立一致的复合索引（如 `{ createdAt:-1, _id:1 }`）。
- 书签 TTL 建议 6~24 小时；数据变动率高的集合可适当缩短 TTL 并提高 `step` 密度。
- 远跳页不要靠放大 `maxHops` 硬顶，应依赖书签密度或在低峰期预热书签。
- 页内 `pipeline` 尽量 `$project` 裁剪，必要时 `allowDiskUse:true`。
- 缓存：仅当 `options.cache>0` 时缓存分页结果；不同 `after/before/page/pipeline` 会生成不同缓存键。
- currentPage 仅在跳页/offset 模式回显（Keyset 分页不天然携带“物理页号”语义）。

<a id='cache'></a>
## 默认配置（defaults）
- maxTimeMS：全局默认查询超时（毫秒），默认 2000；单次可用 options.maxTimeMS 覆盖。
- findLimit：find 未传 limit 时的默认页大小，默认 10；传 0 表示不限制（谨慎）。
- slowQueryMs：慢查询阈值（毫秒），默认 500。
- namespace.scope：命名空间策略，默认 'database'；可选 'connection'。
- findPageMaxLimit：深分页页大小上限，默认 500。
- log.slowQueryTag：慢日志标签（event/code），可覆盖；可选提供 log.formatSlowQuery(meta) 自定义日志结构。

> 提示：上述默认项均可在实例构造参数中按需覆盖；getDefaults() 可查看当前实例的只读默认视图。

## 缓存与失效

- 默认提供内存缓存（LRU + 惰性过期），也可传入自定义缓存实现（需实现标准接口：get/set/del/delPattern/keys 等）。
- 读穿（read-through）策略：当 options.cache>0 时开启缓存；0 或未传则直连数据库。
- TTL 单位为毫秒；允许缓存 null（仅将 undefined 视为未命中）。
- 键采用稳定序列化，确保同一查询结构产生相同键（含常见 BSON 类型）。

### 缓存配置
> 提示：当 `cache` 传入的是“有效的实例”时，优先直接使用该实例；只有当 `cache` 为“普通对象”时，才会按配置解析（如 multiLevel/local/remote 等）。
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



### 多层缓存（本地+远端）
- 通过配置 `cache.multiLevel=true` 启用；默认本地内存 + 可选远端实现（用户可注入 Redis/Memcached 等实现）。
- 读路径：本地命中最快；本地未命中则查远端；远端命中将异步回填本地；两者均未命中则回源数据库并双写缓存。
- 写路径：默认双写（本地+远端）；可配置 `writePolicy='local-first-async-remote'` 以降低尾延迟。
- 失效：集合访问器 `invalidate(op?)` 复用原有命名空间键形状，调用后将执行本地 delPattern；如需跨节点一致性，可结合外部 pub/sub 在构造 MultiLevelCache 时传入 `publish` 函数。
- 降级：远端不可用时不影响正确性，最多影响命中率。

示例：
```js
const MonSQLize = require('monsqlize');
const msq = await new MonSQLize({
  type: 'mongodb',
  databaseName: 'example',
  config: { uri: 'mongodb://localhost:27017' },
  cache: {
    multiLevel: true,
    // 本地层：使用内置内存缓存配置
    local: { maxSize: 100000, enableStats: true },
    // 远端层：可注入一个实现了 CacheLike 的适配器；
    // 若仅提供普通对象，这里会退化为一个“内存实现”占位（方便本地开发）
    // 生产环境建议注入真正的远端实现（如 Redis 适配器）。
    remote: { /* 例如：由业务注入 redisCache 实例 */ },
    policy: {
      writePolicy: 'local-first-async-remote',
      backfillLocalOnRemoteHit: true,
    }
  },
}).connect();
```

提示：也可在上层自行构建 MultiLevelCache 并作为 `cache` 直接注入（需 `require('monsqlize/lib/multi-level-cache')`）。


## 返回耗时（meta）
- 支持在所有读 API 上按次返回耗时与元信息（opt-in，不改默认返回类型）。
- 使用方法：在 options 中传入 `meta: true` 或 `meta: { level: 'sub', includeCache: true }`。
  - findOne/find/count/find：当 `meta` 为真时返回 `{ data, meta }`；不传则维持原返回（对象/数组/数字）。
  - findPage：当 `meta` 为真时在返回对象上附加 `meta` 字段；`level:'sub'` 时返回每个 hop/offset 的子步骤耗时。

示例：
```js
// 单条查询：返回耗时
const { data, meta } = await coll.findOne({ query:{ name: 'Alice' }, cache: 2000, maxTimeMS: 1500, meta: true });
console.log(meta.durationMs);

// 分页：总耗时
const page = await coll.findPage({ query:{ status:'paid' }, sort:{ createdAt:-1,_id:1 }, limit:20, page:37, meta:true });
console.log(page.meta.durationMs);

// 分页：子步骤耗时（跳页时可见每个 hop 的耗时）
const page2 = await coll.findPage({ query:{ status:'paid' }, sort:{ createdAt:-1,_id:1 }, limit:20, page:128, jump:{ step:20 }, meta:{ level:'sub', includeCache:true } });
console.table(page2.meta.steps);
```

> 说明：
> - 默认不返回 meta，需显式开启；开销很小，仅一次时间戳与对象组装。
> - includeCache 仅包含去敏维度（如 cacheTtl 等，具体依实现）。

## 事件（Mongo）
- 事件基于 Node.js EventEmitter，进程内有效：
  - `connected`: `{ type, db, scope, iid? }`
  - `closed`: `{ type, db, iid? }`
  - `error`: `{ type, db, error, iid? }`
  - `slow-query`: `{ op, ns, durationMs, startTs, endTs, maxTimeMS, ... }`（去敏）
  - `query`（可选）：每次读操作完成后触发；需在构造 defaults 中开启 `metrics.emitQueryEvent=true`。
- 实例还暴露：`on/off/once/emit`。

用法示例：
```js
const msq = new MonSQLize({ type:'mongodb', databaseName:'example', config:{ uri:'mongodb://localhost:27017' }, defaults:{ metrics:{ emitQueryEvent:false } } });
msq.on('connected', info => console.log('[connected]', info));
msq.on('closed', info => console.log('[closed]', info));
msq.on('error', info => console.error('[error]', info));
msq.on('slow-query', meta => console.warn('[slow-query]', meta));
// 可选：开启 query 事件
// const msq = new MonSQLize({ ..., defaults:{ metrics:{ emitQueryEvent:true } } });
msq.on('query', meta => console.log('[query]', meta));
await msq.connect();
```

## 健康检查与事件（Mongo）
- 健康检查：`await msq.health()` 返回 `{ status: 'up'|'down', connected, defaults, cache?, driver }` 摘要视图。
- 事件钩子：
  - `msq.on('connected', payload => {})`
  - `msq.on('closed', payload => {})`
  - `msq.on('error', payload => {})`
  - `msq.on('slow-query', meta => {})`（仅输出去敏形状与阈值/耗时等元信息，不含敏感值）

示例：
```js
const msq = new MonSQLize({ type:'mongodb', databaseName:'example', config:{ uri:'mongodb://localhost:27017' } });
msq.on('slow-query', (meta) => console.warn('slow-query', meta));
await msq.connect();
console.log(await msq.health());
```
