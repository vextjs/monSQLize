# Changelog

本项目的所有可见变更将记录于此文档，格式遵循 Keep a Changelog，版本号遵循语义化版本（SemVer）。

## [Unreleased]
### Added
- 新增 STATUS.md：迁移并集中维护能力矩阵与路线图。
- 补充 MongoDB 未实现方法清单至 STATUS.md。
- 进一步细化 STATUS.md：补充 MongoDB 未实现项（showRecordId/comment/readPreferenceTags/renameCollection/collMod/convertToCapped/validator 等）。
- 为慢查询日志新增稳定标识与上下文字段（event/code/category/threshold/type/iid/scope/ts），便于日志采集与告警。

### Changed
- README 的“状态”章节精简为“速览”，并链接至 STATUS.md。
- 更新 .junie/guidelines.md：补充“流程与质量”规范（分支与发布、弃用策略、错误处理、日志去敏、缓存策略、性能预算、兼容性、测试规范、目录与导出、TS 声明、PR 模板、安全与配置、文档联动与自检）。
- 将 .junie/guidelines.md 通用化：新增“工作区通用规范 + 自动选择策略”，并以 profiles/monSQLize 承载该项目差异化信息。
- 扩展 STATUS.md：补充“能力缺口与优先级、设计与实现要点、测试与质量建议、下一步清单”。
- 将“MongoDB 方法覆盖现状”迁移为能力矩阵表格行，并移除冗余清单段落。
- STATUS.md：将“读 API（Read）”与“MongoDB 方法（Read）”对齐合并展示（表内相邻呈现，分类标记为“读 API（Read） · MongoDB 对齐”）。
- STATUS.md：在能力矩阵中补充非弃用的 MongoDB 方法/选项行（Change Streams 关键选项、聚合 $out/$merge、运算符类别声明、GridFS 选项、time-series/clustered/capped 态度），排除已弃用能力。

### Fixed
- （在此添加）

### Deprecated
- （在此添加）

### Removed
- （在此添加）

### Performance
- （在此添加）

### Security
- （在此添加）

## [0.1.0] - 2025-08-25
### Added
- 初始版本：MongoDB 适配器；find/findOne/count；内置内存缓存（TTL/LRU/并发去重）；命名空间失效；跨库访问；默认值（maxTimeMS/findLimit）；慢查询日志；TypeScript 类型。
