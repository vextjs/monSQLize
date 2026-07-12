# 依赖发布边界治理

当前根包采用**精确版本依赖策略**：

| 依赖 | 策略 | 原因 |
|------|------|------|
| `cache-hub` | 精确版本 `2.2.4` | 根包 direct dependency 与 schema-dsl 接入共享已验证的缓存运行时基线 |
| `schema-dsl` | 精确版本 `2.1.5` | 当前非 deprecated TypeScript 正式线，支持 Node 18 并保证 `schema-dsl/runtime` 入口 |
| `ioredis` | 精确版本 `5.11.1` | Redis 运行时依赖；仅在配置 Redis-backed 能力时启用 |
| `mongodb-memory-server` | 开发精确版本 `10.4.3` | 测试工具支持 Node `>=16.20.1`，保持包的 Node 18 CI 契约 |

> `schema-dsl@2.1.5` 是本次发布链路的目标版本；npm 上历史 `2.3.x` 已标记为误发布 / deprecated，不得跟随升级。

## 当前风险

1. **上游版本漂移**：`cache-hub` / `schema-dsl` 已固定为精确版本，升级必须走显式版本调整。
2. **误发布版本风险**：`schema-dsl` 的 npm `2.3.x` 已标记为误发布，不得跟随升级。
3. **联动回归盲区**：升级任意上游依赖后，必须重新覆盖关键回归面。

## 当前治理规则

### 开发态

- 根包 direct `cache-hub` 固定为 `2.2.4`，不需要 workspace override。
- `schema-dsl` 固定为 `2.1.5`，`ioredis` 固定为 `5.11.1`，测试工具 `mongodb-memory-server` 固定为 `10.4.3`。
- 本地 sibling `../schema-dsl` 仅用于上游库自身调试，不再作为 monSQLize 根包安装前提。

### 发布态

- 根包发布态不得依赖工作区 `file:` / `workspace:` 路径。
- 当前依赖策略已满足“外部安装可解析”的基本前提；后续发布仍需通过标准验证链。

```bash
npm run release:preflight
```

## schema-dsl 2.x 升级验证

依赖治理基线已将 `schema-dsl` 从历史 `^1.2.5` 升级并固定到 `2.1.5`，验证标准如下：

1. 上游在 npm 发布了**非 deprecated** 的 2.x 目标版本：`2.1.5`，Node 要求为 `>=18`。
2. `npm install schema-dsl@2.1.5 --save-exact` 后通过 `npm run type-check`。
3. model 相关单测 / 集成测试全通过（随 `npm run test:unit` 与 `npm run test:integration` 覆盖）。
4. `npm run test:examples` 全通过。
5. 发布前仍需以 `npm run release:preflight` 作为最终门禁。
6. 本文件、Profile、CHANGELOG 与 lockfile 必须同步到 `2.1.5`。

## cache-hub 2.2.4 升级验证

依赖治理基线已将 `cache-hub` 从 `1.0.0` 升级并固定到 `2.2.4`，验证标准如下：

1. 上游 npm `latest` 为 `2.2.4`，Node.js 引擎要求仍为 `>=18`，与 monSQLize 当前基线一致。
2. 根包 direct dependency 解析到 `2.2.4`，且不存在本地 workspace override。
3. `npm run type-check`、缓存 / function-cache 定向测试、文档站构建与内存探针必须通过。
4. 本文件、Profile、CHANGELOG、package manifest 与 lockfile 必须同步 root direct dependency 的 `2.2.4` 口径。

## 联动验证建议

| 场景 | 必做验证 |
|------|----------|
| 调整 `cache-hub` 相关能力 | `npm run type-check` + `test/unit/cache/cache.test.ts` + exports / smoke |
| 调整 `schema-dsl` 相关能力 | `npm run type-check` + model 相关单测 / 集成测试 + `npm run test:examples` |
| 准备发版 | `npm run release:preflight` |

## 长期方向

1. `schema-dsl` 后续不自动跟随 npm `latest`；升级必须显式确认目标版本，并继续排除 deprecated 误发布版本。
2. 发布态持续保持对工作区路径零依赖；所有上游依赖都必须可由公开 semver 解析。
