# MongoDB 内存服务端矩阵

> **目的**：把 `MongoDB 7.x / 8.x` 服务端矩阵落实为**默认可执行且严格阻断**的内存版回归链，而不是继续依赖外部 Mongo URI。

## 1. 当前约束

当前仓库的默认 integration 主要依赖：

- `test/bootstrap/memory-server.js`
- `test/bootstrap/replset-server.js`
- `mongodb-memory-server`

这条链路会先把 TypeScript 测试编译到 `.generated/test-dist/test/**`，再直接验证当前 runtime 在 **MongoDB 7.x / 8.x 二进制**上的行为闭环；默认使用内存版 MongoDB，不再要求外部数据库服务。

## 2. 输入方式

默认情况下无需准备外部 URI。矩阵脚本会直接通过 `mongodb-memory-server` 拉起：

- 单机实例：覆盖普通 integration 场景
- 单节点 replica set：覆盖 transaction / sync 等需要副本集的场景

资源目录由仓库统一固定，避免每次脚本运行重复下载二进制或在系统临时目录留下大量数据：

- 二进制缓存：`.cache/mongodb-memory-server/binaries`
- 临时数据目录：`.cache/mongodb-memory-server/db`
- 日常默认二进制版本：`7.0.37`
- 发布必需版本：`7.0.37` / `8.0.26`
- 项目自动创建的 `dbPath` 会在 `stop({ doCleanup: true, force: true })` 路径中清理

如需手工指定二进制版本，可使用：

- `MONSQLIZE_MEMORY_MONGO_BINARY_VERSION`
- `MONSQLIZE_REPLSET_BINARY_VERSION`

如需改写缓存或临时目录，可使用：

- `MONGOMS_DOWNLOAD_DIR`
- `MONSQLIZE_MEMORY_SERVER_CACHE_DIR`
- `MONSQLIZE_MEMORY_SERVER_DB_DIR`
- `MONSQLIZE_MEMORY_MONGO_LAUNCH_TIMEOUT_MS`

## 3. 探测命令

先执行：

```bash
npm run probe:server-matrix
```

该命令会输出：

- 当前 Node/Volta 环境
- `MongoDB 7.0.37` 与 `8.0.26` 是否都能通过 `mongodb-memory-server` 启动单机与 replica set
- 当前是否已具备执行默认矩阵的最小条件

只要一个必需版本启动失败或不可用，命令就会非零退出；不能用另一个版本成功来形成 ready 状态。

## 4. 执行命令

当探测通过后，执行：

```bash
npm run test:server-matrix
```

该脚本会执行以下验证：

- 复用当前 Node，并在 Volta 可用时只补齐缺失的 Node 20/22；从 Node 20 或 Node 22 启动都会得到两个必需运行时，而不会重复当前 major。
- 数据库 integration 文件使用 `--test-concurrency=1` 串行启动，避免多个 memory-server 进程竞争同一个自动端口。

### 4.1 普通服务端路径

- `.generated/test-dist/test/integration/mongodb/connect.test.js`
- `.generated/test-dist/test/integration/mongodb/queries.test.js`
- `.generated/test-dist/test/integration/mongodb/management.test.js`
- `.generated/test-dist/test/integration/mongodb/writes-batch.test.js`
- `.generated/test-dist/test/integration/model/model-features.test.js`
- `.generated/test-dist/test/integration/pool/pool.test.js`
- `.generated/test-dist/test/integration/slow-query-log/slow-query-log.test.js`
- `.generated/test-dist/test/integration/data-tasks/data-task-job-facade.test.js`

这些测试在矩阵脚本中会分别对 `MongoDB 7.0.37` / `8.0.26` 执行。

### 4.2 Replica Set 路径

- `.generated/test-dist/test/integration/transaction/transaction.test.js`
- `.generated/test-dist/test/integration/sync/sync.test.js`

这些测试同样在矩阵脚本中分别对 `MongoDB 7.0.37` / `8.0.26` 执行。

### 4.3 Node / Driver 维度

矩阵脚本还会补跑：

- Node `20.x` 当前环境
- Node `22.x`（`volta run --node 22`）
- Driver `6.21.0` 当前依赖
- Driver `7.2.0` 临时安装后回归

任何必需 Node / Driver / Server / suite 组合的 `unavailable` 或 `failed` 都会让脚本非零退出。Driver 7 临时安装失败也不能降级为发布通过。

## 5. 验证状态

历史证据（不再属于当前发布矩阵）：

- `MongoDB 6.0.14`：单机 / replica set 均可启动
- `MongoDB 7.0.14`：单机 / replica set 均可启动
- Node `20.20.2` / `22.22.3`：矩阵执行通过
- Driver `6.21.0` / `7.2.0`：矩阵执行通过

当前 v3 发布证据（2026-07-13）：

- `MongoDB 7.0.37` / `8.0.26` 的单机与 replica set 已全部通过
- Node 20/22 × Driver 6.21.0/7.5.0 × MongoDB 7/8 的 8 个组合全部 verified
- 每个服务端组合均包含 DataTask integration；单组合 62 tests、61 pass、1 个既有时序型 skip、0 fail
- `npm run probe:server-matrix` 与 `npm run test:server-matrix` 严格 verdict 均为 ready
- 若后续还要补“外部真实服务”烟囱回归，应视为附加验证，而不是默认闭环前提

