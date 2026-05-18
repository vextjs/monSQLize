# 验证入口分层说明

> 目标：把“平时改代码该跑什么、发版前该跑什么、哪些检查依赖私有环境”说清楚。

## 三层验证入口

| 入口 | 命令 | 默认环境 | 用途 |
|------|------|----------|------|
| Fast | `npm run verify:fast` | 本地 / CI | 日常改动、热点重构、PR 前快速守卫 |
| Full | `npm run verify:full` | 本地 / CI | 完整功能回归、示例回归、memory-server 矩阵 |
| Release | `npm run verify:release` | 发布前 | 在 `full` 基础上追加 opt-in 真实环境检查 |

## 补充入口

| 命令 | 说明 |
|------|------|
| `npm run test:refactor-guard` | 热点重构三联回归：exports + runtime/model + sync |
| `npm run test:server-matrix` | memory-server 默认矩阵（Node / Driver / MongoDB server） |
| `npm run test:real-env:private` | 私有真实环境检查；默认不进入常规 verify |
| `npm run release:preflight` | 发布前门禁：检查 changelog / 支持矩阵 / 依赖治理文档，并串联 `verify:fast` + `npm pack --dry-run` |

## 运行策略

### 1. 日常开发 / 小范围重构

```bash
npm run verify:fast
```

适合：

- 热点文件拆分
- 内部 helper 重构
- 类型和导出面调整

### 2. 完整交付 / 大范围改动

```bash
npm run verify:full
```

适合：

- 文档和示例联动更新
- 行为变更或跨模块重构
- 发版前的完整仓库回归

### 3. 私有真实环境验证

```bash
npm run test:real-env:private
```

说明：

- 仅在具备私有 Mongo / SSH 等条件时执行
- 不作为默认 CI 阶段
- 主要用于验证 memory-server 无法覆盖的真实部署路径

## 默认边界

- **默认闭环**：`verify:fast` / `verify:full` / `test:server-matrix`
- **显式 opt-in**：`test:real-env:private`
- **发布前强制建议**：`release:preflight`

> 仓库同时提供 GitHub Actions `Release Preflight` workflow，支持手动触发和 `v*` tag 推送时复用同一套发布前门禁。

> 说明：`test:server-matrix` 只保留**跨 Driver / Server 组合下稳定可重复的兼容面**。像 sync target fan-out 统计这类更依赖 change-stream 时序的深度断言，继续由常规 integration、`test:refactor-guard` 和 `release:preflight` 覆盖。
