# GitHub Workflows 验证脚本

本目录包含用于验证 GitHub Actions workflows 配置的脚本。

## 📁 文件说明

- `verify-github-workflows.js` - 验证 workflows 配置的完整性和正确性

## 🚀 使用方法

### 基本验证

```bash
node scripts/verify/workflows/verify-github-workflows.js
```

### PowerShell 快捷方式

```powershell
cd D:\Project\monSQLize
node scripts/verify/workflows/verify-github-workflows.js
```

### npm script (推荐)

在 `package.json` 中添加：

```json
{
  "scripts": {
    "verify:workflows": "node scripts/verify/workflows/verify-github-workflows.js"
  }
}
```

然后运行：

```bash
npm run verify:workflows
```

## 🔍 验证内容

### 1. 脚本存在性检查
- ✅ 验证 workflow 中引用的 npm scripts 是否存在于 package.json
- ✅ 检查 `npm test`, `npm run coverage`, `npm run lint` 等命令

### 2. Node.js 版本检查
- ✅ 验证 Node.js 版本是否合理 (≥18.x)
- ⚠️  警告使用过时版本

### 3. GitHub Actions 版本检查
- ✅ 检查是否使用最新的 actions (checkout@v4, setup-node@v4)
- ⚠️  警告使用旧版本

### 4. 项目结构检查
- ✅ 验证测试文件存在 (test/run-tests.js)
- ✅ 验证源代码目录存在 (lib/)
- ✅ 验证依赖项完整 (eslint, nyc, mocha)

### 5. Workflow 特定检查

**test.yml:**
- ✅ 矩阵测试配置
- ✅ 多操作系统支持 (Ubuntu + Windows)
- ✅ 覆盖率上传配置

**release.yml:**
- ✅ npm pack 配置
- ✅ GitHub Release 配置
- ✅ Tag 触发条件

## 📊 输出格式

脚本会输出详细的验证结果，包括：

```
✅ 通过: 14
❌ 失败: 0
⚠️  警告: 0
```

### 退出码

- `0` - 所有检查通过
- `1` - 存在失败项

## 🔧 CI 集成

### GitHub Actions

在 `.github/workflows/test.yml` 中添加：

```yaml
- name: Verify Workflows
  run: node scripts/verify/workflows/verify-github-workflows.js
```

### Pre-commit Hook

在 `.husky/pre-commit` 中添加（可选）：

```bash
node scripts/verify/workflows/verify-github-workflows.js
```

## 📝 规范参考

本验证脚本遵循以下规范：

- [guidelines/guidelines/v2.md](../../../guidelines/guidelines/v2.md)
  - 第 7 章: 测试与质量
  - 第 8 章: 多语言/技术栈默认命令
  - 第 11 章: 兼容性与 CI 矩阵
  - 第 21 章: 验证与测试策略
  - 第 22 章: 验证脚本与工具目录规范

## 🐛 问题排查

### 问题：脚本不存在错误

**现象：**
```
❌ test.yml: 使用了不存在的脚本 'npm run coverage'
```

**解决方案：**
1. 检查 `package.json` 中是否定义了该脚本
2. 或者修改 workflow 文件，使用正确的脚本名称

### 问题：Node.js 版本过时警告

**现象：**
```
⚠️  test.yml: Node.js 16.x 已过时，建议使用 18.x 或 20.x
```

**解决方案：**
更新 workflow 中的 `node-version` 配置：

```yaml
- uses: actions/setup-node@v4
  with:
    node-version: '20.x'  # 更新到 20.x
```

## 💡 最佳实践

1. **定期运行验证**
   - 每次修改 workflow 后运行
   - 在 CI 中自动运行

2. **保持 Actions 更新**
   - 使用最新版本的 GitHub Actions
   - 定期检查 Actions 市场的更新

3. **测试多环境**
   - 至少测试 Ubuntu + Windows
   - 测试多个 Node.js 版本

4. **文档同步**
   - 确保 README.md 与 workflows 一致
   - 更新 CHANGELOG.md 记录 workflow 变更

## 🔗 相关链接

- [GitHub Actions 文档](https://docs.github.com/en/actions)
- [actions/checkout](https://github.com/actions/checkout)
- [actions/setup-node](https://github.com/actions/setup-node)
- [softprops/action-gh-release](https://github.com/softprops/action-gh-release)

---

**维护**: 本验证脚本遵循项目规范，定期更新以匹配最新的最佳实践。
