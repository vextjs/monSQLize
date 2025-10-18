# 变更日志

所有显著变更将记录在此文件，遵循 Keep a Changelog 与语义化版本（SemVer）。

## [未发布]
### 修复
- **并发连接问题**：修复高并发调用 `connect()` 时创建多个连接的问题
  - 在 `lib/index.js` 和 `lib/mongodb/index.js` 两层添加连接锁（`_connecting`）
  - 并发请求现在会等待同一个连接 Promise，确保只建立一个连接
  - 添加完整的测试用例验证 10 个并发请求共享同一连接
- **输入验证缺失**：为 `collection()` 方法添加参数校验
  - 集合名必须是非空字符串，否则抛出 `INVALID_COLLECTION_NAME` 错误
  - 数据库名（如果提供）必须是非空字符串，否则抛出 `INVALID_DATABASE_NAME` 错误
  - 添加友好的错误消息，包含参数要求说明
  - 添加完整的测试用例覆盖空字符串、null、纯空格、非字符串等边界情况
- **内存泄漏**：修复 `close()` 方法未清理缓存的问题
  - 清理 `_iidCache`（实例 ID 缓存），防止多次连接-关闭循环累积内存
  - 清理 `_connecting` 锁，避免连接状态残留
  - 添加完整的测试用例验证多次连接-关闭循环无内存泄漏

### 新增
- **文档增强**：为 `distinct` 方法添加完整的文档、示例和测试用例
  - 新增 `docs/distinct.md`：详细的 distinct 方法使用文档，包含参数说明、使用模式、性能优化建议、常见问题等
  - 新增 `examples/distinct.examples.js`：10 个完整示例，涵盖基础去重、条件查询、嵌套字段、数组字段展开、大小写不敏感、缓存优化、性能分析等场景
  - 新增 `test/distinct.test.js`：12 个测试套件共 60+ 个测试用例，全面覆盖去重功能的各种场景和边界情况
  - README.md 添加 distinct 方法说明和指向详细文档、示例、测试的链接
- **文档增强**：为 `aggregate` 方法添加完整的文档、示例和测试用例
  - 新增 `docs/aggregate.md`：详细的 aggregate 方法使用文档，包含所有管道阶段、参数说明、使用模式、性能优化建议等
  - 新增 `examples/aggregate.examples.js`：8 个完整示例，涵盖基础聚合、联表查询、数据转换、数组操作、日期分组、多路聚合、流式处理和性能优化
  - 新增 `test/aggregate.test.js`：11 个测试套件共 50+ 个测试用例，全面覆盖聚合功能的各种场景和边界情况
  - README.md 添加指向 aggregate 详细文档、示例和测试的链接
- 统一 findPage：在原 after/before 基础上，新增 `page` 跳页（书签 bm: + 少量 hops），`offsetJump` 小范围 `$skip+$limit` 兜底，`totals` 多模式（none/async/approx/sync）。
- 书签/总数缓存键：复用实例 cache；书签键前缀 `bm:`，总数键前缀 `tot:`；键采用去敏"查询形状哈希"（不含具体值）。
- 文档：README 新增并细化"统一 findPage：游标 + 跳页 + offset + totals"章节（完整参数/注释/错误码/异步 totals 轮询示例）；STATUS 路线图对齐。

### 变更
- 重构：将 `findPage` 抽离到 `lib/mongodb/find-page.js`，index 通过工厂注入上下文；命名空间键稳定。
- 运行器：findPage 内部的单页执行与 offset 分支改为使用统一 `run()` 包装（缓存+慢日志+精确失效）。
- 跳页：`maxHops` 从“分段限制”改为“整次跳页累计限制”（更符合直觉，默认仍为 20）。
- 文档：补充“默认值一览/优先级/实例级书签默认配置示例”，细化各可选项默认行为。

### 修复
- totals：`countDocuments` 透传 `collation` 与 `maxTimeMS/hint`，并在失败时输出一次 warn（去敏）；异步失败也缓存 `{ total:null }` 以保持语义一致。
- totals：async 的对外 token 改为短标识（`<keyHash>`），避免暴露命名空间；README 示例同步更新。
- 形状键：`queryShape/pipelineShape` 计算改进，减少不同查询碰撞同一 keyHash 的概率。
- 书签：修复推进到 anchorPage 的循环中未应用 `maxBookmarkPages` 上限的边界问题，避免过多书签键写入。

### 性能
- totals：新增 5s 窗口的 inflight 去重，避免同一形状的并发计数击穿。

### 测试
- **新增连接管理测试套件**：`test/connection-simple.test.js`
  - 验证并发连接只建立一个实例（10 并发测试）
  - 验证集合名和数据库名的输入校验（空、null、空格、非字符串）
  - 验证多次连接-关闭循环的资源清理（3 次循环测试）
  - 验证连接锁正确清理

### 说明
- 推荐发布类型：`patch`（x.y.z -> x.y.(z+1)），因为是 bug 修复

[未发布]: ./
