# v1 API Parity Issues

Tracks behavior/API gaps between monSQLize v1 (`e:/Worker/monSQLize-v1/lib/`) and v2 (`e:/Worker/monSQLize/src/`) discovered by direct source-code comparison (not test inference).

格式: `| 类别 | 方法 | v1 约定 | v2 实际 | 发现位置 (v1 vs v2) | 优先级 | 状态 |`

类别枚举: `入参` / `响应结构` / `行为` / `类型声明`
状态枚举: `已确认-已修复` / `待复核`

---

## 已修复行为差异（v1 parity）

| # | 类别 | 方法 | v1 约定 | v2 实际 | 发现位置 (v1 vs v2) | 优先级 | 状态 |
|---|------|------|---------|---------|---------------------|--------|------|
| 6 | 行为 | `findOneById` | 支持 `options.cache`（TTL ms），经 read-through 缓存层 | 已接入 `queryCache` read-through cache，并保留 maxTimeMS/defaults | `lib/mongodb/queries/find-one-by-id.js` vs `src/adapters/mongodb/queries/find-by-id.ts` | 中 | 已确认-已修复 |
| 7 | 行为 | `findByIds` | 支持 `options.cache`（同上） | 已接入 `queryCache` read-through cache，并保留 preserveOrder 处理 | `lib/.../find-by-ids.js` vs `src/.../find-by-id.ts` | 中 | 已确认-已修复 |
| 8 | 行为 | Model `hooks`（v2 flat 格式）命名重写 | v1 按 op 分组：`insert/update/delete/find` | flat hooks 已支持 `beforeInsert/afterInsert` 作为 `beforeCreate/afterCreate` 兼容别名 | `lib/model/index.js` vs `types/model.d.ts` + `src/capabilities/model/model-mutation-orchestrator.ts` | 中 | 已确认-已修复 |
| 9 | 行为 | Model `hooks`（v2 flat 格式）覆盖范围缩小 | v1 对所有写操作触发 op-type 钩子 | flat hooks 已扩展到 bulk/upsert/increment/findOneAnd* 等写路径 | `lib/model/index.js` vs `src/capabilities/model/model-mutation-orchestrator.ts` | 高 | 已确认-已修复 |
| 12 | 入参 | `insertBatch / deleteBatch` 重试默认值 | `retryAttempts = 3`、`retryDelay = 1000` | 默认值已恢复为 `3/1000` | `lib/mongodb/writes/insert-batch.js` + `delete-batch.js` vs `src/adapters/mongodb/writes/write-batch.ts` | 中 | 已确认-已修复 |
| 13 | 入参 | `updateBatch` 重试支持**整体缺失** | 支持 `onError='retry'` + `retryAttempts=3` + `retryDelay=1000` + `onRetry` 回调 | 已补齐 retry 参数、onRetry、retries 记录与错误策略 | `lib/mongodb/writes/update-batch.js` vs `src/adapters/mongodb/writes/write-batch.ts` | **高** | 已确认-已修复 |
| 14 | 行为 | 库级默认值整体缺失 | v1 构造器统一注入 `maxTimeMS=2000` / `findLimit=10` / `slowQueryMs=500` / `findPageMaxLimit=500` | runtime query defaults 已恢复内建默认，公开 `getDefaults()` 与查询层默认值保持一致 | `lib/index.js` vs `src/entry/capability-wiring.ts` + `runtime-defaults.ts` | **高** | 已确认-已修复 |
| 15 | 入参 | `LockManager` TTL 上限 | v1 `acquireLock` 直接 honor `options.ttl`（无上限） | 内存 `LockManager` 已移除 `maxDuration` 静默截断，renew 同步 honor 传入 ttl | `lib/transaction/DistributedCacheLockManager.js` vs `src/capabilities/lock/index.ts` | 低 | 已确认-已修复 |
| 17 | 入参 | `withCache(fn, options)` 默认值 | `ttl=60000`、`namespace='fn'`、`enableStats=true` | 默认值已恢复为 60 秒缓存、共享 `fn` 命名空间与统计开启 | `lib/function-cache.js` vs `src/capabilities/function-cache/index.ts` | **高** | 已确认-已修复 |

---

> 说明：错误消息英文化、`findPage` 缺省 limit、更丰富的 `getPoolStats()` / `Saga.execute()` 响应字段已按用户确认从 parity issue 清单移除，不再作为待修复差异记录。

---

## 已撤销条目（本次源码核对推翻）

| 误记内容 | 撤销原因 | 校验位置 |
|---------|---------|---------|
| `findOneAndUpdate` returnDocument 默认 `'after'` vs v2 `'before'` | v1 实际代码 `returnDocument: options.returnDocument \|\| 'before'`，**v1 默认也是 `'before'`**（与 MongoDB driver v6 默认一致）；v2 直接透传 driver 默认 `'before'`；**两者一致**。原条目源于 delete.test.ts 写法误判 | `lib/mongodb/writes/find-one-and-update.js:186,195` vs `src/adapters/mongodb/writes/write-basic.ts:54-64` |
| `findOneAndReplace` returnDocument 默认 `'after'` vs v2 `'before'` | 同上，v1 实际也是 `'before'` | `lib/mongodb/writes/find-one-and-replace.js:185,194` vs `src/adapters/mongodb/writes/write-basic.ts:66-77` |

---

## 已确认无差异（同源核对通过）

- soft-delete 默认 `field='deletedAt'` / `type='timestamp'`（v1 `lib/model/features/soft-delete.js:24-39` ≈ v2）
- version 默认 `field='version'`（v1 `lib/model/features/version.js:49,57` ≈ v2 `model-instance-config.ts:171,176`）
- timestamps 默认 `createdAt='createdAt'` / `updatedAt='updatedAt'`（v1 `lib/model/index.js:345-346` ≈ v2）
- `incrementOne` 默认 `returnDocument='after'` 一致（v1 `increment-one.js:146` ≈ v2 `write-basic.ts:155`）
- `incrementOne` 返回 shape `{ acknowledged, matchedCount, modifiedCount, value }` 一致
- `normalizeProjection` / `normalizeSort` 实现逐行一致（v1 `common/normalize.js` ≈ v2 `utils/normalize.ts`）
- `FindChain.sort('string')` 在 v1/v2 都抛同样英文错误 `sort() requires an object or array`（v1 `chain.js:102` ≈ v2 `queries/index.ts:98`）
- Methods factory `(model) => ({ instance, static })` 被 v2 `V1MethodsFactory` 完整保留
- v1 hooks factory `(model) => ({ insert: { before }, ... })` 被 v2 `V1HooksFactory` 完整保留（**仅 v2 flat 形式有 #8/#9 问题**）
- `findOneAndUpdate / findOneAndReplace / findOneAndDelete` 默认返回 shape 一致（默认无 `includeResultMetadata` 时都返回单文档或 null）

---

## Current Review Status

- 复核日期: 2026-05-27（移除合理演进项并修复剩余 parity 差异）
- 复核方法: **直接对照 `e:/Worker/monSQLize-v1/lib/` 与 `e:/Worker/monSQLize/src/` 源码**（不再依赖测试推断）
- 覆盖范围: errors / mongodb/queries / mongodb/writes / mongodb/writes 批操作 / model + features / infrastructure(pool) / common/normalize / common/validation / runner / cache / function-cache / chain / transaction / lock / saga / count-queue / 库级默认值（DEFAULTS 块）
- 当前保留 **9 条已修复 parity 条目** + 2 条已撤销：
  - #6–#7 findOneById/findByIds cache 已恢复
  - #8–#9 flat hooks 命名别名与覆盖范围已恢复
  - #12–#13 batch retry 默认值与 updateBatch retry 支持已恢复
  - #14 runtime query defaults 已恢复
  - #15 Lock TTL 静默截断已移除
  - #17 `withCache` 默认缓存行为已恢复
