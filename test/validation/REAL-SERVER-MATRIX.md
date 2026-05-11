# MongoDB 真实服务端矩阵

> **目的**：把 `MongoDB 6.x / 7.x` 真实服务端矩阵从“口头待补”升级为“可执行探测 + 可复用执行入口”。

## 1. 当前约束

当前仓库的默认 integration 主要依赖：

- `test/bootstrap/memory-server.js`
- `test/bootstrap/replset-server.js`
- `mongodb-memory-server`

这能验证当前运行时闭环，但**不等于真实 MongoDB 6.x / 7.x 服务端矩阵已经完成**。

## 2. 真实服务端矩阵的输入

执行真实服务端矩阵前，需要准备两个外部 URI：

- `MONSQLIZE_MEMORY_MONGO_URI`
  - 用于普通 integration 场景
  - 例如单机 MongoDB 6.x / 7.x 实例
- `MONSQLIZE_REPLSET_URI`
  - 用于 transaction / sync 等需要 replica set 的场景
  - 例如 1 节点 replica set 的连接串

> 两个 URI 可以指向同一套服务，只要该服务同时满足对应能力。

## 3. 探测命令

先执行：

```bash
npm run probe:server-matrix
```

该命令会输出：

- 当前主机是否存在 `docker` / `podman` / `mongod` / `mongosh`
- 当前是否已注入 `MONSQLIZE_MEMORY_MONGO_URI`
- 当前是否已注入 `MONSQLIZE_REPLSET_URI`
- 当前是否已具备执行真实服务端矩阵的最小条件

## 4. 执行命令

当真实服务已准备好后，执行：

```bash
npm run test:server-matrix
```

该脚本会执行以下两组测试：

### 4.1 普通服务端路径

- `test/integration/mongodb/connect.test.js`
- `test/integration/mongodb/queries.test.js`
- `test/integration/mongodb/management.test.js`
- `test/integration/mongodb/writes-batch.test.js`
- `test/integration/model/model-features.test.js`
- `test/integration/pool/pool.test.js`
- `test/integration/slow-query-log/slow-query-log.test.js`

这些测试使用：

- `MONSQLIZE_MEMORY_MONGO_URI`

### 4.2 Replica Set 路径

- `test/integration/transaction/transaction.test.js`
- `test/integration/sync/sync.test.js`

这些测试使用：

- `MONSQLIZE_REPLSET_URI`

## 5. 当前主机结论（2026-05-11）

本机已探测到：

- `docker`：不可用
- `docker compose`：不可用
- `podman`：不可用
- `mongod`：不可用
- `mongosh`：不可用

因此：

- 当前这台机器**尚不具备**直接拉起真实 MongoDB 6.x / 7.x 服务端矩阵的本地条件
- 但仓库已经具备**可执行探测入口**与**正式执行入口**
- 一旦外部服务或命令可用，可直接重用现有测试资产执行真实服务端矩阵，无需再临时手工拼命令

