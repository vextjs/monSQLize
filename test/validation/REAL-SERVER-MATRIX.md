# MongoDB 内存服务端矩阵

> **目的**：把 `MongoDB 6.x / 7.x` 服务端矩阵落实为**默认可执行**的内存版回归链，而不是继续依赖外部 Mongo URI。

## 1. 当前约束

当前仓库的默认 integration 主要依赖：

- `test/bootstrap/memory-server.js`
- `test/bootstrap/replset-server.js`
- `mongodb-memory-server`

这条链路会先把 TypeScript 测试编译到 `.generated/test-dist/test/**`，再直接验证当前 runtime 在 **MongoDB 6.x / 7.x 二进制**上的行为闭环；默认使用内存版 MongoDB，不再要求外部数据库服务。

## 2. 输入方式

默认情况下无需准备外部 URI。矩阵脚本会直接通过 `mongodb-memory-server` 拉起：

- 单机实例：覆盖普通 integration 场景
- 单节点 replica set：覆盖 transaction / sync 等需要副本集的场景

资源目录由仓库统一固定，避免每次脚本运行重复下载二进制或在系统临时目录留下大量数据：

- 二进制缓存：`.cache/mongodb-memory-server/binaries`
- 临时数据目录：`.cache/mongodb-memory-server/db`
- 默认二进制版本：`7.0.14`
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
- `MongoDB 6.0.14` 与 `7.0.14` 是否都能通过 `mongodb-memory-server` 启动单机与 replica set
- 当前是否已具备执行默认矩阵的最小条件

## 4. 执行命令

当探测通过后，执行：

```bash
npm run test:server-matrix
```

该脚本会执行以下验证：

### 4.1 普通服务端路径

- `.generated/test-dist/test/integration/mongodb/connect.test.js`
- `.generated/test-dist/test/integration/mongodb/queries.test.js`
- `.generated/test-dist/test/integration/mongodb/management.test.js`
- `.generated/test-dist/test/integration/mongodb/writes-batch.test.js`
- `.generated/test-dist/test/integration/model/model-features.test.js`
- `.generated/test-dist/test/integration/pool/pool.test.js`
- `.generated/test-dist/test/integration/slow-query-log/slow-query-log.test.js`

这些测试在矩阵脚本中会分别对 `MongoDB 6.0.14` / `7.0.14` 执行。

### 4.2 Replica Set 路径

- `.generated/test-dist/test/integration/transaction/transaction.test.js`
- `.generated/test-dist/test/integration/sync/sync.test.js`

这些测试同样在矩阵脚本中分别对 `MongoDB 6.0.14` / `7.0.14` 执行。

### 4.3 Node / Driver 维度

矩阵脚本还会补跑：

- Node `20.x` 当前环境
- Node `22.x`（`volta run --node 22`）
- Driver `6.21.0` 当前依赖
- Driver `7.2.0` 临时安装后回归

## 5. 当前主机结论（2026-05-17）

本机已验证：

- `MongoDB 6.0.14`：单机 / replica set 均可启动
- `MongoDB 7.0.14`：单机 / replica set 均可启动
- Node `20.20.2` / `22.22.3`：矩阵执行通过
- Driver `6.21.0` / `7.2.0`：矩阵执行通过

因此：

- 当前这台机器**已经具备**默认矩阵执行条件
- `npm run probe:server-matrix` 与 `npm run test:server-matrix` 均可直接复用
- 若后续还要补“外部真实服务”烟囱回归，应视为附加验证，而不是默认闭环前提
- 2026-06-10 复核：`npm run probe:server-matrix` 已在项目本地 binary cache / dbPath 策略下通过，执行后 `.cache/mongodb-memory-server/db` 无残留项目自动目录

