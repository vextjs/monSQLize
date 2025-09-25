# STATUS / ROADMAP

说明：本页用于集中呈现 monSQLize 的当前能力矩阵与路线图。状态标记如下：
- ✅ 已实现
- 🗺️ 计划中
- ❌ 未实现

注：状态对应主分支最新实现；历史变化请参见 CHANGELOG。

## 能力矩阵（非表格版）

> 说明：使用分节 + 清单表示。状态：✅ 已实现 | 🗺️ 计划中 | ❌ 未实现 | ☑️ 手动/受限。

### 数据库类型
- ✅ MongoDB
    - 当前唯一已实现适配器。
- 🗺️ PostgreSQL
    - 未实现。
- 🗺️ MySQL
    - 未实现。
- 🗺️ SQLite
    - 未实现。
- 🗺️ 查询运算符映射（operators）
    - 预研草案，尚未实现跨库翻译。

### 数据模型 / Schema
- ❌ Schema 能力
    - 由上层应用自行约束。

### 缓存与失效
- ✅ 内置内存缓存
    - 读穿、TTL（毫秒）、LRU、惰性过期、并发去重。
- ✅ 稳定序列化键
    - 支持常见 BSON；keys()/delPattern()；统计（enableStats 可选）。
- ✅ 命名空间与精准失效
    - collection.invalidate(op?)；getNamespace()。
- ✅ 多层缓存（本地+远端）
    - 提供 MultiLevelCache 组合本地+远端；远端可选，失败降级。

### 跨库访问
- ✅ 跨库读与失效
    - db('…').collection('…') 支持 find/findOne/count/invalidate。

### 超时与慢日志
- ✅ 全局默认值
    - maxTimeMS、findLimit 构造时设定；单次可覆盖。
    - findPageMaxLimit（默认 500）集中在 defaults 中统一管理；allowDiskUse 请在聚合调用处按次设置。
- ✅ 慢查询日志
    - slowQueryMs（默认 500ms）；日志输出安全字段与查询形状（无敏感值）。

### 类型与接口
- ✅ TypeScript 类型声明
    - index.d.ts；含 CacheLike、Find/Count、getNamespace、getDefaults。
- ✅ getDefaults()
    - 返回当前实例默认配置视图。
- 🗺️ 模块格式
    - 目前 CJS；ESM 条件导出未实现。

### 连接与运维
- ✅ connect / close
    - 连接与关闭。
- ✅ 健康检查 / 事件钩子
    - 提供 health() 视图与 on('connected'|'closed'|'error'|'slow-query') 事件（慢查询仅输出去敏形状）。

### 写相关辅助
- ☑️ 写后读缓存一致性
    - 手动：建议写后调用 collection.invalidate(op?)。
- ✅ createCollection / createView / dropCollection（Mongo）
    - 通过 Mongo 适配器提供。

### 其他
- ✅ 安全默认
    - find 未指定 limit 使用全局 findLimit（默认 10）；limit=0 表示不限制。
- ✅ 命名空间 instanceId
    - 可显式指定或自动生成；scope 支持 database/connection。

### 读 API（Read）
- ✅ findOne
    - 支持 projection、sort、cache、maxTimeMS。
- ✅ find
    - 支持 limit/skip 普通分页；未传 limit 使用全局 findLimit（默认 10）；limit=0 表示不限制。
- ✅ 深分页（统一 findPage）
    - 游标 after/before + 跳页 page（书签 bm: + 少量 hops）+ offset 兜底（小范围 `$skip+$limit`）+ totals（none/async/approx/sync）。
    - 稳定排序（默认补 `_id`）；页内 `$lookup` 支持；书签/总数键采用去敏“查询形状哈希”，复用实例 cache。
    - totals 优化：异步 totals 返回短 token（keyHash），并启用 5s inflight 去重；失败语义统一（total:null）。
- ☑️ 链表/聚合驱动分页
    - 方案A（先分页后联表）已支持；按联表字段排序/筛选的方案B（先联表后分页）计划中。
- ✅ count
    - 统计匹配文档数；totals.sync/async 会透传 hint/collation/maxTimeMS。
- ❌ stream（find 流式返回）
    - 计划中。
- ❌ 聚合（aggregate/或 find 支持聚合）
    - 后续可能透传或翻译。
- ❌ distinct
    - 仅 Mongo 适配器语义；尚未纳入抽象。
- ❌ explain
    - 诊断用途；建议透传且禁用缓存（规划中）。
- ❌ countDocuments / estimatedDocumentCount
    - 目前仅对外提供 count 抽象；计划拆分补充。
- ❌ 高级查询/游标选项统一抽象
    - batchSize/hint/collation/noCursorTimeout/tailable/max/min/returnKey/allowPartialResults/
      readPreference/readConcern。
- ❌ showRecordId
    - Mongo 专属选项。
- ❌ comment / let
    - let 多见于聚合；待评估透传策略。
- ❌ readPreferenceTags
    - 读偏好标签，仅 Mongo 适配器相关。

### MongoDB 方法（Writes）
- ❌ insertOne / insertMany
- ❌ updateOne / updateMany
- ❌ replaceOne
- ❌ deleteOne / deleteMany
- ❌ bulkWrite
- ❌ findOneAndUpdate / findOneAndReplace / findOneAndDelete
    - 写路径当前不在范围内；不提供自动失效。

### MongoDB 方法（Indexes）
- ❌ createIndex / createIndexes
- ❌ dropIndex / dropIndexes
- ❌ listIndexes
- ❌ 索引选项统一抽象（unique/sparse/TTL/partialFilterExpression/collation …）
- ❌ hidden / wildcard / columnstore

### MongoDB 方法（Transactions & Sessions）
- ❌ startSession/withTransaction/commit/abort
- ❌ readConcern / readPreference / causalConsistency

### MongoDB 方法（Change Streams）
- ❌ watch
- ❌ 关键选项（fullDocument/fullDocumentBeforeChange/resumeAfter/startAfter/startAtOperationTime）

### MongoDB 方法（Admin/DB/Collection）
- ❌ listCollections / listDatabases
- ❌ dropDatabase
- ❌ db.stats() / coll.stats()
- ❌ runCommand
- ❌ serverStatus / ping / buildInfo
- ❌ profilingLevel / setProfilingLevel
- ❌ 用户与角色管理
- ❌ renameCollection / collMod / convertToCapped
- ❌ validator / validationLevel / validationAction
- ❌ time-series / clustered / capped 支持态度

### MongoDB 方法（Cursors & Pagination）
- ❌ 深分页（游标/主键锚点）
- ❌ 流式消费（cursor/async iterator）
- ❌ 其他光标细节统一抽象（batchSize/noCursorTimeout/tailable/maxAwaitTimeMS/exhaust/hint）

### MongoDB 方法（Operators/Projection/Sort）
- 🗺️ 跨库运算符映射层（operators registry）
    - 复杂阶段如 $lookup/$facet/$graphLookup 暂不覆盖。
- 🗺️ 文本/正则/地理运算符覆盖声明（$text/$regex/$geoWithin/$near …）
    - Mongo-only 透传策略待定；跨库取决于 operators registry。

### MongoDB 方法（GridFS）
- ❌ GridFSBucket 及 API（openUploadStream/openDownloadStream …）
- ❌ 选项（chunkSizeBytes/disableMD5）

### MongoDB 方法（Options & Driver-level）
- ❌ collation / readPreference / readConcern / writeConcern（统一抽象）
- ❌ explain / allowDiskUse / let / comment（聚合相关）
- ❌ 时间序列/特殊集合能力封装（如 TTL index 管理）
- ❌ apiVersion / 传输与压缩参数（驱动层能力）

## MongoDB 方法覆盖现状（已合并至能力矩阵）
> 说明：MongoDB 方法覆盖情况已并入上方“能力矩阵”主表（分类以“MongoDB 方法（…）”开头）。后续更新请直接维护表格行，避免与该段落重复。

## 里程碑（示例）
- [Unreleased]
  - ✅ 多层缓存（本地+远端）
  - 🗺️ 更多数据库适配器（PostgreSQL/MySQL/SQLite）
  - 🗺️ ESM 条件导出

## Not Goals（短期非目标）
- 提供写 API 的自动失效（由调用方手动失效或在业务层封装）。

## 能力缺口与优先级（建议）
- P0（直接提升可用性/生态兼容）
  - 深分页（游标/主键）
  - 健康检查/事件钩子
- P1（扩展能力面）
  - stream（find 流式返回）
  - 聚合（aggregate/透传）
  - 查询运算符映射层（operators）
- P2（生态/打包与多数据库）
  - 模块格式：ESM 条件导出
  - PostgreSQL/MySQL/SQLite 适配器（从只读最小集起步）
- Not Goals（短期不做）
  - 写路径自动失效（保持由业务手动失效或上层封装）

## 设计与实现要点（提纲）
- 深分页
  - 提供“游标/主键锚点 + 方向”（after/before + limit + sort），默认使用主键升序。
  - 禁止与不稳定排序字段混用；缓存键需包含锚点与方向信息。
- stream（find 流式）
  - 默认禁用缓存；与 maxTimeMS/slowQueryMs 联动，分段观测耗时。
- 聚合（aggregate）
  - 阶段性：对 Mongo 先透传，跨库依赖 operators 映射，逐步覆盖 match/project/sort/limit。
- 事件钩子/健康检查
  - on('connected'|'closed'|'error'|'slow-query')；slow-query 输出“查询形状”与耗时阈值。
  - health() 返回连接状态、默认值视图、缓存层摘要（命中率/size，可选）。
- 模块格式（ESM 条件导出）
  - package.json exports { require, import, types }，不破坏 CJS 现有入口。
- 运算符映射层
  - 先覆盖 =, !=, >, >=, <, <=, in, nin, and, or, not 及基本排序/投影；以适配器声明自身支持矩阵。

## 测试与质量建议（重点覆盖）
- 深分页：首页/末页/方向切换、稳定排序校验、游标重复/过期。
- 多层缓存：本地/远端命中与降级、命名空间失效、异常/超时后的 inflight 清理。
- stream：背压与 maxTimeMS、缓存禁用验证、慢日志不泄露敏感值。
- 聚合：Mongo 透传用例；跨库未实现时的明确错误/能力告知。
- 事件钩子/health：事件触发顺序、异常路径、健康视图字段。
- CI 建议：继续覆盖 Windows + Ubuntu；库类项目增加包体检查（npm pack）。

## 下一步（可执行清单）
1) 深分页（游标/主键） [P0]
2) 健康检查/事件钩子 [P0]
3) Schema（轻量运行时校验与规范化） [P0]
4) stream（find 流式返回） [P1]

> 更新时间：2025-08-25 16:55

## 关联
- 历史变更：见 ./CHANGELOG.md
- 入门与示例：见 ./README.md
