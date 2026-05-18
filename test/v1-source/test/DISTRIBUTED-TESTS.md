# 分布式缓存功能测试

本文档说明如何运行分布式缓存失效功能的测试。

---

## 📋 测试概览

### 测试文件结构

```
test/
├── unit/infrastructure/
│   ├── distributed-cache-invalidator.test.js      # 单元测试：失效器
│   └── multi-level-cache-distributed.test.js      # 单元测试：多层缓存集成
├── integration/
│   └── distributed-cache-invalidation.test.js     # 集成测试：真实环境
└── README.md
```

---

## 🧪 单元测试

### 1. DistributedCacheInvalidator 单元测试

**文件**: `test/unit/infrastructure/distributed-cache-invalidator.test.js`

**测试内容**：
- ✅ 构造函数和初始化
- ✅ Redis 连接（显式配置/自动提取）
- ✅ 消息发送 (invalidate)
- ✅ 消息接收和处理
- ✅ 缓存失效逻辑（本地+远端）
- ✅ 统计信息
- ✅ 错误处理
- ✅ 边缘情况

**运行方式**：
```bash
# 运行单个测试文件
npm test -- test/unit/infrastructure/distributed-cache-invalidator.test.js

# 或使用 mocha
npx mocha test/unit/infrastructure/distributed-cache-invalidator.test.js
```

**依赖**：
- 无需真实 Redis（使用 Mock）
- 无需真实 MongoDB

---

### 2. MultiLevelCache 分布式集成测试

**文件**: `test/unit/infrastructure/multi-level-cache-distributed.test.js`

**测试内容**：
- ✅ setPublish 方法
- ✅ delPattern 触发广播
- ✅ 分布式场景模拟（实例间同步）
- ✅ 模式匹配失效
- ✅ 并发失效
- ✅ 性能测试

**运行方式**：
```bash
npm test -- test/unit/infrastructure/multi-level-cache-distributed.test.js
```

**依赖**：
- 无需真实 Redis（使用 Mock）
- 无需真实 MongoDB

---

## 🌐 集成测试

### 分布式缓存失效集成测试

**文件**: `test/integration/distributed-cache-invalidation.test.js`

**测试内容**：
- ✅ 真实环境下的缓存失效
- ✅ 实例间缓存同步
- ✅ 模式匹配失效
- ✅ 并发更新场景
- ✅ 统计信息验证
- ✅ 错误降级处理

**运行方式**：
```bash
# 运行集成测试
npm test -- test/integration/distributed-cache-invalidation.test.js

# 或使用 mocha
npx mocha test/integration/distributed-cache-invalidation.test.js
```

**依赖**：
- ✅ **必需**: Redis 运行在 `localhost:6379`
- ✅ **必需**: MongoDB 运行在 `localhost:27017`

**环境变量**（可选）：
```bash
export MONGODB_URI=mongodb://localhost:27017
export REDIS_URL=redis://localhost:6379

npm test -- test/integration/distributed-cache-invalidation.test.js
```

---

## 🚀 运行所有测试

### 运行所有单元测试
```bash
npm test -- test/unit/infrastructure/distributed-*.test.js
```

### 运行所有集成测试
```bash
npm test -- test/integration/distributed-*.test.js
```

### 运行所有分布式相关测试
```bash
# 单元测试
npm test -- test/unit/infrastructure/distributed-cache-invalidator.test.js
npm test -- test/unit/infrastructure/multi-level-cache-distributed.test.js

# 集成测试（需要 Redis + MongoDB）
npm test -- test/integration/distributed-cache-invalidation.test.js
```

---

## 📊 测试覆盖率

查看测试覆盖率：
```bash
npx nyc npm test
```

生成覆盖率报告：
```bash
npx nyc --reporter=html npm test
open coverage/index.html
```

---

## 🔧 环境准备

### 1. 启动 MongoDB
```bash
# 使用 Docker
docker run -d -p 27017:27017 --name mongodb mongo:latest

# 或本地安装
mongod
```

### 2. 启动 Redis
```bash
# 使用 Docker
docker run -d -p 6379:6379 --name redis redis:latest

# 或本地安装
redis-server
```

### 3. 安装依赖
```bash
npm install
npm install ioredis
```

---

## 📝 测试用例说明

### 单元测试用例

#### DistributedCacheInvalidator

| 测试组 | 测试数量 | 说明 |
|-------|---------|------|
| 构造函数 | 5 | 参数验证、默认值、初始化 |
| Redis 连接 | 3 | 显式配置、URL配置、订阅连接 |
| 消息发送 | 5 | 发送逻辑、统计、日志、错误 |
| 消息接收 | 6 | 接收处理、忽略自己、失效逻辑 |
| 统计信息 | 2 | 统计结构、更新逻辑 |
| 关闭连接 | 2 | 正常关闭、错误处理 |
| 边缘情况 | 5 | 缺失配置、特殊消息、错误频道 |

**总计**: ~28 个测试用例

#### MultiLevelCache 分布式集成

| 测试组 | 测试数量 | 说明 |
|-------|---------|------|
| setPublish 方法 | 3 | 设置回调、参数验证 |
| delPattern 广播 | 4 | 触发广播、返回值、错误处理 |
| 分布式场景 | 3 | 实例间同步、模式匹配、并发 |
| 边缘情况 | 3 | 空 pattern、特殊字符、精确匹配 |
| 性能测试 | 1 | 大量失效性能 |

**总计**: ~14 个测试用例

### 集成测试用例

| 测试组 | 测试数量 | 说明 |
|-------|---------|------|
| 基本失效 | 2 | 实例间同步、模式匹配 |
| 并发场景 | 1 | 并发更新 |
| 统计信息 | 1 | 统计验证 |
| 错误处理 | 1 | 降级处理 |

**总计**: ~5 个测试用例

---

## ✅ 测试验证清单

运行测试前，请确认：

- [ ] MongoDB 已启动并可访问
- [ ] Redis 已启动并可访问
- [ ] 已安装 ioredis：`npm install ioredis`
- [ ] 已安装 mocha、chai、sinon 测试依赖

运行测试：
```bash
# 1. 单元测试（无需外部服务）
npm test -- test/unit/infrastructure/distributed-cache-invalidator.test.js
npm test -- test/unit/infrastructure/multi-level-cache-distributed.test.js

# 2. 集成测试（需要 Redis + MongoDB）
npm test -- test/integration/distributed-cache-invalidation.test.js
```

---

## 🐛 故障排查

### 测试失败：Redis 连接错误
```
Error: Redis connection failed
```

**解决方案**：
1. 确认 Redis 正在运行：`redis-cli ping`
2. 检查端口：`lsof -i :6379`
3. 启动 Redis：`redis-server`

### 测试失败：MongoDB 连接错误
```
Error: MongoServerError: connect ECONNREFUSED
```

**解决方案**：
1. 确认 MongoDB 正在运行：`mongo --eval "db.version()"`
2. 检查端口：`lsof -i :27017`
3. 启动 MongoDB：`mongod`

### 测试超时
```
Error: Timeout of 2000ms exceeded
```

**解决方案**：
1. 增加超时时间：`this.timeout(10000)` 在测试中
2. 检查网络连接
3. 减少测试数据量

---

## 📚 相关文档

- [分布式部署指南](../../docs/distributed-deployment.md)
- [快速参考](../../docs/distributed-deployment-quickref.md)
- [完整示例](../../examples/distributed-deployment.examples.js)

---

**更新时间**: 2025-11-25  
**测试状态**: ✅ 所有测试通过  
**覆盖率**: 目标 >80%

