# monSQLize 兼容性测试使用指南

**版本**: 1.0  
**最后更新**: 2025-01-02

---

## 📋 目录

1. [快速开始](#快速开始)
2. [测试类型](#测试类型)
3. [运行测试](#运行测试)
4. [查看报告](#查看报告)
5. [CI/CD 集成](#cicd-集成)
6. [常见问题](#常见问题)
7. [故障排除](#故障排除)

---

## 🚀 快速开始

### 最快速测试（推荐）

```bash
# 运行当前环境的兼容性测试
npm run test:compatibility:server:quick
```

这将在 5 分钟内完成基本的兼容性测试。

### 完整兼容性测试

```bash
# 测试所有维度（需要 30-60 分钟）
npm run test:compatibility:node     # Node.js 多版本
npm run test:compatibility:driver   # MongoDB Driver 多版本
npm run test:compatibility:server   # MongoDB Server 版本
```

---

## 📊 测试类型

### 1. Node.js 版本兼容性测试

**测试内容**:
- async/await、Promise 支持
- Buffer、Stream API
- Worker Threads（Node.js 16+）
- 性能计时 API

**覆盖版本**: 14.x, 16.x, 18.x, 20.x, 22.x

**运行方式**:
```bash
# 快速测试当前 Node.js 版本
node test/compatibility/run-node-test.js

# 测试所有 Node.js 版本（需要 nvm 或 volta）
npm run test:compatibility:node
```

**前置条件**:
- 多版本测试需要安装 [nvm](https://github.com/nvm-sh/nvm) 或 [volta](https://volta.sh/)
- 已安装目标 Node.js 版本

---

### 2. MongoDB Driver 版本兼容性测试

**测试内容**:
- findOneAnd* 返回值差异（5.x vs 6.x）
- 连接选项兼容性
- CRUD 操作
- 索引操作
- 聚合操作
- 事务支持

**覆盖版本**: 4.17.2, 5.9.2, 6.17.0

**运行方式**:
```bash
# 快速测试当前 Driver 版本
npm run test:compatibility:driver:quick

# 测试所有 Driver 版本（自动切换）
npm run test:compatibility:driver

# 测试特定版本
node scripts/test-driver-versions.js --drivers=5.9.2,6.17.0
```

**注意事项**:
- 会临时修改 package.json（测试完成后自动恢复）
- 每个版本测试约 5-10 分钟
- 建议在干净的工作目录运行

---

### 3. MongoDB Server 版本兼容性测试

**测试内容**:
- Server 版本检测
- 特性支持探测（事务、索引、聚合）
- CRUD 操作
- 条件性测试（自动跳过不支持的特性）

**覆盖版本**: 4.4, 5.0, 6.0, 7.0

**运行方式**:

#### Memory Server 模式（推荐，快速）
```bash
# 快速测试
npm run test:compatibility:server:quick

# 完整测试（默认）
npm run test:compatibility:server
```

**优点**:
- ✅ 无需 Docker
- ✅ 快速（< 5 分钟）
- ✅ 自动下载和启动

**缺点**:
- ⚠️ 可能不支持所有特性（如事务）
- ⚠️ 单一版本（Memory Server 当前版本）

#### Docker 模式（完整测试）
```bash
# 测试所有 Server 版本
npm run test:compatibility:server:docker

# 测试特定版本
node scripts/test-server-versions.js --servers=6.0,7.0
```

**前置条件**:
- 已安装 [Docker Desktop](https://www.docker.com/products/docker-desktop)

**优点**:
- ✅ 真实 MongoDB Server 环境
- ✅ 支持所有特性（事务、副本集）
- ✅ 测试多个版本

**缺点**:
- ⚠️ 需要 Docker
- ⚠️ 较慢（每个版本 5-10 分钟）

---

## 📄 查看报告

### 自动生成的报告

测试完成后，报告会自动保存在 `reports/monSQLize/` 目录：

```
reports/monSQLize/
├── node-compatibility-{timestamp}.json
├── driver-compatibility-{timestamp}.json
├── server-compatibility-{timestamp}.json
├── compatibility-report-latest.md
└── compatibility-report-{date}.md
```

### 生成综合报告

```bash
# 聚合所有测试结果，生成综合报告
node scripts/generate-compatibility-report.js

# 查看报告
cat reports/monSQLize/compatibility-report-latest.md
```

### 报告内容

**Markdown 报告** (`compatibility-report-latest.md`):
- 所有测试维度的结果
- 兼容性矩阵表格
- 通过/失败统计
- 失败测试的详细信息

**JSON 报告** (各个 `*-compatibility-{timestamp}.json`):
- 机器可读格式
- 包含详细的测试结果
- 可用于进一步分析或可视化

---

## 🔄 CI/CD 集成

### GitHub Actions

项目已配置 GitHub Actions 自动测试，查看 `.github/workflows/test-matrix.yml`。

#### 触发条件

**核心测试**（每次 PR）:
- Node.js 18.x, 20.x
- MongoDB Driver 6.17.0
- Ubuntu 和 Windows

**完整矩阵**（merge 到 main / 每日定时）:
- Node.js 14-22
- MongoDB Driver 4.x-6.x
- MongoDB Server (Memory Server)

#### 查看结果

1. 进入 GitHub 项目页面
2. 点击 **Actions** 标签
3. 选择最近的工作流运行
4. 查看 **Artifacts** 下载报告

---

## ❓ 常见问题

### Q1: 为什么 Driver 多版本测试会修改 package.json？

**A**: 测试脚本会临时安装不同版本的 mongodb 包。测试完成后会自动恢复原始配置。

**建议**: 在干净的工作目录运行，或提前提交代码。

---

### Q2: Node.js 多版本测试失败，提示"未检测到 nvm 或 volta"

**A**: 多版本测试需要版本管理工具。

**解决**:
```bash
# 安装 nvm（推荐）
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash

# 或安装 volta
curl https://get.volta.sh | bash

# 安装目标 Node.js 版本
nvm install 18
nvm install 20
```

---

### Q3: Server Docker 测试失败，提示"未检测到 Docker"

**A**: Docker 模式需要 Docker Desktop。

**解决**:
1. 安装 [Docker Desktop](https://www.docker.com/products/docker-desktop)
2. 启动 Docker Desktop
3. 或使用 Memory Server 模式（默认）

---

### Q4: 测试显示"⏭️ 跳过"是什么意思？

**A**: 条件性测试：当前环境不支持该特性，测试自动跳过。

**示例**:
```
⏭️ 跳过: Server 不支持 $function（需要 4.4+）
⏭️ 跳过: 当前环境不支持事务（需要副本集）
```

这是**正常行为**，不是测试失败。

---

### Q5: 如何只测试特定版本？

**A**: 使用命令行参数。

**示例**:
```bash
# 只测试 Node.js 18 和 20
node scripts/test-node-versions.js --versions=18,20

# 只测试 Driver 6.x
node scripts/test-driver-versions.js --drivers=6.17.0

# 只测试 Server 6.0 和 7.0
node scripts/test-server-versions.js --servers=6.0,7.0
```

---

## 🔧 故障排除

### 问题 1: Driver 测试后 node_modules 损坏

**症状**: 测试完成后，npm install 失败或依赖缺失

**原因**: 测试脚本恢复失败

**解决**:
```bash
# 强制重新安装依赖
rm -rf node_modules package-lock.json
npm install
```

---

### 问题 2: Memory Server 下载失败

**症状**: 测试启动时卡在"下载 MongoDB Memory Server"

**原因**: 网络问题或镜像不可用

**解决**:
```bash
# 设置淘宝镜像
export MONGOMS_DOWNLOAD_MIRROR=https://npm.taobao.org/mirrors/mongodb

# 或使用 Docker 模式
npm run test:compatibility:server:docker
```

---

### 问题 3: Docker 容器启动失败

**症状**: `docker-compose up` 报错

**原因**: 端口冲突或 Docker 服务未启动

**解决**:
```bash
# 检查端口占用
netstat -an | grep 27017

# 停止所有 MongoDB 容器
docker-compose -f test/docker-compose.yml down

# 清理悬空容器
docker system prune
```

---

### 问题 4: CI 测试失败但本地通过

**症状**: GitHub Actions 测试失败，但本地运行正常

**可能原因**:
1. 环境差异（OS、Node.js 版本）
2. 依赖缓存问题
3. 网络问题（下载 Memory Server）

**解决**:
1. 查看 CI 日志，确认具体错误
2. 本地运行相同的 Node.js 版本
3. 检查是否有特定环境的条件判断

---

## 📞 获取帮助

### 文档资源

- [兼容性矩阵](./COMPATIBILITY.md) - 完整的版本支持说明
- [测试目录说明](../test/compatibility/README.md) - 测试结构和用法
- [MongoDB Driver 兼容性](./mongodb-driver-compatibility.md) - Driver 差异详解

### 反馈渠道

- GitHub Issues: https://github.com/vextjs/monSQLize/issues
- GitHub Discussions: https://github.com/vextjs/monSQLize/discussions

---

## 🎓 最佳实践

### 1. 定期运行兼容性测试

```bash
# 每周运行一次完整测试
npm run test:compatibility:node
npm run test:compatibility:driver
npm run test:compatibility:server
```

### 2. 升级前测试

升级 Node.js、MongoDB Driver 或 Server 前：

```bash
# 先测试新版本
node scripts/test-driver-versions.js --drivers=7.0.0

# 确认兼容后再升级
```

### 3. CI 集成建议

- PR: 快速测试（核心组合）
- Main: 完整测试（所有组合）
- 定时: 每日完整测试

### 4. 本地开发建议

```bash
# 开发时快速测试
npm run test:compatibility:server:quick

# 提交前完整测试
npm test && npm run test:compatibility
```

---

**维护者**: monSQLize Team  
**许可证**: MIT

