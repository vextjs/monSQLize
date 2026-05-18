# 兼容性测试套件

本目录包含 monSQLize 的多版本兼容性测试。

## 📋 测试结构

```
test/compatibility/
├── node-versions.test.js       # Node.js 版本特定测试
├── driver-versions.test.js     # MongoDB Driver 版本测试
├── server-versions.test.js     # MongoDB Server 版本测试
├── matrix-test.test.js         # 组合兼容性测试
└── README.md                   # 本文件
```

## 🎯 测试目标

### 1. Node.js 版本兼容性
确保 monSQLize 在以下 Node.js 版本上正常运行：
- ✅ Node.js 14.x（最低支持版本）
- ✅ Node.js 16.x
- ✅ Node.js 18.x（LTS，推荐）
- ✅ Node.js 20.x（LTS，推荐）
- ✅ Node.js 22.x（最新）

### 2. MongoDB Driver 版本兼容性
兼容以下 MongoDB Driver 版本：
- ⚠️ Driver 4.x（部分支持，连接选项必需）
- ✅ Driver 5.x（完全支持，findOneAnd* 返回格式不同）
- ✅ Driver 6.x（默认使用，推荐）
- 🔶 Driver 7.x（实验性支持）

### 3. MongoDB Server 版本兼容性
支持以下 MongoDB Server 版本：
- ✅ MongoDB 4.4（基础功能）
- ✅ MongoDB 5.0（完整支持）
- ✅ MongoDB 6.0（完整支持，推荐）
- ✅ MongoDB 7.0（完整支持）

## 🚀 运行测试

### 运行所有兼容性测试
```bash
npm run test:compatibility
```

### 运行特定维度测试
```bash
# Node.js 版本测试
node test/compatibility/node-versions.test.js

# MongoDB Driver 版本测试
node test/compatibility/driver-versions.test.js

# MongoDB Server 版本测试
node test/compatibility/server-versions.test.js
```

### 生成兼容性报告
```bash
npm run test:compatibility:report
```

## 📊 测试报告

测试报告会自动生成在以下位置：
- **Markdown 格式**: `reports/monSQLize/compatibility-report-{date}.md`
- **JSON 格式**: `reports/monSQLize/compatibility-report-{date}.json`

## ⚙️ CI/CD 集成

兼容性测试在以下情况自动运行：
- ✅ 每次 Pull Request（核心组合）
- ✅ Merge 到 main 分支（完整矩阵）
- ✅ 每日定时任务（完整矩阵）

查看 CI 配置: `.github/workflows/test-matrix.yml`

## 📖 相关文档

- [兼容性矩阵](../../docs/COMPATIBILITY.md) - 详细的版本支持说明
- [MongoDB Driver 兼容性](../../docs/mongodb-driver-compatibility.md) - Driver 差异详解
- [测试规范](../README.md) - 测试目录说明

## 🔧 工具和辅助模块

### 版本适配器
`test/utils/version-adapter.js` - 处理不同版本的 API 差异

**功能**:
- 检测 Node.js 和 MongoDB Driver 版本
- 统一 findOneAnd* 方法返回值格式
- 提供版本特定的连接选项
- 检测特性可用性（Worker Threads、性能 API 等）

**使用示例**:
```javascript
const versionAdapter = require('../utils/version-adapter');

// 获取版本信息
const report = versionAdapter.generateReport();
console.log('Node.js 版本:', report.node.version);
console.log('MongoDB Driver 版本:', report.mongodbDriver.version);

// 适配 findOneAndUpdate 返回值
const result = await collection.findOneAndUpdate(filter, update);
const adaptedResult = versionAdapter.adaptFindOneAndUpdateResult(result);
console.log('统一格式的结果:', adaptedResult.value);
```

### 兼容性报告生成器
`test/utils/compatibility-reporter.js` - 生成测试报告

**功能**:
- 收集测试结果
- 生成 Markdown 和 JSON 格式报告
- 生成 GitHub Actions Summary

**使用示例**:
```javascript
const CompatibilityReporter = require('../utils/compatibility-reporter');

const reporter = new CompatibilityReporter();

// 添加测试结果
reporter.addTestResult({
  category: 'node',
  version: '20.x',
  passed: true,
  passedCount: 45,
  totalCount: 45,
  duration: 1234,
  notes: 'All tests passed',
});

// 保存报告
const paths = reporter.saveReports('reports/monSQLize');
console.log('报告已保存:', paths.markdown);
```

## ❓ 常见问题

### Q: 为什么需要兼容性测试？
A: 确保 monSQLize 在不同环境下都能正常工作，给用户明确的版本支持信息。

### Q: 如何添加新的兼容性测试？
A: 在对应的测试文件中添加测试用例，遵循现有的测试结构。

### Q: 测试失败怎么办？
A: 查看生成的报告，了解失败原因。如果是已知限制，文档中会说明；如果是新问题，请提交 Issue。

### Q: 如何在本地运行多版本测试？
A: 使用 nvm 或 volta 切换 Node.js 版本，或使用提供的测试脚本：
```bash
node scripts/test-node-versions.js
node scripts/test-driver-versions.js
node scripts/test-server-versions.js
```

---

**维护者**: monSQLize Team  
**最后更新**: 2025-01-02

