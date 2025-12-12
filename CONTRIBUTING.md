# 贡献指南

感谢您对 monSQLize 项目的兴趣！我们欢迎各种形式的贡献。

## 📋 目录

- [开发环境设置](#开发环境设置)
- [提交流程](#提交流程)
- [代码规范](#代码规范)
- [测试要求](#测试要求)
- [CI/CD 流程](#cicd-流程)

---

## 🛠️ 开发环境设置

### 1. Fork 并克隆项目

```bash
git clone https://github.com/YOUR_USERNAME/monSQLize.git
cd monSQLize
```

### 2. 安装依赖

```bash
npm ci  # 推荐使用 ci 保证依赖一致性
```

### 3. 运行测试

```bash
# 运行所有测试
npm test

# 运行测试并生成覆盖率报告
npm run coverage

# 运行 Lint 检查
npm run lint

# 自动修复 Lint 问题
npm run lint:fix
```

---

## 📝 提交流程

### 1. 创建分支

```bash
git checkout -b feature/your-feature-name
# 或
git checkout -b fix/your-bug-fix
```

### 2. 编写代码

- 遵循现有代码风格
- 添加必要的注释（中文）
- 确保所有测试通过

### 3. 运行测试

```bash
# 运行测试
npm test

# 检查覆盖率（目标: ≥70%）
npm run coverage

# 运行 Lint
npm run lint
```

### 4. 提交更改

提交消息格式遵循 [Conventional Commits](https://www.conventionalcommits.org/)：

```bash
git commit -m "feat: 添加新功能描述"
git commit -m "fix: 修复BUG描述"
git commit -m "docs: 更新文档"
git commit -m "test: 添加测试"
git commit -m "refactor: 重构代码"
git commit -m "perf: 性能优化"
git commit -m "ci: CI/CD 相关更新"
```

### 5. 推送并创建 Pull Request

```bash
git push origin feature/your-feature-name
```

然后在 GitHub 上创建 Pull Request。

---

## 📐 代码规范

### ESLint

项目使用 ESLint 进行代码检查：

```bash
# 检查代码
npm run lint

# 自动修复
npm run lint:fix
```

### 命名规范

- **变量/函数**: camelCase（如 `findOne`, `maxTimeMS`）
- **类**: PascalCase（如 `MonSQLize`, `CacheManager`）
- **常量**: UPPER_SNAKE_CASE（如 `MAX_RETRY_COUNT`）
- **文件名**: kebab-case（如 `find-page.js`）

### 注释规范

- 所有公开 API 必须有 JSDoc 注释（中文）
- 复杂逻辑必须添加行内注释
- 示例：

```javascript
/**
 * 查找单个文档
 * @param {Object} filter - 查询条件
 * @param {Object} [options] - 可选参数
 * @param {Object} [options.projection] - 字段投影
 * @param {number} [options.maxTimeMS] - 查询超时时间（毫秒）
 * @returns {Promise<Object|null>} 文档对象或 null
 */
async findOne(filter, options = {}) {
    // 实现代码...
}
```

---

## 🧪 测试要求

### 测试覆盖率

- **最低要求**: 70%
- **推荐目标**: 80%+
- **关键模块**: 90%+

### 测试文件位置

```
test/
├── unit/                 # 单元测试
│   ├── features/         # 功能测试
│   ├── infrastructure/   # 基础设施测试
│   └── utils/            # 工具函数测试
├── integration/          # 集成测试
└── performance/          # 性能测试
```

### 编写测试

1. 测试文件命名: `*.test.js`
2. 使用项目内置测试框架
3. 每个测试必须独立，不依赖执行顺序

示例：

```javascript
describe('findOne', function() {
    it('should return document when found', async function() {
        const result = await msq.collection('users').findOne({ name: 'Alice' });
        assert.strictEqual(result.name, 'Alice');
    });
    
    it('should return null when not found', async function() {
        const result = await msq.collection('users').findOne({ name: 'NonExistent' });
        assert.strictEqual(result, null);
    });
});
```

---

## 🚀 CI/CD 流程

### 自动化工作流

项目使用 GitHub Actions 实现 CI/CD：

#### 1. **Test & Coverage**（测试和覆盖率）

**触发条件**:
- Push 到 `main` 或 `develop` 分支
- Pull Request 到 `main` 或 `develop` 分支

**执行内容**:
- 在 Node.js 18.x 和 20.x 上运行测试
- 生成覆盖率报告
- 上传覆盖率到 Codecov

#### 2. **Lint**（代码检查）

**触发条件**:
- 所有 Push 和 Pull Request

**执行内容**:
- 运行 ESLint 检查
- 确保代码符合规范

#### 3. **Compatibility Test**（兼容性测试）

**触发条件**:
- Push 到 `main` 分支
- Pull Request 到 `main` 分支
- 每周日凌晨定时运行

**执行内容**:
- 测试 Node.js 14.x - 20.x 兼容性
- 测试 MongoDB 驱动 4.x - 7.x 兼容性

### Pull Request 检查清单

在合并前，请确保：

- [x] 所有测试通过 ✅
- [x] Lint 检查通过 ✅
- [x] 覆盖率 ≥70% ✅
- [x] 无未解决的 Code Review 意见
- [x] 提交消息符合规范
- [x] 文档已更新（如有API变更）

### 查看 CI 状态

- 访问 [Actions 页面](https://github.com/vextjs/monSQLize/actions) 查看所有工作流
- Pull Request 页面会显示所有检查状态
- README 中的 Badges 显示最新状态

---

## 📚 文档要求

如果您的更改涉及 API 变更或新功能：

1. **更新 README.md**: 添加功能描述和示例
2. **更新 docs/**: 添加详细文档
3. **更新 examples/**: 添加可运行示例
4. **更新 CHANGELOG.md**: 记录变更（由维护者负责）

---

## 🐛 报告问题

在 [GitHub Issues](https://github.com/vextjs/monSQLize/issues) 提交问题时，请包含：

- **环境信息**: Node.js 版本、MongoDB 版本、操作系统
- **复现步骤**: 清晰的步骤说明
- **预期行为**: 您期望发生什么
- **实际行为**: 实际发生了什么
- **代码示例**: 最小化复现代码

---

## 💬 讨论与交流

- **GitHub Discussions**: [讨论区](https://github.com/vextjs/monSQLize/discussions)
- **GitHub Issues**: [问题跟踪](https://github.com/vextjs/monSQLize/issues)

---

## 📄 许可

通过贡献代码，您同意您的贡献将以 MIT 许可证发布。

---

**感谢您的贡献！** 🎉

