# 依赖发布边界治理

当前根包采用**公开 semver 依赖策略**：

| 依赖 | 策略 | 原因 |
|------|------|------|
| `cache-hub` | 公开 semver `^1.0.0` | 上游已发布稳定版本，验证通过 |
| `schema-dsl` | 公开 semver `^1.2.5` | 当前 monSQLize 仅依赖 `dsl` / `validate` 能力；已用 1.2.5 实跑 type-check、model 测试与 examples 验证通过 |

> `schema-dsl` 在工作区 sibling `../schema-dsl` 中仍在进行 2.x 重构，但 monSQLize 根包依赖已回到可发布的 semver 路径。后续若要升级到 2.x，必须重新走兼容评估。

## 当前风险

1. **上游版本漂移**：`cache-hub` / `schema-dsl` 都使用 semver，需防止无意吸收 breaking change。
2. **误发布版本风险**：`schema-dsl` 的 npm `2.3.x` 已标记为误发布，不得跟随升级。
3. **联动回归盲区**：升级任意上游依赖后，必须重新覆盖关键回归面。

## 当前治理规则

### 开发态

- `cache-hub` 跟随公开 semver `^1.0.0`。
- `schema-dsl` 跟随公开 semver `^1.2.5`。
- 本地 sibling `../schema-dsl` 仅用于上游库自身调试，不再作为 monSQLize 根包安装前提。

### 发布态

- 根包发布态不得依赖工作区 `file:` / `workspace:` 路径。
- 当前依赖策略已满足“外部安装可解析”的基本前提；后续发布仍需通过标准验证链。

```bash
npm run release:preflight
```

## schema-dsl 未来升级到 2.x 的评估标准

满足以下全部条件，才可将 `schema-dsl` 从 `^1.2.5` 升级到 2.x semver：

1. 上游在 npm 发布了**非 deprecated** 的 2.x 版本。
2. `npm install schema-dsl@^2.x` 后通过 `npm run type-check`。
3. model 相关单测 / 集成测试全通过。
4. `npm run test:examples` 全通过。
5. `npm run verify:full` 全通过。
6. 更新本文件的锁定策略表。

## 联动验证建议

| 场景 | 必做验证 |
|------|----------|
| 调整 `cache-hub` 相关能力 | `npm run type-check` + `test/unit/cache/cache.test.js` + exports / smoke |
| 调整 `schema-dsl` 相关能力 | `npm run type-check` + model 相关单测 / 集成测试 + `npm run test:examples` |
| 准备发版 | `npm run release:preflight` |

## 长期方向

1. `schema-dsl` 2.x 正式发版后，按上方评估标准再决定是否升级。
2. 发布态持续保持对工作区路径零依赖；所有上游依赖都必须可由公开 semver 解析。
