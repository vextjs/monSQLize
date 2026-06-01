# 依赖发布边界治理

当前根包采用**公开 semver 依赖策略**：

| 依赖 | 策略 | 原因 |
|------|------|------|
| `cache-hub` | 公开 semver `^1.0.0` | 上游已发布稳定版本，验证通过 |
| `schema-dsl` | 公开 semver `^2.0.3` | npm `latest` 指向 2.0.3，且该版本是当前 TypeScript 正式线；monSQLize 仅依赖 `dsl` / `validate` 能力，已用 2.0.3 实跑 type-check、model 测试、integration 与 examples 验证通过 |

> `schema-dsl@2.0.3` 与工作区 sibling `../schema-dsl` 当前版本一致；npm 上存在更高的 `2.3.x`，但已标记为误发布 / deprecated，不得跟随升级。

## 当前风险

1. **上游版本漂移**：`cache-hub` / `schema-dsl` 都使用 semver，需防止无意吸收 breaking change。
2. **误发布版本风险**：`schema-dsl` 的 npm `2.3.x` 已标记为误发布，不得跟随升级。
3. **联动回归盲区**：升级任意上游依赖后，必须重新覆盖关键回归面。

## 当前治理规则

### 开发态

- `cache-hub` 跟随公开 semver `^1.0.0`。
- `schema-dsl` 跟随公开 semver `^2.0.3`。
- 本地 sibling `../schema-dsl` 仅用于上游库自身调试，不再作为 monSQLize 根包安装前提。

### 发布态

- 根包发布态不得依赖工作区 `file:` / `workspace:` 路径。
- 当前依赖策略已满足“外部安装可解析”的基本前提；后续发布仍需通过标准验证链。

```bash
npm run release:preflight
```

## schema-dsl 2.x 升级闭环

本轮已将 `schema-dsl` 从 `^1.2.5` 升级到 `^2.0.3`，闭环标准如下：

1. 上游在 npm 发布了**非 deprecated** 的 2.x latest 版本：`2.0.3`。
2. `npm install schema-dsl@^2.0.3` 后通过 `npm run type-check`。
3. model 相关单测 / 集成测试全通过（随 `npm run test:unit` 与 `npm run test:integration` 覆盖）。
4. `npm run test:examples` 全通过。
5. 发布前仍需以 `npm run release:preflight` 作为最终门禁。
6. 本文件、Profile、CHANGELOG 与 lockfile 必须同步到 `^2.0.3`。

## 联动验证建议

| 场景 | 必做验证 |
|------|----------|
| 调整 `cache-hub` 相关能力 | `npm run type-check` + `test/unit/cache/cache.test.ts` + exports / smoke |
| 调整 `schema-dsl` 相关能力 | `npm run type-check` + model 相关单测 / 集成测试 + `npm run test:examples` |
| 准备发版 | `npm run release:preflight` |

## 长期方向

1. `schema-dsl` 继续跟随 npm `latest`，但必须排除 deprecated 误发布版本。
2. 发布态持续保持对工作区路径零依赖；所有上游依赖都必须可由公开 semver 解析。
