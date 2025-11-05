# 测试目录说明

本目录包含 monSQLize 项目的所有测试用例。

## 目录结构

按照规范（guidelines v2.0 第21章），测试目录采用标准的 unit/integration/e2e 结构，**单元测试内部按功能分类**：

```
test/
├── unit/                            # 单元测试（强制）✅
│   ├── features/                   # 功能性测试（业务功能）
│   │   ├── find.test.js
│   │   ├── findOne.test.js
│   │   ├── findPage.test.js
│   │   ├── count.test.js
│   │   ├── aggregate.test.js
│   │   └── distinct.test.js
│   ├── infrastructure/             # 基础设施测试（底层支撑）
│   │   ├── connection.test.js
│   │   ├── connection.test.js
│   │   ├── errors.test.js
│   │   └── logger.test.js
│   └── utils/                      # 工具函数测试（纯函数）
│       └── (待添加)
│
├── integration/                     # 集成测试（推荐）
│   └── (待添加)
│
├── e2e/                            # 端到端测试（可选）
│   └── (待添加)
│
├── README.md                       # 本文件
└── run-tests.js                    # 测试运行器（已更新支持分类结构）
```

### 迁移状态

✅ **已完成**: 
- 所有单元测试已迁移到 `test/unit/` 目录（2025-11-04）
- **按规范分类到 features/ 和 infrastructure/ 子目录**（2025-11-04）

**注意**: 验证脚本已移动到 `scripts/verify/` 目录，参见 [scripts/README.md](../scripts/README.md)。

## 测试分类说明

### 功能性测试（features/）
**测试对象**: 对外暴露的 API 和业务功能

**包含文件**:
- `find.test.js` - 批量查询测试
- `findOne.test.js` - 单文档查询测试
- `findPage.test.js` - 深度分页测试
- `count.test.js` - 统计功能测试
- `aggregate.test.js` - 聚合查询测试
- `distinct.test.js` - 字段去重测试

### 基础设施测试（infrastructure/）
**测试对象**: 底层支撑系统和内部工具

**包含文件**:
- `connection.test.js` - 连接管理测试
- `connection.test.js` - 连接管理简化测试
- `errors.test.js` - 错误码系统测试
- `logger.test.js` - 日志系统测试

### 工具函数测试（utils/）
**测试对象**: 纯函数和辅助工具

**状态**: 待添加（如有需要）

## 测试分类

### 1. 核心 API 测试（Core API Tests）
测试所有对外暴露的读操作 API：
- **find**: 批量查询、流式查询
- **findOne**: 单文档查询
- **findPage**: 深度分页（游标、跳页、totals）
- **count**: 文档统计
- **aggregate**: 聚合管道
- **distinct**: 字段去重

### 2. 基础设施测试（Infrastructure Tests）
测试底层基础功能：
- **connection**: 连接池管理、跨库访问
- **errors**: 统一错误码系统
- **logger**: 日志系统（traceId、结构化日志）

## 运行测试

### ✨ 测试环境（MongoDB Memory Server - 配置驱动）

从 2025-11-05 开始，本项目支持通过 **`config.useMemoryServer`** 配置参数使用 MongoDB Memory Server（内存数据库）进行测试。

**使用方式**:
```javascript
// 测试文件中显式启用内存数据库
const msq = new MonSQLize({
  type: 'mongodb',
  databaseName: 'test_db',
  config: { 
    useMemoryServer: true  // 🔑 启用内存数据库
  }
});

await msq.connect();  // 自动使用内存 MongoDB
```

**优势**:
- ✅ **配置驱动**：完全通过配置参数控制，逻辑清晰
- ✅ **显式明确**：测试代码明确表明使用内存数据库
- ✅ **单例模式**：所有测试共享同一个内存服务器，极速启动
- ✅ **高性能**：单例共享，启动仅需 ~3 秒
- ✅ **零风险**：生产环境不会误用（需显式配置）
- ✅ **CI 友好**：GitHub Actions 无需额外配置

**性能数据**:
- 内存服务器启动：首次 ~3s，后续 <1ms（单例共享）
- connection 套件：0.43 秒（5 个测试）
- find 套件：0.51 秒（31 个测试）
- findPage 套件：0.50 秒（42 个测试）

**首次运行**：
```bash
npm test  # 首次会自动下载 MongoDB 二进制文件（~70MB），缓存到本地
```

**后续运行**：
```bash
npm test  # 直接使用缓存，秒启动
```

**技术细节**:
1. 测试文件配置 `config: { useMemoryServer: true }`
2. 库内部 `lib/mongodb/connect.js` 检测到配置
3. 自动启动内存 MongoDB（单例模式）
4. 所有测试共享同一个实例
5. 测试结束后自动清理

**使用真实 MongoDB**（集成测试）:
```javascript
// 不设置 useMemoryServer，使用真实数据库
const msq = new MonSQLize({
  config: { 
    uri: 'mongodb://localhost:27017'  // 真实数据库 URI
  }
});
```

### 运行所有测试
```bash
npm test
# 或
node test/run-tests.js
```

### 运行单个测试文件
```bash
node test/run-tests.js connection
node test/run-tests.js find
node test/run-tests.js findPage
```

### 运行 P0 验证
```bash
node test/verify-p0.js
```

## 测试规范

### 文件命名
- 测试文件: `<功能名>.test.js`
- 示例文件: `examples/<功能名>.examples.js`

### 测试覆盖要求
每个测试文件应包含：
1. ✅ **正常路径**: 主要使用场景
2. ✅ **异常路径**: 非法输入、边界条件
3. ✅ **边界用例**: 空值、最小/最大值、并发、超时

### 测试结构
```javascript
console.log('\n📦 <功能名称>测试套件\n');

// 测试套件 1: 基础功能
console.log('📦 1. 基础功能');
function test1() { /* ... */ }
test1();

// 测试套件 2: 高级功能
console.log('📦 2. 高级功能');
function test2() { /* ... */ }
test2();

// ... 更多测试套件

console.log('\n✅ <功能名称>测试全部通过\n');
```

## 测试依赖

### 外部依赖
- **MongoDB**: 需要真实 MongoDB 实例（本地或远程）
  - 默认连接: `mongodb://localhost:27017`
  - 测试数据库: 各测试文件使用独立数据库名

### 未来计划
- [ ] 集成 `mongodb-memory-server` 实现纯内存测试
- [ ] 添加代码覆盖率报告（Istanbul/nyc）
- [ ] 添加性能基准测试

## 测试数据

### 测试数据库命名
- 连接测试: `test_connection`
- 查询测试: `test_<功能名>`
- 示例: `test_find`, `test_findPage`

### 测试数据清理
- 每个测试套件负责清理自己创建的数据
- 使用独立的数据库名避免冲突

## 故障排查

### 常见问题

#### 1. 连接失败
```
Error: connect ECONNREFUSED 127.0.0.1:27017
```
**解决**: 确保 MongoDB 服务正在运行
```bash
# Windows
net start MongoDB

# Linux/Mac
sudo systemctl start mongod
```

#### 2. 测试超时
**解决**: 检查 MongoDB 性能或增加超时时间

#### 3. 端口冲突
**解决**: 修改测试配置中的连接 URI

## 贡献指南

### 添加新测试
1. 在适当的目录创建 `<功能>.test.js`
2. 遵循测试规范编写测试用例
3. 在 `run-tests.js` 中注册测试文件（如需要）
4. 运行测试确保通过
5. 更新本 README（如有新分类）

### 测试最佳实践
- 使用描述性的测试名称
- 每个测试独立运行，不依赖其他测试
- 清理测试数据，避免污染数据库
- 使用 `assert` 进行断言
- 添加详细的错误消息

## 参考文档

- [项目规范](../guidelines/profiles/monSQLize.md)
- [通用测试规范](../guidelines/guidelines/v2.md#7-测试与质量)
- [示例代码](../examples/)

---

**最后更新**: 2025-11-04  
**维护者**: monSQLize Team

