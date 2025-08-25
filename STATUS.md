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

## 里程碑（示例）
- [Unreleased]
  - 🗺️ 多层缓存（本地+远端）
  - 🗺️ 更多数据库适配器（PostgreSQL/MySQL/SQLite）
  - 🗺️ ESM 条件导出

## Not Goals（短期非目标）
- 提供写 API 的自动失效（由调用方手动失效或在业务层封装）。

## 关联
- 历史变更：见 ./CHANGELOG.md
- 入门与示例：见 ./README.md