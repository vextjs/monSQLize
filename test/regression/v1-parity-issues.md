# v1 API Parity Issues

Tracks incompatibilities discovered while writing v1-parity-oriented tests.
Each row captures the gap between v1 behavior and v2 actual behavior.

Format: `| 类别 | 方法 | v1 约定 | v2 实际 | 发现于测试文件 | 优先级建议 | 状态 |`

类别枚举: `入参` / `响应结构` / `行为` / `类型声明`
状态枚举: `已确认-合理演进` / `已确认-待修复` / `待复核`

---

| 类别 | 方法 | v1 约定 | v2 实际 | 发现于测试文件 | 优先级建议 | 状态 |
|------|------|---------|---------|--------------|-----------|------|
| 行为 | `findOneById` | `null`/`undefined` id → 抛出 `"id 参数是必需的"`（中文） | 抛出 `"id is required"`（英文） | find-one.test.ts | 低（合理演进：v2 统一使用英文错误消息） | 已确认-合理演进 |
| 行为 | `findOneById` | 无效字符串 id → 抛出 `"无效的 ObjectId 格式"` | 抛出 `"invalid ObjectId format: \"...\""` | find-one.test.ts | 低（合理演进：英文化） | 已确认-合理演进 |
| 行为 | `findOneById` | 非字符串/非 ObjectId → 抛出 `"id 必须是字符串或 ObjectId 实例"` | 抛出 `"id must be a string or ObjectId instance"` | find-one.test.ts | 低（合理演进：英文化） | 已确认-合理演进 |
| 行为 | `findByIds` | 非数组 → 抛出 `"ids 必须是数组"` | 抛出 `"ids must be an array"` | find-one.test.ts | 低（合理演进：英文化） | 已确认-合理演进 |
| 行为 | `findByIds` | 无效 ID 元素 → 抛出含 `"无效 ID"` 的消息 | 抛出 `"ids array contains N invalid ID(s)"` | find-one.test.ts | 低（合理演进：英文化，且更具体） | 已确认-合理演进 |
| 行为 | `findOneById` | 支持 `cache` 选项（`{ cache: ttlMs }`），命中缓存时返回缓存结果 | `cache` 选项被静默忽略，始终查询 DB | find-one.test.ts | 中（功能缺失：`findOne` 支持 cache 但 `findOneById` 不支持，存在不一致） | 已确认-待修复 |
| 行为 | `findByIds` | 支持 `cache` 选项 | `cache` 选项被静默忽略 | find-one.test.ts | 中（功能缺失：同上） | 已确认-待修复 |
| 行为 | `findOneAndUpdate` | `returnDocument` 默认为 `'after'`（返回更新后的文档）| MongoDB driver v6 默认为 `'before'`（返回更新前的文档），v2 直接透传，未设置默认值 | delete.test.ts | 中（行为差异：调用方若依赖默认值会得到旧文档而非新文档） | 已确认-待修复 |
| 行为 | `findOneAndReplace` | `returnDocument` 默认为 `'after'` | 同上，默认为 `'before'` | delete.test.ts | 中（同上） | 已确认-待修复 |

---

## Current Review Status

- 已复核到当前已接入的 Phase A / B / C / D 补测文件。
- 截至 `2026-05-24`，未发现新增的中优先级兼容差异漏记项。
- 当前共有 9 条已确认差异：
  - 5 条 `已确认-合理演进`
  - 4 条 `已确认-待修复`
