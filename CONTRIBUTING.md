# 贡献指南

感谢您对 monSQLize 项目的兴趣！我们欢迎各种形式的贡献。

## 📋 目录

- 开发环境设置
- 提交流程
- 代码规范
- 测试要求
- CI/CD 流程

---

## 开发环境设置

### 1. Fork 并克隆项目

```bash
git clone https://github.com/YOUR_USERNAME/monSQLize.git
cd monSQLize
```

### 2. 安装依赖

```bash
npm ci  # 推荐使用 ci 保证依赖一致性
```

### 3. 运行当前校验

```bash
# 推荐：运行完整验证链
npm run verify

# 若只想先做文档/类型/示例回归，可按需拆开执行
npm run test:examples
npm run test:compatibility

# 自动修复 Lint 问题
npm run lint:fix
```

---

## 提交流程

### 1. 创建分支

```bash
git checkout -b feature/your-feature-name
# 或
git checkout -b fix/your-bug-fix
```

### 2. 编写代码

- 遵循现有代码风格
- 添加必要的注释（中文）
- 确保当前有效校验通过

### 3. 运行当前校验

```bash
# 推荐：运行完整验证链
npm run verify

# 如果只需检查示例入口
npm run test:examples

# 如果只需检查兼容矩阵
npm run test:compatibility
```

> 当前仓库已经恢复 `npm test`、`npm run test:compatibility`、`npm run test:examples` 与 `npm run verify`；历史覆盖率链路若需补强，将另行在验证资产中推进。

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

## 代码规范

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
async function findOne(filter, options = {}) {
    // 实现代码...
}
```

---

## 测试要求

### 当前测试状态

- 当前仓库已经恢复以下本地验证入口：
  - `npm test`
  - `npm run test:compatibility`
  - `npm run test:examples`
  - `npm run verify`
- 若改动影响公开类型、README 入口、示例或能力映射，请同步检查：
  - `docs/**`
  - `examples/**`
  - `test/validation/DOCS-EXAMPLES-MAPPING.md`
  - `test/validation/VERIFICATION-PROGRESS.md`
- 提交前至少应保证受影响范围对应的验证命令通过；若无法跑完整链路，需在说明中明确列出未验证项。

---

## CI/CD 流程

### 自动化工作流

项目使用 GitHub Actions 实现 CI/CD：

#### 1. **Lint**（代码检查）

**触发条件**:
- 所有 Push 和 Pull Request

**执行内容**:
- 运行 ESLint 检查
- 确保代码符合规范

#### 2. **类型 / 运行时 / 示例验证**

当前仓库已经恢复 TS 重写后的验证链，提交前建议至少关注：

- `npm test`
- `npm run test:compatibility`
- `npm run test:examples`
- `npm run verify`

旧时代的覆盖率统计和更细粒度 CI 维度仍可继续增强，但不应再把已经移除的旧命令说明写回贡献流程。

### Pull Request 检查清单

在合并前，请确保：

- [x] Lint 检查通过 ✅
- [x] 无未解决的 Code Review 意见
- [x] 提交消息符合规范
- [x] 文档已更新，并与当前仓库现状一致（如有 API 或入口面变更）

### 查看 CI 状态

- 访问 [Actions 页面](https://github.com/vextjs/monSQLize/actions) 查看所有工作流
- Pull Request 页面会显示所有检查状态
- README 中的入口说明应与当前仓库现状一致

---

## 📚 文档要求

如果您的更改涉及 API 变更或新功能：

1. **更新 README.md**: 添加功能描述和示例
2. **同步 profile / 需求文档**: 若修改仓库入口、命令或发布契约，需同步更新 `.devcodex/profile/*` 与相关需求产物
3. **维护当前 TS 文档/示例入口**: 当前仓库的 `docs/**`、`examples/**` 已作为新的 TS 版正式入口建立；其中官方示例统一使用 TypeScript。更新相关能力时，需同步维护这些入口，而不是回滚复制 `monSQLize-v1` 的旧目录内容
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

