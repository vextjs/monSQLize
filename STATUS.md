# STATUS / ROADMAP

说明：本页用于集中呈现 monSQLize 的当前能力矩阵与路线图。状态标记如下：
- ✅ 已实现
- 🗺️ 计划中
- ❌ 未实现

注：状态对应主分支最新实现；历史变化请参见 CHANGELOG。

## 能力矩阵

> 说明：本表统一四列（分类 | 能力 | 状态 | 备注）。

| 分类 | 能力 | 状态 | 备注 |
|---|---|---|---|
| 数据库类型 | MongoDB | ✅ 已实现 | 当前唯一已实现适配器 |
| 数据库类型 | PostgreSQL | 🗺️ 计划中 | 未实现 |
| 数据库类型 | MySQL | 🗺️ 计划中 | 未实现 |
| 数据库类型 | SQLite | 🗺️ 计划中 | 未实现 |
| 数据库类型 | 查询运算符映射（operators） | 🗺️ 计划中 | 预研草案，尚未实现跨库翻译 |
| 数据模型/Schema | Schema 能力 | ❌ 未实现 | 由上层应用自行约束 |
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
| 读 API（Read） | findOne | ✅ 已实现 | 支持 projection、sort、cache、maxTimeMS |
| 读 API（Read） | find | ✅ 已实现 | 支持 limit/skip 普通分页；未传 limit 使用全局 findLimit（默认 10）；limit=0 表示不限制 |
| 读 API（Read） | 深分页（游标/主键） | ❌ 未实现 | 计划中 |
| 读 API（Read） | 链表/聚合驱动分页 | ❌ 未实现 | 计划中 |
| 读 API（Read） | count | ✅ 已实现 | 统计匹配文档数 |
| 读 API（Read） | stream（find 流式返回） | ❌ 未实现 | 计划中 |
| 读 API（Read） | 聚合（aggregate/或 find 支持聚合） | ❌ 未实现 | 后续可能透传或翻译 |
| 读 API（Read） | distinct | ❌ 未实现 | 仅 Mongo 适配器语义；尚未纳入抽象 |
| 读 API（Read） | explain | ❌ 未实现 | 诊断用途；建议透传且禁用缓存（规划中） |
| 读 API（Read） | countDocuments / estimatedDocumentCount | ❌ 未实现 | 目前仅对外提供 count 抽象；计划拆分补充 |
| 读 API（Read） | 高级查询/游标选项统一抽象 | ❌ 未实现 | batchSize/hint/collation/noCursorTimeout/tailable/max/min/returnKey/allowPartialResults/readPreference/readConcern |
| 读 API（Read） | showRecordId | ❌ 未实现 | Mongo 专属选项 |
| 读 API（Read） | comment / let | ❌ 未实现 | let 多见于聚合；待评估透传策略 |
| 读 API（Read） | readPreferenceTags | ❌ 未实现 | 读偏好标签，仅 Mongo 适配器相关 |
| MongoDB 方法（Writes） | insertOne / insertMany | ❌ 未实现 | 写路径当前不在范围内；不提供自动失效 |
| MongoDB 方法（Writes） | updateOne / updateMany | ❌ 未实现 | 同上 |
| MongoDB 方法（Writes） | replaceOne | ❌ 未实现 | 同上 |
| MongoDB 方法（Writes） | deleteOne / deleteMany | ❌ 未实现 | 同上 |
| MongoDB 方法（Writes） | bulkWrite | ❌ 未实现 | 同上 |
| MongoDB 方法（Writes） | findOneAndUpdate / findOneAndReplace / findOneAndDelete | ❌ 未实现 | findAndModify 系列 |
| MongoDB 方法（Indexes） | createIndex / createIndexes | ❌ 未实现 | 索引管理未纳入抽象 |
| MongoDB 方法（Indexes） | dropIndex / dropIndexes | ❌ 未实现 | 同上 |
| MongoDB 方法（Indexes） | listIndexes | ❌ 未实现 | 同上 |
| MongoDB 方法（Indexes） | 索引选项统一抽象 | ❌ 未实现 | unique/sparse/TTL/partialFilterExpression/collation 等 |
| MongoDB 方法（Indexes） | hidden/wildcard/columnstore | ❌ 未实现 | 待评估，版本相关 |
| MongoDB 方法（Transactions & Sessions） | startSession/withTransaction/commit/abort | ❌ 未实现 | 会话与事务未纳入抽象 |
| MongoDB 方法（Transactions & Sessions） | readConcern / readPreference / causalConsistency | ❌ 未实现 | 与会话绑定的读选项 |
| MongoDB 方法（Change Streams） | watch | ❌ 未实现 | 集合/数据库/集群级变更流 |
| MongoDB 方法（Admin/DB/Collection） | listCollections / listDatabases | ❌ 未实现 | 管理类接口未纳入抽象 |
| MongoDB 方法（Admin/DB/Collection） | dropDatabase | ❌ 未实现 | 同上 |
| MongoDB 方法（Admin/DB/Collection） | db.stats() / coll.stats() | ❌ 未实现 | 同上 |
| MongoDB 方法（Admin/DB/Collection） | runCommand | ❌ 未实现 | 通用命令透传（待策略） |
| MongoDB 方法（Admin/DB/Collection） | serverStatus / ping / buildInfo | ❌ 未实现 | 同上 |
| MongoDB 方法（Admin/DB/Collection） | profilingLevel / setProfilingLevel | ❌ 未实现 | 同上 |
| MongoDB 方法（Admin/DB/Collection） | 用户与角色管理 | ❌ 未实现 | createUser/grantRoles/revokeRoles/dropUser 等 |
| MongoDB 方法（Admin/DB/Collection） | renameCollection / collMod / convertToCapped | ❌ 未实现 | 同上 |
| MongoDB 方法（Admin/DB/Collection） | validator / validationLevel / validationAction | ❌ 未实现 | 统一抽象未实现 |
| MongoDB 方法（Cursors & Pagination） | 深分页（游标/主键锚点） | ❌ 未实现 | 见上方“读 API”；计划中 |
| MongoDB 方法（Cursors & Pagination） | 流式消费（cursor/async iterator） | ❌ 未实现 | 计划中；find 的 stream 形态 |
| MongoDB 方法（Cursors & Pagination） | 其他光标细节统一抽象 | ❌ 未实现 | batchSize/noCursorTimeout/tailable/maxAwaitTimeMS/exhaust/hint |
| MongoDB 方法（Operators/Projection/Sort） | 跨库运算符映射层 | 🗺️ 计划中 | operators registry；复杂阶段如 $lookup/$facet/$graphLookup 未覆盖 |
| MongoDB 方法（GridFS） | GridFSBucket 及 API | ❌ 未实现 | openUploadStream/openDownloadStream 等 |
| MongoDB 方法（Options） | collation / readPreference / readConcern / writeConcern | ❌ 未实现 | 统一抽象未纳入 |
| MongoDB 方法（Options） | explain / allowDiskUse / let / comment | ❌ 未实现 | 其中 allowDiskUse 多见于聚合；透传策略待定 |
| MongoDB 方法（Options） | 时间序列/特殊集合能力封装 | ❌ 未实现 | 如 TTL index 管理等 |
| MongoDB 方法（Driver-level） | apiVersion / 传输与压缩参数 | ❌ 未实现 | 驱动层能力；不在通用抽象范围 |
| MongoDB 方法（Change Streams） | 关键选项（fullDocument/fullDocumentBeforeChange/resumeAfter/startAfter/startAtOperationTime） | ❌ 未实现 | 仅 Mongo；跨库缺失；通常禁用缓存 |
| MongoDB 方法（Aggregation） | $out / $merge | ❌ 未实现 | 写路径；短期不纳入通用抽象；透传需禁缓存 |
| MongoDB 方法（Operators） | 文本/正则/地理运算符覆盖声明（$text/$regex/$geoWithin/$near 等） | 🗺️ 计划中 | Mongo-only 透传策略待定；跨库取决于 operators registry |
| MongoDB 方法（GridFS） | 选项（chunkSizeBytes/disableMD5） | ❌ 未实现 | 仅在引入 GridFS 时细化 |
| MongoDB 方法（Admin/DB/Collection） | time-series/clustered/capped 集合支持态度 | ❌ 未实现 | 暂不纳入通用抽象；仅在 Mongo createCollection/collMod 透传 |

## MongoDB 方法覆盖现状（已合并至能力矩阵）
> 说明：MongoDB 方法覆盖情况已并入上方“能力矩阵”主表（分类以“MongoDB 方法（…）”开头）。后续更新请直接维护表格行，避免与该段落重复。

## 里程碑（示例）
- [Unreleased]
  - 🗺️ 多层缓存（本地+远端）
  - 🗺️ 更多数据库适配器（PostgreSQL/MySQL/SQLite）
  - 🗺️ ESM 条件导出

## Not Goals（短期非目标）
- 提供写 API 的自动失效（由调用方手动失效或在业务层封装）。

## 能力缺口与优先级（建议）
- P0（直接提升可用性/生态兼容）
  - 深分页（游标/主键）
  - 多层缓存（本地+远端）
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
- 多层缓存
  - 在现有 CacheLike 基础上组合 local + remote，TTL 毫秒单位保持一致；远端失败优雅降级。
  - inflight 去重在本地层生效；失效复用命名空间键形状。
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
1) 设计与评审：深分页 API 草案 + 缓存分层接口草案。
2) 补充里程碑细化：将 P0/P1 拆解到 [Unreleased] 并标注依赖。
3) 实现与测试：优先落地深分页最小集 + 多层缓存骨架（远端可先 mock）。
4) 文档：README 增加新能力示例；CHANGELOG 记录 Added/Changed。

> 更新时间：2025-08-25 16:55

## 关联
- 历史变更：见 ./CHANGELOG.md
- 入门与示例：见 ./README.md