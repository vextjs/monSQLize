# 核心运行时结构说明

> 目标：给后续维护者一张“从入口到能力层”的结构图，避免继续把逻辑堆回 `runtime-core.ts`。

## 模块分层

```text
MonSQLizeRuntime (src/entry/runtime-core.ts)
├── entry helpers / compat accessors
│   ├── runtime-helpers.ts
│   └── runtime-compat-accessors.ts
├── capabilities
│   ├── cache / function-cache
│   ├── model
│   ├── pool
│   ├── sync
│   ├── slow-query-log
│   ├── transaction / lock / saga
│   └── count-queue
├── adapters
│   └── mongodb/common + writes
└── core
    ├── expression
    └── errors / logger / utils
```

## 维护边界

### `runtime-core.ts`

只负责：

- runtime 主类公开 API
- 能力装配
- connect / close / collection / db / model 等入口委托

不应该继续堆：

- 复杂写入编排
- expression 解析细节
- sync 记录/存储细节
- compat-only 的类型清洗逻辑

### `runtime-helpers.ts` / `runtime-compat-accessors.ts`

负责：

- runtime 与 model/accessor 的装配细节
- v1 兼容路径的 getter / cache / dbInstance 桥接

### capability / adapter 层

负责：

- 真正的行为语义
- 对应模块的内部 helper、队列、存储、编排

## 当前热点治理结果

| 热点 | 当前策略 |
|------|----------|
| `slow-query-log` | 已拆为 config / queue / records / storage / manager |
| `writes` | 已拆为 utils / basic / batch |
| `expression` | 已抽离 compiler，入口只保留公开 API 与 traversal |
| `collection-accessor` | 写路径已移到 helper，主文件回归 façade |
| `ModelInstance` | mutation orchestration 已迁出主文件 |

## 后续维护规则

1. 新能力优先进入 `capabilities/` 或 `adapters/`，不要先改 `runtime-core.ts`。
2. 涉及 compat-only 逻辑时，优先进入 `runtime-compat-accessors.ts`。
3. 热点重构后，至少补 `test:refactor-guard` + 对应 capability 层回归。
