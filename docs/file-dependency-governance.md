# 依赖发布边界治理

当前根包采用**混合依赖策略**：

| 依赖 | 策略 | 原因 |
|------|------|------|
| `cache-hub` | 公开 semver `^1.0.0` | 上游已发布稳定版本，验证通过 |
| `schema-dsl` | 工作区 `file:../schema-dsl` | 本地重构版本尚未发布；npm `2.3.x` 为误发布，`1.2.5` 与本地版本不匹配 |

> `schema-dsl` 在工作区 sibling `../schema-dsl` 中正在进行 2.x 重构，尚未发版。待上游正式发布非 deprecated 版本后，再迁移到 semver。

## 当前风险

1. **`file:` 路径绑定**：`schema-dsl` 以本地路径引用，CI / 外部安装环境中无法解析——当前仅作内部联调，**不进入 npm publish 流程**。
2. **上游版本漂移**：`cache-hub` 使用 semver，需防止无意间吸收上游 breaking change。
3. **误发布版本风险**：`schema-dsl` 的 npm `2.3.x` 已标记为误发布，不得跟随升级。
4. **联动回归盲区**：升级任意上游依赖后，必须重新覆盖关键回归面。

## 当前治理规则

### 开发态

- `schema-dsl` 使用 `file:../schema-dsl`；开发者须保证本地路径存在（monSQLize 与 schema-dsl 为同级目录）。
- `cache-hub` 跟随公开 semver `^1.0.0`。

### 发布态

- **当前 monSQLize 不应直接发布**：`file:` 依赖在外部安装场景无法解析。
- 待 `schema-dsl` 上游发布稳定版本后，按下方升级评估流程切换 semver，才可进入发布门禁。

```bash
npm run release:preflight
```

## schema-dsl 升级评估标准

满足以下全部条件，才可将 `schema-dsl` 从 `file:` 切换为 semver：

1. 上游在 npm 发布了**非 deprecated** 的 2.x 版本。
2. `npm install schema-dsl@^2.x` 后通过 `npm run type-check`。
3. model 相关单测 / 集成测试全通过。
4. `npm run test:examples` 全通过。
5. 更新本文件的锁定策略表。

## 联动验证建议

| 场景 | 必做验证 |
|------|----------|
| 调整 `cache-hub` 相关能力 | `npm run type-check` + `test/unit/cache/cache.test.js` + exports / smoke |
| 调整 `schema-dsl` 相关能力 | `npm run type-check` + model 相关单测 / 集成测试 |
| 准备发版（schema-dsl 切 semver 后）| `npm run release:preflight` |

## 长期方向

1. `schema-dsl` 2.x 正式发版后，按上方评估标准切换到 semver，移除 `file:` 绑定。
2. 发布态对工作区路径零依赖——两个上游包均使用公开 semver 后才进入发版通道。
