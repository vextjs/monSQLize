# 需求级会话记忆

> 需求: model-多数据库连接池绑定 | 入口服务: monSQLize

## 会话 01 — 2026-04-24

| 字段 | 内容 |
|------|------|
| 状态 | ✅ 已完成 |
| 阶段 | CP3 执行完毕 |
| 工作流 | dev.default |
| 版本 | v1.2.2 |

### 需求背景

用户希望 Model 层支持绑定不同的数据库或连接池。当前 `msq.model('users')` 始终通过默认连接获取 collection，不支持指定使用哪个连接池或数据库名。

### 实施产物

| 文件 | 变更 |
|------|------|
| `lib/model/index.js` | 新增 `_validateConnection()` + `define()` 中调用 |
| `lib/index.js` | 新增 `_resolveModelCollection()` + `model()` 路由分支 |
| `lib/mongodb/index.js` | 新增 `collectionFromClient()` |
| `types/model/definition.ts` | 新增 `ModelConnection` 接口 + `connection?` 字段 |
| `index.d.ts` | 导出 `ModelConnection` |
| `test/unit/model/model-connection-binding.test.js` | 15 个测试，全部通过 |
| `CHANGELOG.md` | v1.2.2 条目 |
| `changelogs/v1.2.2.md` | 新建详细变更日志 |
| `README.md` | Model 层特性 + 数据源绑定示例 |

### 测试结果

15 passing (19ms) — 100% 通过
