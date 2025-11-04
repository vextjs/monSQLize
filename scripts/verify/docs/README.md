# 文档完整性验证脚本

本目录包含用于验证文档与代码一致性的持续集成验证脚本。

## 特点

- ✅ **CI 持续执行**: 作为质量门禁的一部分
- ✅ **自动运行**: 每次提交自动验证
- ✅ **文档质量**: 确保文档完整性和准确性

## 计划脚本

### verify-docs-completeness.js（待添加）

**用途**: 验证必需文档文件存在

**验证内容**:
- README.md 存在且完整
- CHANGELOG.md 符合格式
- STATUS.md 存在
- LICENSE 文件存在
- package.json 配置正确

**运行方式**:
```bash
node scripts/verify/docs/verify-docs-completeness.js
```

---

### verify-examples-runnable.js（待添加）

**用途**: 验证 examples/ 中的示例可以运行

**验证内容**:
- 所有示例文件可以加载
- 示例代码语法正确
- 示例使用的 API 存在
- 示例注释完整

**运行方式**:
```bash
node scripts/verify/docs/verify-examples-runnable.js
```

---

### verify-api-docs-sync.js（待添加）

**用途**: 验证 API 文档与代码同步

**验证内容**:
- docs/ 中的文档与 lib/ 对应
- API 参数描述准确
- 返回值说明完整
- 类型声明同步（index.d.ts）

**运行方式**:
```bash
node scripts/verify/docs/verify-api-docs-sync.js
```

---

### verify-changelog-format.js（待添加）

**用途**: 验证 CHANGELOG.md 格式符合 Keep a Changelog

**验证内容**:
- [Unreleased] 章节存在
- 版本号符合 SemVer
- 分类标签正确（Added/Changed/Fixed/etc.）
- 日期格式正确

**运行方式**:
```bash
node scripts/verify/docs/verify-changelog-format.js
```

---

## 与合规性验证的区别

| 特性 | 合规性验证 (compliance/) | 文档验证 (docs/) |
|------|------------------------|-----------------|
| **执行频率** | 一次性（改进完成后） | 持续（每次提交） |
| **纳入 CI** | ❌ 否 | ✅ 是 |
| **验证内容** | 规范遵守、结构正确 | 文档完整、一致性 |
| **失败影响** | 不阻塞提交 | 阻塞 CI |
| **执行时机** | 手动运行 | 自动触发 |

## 使用场景

### CI 集成

在 `.github/workflows/ci.yml` 中添加：

```yaml
name: CI

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
      
      # 运行单元测试
      - run: npm test
      
      # 验证文档完整性
      - run: node scripts/verify/docs/verify-docs-completeness.js
      
      # 验证示例可运行
      - run: node scripts/verify/docs/verify-examples-runnable.js
      
      # 验证 API 文档同步
      - run: node scripts/verify/docs/verify-api-docs-sync.js
      
      # 验证 CHANGELOG 格式
      - run: node scripts/verify/docs/verify-changelog-format.js
```

### 本地验证

提交前手动运行：

```bash
# 运行所有文档验证
npm run verify:docs

# 或单独运行
node scripts/verify/docs/verify-docs-completeness.js
node scripts/verify/docs/verify-examples-runnable.js
```

## 添加新验证脚本

### 步骤

1. **确定验证目标**: 要验证哪方面的文档质量
2. **创建脚本文件**: 遵循命名规范
3. **编写验证逻辑**: 快速失败，明确错误
4. **添加到 CI**: 更新 GitHub Actions 配置
5. **更新文档**: 添加到本 README

### 命名规范

```
verify-<目标>-<方面>.js

✅ 正确示例:
- verify-docs-completeness.js
- verify-examples-runnable.js
- verify-api-docs-sync.js
- verify-changelog-format.js
- verify-readme-sections.js

❌ 错误示例:
- checkDocs.js             # 不使用驼峰，统一 verify
- doc-verify.js            # 前缀应是 verify
- validate-docs.js         # 统一使用 verify
```

### 脚本模板

```javascript
/**
 * <验证目标> 文档验证
 * 
 * 用途: 验证 <文档方面> 的完整性和一致性
 * 执行: node scripts/verify/docs/verify-<目标>.js
 * CI: 每次提交自动运行
 */

const assert = require('assert');
const fs = require('fs');

console.log('🔍 验证 <验证目标>...\n');

let errors = [];

// 验证项 1
try {
    assert.ok(condition, '错误描述');
    console.log('✅ 验证项 1');
} catch (error) {
    console.error(`❌ 验证项 1: ${error.message}`);
    errors.push(error.message);
}

// 验证项 2
try {
    assert.ok(condition, '错误描述');
    console.log('✅ 验证项 2');
} catch (error) {
    console.error(`❌ 验证项 2: ${error.message}`);
    errors.push(error.message);
}

// 总结
console.log('\n' + '='.repeat(60));
if (errors.length === 0) {
    console.log('✅ 所有文档验证通过\n');
    process.exit(0);
} else {
    console.log(`❌ 发现 ${errors.length} 个问题:\n`);
    errors.forEach((err, i) => {
        console.log(`${i + 1}. ${err}`);
    });
    console.log();
    process.exit(1);
}
```

## 验证最佳实践

### 1. 快速失败

```javascript
// ✅ 好的做法：遇到错误继续检查，最后统一报告
let errors = [];
try {
    assert.ok(condition);
} catch (e) {
    errors.push(e.message);
}

// ❌ 不好：遇到第一个错误就退出
assert.ok(condition); // 失败后看不到其他问题
```

### 2. 清晰的错误信息

```javascript
// ✅ 好的做法：说明问题和解决方案
assert.ok(
    fs.existsSync('README.md'),
    'README.md 文件不存在。请创建项目说明文档。'
);

// ❌ 不好：错误信息不明确
assert.ok(fs.existsSync('README.md'), 'file missing');
```

### 3. 可操作的建议

```javascript
// ✅ 好的做法
if (!hasInstallSection) {
    errors.push(
        'README.md 缺少"## 安装"章节。' +
        '请添加安装说明，参考: https://...'
    );
}

// ❌ 不好
if (!hasInstallSection) {
    errors.push('Missing install section');
}
```

## 常见验证模式

### 文件存在验证

```javascript
const requiredDocs = [
    'README.md',
    'CHANGELOG.md',
    'LICENSE',
    'STATUS.md'
];

requiredDocs.forEach(doc => {
    if (!fs.existsSync(doc)) {
        errors.push(`必需文档缺失: ${doc}`);
    }
});
```

### 内容完整性验证

```javascript
const readme = fs.readFileSync('README.md', 'utf8');
const requiredSections = [
    '## 安装',
    '## 使用',
    '## API',
    '## 许可证'
];

requiredSections.forEach(section => {
    if (!readme.includes(section)) {
        errors.push(`README.md 缺少必需章节: ${section}`);
    }
});
```

### 格式一致性验证

```javascript
const changelog = fs.readFileSync('CHANGELOG.md', 'utf8');

// 检查 [Unreleased] 章节
if (!changelog.includes('## [Unreleased]')) {
    errors.push('CHANGELOG.md 缺少 [Unreleased] 章节');
}

// 检查版本格式
const versionRegex = /## \[(\d+\.\d+\.\d+)\] - \d{4}-\d{2}-\d{2}/;
if (!versionRegex.test(changelog)) {
    errors.push('CHANGELOG.md 版本格式不符合 Keep a Changelog 规范');
}
```

### 代码-文档同步验证

```javascript
const apiFiles = fs.readdirSync('lib/mongodb')
    .filter(f => f.endsWith('.js'))
    .map(f => f.replace('.js', ''));

const docFiles = fs.readdirSync('docs')
    .filter(f => f.endsWith('.md'))
    .map(f => f.replace('.md', ''));

apiFiles.forEach(api => {
    if (!docFiles.includes(api)) {
        errors.push(`API ${api} 缺少对应文档 docs/${api}.md`);
    }
});
```

## 相关文档

- [scripts/README.md](../README.md) - 脚本目录总览
- [第22章 验证脚本规范](../../guidelines/guidelines/v2.md#22-验证脚本与工具目录规范)
- [第15章 文档联动与自检](../../guidelines/guidelines/v2.md#15-文档联动与自检)

---

**最后更新**: 2025-11-04  
**维护者**: monSQLize Team

