# STATUS / ROADMAP

说明：本页用于集中呈现 monSQLize 的当前能力矩阵与路线图。状态标记如下：
- ✅ 已实现
- 🗺️ 计划中
- ❌ 未实现

注：状态对应主分支最新实现；历史变化请参见 CHANGELOG。

---

## 📊 实现状态统计

**最后更新**: 2025-11-06

| 分类 | 已实现 ✅ | 计划中 🗺️ | 未实现 ❌ | 手动/受限 ☑️ | 总计 |
|------|----------|----------|----------|-------------|------|
| **核心功能** | 23 | 2 | 5 | 2 | 32 |
| **MongoDB 读方法** | 9 | 0 | 3 | 0 | 12 |
| **MongoDB 写方法 - Insert** | 0 | 0 | 2 | 0 | 2 |
| **MongoDB 写方法 - Update** | 0 | 0 | 5 | 0 | 5 |
| **MongoDB 写方法 - Delete** | 0 | 0 | 3 | 0 | 3 |
| **MongoDB 写方法 - Bulk** | 0 | 0 | 1 | 0 | 1 |
| **MongoDB 索引** | 0 | 0 | 5 | 0 | 5 |
| **MongoDB 事务** | 0 | 0 | 3 | 0 | 3 |
| **MongoDB 其他** | 0 | 0 | 15 | 0 | 15 |
| **总计** | **32** | **2** | **42** | **2** | **78** |

**完成度**: 41.0% (32/78)  
**核心功能完成度**: 71.9% (23/32)

---

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
- ❌ 查询运算符映射（operators）
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
- ❌ 模块格式
    - 目前 CJS；ESM 条件导出未实现。

### 连接与运维
- ✅ connect / close
    - 连接与关闭。
- ✅ 健康检查 / 事件钩子
    - 提供 health() 视图与事件系统：on('connected'|'closed'|'error'|'slow-query'|'query') 事件（慢查询仅输出去敏形状）。
    - 暴露 on/off/once/emit 方法；可选启用 query 事件（defaults.metrics.emitQueryEvent=true）。
- ✅ 返回耗时（meta）
    - 支持在所有读 API 上按次返回耗时与元信息（opt-in，不改默认返回类型）。
    - findOne/find/count/find：meta=true 时返回 { data, meta }；findPage：附加 meta 字段。
    - findPage 支持子步骤耗时（meta.level='sub'）：返回每个 hop/offset 的明细耗时。

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
- ✅ **性能基准测试框架**（2025-11-06 完成）
    - test/benchmark/run-benchmarks.js 统一运行器
    - 测试所有核心 API：findOne/find/count/findPage/aggregate/distinct（13 个场景）
    - 记录性能基线：test/benchmark/BASELINE.md
    - npm run benchmark 命令

### 读 API（Read）
- ✅ findOne
    - 支持 projection、sort、cache、maxTimeMS。
- ✅ find
    - 支持 limit/skip 普通分页；未传 limit 使用全局 findLimit（默认 10）；limit=0 表示不限制。
- ✅ 深分页（统一 findPage）
    - 游标 after/before + 跳页 page（书签 bm: + 少量 hops）+ offset 兜底（小范围 `$skip+$limit`）+ totals（none/async/approx/sync）。
    - 稳定排序（默认补 `_id`）；页内 `$lookup` 支持；书签/总数键采用去敏"查询形状哈希"，复用实例 cache。
    - totals 优化：异步 totals 返回短 token（keyHash），并启用 5s inflight 去重；失败语义统一（total:null）。
- ☑️ 链表/聚合驱动分页
    - 方案A（先分页后联表）已支持；按联表字段排序/筛选的方案B（先联表后分页）计划中。
- ✅ count
    - 统计匹配文档数；totals.sync/async 会透传 hint/collation/maxTimeMS。
    - 性能优化：空查询自动使用 estimatedDocumentCount（基于元数据，速度快）；有查询条件使用 countDocuments（精确统计）。
- ✅ stream（流式返回）
    - 支持流式查询，适合处理大数据集；默认 batchSize=1000；支持 maxTimeMS/hint/collation/noCursorTimeout。
    - 自动记录慢查询日志；触发 slow-query 和 query 事件；不支持缓存（流式特性）。
- ✅ 聚合（aggregate）
    - 支持 MongoDB 聚合管道透传；支持 maxTimeMS/allowDiskUse/hint/collation/comment；默认禁用缓存（cache=0）；可选返回 meta 耗时信息。
- ✅ distinct
    - 支持字段去重查询；支持 query/maxTimeMS/collation/hint；默认启用缓存；可选返回 meta 耗时信息。
- ✅ explain
    - **查询执行计划分析**（诊断专用，不返回数据）
    - 支持 3 种 verbosity：queryPlanner（默认）/ executionStats / allPlansExecution
    - 支持参数：query, projection, sort, limit, skip, maxTimeMS, hint, collation
    - 特性：禁用缓存、慢查询日志集成、INVALID_EXPLAIN_VERBOSITY 错误处理
    - 使用场景：索引使用验证、慢查询诊断、查询策略对比、复杂查询分析
- ✅ Bookmark 维护 APIs
    - **bookmark 缓存管理**（运维调试、性能优化）
    - 3 个 API：
      - `prewarmBookmarks(keyDims, pages)`：预热指定页面的 bookmark 缓存
      - `listBookmarks(keyDims?)`：列出已缓存的 bookmark（支持按查询过滤或全部）
      - `clearBookmarks(keyDims?)`：清除指定查询或全部 bookmark 缓存
    - 核心特性：
      - 智能 Hash 匹配：自动应用 ensureStableSort 规范化确保键一致性
      - 精确控制：支持按 keyDims 管理特定查询的 bookmark
      - 全局操作：不传 keyDims 可操作所有 bookmark
      - 失败检测：prewarmBookmarks 自动检测超出范围页面
      - 缓存可用性检查：缓存不可用时抛出 CACHE_UNAVAILABLE 错误
    - 使用场景：系统启动预热、运维监控、数据变更后清除缓存、内存管理
- ☑️ 高级查询/游标选项（已评估，分阶段实施）
    - ✅ 已支持: hint, collation, batchSize, comment (find/findOne/count/aggregate), **readPreference (全局配置)**

### MongoDB 方法（Writes - Insert）
- ❌ insertOne
- ❌ insertMany

### MongoDB 方法（Writes - Update）
- ❌ updateOne
- ❌ updateMany
- ❌ replaceOne
- ❌ findOneAndUpdate
- ❌ findOneAndReplace

### MongoDB 方法（Writes - Delete）
- ❌ deleteOne
- ❌ deleteMany
- ❌ findOneAndDelete

### MongoDB 方法（Writes - Bulk）
- ❌ bulkWrite
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
> 说明：MongoDB 方法覆盖情况已并入上方"能力矩阵"主表（分类以"MongoDB 方法（…）"开头）。后续更新请直接维护表格行，避免与该段落重复。

---

## ❌ 未实现功能清单（按优先级排序）

### 🔴 P2 - 能力扩展（中期规划）

#### 数据库支持
1. ❌ **PostgreSQL 适配器**
   - 只读 API：findOne/find/count/findPage
   - Keyset 分页支持
   - 统一游标与书签机制

2. ❌ **MySQL 适配器**
   - 只读 API：findOne/find/count/findPage
   - 分页支持

3. ❌ **SQLite 适配器**
   - 只读 API：findOne/find/count/findPage
   - 轻量级场景支持

#### 模块与运算符
4. ❌ **ESM 条件导出**
   - package.json exports: { require, import, types }
   - 保持 CJS 兼容性

5. ❌ **查询运算符映射层（基础）**
   - 覆盖基本比较：=, !=, >, <, >=, <=, in, nin
   - 逻辑运算：and, or, not
   - 适配器声明支持矩阵

#### 高级查询选项
6. ❌ **高级查询/游标选项统一抽象**
   - batchSize/hint/collation/noCursorTimeout/tailable
   - max/min/returnKey/allowPartialResults
   - readPreference/readConcern

7. ❌ **comment / let 支持**
   - 查询注释（调试用）
   - let 变量绑定（聚合场景）

8. ❌ **readPreferenceTags**
   - 读偏好标签（MongoDB 特定）

### 🟡 P3 - 写操作支持（长期规划）

#### Insert 操作
9. ❌ **insertOne**
   - 单条插入
   - 手动失效缓存（collection.invalidate('insertOne')）

10. ❌ **insertMany**
    - 批量插入
    - 手动失效缓存（collection.invalidate('insertMany')）

#### Update 操作
11. ❌ **updateOne**
    - 单条更新
    - 手动失效缓存（collection.invalidate('updateOne')）

12. ❌ **updateMany**
    - 批量更新
    - 手动失效缓存（collection.invalidate('updateMany')）

13. ❌ **replaceOne**
    - 完整替换文档
    - 手动失效缓存（collection.invalidate('replaceOne')）

14. ❌ **findOneAndUpdate**
    - 原子查询并更新
    - 返回更新前/后文档
    - 手动失效缓存

15. ❌ **findOneAndReplace**
    - 原子查询并替换
    - 返回替换前/后文档
    - 手动失效缓存

#### Delete 操作
16. ❌ **deleteOne**
    - 单条删除
    - 手动失效缓存（collection.invalidate('deleteOne')）

17. ❌ **deleteMany**
    - 批量删除
    - 手动失效缓存（collection.invalidate('deleteMany')）

18. ❌ **findOneAndDelete**
    - 原子查询并删除
    - 返回删除前文档
    - 手动失效缓存

#### Bulk 操作
19. ❌ **bulkWrite**
    - 批量混合操作（insert/update/delete）
    - 性能优化
    - 手动失效缓存（collection.invalidate('bulkWrite')）

### 🟢 P4 - 索引与管理（运维功能）

#### 索引管理
20. ❌ **createIndex / createIndexes**
    - 创建单个/多个索引
    - 索引选项：unique/sparse/TTL/partial

21. ❌ **dropIndex / dropIndexes**
    - 删除索引

22. ❌ **listIndexes**
    - 列出所有索引

23. ❌ **索引选项统一抽象**
    - unique/sparse/TTL/partialFilterExpression
    - collation/hidden/wildcard/columnstore

#### 集合与数据库管理
24. ❌ **listCollections / listDatabases**
    - 列出集合/数据库

25. ❌ **dropDatabase**
    - 删除数据库

23. ❌ **db.stats() / coll.stats()**
    - 数据库/集合统计信息

24. ❌ **runCommand**
    - 执行原始数据库命令

#### 服务器管理
25. ❌ **serverStatus / ping / buildInfo**
    - 服务器状态/健康检查/版本信息

26. ❌ **profilingLevel / setProfilingLevel**
    - 查询性能分析级别

27. ❌ **用户与角色管理**
    - 创建/删除用户
    - 授权/撤销权限

#### 高级集合特性
28. ❌ **renameCollection / collMod / convertToCapped**
    - 重命名集合/修改集合/转换为固定集合

29. ❌ **validator / validationLevel / validationAction**
    - Schema 验证器配置

30. ❌ **time-series / clustered / capped 支持态度**
    - 时间序列集合
    - 集群索引集合
    - 固定大小集合

### 🔵 P5 - 事务与高级特性（企业功能）

#### 事务支持
31. ❌ **startSession**
    - 创建会话

32. ❌ **withTransaction**
    - 事务执行器

33. ❌ **commit/abort**
    - 提交/回滚事务

34. ❌ **readConcern / readPreference / causalConsistency**
    - 读关注级别
    - 读偏好
    - 因果一致性

#### Change Streams
35. ❌ **watch**
    - 监听集合/数据库变更

36. ❌ **Change Streams 关键选项**
    - fullDocument/fullDocumentBeforeChange
    - resumeAfter/startAfter/startAtOperationTime

#### GridFS
37. ❌ **GridFSBucket 及 API**
    - openUploadStream/openDownloadStream
    - 大文件存储支持

38. ❌ **GridFS 选项**
    - chunkSizeBytes/disableMD5

---

## 优先级说明

| 优先级 | 说明 | 目标时间 | 重要性 |
|--------|------|---------|--------|
| 🔴 **P2** | 能力扩展 | 1-2 个月 | 高 - 提升跨数据库能力 |
| 🟡 **P3** | 写操作支持 | 2-3 个月 | 中 - 完整 CRUD 能力 |
| 🟢 **P4** | 索引与管理 | 3-6 个月 | 中低 - 运维便利性 |
| 🔵 **P5** | 事务与高级特性 | 6+ 个月 | 低 - 企业级功能 |

---

## 里程碑（示例）
- [Unreleased]
  - ✅ Bookmark 维护 APIs（prewarmBookmarks/listBookmarks/clearBookmarks）
  - ✅ explain 诊断 API
  - ✅ 性能基准测试框架
  - ✅ 示例验证自动化（CI 集成）
  - 🗺️ ESM 条件导出
  - 🗺️ PostgreSQL 适配器
  - 🗺️ MySQL 适配器
  - 🗺️ SQLite 适配器
  - 🗺️ 运算符映射层

## Not Goals（短期非目标）
- 提供写 API 的自动失效（由调用方手动失效或在业务层封装）
- GridFS 支持（大文件存储，不在当前范围）
- Change Streams（实时变更监听，企业级功能）

---

## 能力缺口与优先级（2025-11-06 更新）

### ✅ P0（已完成）- 直接提升可用性/生产稳定性
- ✅ **Logger.js 测试覆盖率提升**：从 37.28% 提升至 93.22%（2025-11-05 完成）
  - 新增 20+ 测试用例覆盖 withTraceId 嵌套、异步传播、边界情况、所有日志级别
  - 语句覆盖率提升 +55.94%，分支覆盖率 +46.92%，函数覆盖率达到 100%
- ✅ **TypeScript 类型声明完善**：验证所有 API 均有完整类型定义（2025-11-05 完成）
  - findOne/find/count/aggregate/distinct/stream/findPage 所有方法类型完整
  - 支持 meta 参数重载（ResultWithMeta<T>）
  - StreamOptions/AggregateOptions/DistinctOptions 接口完整
- ✅ **CI/CD 配置验证**：测试矩阵、覆盖率上传、Lint 检查完整（2025-11-05 完成）
  - 测试矩阵：Node.js 18.x/20.x × Ubuntu/Windows
  - 覆盖率自动上传 Codecov
  - CI 健康度 5/5
- ✅ **完整测试套件验证**：所有测试通过，无回归问题（2025-11-05 完成）
  - 9/9 测试套件通过（278+ 测试用例）
  - 总耗时 <5s（快速反馈）

### ✅ P1（已完成）- 扩展能力面
- ✅ **分支覆盖率提升**：从 61.51% 提升至 65.9%（2025-11-05 完成）
  - cache.js: 51.11% → 62.96% (+11.85%)
  - index.js: 44.44% → 75% (+30.56%)
  - mongodb/connect.js: 37.5% → 67.86% (+30.36%)
  - 补充异常路径测试（缓存失效、超时、并发、连接失败）
- ✅ **示例可运行性验证**：添加 CI 自动验证步骤（2025-11-06 完成）
  - 创建 scripts/verify-examples.js 自动验证所有示例
  - 所有示例改为使用 Memory Server
  - CI workflow 添加示例验证步骤
- ✅ **性能基准测试框架**（2025-11-06 完成）
  - test/benchmark/run-benchmarks.js 统一运行器
  - 测试 13 个场景（findOne/find/count/findPage/aggregate/distinct）
  - 记录性能基线（test/benchmark/BASELINE.md）
  - npm run benchmark 命令
- ✅ **stream（find 流式返回）**
- ✅ **聚合（aggregate/透传）**
- ✅ **distinct / explain（诊断用途）**
- ✅ **Bookmark 维护 APIs**

### 🗺️ P2（规划中）- 生态/打包与多数据库
- 🗺️ **模块格式**：ESM 条件导出
- 🗺️ **PostgreSQL 适配器**（从只读最小集起步）
- 🗺️ **MySQL 适配器**（从只读最小集起步）
- 🗺️ **SQLite 适配器**（从只读最小集起步）
- 🗺️ **查询运算符映射层（operators）**：基础运算符支持

### ❌ P3（未规划）- 高级功能
- ❌ **写 API**（insertOne/updateOne/deleteOne 等）
- ❌ **索引管理**（createIndex/dropIndex/listIndexes）
- ❌ **事务与会话**（startSession/withTransaction）

### ⛔ Not Goals（短期不做）
- 写路径自动失效（保持由业务手动失效或上层封装）
- GridFS 支持
- Change Streams

---

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

## 下一阶段执行清单（2025-11-05）

### P0（已完成 ✅）- 生产稳定性
1. ✅ **Logger.js 测试覆盖率提升**（2025-11-05）
   - 从 37.28% → 93.22%（语句覆盖率）
   - 新增 20+ 测试用例，覆盖复杂场景
   - 整体项目覆盖率提升至 77.04%
2. ✅ **TypeScript 类型声明完善**（2025-11-05）
   - 验证所有 API 均有完整类型定义
   - 支持 meta 参数重载
   - 类型覆盖率 100%
3. ✅ **CI/CD 配置验证**（2025-11-05）
   - 测试矩阵完整（Node 18/20 × Windows/Ubuntu）
   - 覆盖率自动上传 Codecov
   - CI 健康度 5/5
4. ✅ **完整测试套件验证**（2025-11-05）
   - 9/9 测试套件通过
   - 278+ 测试用例，无回归问题

### 短期（1-2 周）- P1 质量提升
1. ✅ **分支覆盖率提升**（2025-11-05 完成）
   - 从 61.51% → 65.9%（+4.39%）
   - cache.js: 51.11% → 62.96%
   - index.js: 44.44% → 75%
   - mongodb/connect.js: 37.5% → 67.86%
   - 新增 40+ 测试用例覆盖异常路径
2. ✅ **示例可运行性验证**（2025-11-06 完成）
   - 创建 scripts/verify-examples.js 验证脚本
   - 所有示例改为使用 Memory Server
   - CI 添加自动验证步骤
3. ✅ **性能基准测试框架**（2025-11-06 完成）
   - test/benchmark/run-benchmarks.js 统一运行器
   - 测试 13 个场景（findOne/find/count/findPage/aggregate/distinct）
   - 记录性能基线（test/benchmark/BASELINE.md）
   - 缓存效果显著：findOne 4.4倍提升，count 14.8倍提升
   - npm run benchmark 命令
   - 建立性能监控体系

### 中期（1 个月）- P2 能力扩展
3. **书签运维 API**
   - prewarmBookmarks：批量预热热门查询形状
   - listBookmarks/clearBookmarks：运维与调试工具
4. **stream（find 流式返回）**
   - 基于 MongoDB cursor.stream()，禁用缓存
   - 与 maxTimeMS/slowQueryMs 联动，分段观测耗时
5. **distinct / explain**
   - distinct：统一抽象，跨库待定
   - explain：诊断专用，禁用缓存，透传策略

### 长期（2-3 个月）- P2 跨数据库
6. **ESM 条件导出**
   - package.json exports: { require, import, types }
   - 保持 CJS 兼容性
7. **PostgreSQL 适配器**
   - 只读 API：findOne/find/count/findPage（Keyset 分页）
   - 统一游标与书签机制
8. **运算符映射层基础**
   - 覆盖基本比较：=, !=, >, <, >=, <=, in, nin
   - 逻辑运算：and, or, not
   - 适配器声明支持矩阵

---

## 📈 开发进度追踪

### 最近完成（2025-11-05 ~ 2025-11-06）
- ✅ P0 全部完成（Logger 测试、TypeScript 类型、CI/CD、测试套件）
- ✅ P1 全部完成（分支覆盖率、示例验证、性能基准、核心 API）
- ✅ Bookmark 维护 APIs（3个）
- ✅ explain 诊断 API
- ✅ 性能基准测试框架

### 下一步计划（P2 - 2025-11 ~ 2026-01）
1. **ESM 条件导出**（预计 2 周）
   - package.json exports 配置
   - 保持 CJS 兼容性
   - 测试双模块导入

2. **PostgreSQL 适配器**（预计 4 周）
   - 只读 API：findOne/find/count/findPage
   - Keyset 分页支持
   - 统一游标与书签机制

3. **运算符映射层基础**（预计 3 周）
   - 基本比较运算符
   - 逻辑运算符
   - 适配器支持矩阵

### 质量指标

| 指标 | 当前值 | 目标值 | 状态 |
|------|--------|--------|------|
| **语句覆盖率** | 77.04% | ≥70% | ✅ 达标 |
| **分支覆盖率** | 65.9% | ≥65% | ✅ 达标 |
| **函数覆盖率** | 81.42% | ≥70% | ✅ 达标 |
| **测试套件** | 9/9 通过 | 全部通过 | ✅ 健康 |
| **测试用例数** | 278+ | - | ✅ 充足 |
| **CI 健康度** | 5/5 | 5/5 | ✅ 优秀 |
| **示例验证** | 自动化 | 自动化 | ✅ 完成 |
| **性能基线** | 已建立 | 已建立 | ✅ 完成 |

---

> 更新时间：2025-11-06

## 关联
- 历史变更：见 [CHANGELOG.md](./CHANGELOG.md)
- 入门与示例：见 [README.md](./README.md)
- 详细文档：见 [docs/](./docs/)
- 示例代码：见 [examples/](./examples/)
- 测试用例：见 [test/](./test/)
